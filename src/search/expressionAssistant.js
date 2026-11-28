import {fieldCommand,scopeFields,valueKey} from './queryFields.js';
import {choices,dateKeys,numberKeys,typeNames} from './typedFields.js';
import {expressionModes,expressionState} from './filterExpression.js';
import {parseQuery,slashCommand} from './logicQuery.js';

const ratingKeys=new Set(['score','personalScore']);
function fieldSpec(field){
 const key=field.key, values=choices[key];
 if(values){
   if(Object.hasOwn(values,'YES') && Object.hasOwn(values,'NO'))return [field.name,'bool'];
   return [field.name,'enum',{values}];
 }
 if(numberKeys.has(key))return ratingKeys.has(key)?[field.name,'number',{min:0,max:10}]:[field.name,'number'];
 return [field.name,dateKeys.has(key)?'date':key==='time'?'clockText':'text'];
}

export function searchCapabilities(scope,label=value=>value){
 const types={},fields={},modes={};
 const include=definitions=>{
   for(const f of definitions){
     if(f.entityQuery)types[f.type]=typeNames[f.type];
     const key=fieldCommand(f);
     const spec=fields[key]??=fieldSpec(f);
     const constraints=spec[2]??={};
     const owners=constraints.owners??={};
     owners[f.type]=f.name;
   }
 };
 include(scopeFields(scope));
 for(const filter of scope.filters||[]){
   if(!expressionModes.has(filter.key))continue;
   modes[filter.key]=Object.fromEntries(filter.options.filter(([id])=>id).map(([id,name])=>{
     return [id,label(name)];
   }));
 }
 if(Object.keys(types).length<=1)for(const spec of Object.values(fields)){
   delete spec[2].owners;
   if(!Object.keys(spec[2]).length)spec.pop();
 }
 const data={scope:label(scope.label),types,fields,modes,related:Boolean(scope.relatedSearch)};
 if(['geography','projection-geography'].includes(scope.id))data.resultRule='地图默认搜记忆点；按旅途条件搜须使用 TYPE journey，命中后显示其成员记忆点。';
 return data;
}

export function validCandidate(query,scope){
 if(typeof query!=='string'||!query.trim()||/[\r\n]/.test(query)||slashCommand(query))return false;
 if((query.match(/"/g)||[]).length%2)return false;
 const raw=parseQuery(query,true);
 if(raw.error||raw.related&&!scope.relatedSearch)return false;
 const {options,predicate}=expressionState(query,scope);
 const available=scopeFields(scope,options);
 const commands=new Set(available.map(fieldCommand));
 const types=new Set(available.filter(f=>f.entityQuery).map(f=>f.type));
 const parsed=parseQuery(predicate,scope.relatedSearch);
 if(parsed.error||parsed.fields.some(key=>key!=='type'&&!commands.has(key)))return false;
 function valid(node){
   if(!node)return true;
   if(node.op)return valid(node.a)&&valid(node.b);
   if(node.field==='type')return types.has(node.exact);
   if(valueKey(node.field)==='time'&&!node.empty)return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(node.value);
   if(ratingKeys.has(valueKey(node.field)) && node.range)return [node.from,node.to].every(v=>v===null||v>=0&&v<=10);
   return true;
 }
 return valid(parsed.tree);
}

export function readAssistantReply(content,scope){
 const reply=JSON.parse(content);
 if(!reply || typeof reply!=='object'||Array.isArray(reply)||Object.keys(reply).length!==1)return null;
 const [kind]=Object.keys(reply);
 if(!['query','ask','unsupported'].includes(kind)||typeof reply[kind]!=='string'||!reply[kind].trim())return null;
 const value=reply[kind].trim();
 return kind==='query'&&!validCandidate(value,scope)?null:{[kind]:value};
}
