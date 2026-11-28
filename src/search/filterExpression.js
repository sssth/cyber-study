import {fieldCommand} from './queryFields.js';
import {parseQuery} from './logicQuery.js';
import {calendarDay,comparable} from './typedFields.js';

// These affect how a page searches or presents matches, rather than testing an entity.
export const expressionModes=new Set(['context','fulltext','musicTarget','searchBy','provider']);
const aliases={watchStatus:'movie.status',boardVisibility:'showOnBoard',status:'done'};
const boolValues={boardVisibility:{shown:'YES',hidden:'NO'},status:{done:'YES',open:'NO'}};

function binding(scope,key){
 const score=/^(score|personalScore)(Min|Max)$/.exec(key);
 if(score)return {name:score[1],bound:score[2]==='Min'?'from':'to'};
 if(key==='from'||key==='to'){
   const id=scope.id.replace(/^projection:/,'');
   return {name:id==='movie'?'watchedOn':id==='journey'?'startDate':'date',bound:key};
 }
 return {name:aliases[key]||key};
}

// Split only conjunctions at the outermost level. Preserve OR branches, quoted
// strings and grouped conditions verbatim when a visual filter is changed.
function clauses(query){
 const text=query.trim();
 if(!text)return [];
 const parsed=parseQuery(text,true);
 if(parsed.error||!parsed.tree)return [{text}];
 const tokens=[...text.matchAll(/(?:"[^"]*"|[^\s()"]+)+|[()]|"/gu)];
 const parts=[];
 function visit(node){
   if(node.op==='AND'&&!node.grouped){visit(node.a);visit(node.b);return;}
   const first=tokens[node.first],last=tokens[node.last-1];
   parts.push({start:first.index,end:last.index+last[0].length,text:text.slice(first.index,last.index+last[0].length),disjunction:node.op==='OR'&&!node.grouped});
 }
 // NFKC may split a pasted token. Keep the original draft intact in that case.
 if(parsed.tree.last!==tokens.length)return [{text,disjunction:parsed.tree.op==='OR'}];
 visit(parsed.tree);
 return parts;
}
function join(parts,original){
 const source=original.trim();
 return parts.map((part,index)=>{
   const previous=parts[index-1];
   const gap=previous?.end!=null && part.start!=null?source.slice(previous.end,part.start):null;
   const separator=!previous?'':gap!=null && /^\s*(?:AND\s*)?$/.test(gap)?gap:' AND ';
   return separator+(part.disjunction && parts.length>1?'('+part.text+')':part.text);
 }).join('');
}
function unwrap(text){
 if(!text.startsWith('(')||!text.endsWith(')'))return text;
 let depth=0;
 for(const m of text.matchAll(/"[^"]*(?:"|$)|[()]/g)){
   if(m[0]==='(')depth++;
   if(m[0]===')'&&!--depth && m.index!==text.length-1)return text;
 }
 return depth===0?text.slice(1,-1):text;
}
function inspect(part,scope){
 const parsed=parseQuery(part.text,true);
 const node=parsed.tree;
 if(parsed.error||!node?.field||node.op||node.empty)return {};
 const found={};
 for(const f of scope.filters||[]){
   const {name,bound}=binding(scope,f.key);
   // A page limited to one entity also accepts the spelling inserted by its slash menu.
   const page=scope.id.replace(/^projection:/,'');
   const owner=page==='globe'?'memory_point':page==='memo'?scope.entityView:page;
   if(node.field!==name && node.field!==fieldCommand({type:owner,key:name}))continue;
   if(bound){
     if(node.range && node[bound]!==null)found[f.key]=String(node[bound]);
   }else{
     const option=f.options?.find(([id])=>id && String(boolValues[f.key]?.[id]??id).toLowerCase()===(node.exact??node.value));
     if(option)found[f.key]=option[0];
   }
 }
 return found;
}
export function expressionState(query,scope){
 const values={},conditions=[],options={};
 for(const part of clauses(query)){
   const found=inspect(part,scope);
   Object.assign(values,found);
   const mode=Object.keys(found).find(key=>expressionModes.has(key));
   if(mode)options[mode]=found[mode];else conditions.push(part);
 }
 let predicate=Object.keys(options).length?join(conditions,query):query;
 if(conditions.length===1 && Object.keys(options).length)predicate=unwrap(predicate);
 return {values,options,predicate};
}
export function changeFilter(query,scope,key,value){
 const {name,bound}=binding(scope,key);
 const parts=[],bounds={};
 for(const part of clauses(query)){
   const found=inspect(part,scope);
   const related=Object.keys(found).filter(k=>binding(scope,k).name===name);
   if(!related.length){parts.push(part);continue;}
   for(const k of related)bounds[binding(scope,k).bound]=found[k];
 }
 let clause='';
 if(bound){
   bounds[bound]=value;
   if(bounds.from && bounds.to && comparable(name,bounds.from)>comparable(name,bounds.to)){
     bounds[bound==='from'?'to':'from']=value;
   }
   if(bounds.from||bounds.to){
     const pieces=[];
     for(const side of ['from','to'])if(bounds[side])pieces.push(side.toUpperCase(),bounds[side]);
     clause=name+':'+pieces.join(' ');
   }
 }else if(value)clause=key==='type'?'TYPE '+value:name+':'+(boolValues[key]?.[value]??value);
 if(clause)parts.unshift({text:clause});
 if(!clause&&parts.length===1)return unwrap(parts[0].text);
 return join(parts,query);
}
export function restoreExpression(state,scope){
 let query=state.expression??state.query;
 if(state.expression===undefined){
   for(const f of scope.filters||[]){
     const value=state.filters?.[f.key];
     if(value && !(f.key==='context'&&value==='paragraph'))query=changeFilter(query,scope,f.key,value);
   }
 }
 return query;
}
export function normalizeFilter(field,value){
 return field.type==='date'&&value?calendarDay(value):value;
}

export function appliedExpression(expression,scope,previous){
 const {predicate,options}=expressionState(expression,scope);
 const filters={...previous.filters};
 for(const field of scope.filters||[])delete filters[field.key];
 return {expression,query:predicate,filters:{...filters,...options}};
}
