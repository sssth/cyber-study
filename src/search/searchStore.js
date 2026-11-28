import {emptySearch} from './searchCore.js';
const states=new Map(), listeners=new Set(), scopes=new Map();
const locations = new Map(), selections = new Map();
export const getSearch = id => selections.get(id) ?? states.get(id) ?? emptySearch;

function publish(id, state) {
 const location = locations.get(id);
 const effective = location
   ? { ...state, filters: { ...state.filters, [location.field]: location.id } }
   : state;
 if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cyber-search-before-change', { detail: { id, state: effective } }));
 states.set(id, state);
 if (location) selections.set(id, effective);
 else selections.delete(id);
 listeners.forEach(fn => fn());
}

export function locateEntityInScope(scopeId, field, entityId) {
 rememberedSearches.delete(scopeId);
 locations.set(scopeId, { field, id: entityId });
 publish(scopeId, emptySearch);
}
const readingContextKey='cyber-study.reading-search-context';
function savedReadingContext(){try{return ['sentence','paragraph','chapter'].includes(globalThis.localStorage?.getItem(readingContextKey))?globalThis.localStorage.getItem(readingContextKey):'paragraph';}catch{return 'paragraph';}}
export function setSearch(id,state){
 if(id?.startsWith('book:')&&['sentence','paragraph','chapter'].includes(state.filters?.context)){
  try{globalThis.localStorage?.setItem(readingContextKey,state.filters.context);}catch{}
 }
 const location = locations.get(id);
 if (location && state.filters?.[location.field] === location.id) {
  const filters = { ...state.filters };
  delete filters[location.field];
  publish(id, { ...state, filters });
 } else {
  locations.delete(id);
  publish(id, state);
 }
}
export const subscribeSearch=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export function notifyScopeChange() {
 if (typeof window !== 'undefined') window.dispatchEvent(new Event('cyber-search-scope-changed'));
}
export function registerScope(id, get) {
 const token = { get };
 scopes.set(id, token);
 notifyScopeChange();
 return () => {
  if (scopes.get(id) !== token) return;
  scopes.delete(id);
  notifyScopeChange();
 };
}
export const currentScope=(accept)=>[...scopes.values()].map(s=>s.get()).filter(s=>s.enabled!==false && (!accept || accept(s))).sort((a,b)=>(b.priority||0)-(a.priority||0))[0];
export const getScope=id=>{const scope=scopes.get(id)?.get();return scope?{...scope,state:getSearch(id)}:undefined;};
const counts=new Map();
export function publishSearchCount(id,state,count){const old=counts.get(id);if(old?.state===state&&old.count===count)return;counts.set(id,{state,count});listeners.forEach(fn=>fn());}
export const getSearchCount=id=>{const entry=counts.get(id);return entry?.state===getSearch(id)?entry.count:null;};

// Drafts belong to each search scope; applied conditions only live while open.
const rememberedSearches = new Map();
export function suspendSearch(id, draft) {
  if (!id) return;
  rememberedSearches.set(id, { draft: draft || getSearch(id), applied: getSearch(id), location: locations.get(id) });
  setSearch(id, emptySearch);
}
export function resumeSearch(id) {
  const remembered = rememberedSearches.get(id);
  const withPreferences=state=>state.expression===undefined&&id?.startsWith('book:')?{...state,filters:{...state.filters,context:savedReadingContext()}}:state;
  const applied = withPreferences(remembered?.applied || getSearch(id));
  if (remembered?.location) locations.set(id, remembered.location);
  setSearch(id, applied);
  return { draft: withPreferences(remembered?.draft || applied), applied };
}
