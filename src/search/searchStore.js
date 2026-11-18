import {emptySearch} from './searchCore.js';
const states=new Map(), listeners=new Set(), scopes=new Map();
export const getSearch=id=>states.get(id)||emptySearch;
const readingContextKey='cyber-study.reading-search-context';
function savedReadingContext(){try{return ['sentence','paragraph','chapter'].includes(globalThis.localStorage?.getItem(readingContextKey))?globalThis.localStorage.getItem(readingContextKey):'paragraph';}catch{return 'paragraph';}}
export function setSearch(id,state){
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cyber-search-before-change',{detail:{id,state}}));
 if(id?.startsWith('book:')&&['sentence','paragraph','chapter'].includes(state.filters?.context)){
  try{globalThis.localStorage?.setItem(readingContextKey,state.filters.context);}catch{}
 }
 states.set(id,state);listeners.forEach(fn=>fn());}
export const subscribeSearch=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export function registerScope(id,get){const token={get};scopes.set(id,token);return()=>{if(scopes.get(id)===token)scopes.delete(id);};}
export const currentScope=()=>[...scopes.values()].map(s=>s.get()).filter(s=>s.enabled!==false).sort((a,b)=>(b.priority||0)-(a.priority||0))[0];
export const getScope=id=>{const scope=scopes.get(id)?.get();return scope?{...scope,state:getSearch(id)}:undefined;};
const counts=new Map();
export function publishSearchCount(id,state,count){const old=counts.get(id);if(old?.state===state&&old.count===count)return;counts.set(id,{state,count});listeners.forEach(fn=>fn());}
export const getSearchCount=id=>{const entry=counts.get(id);return entry?.state===getSearch(id)?entry.count:null;};

// Drafts belong to each search scope; applied conditions only live while open.
const rememberedSearches = new Map();
export function suspendSearch(id, draft) {
  if (!id) return;
  rememberedSearches.set(id, { draft: draft || getSearch(id), applied: getSearch(id) });
  setSearch(id, emptySearch);
}
export function resumeSearch(id) {
  const remembered = rememberedSearches.get(id);
  const withPreferences=state=>id?.startsWith('book:')?{...state,filters:{...state.filters,context:savedReadingContext()}}:state;
  const applied = withPreferences(remembered?.applied || getSearch(id));
  setSearch(id, applied);
  return { draft: withPreferences(remembered?.draft || applied), applied };
}
