import {useEffect,useRef,useSyncExternalStore} from 'react';
import {getSearch,subscribeSearch,registerScope,publishSearchCount,notifyScopeChange} from './searchStore.js';
import {emptySearch} from './searchCore.js';
export function useSearchScope(config){
 const latest=useRef(config);latest.current=config;
 const state=useSyncExternalStore(subscribeSearch,()=>getSearch(config.id),()=>emptySearch);
 useEffect(()=>registerScope(config.id,()=>({...latest.current,state:getSearch(config.id)})),[config.id]);
 useEffect(notifyScopeChange, [config.enabled, config.priority, config.hostKey]);
 return state;
}
// Kept for existing callers; the live search bar owns query and filter controls.
export function SearchStatus(){return null;}
export const dateFilters=[{key:'from',label:"i18n.startDate",type:'date'},{key:'to',label:"i18n.endDate",type:'date'}];
export function useSearchCount(id,count){
 const state=getSearch(id);
 useEffect(()=>{publishSearchCount(id,state,count);},[id,state,count]);
}
