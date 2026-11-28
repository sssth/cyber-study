import {rangeKey,comparable,choices} from './typedFields.js';
import {canonicalField,valueKey} from './queryFields.js';
// Ordinary text stays on the original matcher. Only explicit commands enter the grammar.
const normalize = value=>String(value??'').normalize('NFKC').toLowerCase();
const cache=new Map();
// Read the command being typed at the caret, including a slash attached to a word.
export function slashCommand(before) {
 const match=/\/([^\s/:："]*)$/u.exec(before);
 if(!match)return null;
 const prefix=before.slice(0,match.index);
 if((prefix.match(/"/g)||[]).length%2 || /(?:[a-z][\w+.-]*:|[^\s"]*\/[^\s"]*)$/iu.test(prefix))return null;
 return {prefix,needle:match[1]};
}
export const precedence = Object.freeze({RELATED:40, NOT:30, AND:20, OR:10});
const relationCache=new Map();
export function parseQuery(input='', allowRelated=false) {
 const memo=allowRelated?relationCache:cache;
 if(memo.has(input))return memo.get(input);
 const source=input.normalize('NFKC');
 const tokens=source.match(/(?:"[^"]*"|[^\s()"]+)+|[()]|"/gu)||[];
 let i=0;
 const fields=new Set();
 const op=t=>['AND','OR','NOT'].includes(t);
 const fieldPattern=/^([\p{L}_][\p{L}\d_.]*):(?!\/\/)(.*)$/u;
 const related=allowRelated && tokens.includes('RELATED');
 const structured=related || tokens.some(t=>t==='TYPE'||op(t)||fieldPattern.test(t));
 let tree, error;
 function atom() {
   let token=tokens[i++];
   if(token==='TYPE'){
     const value=tokens[i++];
     if(!value||value.toUpperCase()==='NONE')throw Error();
     token='type:'+value;
   }
   if(token==='NOT')return {op:'NOT',a:expression(precedence.NOT)};
   if(token==='('){const node=expression();if(tokens[i++]!==')')throw Error();return {...node,grouped:true};}
   if(!token||token===')'||op(token)||token==='"'||(related && token==='RELATED'))throw Error();
   const match=token.match(fieldPattern);
   const name=match && canonicalField(match[1]);
   if(name)fields.add(name);
   const key=valueKey(name);
   let raw=match?match[2]:token;
   if(name && !raw && rangeKey(key) && ['FROM','TO'].includes(tokens[i]?.toUpperCase()))raw=tokens[i++];
   if(!raw || (raw.includes('"')&&!/^"[^"]*"$/.test(raw)))throw Error();
   if(rangeKey(key) && raw.toUpperCase()!=='NONE'){
     const keyword=raw.toUpperCase();
     const bound=value=>{const n=comparable(key,value);if(n===null)throw Error();return n;};
     if(keyword==='FROM'||keyword==='TO'){
       let from=null,to=null;
       if(keyword==='FROM'){from=bound(tokens[i++]);if(tokens[i]?.toUpperCase()==='TO'){i++;to=bound(tokens[i++]);}}
       else to=bound(tokens[i++]);
       if(from!==null&&to!==null&&from>to)throw Error();
       return {field:name,range:true,from,to};
     }
     const exact=bound(raw);return {field:name,range:true,from:exact,to:exact};
   }
   if(Object.hasOwn(choices,key) && raw.toUpperCase()!=='NONE'){
     const value=Object.entries(choices[key]).find(([k,v])=>normalize(k)===normalize(raw)||v===raw)?.[0];
     if(!value)throw Error();
     return {field:name,exact:normalize(value)};
   }
   return {field:name,empty:Boolean(match)&&raw.toUpperCase()==='NONE',value:normalize(raw.replace(/^"|"$/g,''))};
 }
 function expression(min=0) {
   const first=i;
   let node={...atom(),first,last:i};
   while(i<tokens.length && tokens[i]!==')') {
     const token=tokens[i];
     if(related && token==='RELATED') {
       if(precedence.RELATED<min)break;
       if(containsRelation(node))throw Error();
       i++;node={op:'RELATED',a:node,first,last:i};continue;
     }
     const explicit=token==='OR'||token==='AND';
     const operator=explicit?token:'AND';
     if(precedence[operator]<min)break;
     if(explicit)i++;
     node={op:operator,a:node,b:expression(precedence[operator]+1),first,last:i};
   }
   return node;
 }
 function containsRelation(node) {
   return Boolean(node && (node.op==='RELATED'||containsRelation(node.a)||containsRelation(node.b)));
 }
 if(structured)try{tree=expression();if(i!==tokens.length)throw Error();}catch{error=true;}
 const result={structured,related,tree,error,fields:[...fields]};
 if(memo.size>128)memo.clear();
 memo.set(input,result);return result;
}
export function evaluateQuery(node,values,fields,relatedMatch) {
 // null means a field does not belong to this record, including under NOT.
 if(!node)return false;
 if(node.op==='RELATED')return relatedMatch(node);
 if(node.op) {
   const a=evaluateQuery(node.a,values,fields,relatedMatch);
   if(node.op==='NOT')return a===null?null:!a;
   const b=evaluateQuery(node.b,values,fields,relatedMatch);
   if(node.op==='OR')return a===true||b===true?true:a===null||b===null?null:false;
   return a===false||b===false?false:a===null||b===null?null:true;
 }
 if(node.field && !Object.hasOwn(fields,node.field))return null;
 const parts=[node.field?fields[node.field]:values].flat(Infinity).map(normalize);
 if(node.range)return parts.some(part=>{const v=comparable(valueKey(node.field),part);return v!==null&&(node.from===null||v>=node.from)&&(node.to===null||v<=node.to);});
 if(node.exact!==undefined)return parts.includes(node.exact);
 return node.empty?parts.every(value=>!value.trim()):parts.some(value=>value.includes(node.value));
}
export function positiveTerms(node, field) {
 if(!node||node.op==='NOT'||node.empty||node.range||node.exact!==undefined)return [];
 return node.op?[...positiveTerms(node.a,field),...positiveTerms(node.b,field)]:(field && node.field && ![field].flat().includes(node.field) ? [] : [node.value]);
}
