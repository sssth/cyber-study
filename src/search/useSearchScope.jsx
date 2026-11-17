import {useEffect,useRef,useSyncExternalStore} from 'react';
import {getSearch,subscribeSearch,registerScope,publishSearchCount} from './searchStore.js';
import {emptySearch} from './searchCore.js';
export function useSearchScope(config){
 const latest=useRef(config);latest.current=config;
 const state=useSyncExternalStore(subscribeSearch,()=>getSearch(config.id),()=>emptySearch);
 useEffect(()=>registerScope(config.id,()=>({...latest.current,state:getSearch(config.id)})),[config.id]);
 useEffect(()=>{window.dispatchEvent(new Event('cyber-search-scope-changed'));});
 return state;
}
// Kept for existing callers; the live search bar owns query and filter controls.
export function SearchStatus(){return null;}
export const dateFilters=[{key:'from',label:'开始日期',type:'date'},{key:'to',label:'结束日期',type:'date'}];
export function useSearchCount(id,count){
 const state=getSearch(id);
 useEffect(()=>{publishSearchCount(id,state,count);},[id,state,count]);
}
