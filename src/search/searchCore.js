import {knowledgeEntity} from '../data/knowledgeRecords.js';
import {storedTitle} from '../entities/records.js';
import {entityFields,fieldCommand,withPropertyKeys} from './queryFields.js';
import {evaluateQuery,parseQuery,positiveTerms} from './logicQuery.js';
import { entityTags } from '../entities/tags.js';
import { entityTypes } from '../entities/registry.js';

import {choices,defaultEnabled,preferences,typedValue,calendarDay,dateKeys} from './typedFields.js';
import {includeDirectNeighbors} from './relatedQuery.js';

export const emptySearch = Object.freeze({query:'', filters:{}});
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export const termsOf = query => Array.from(normalize(query).matchAll(/"([^"]+)"|([^\s"]+)/g), m=>m[1]||m[2]);
export const textMatches = (values, query) => { const text=values.flat(Infinity).filter(v=>v!=null).map(normalize).join('\n');return termsOf(query).every(term=>text.includes(term)||Boolean(calendarDay(term)&&text.includes(calendarDay(term)))); };
const catalogFields=new Map();
function fieldsFor(type){
 if(!catalogFields.has(type))catalogFields.set(type,entityFields(type));
 return catalogFields.get(type);
}
function fieldValue(type,item,f,useStoredTitle){
 if(f.key==='tags')return entityTags(type,item);
 if(f.key==='title' && useStoredTitle && storedTitle in item)return item[storedTitle];
 return typedValue(type,f.key==='movie.region'?'region':f.key,item);
}
export function searchValues(type,item,definitions=entityTypes){
 if(definitions!==entityTypes||!entityTypes[type])return [item.title,entityTags(type,item),...(definitions[type]?.search??[]).map(key=>item[key])];
 const fields=fieldsFor(type);
 const values=[];
 const customized=Object.keys(preferences()[type]||{}).length>0;
 if(!fields.some(f=>f.key==='title'))values.push(customized && storedTitle in item?item[storedTitle]:item.title);
 for(const f of fields){
   if(!defaultEnabled(f))continue;
   const value=fieldValue(type,item,f,customized);
   values.push(value);
   if(Object.hasOwn(choices,f.key))values.push(choices[f.key][value]);
   if(dateKeys.has(f.key))values.push(calendarDay(value));
 }
 return values;
}
export function matchFields(values,fields,query) {
 const parsed=parseQuery(query);
 return parsed.structured ? !parsed.error && evaluateQuery(parsed.tree,values,withPropertyKeys(fields))===true : textMatches(values,query);
}
export function highlightTerms(text,query,bodyKey='text') {
 const parsed=parseQuery(query);
 if(!parsed.structured)return termsOf(query);
 return !parsed.error && evaluateQuery(parsed.tree,[text],{'正文':text,[bodyKey]:text}) ? positiveTerms(parsed.tree) : [];
}
export function queryFields(type,item) {
 const fields={type};
 for(const f of fieldsFor(type)){
   const value=fieldValue(type,item,f,true);
   fields[f.name]=value;
   fields[f.key]=value;
   fields[fieldCommand(f)]=value;
 }
 return fields;
}
export function matchesItem(type,item,state=emptySearch, definitions=entityTypes, extra={}){
 if(item.deletedAt)return false;
 const f=state.filters||{};
 if(f.id&&item.id!==f.id)return false;
 if(f.type&&f.type!==type)return false;
 if(f.status&&String(item.visitStatus??item.status??(definitions[type]?.status?.(item) ?? ''))!==f.status)return false;
 if(f.bookId&&item.bookId!==f.bookId)return false;
 if(f.provider&&item.provider!==f.provider)return false;
 if(f.author&&item.author!==f.author)return false;
 if(f.format&&(item.originalFormat||item.format)!==f.format)return false;
 if(f.mood&&item.mood!==f.mood)return false;
 if(state.query?.trim()){
   item=knowledgeEntity(type,item);
   const values=searchValues(type,item,definitions);
   const parsed=parseQuery(state.query);
   if(parsed.structured){
     const fields=queryFields(type,item);
     const includeBody=type!=='book'||defaultEnabled({type,key:'content',defaultOn:true})&&state.includeBodyKeywords!==false;
     const keywords=includeBody?[...values,...Object.values(extra)]:values;
     if(parsed.error || evaluateQuery(parsed.tree,keywords,withPropertyKeys({...fields,...extra},type==='book'?'content':'text'))!==true)return false;
   }else if(!textMatches(values,state.query))return false;
 }
 if(!f.from && !f.to)return true;
 const rawDate=item.date||item.startDate||item.completedAt||item.createdAt||'';
 const date=calendarDay(rawDate);
 if(f.from&&(!date||date<f.from)||f.to&&(!date||date>f.to))return false;
 return true;
}
export const hasSearch=state=>Boolean(state.query.trim()||Object.values(state.filters||{}).some(Boolean));

export function matchesCatalogItem(item, state, definitions = entityTypes) {
 const parsed=parseQuery(state.query);
 if(parsed.structured && definitions[item.type]?.fullText && (state.filters?.fulltext==='yes'||parsed.fields.includes('content')||parsed.fields.includes('正文')))
   return matchesItem(item.type,item,{...state,includeBodyKeywords:state.filters?.fulltext==='yes'},definitions,{'正文':item[definitions[item.type].fullText]});
 if (matchesItem(item.type, item, state, definitions)) return true;
 const field = definitions[item.type]?.fullText;
 return Boolean(field && state.filters?.fulltext === 'yes' &&
   matchesItem(item.type, item, { ...state, query: '' }, definitions) &&
   defaultEnabled({type:item.type,key:'content',defaultOn:true}) && textMatches([item[field]], state.query));
}

// A query strategy receives normalized catalog entities and returns their matching subset.
export function queryEntities(items, state, matches = matchesCatalogItem) {
 return items.filter(item => matches(item, state));
}

export function queryRelatedEntities(items, state, edges) {
 const parsed=parseQuery(state.query,true);
 if (!parsed.related) return queryEntities(items,state);
 if (parsed.error) return [];
 const active=items.filter(item=>!item.deletedAt);
 const eligible=new Set(queryEntities(active,{...state,query:''}));
 const candidates=new Set(eligible);
 const expansions=new Map();
 const contexts=new Map();
 function matches(item,node) {
   if(!contexts.has(item)){
     const record=knowledgeEntity(item.type,item);
     const values=searchValues(item.type,record);
     const fields=queryFields(item.type,record);
     const body=entityTypes[item.type]?.fullText;
     if(body && (state.filters?.fulltext==='yes'||parsed.fields.includes('content')||parsed.fields.includes('正文'))){
       fields['正文']=record[body];
       if(state.filters?.fulltext==='yes' && defaultEnabled({type:'book',key:'content',defaultOn:true}))values.push(record[body]);
     }
     contexts.set(item,{values,fields:withPropertyKeys(fields,item.type==='book'?'content':'text')});
   }
   const {values,fields}=contexts.get(item);
   return evaluateQuery(node,values,fields,relation=>expansions.get(relation).has(item))===true;
 }
 function prepare(node) {
   if(node.op==='RELATED'){
     const seeds=[...eligible].filter(item=>matches(item,node.a));
     const expanded=includeDirectNeighbors(active,seeds,edges);
     expansions.set(node,new Set(expanded));
     for(const item of expanded)candidates.add(item);
   }else if(node.op){
     prepare(node.a);
     if(node.b)prepare(node.b);
   }
 }
 prepare(parsed.tree);
 return active.filter(item=>candidates.has(item)&&matches(item,parsed.tree));
}
