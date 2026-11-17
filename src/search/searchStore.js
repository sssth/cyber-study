import {emptySearch} from './searchCore.js';
const states=new Map(), listeners=new Set(), scopes=new Map();
export const getSearch=id=>states.get(id)||emptySearch;
export function setSearch(id,state){states.set(id,state);listeners.forEach(fn=>fn());}
export const subscribeSearch=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export function registerScope(id,get){const token={get};scopes.set(id,token);return()=>{if(scopes.get(id)===token)scopes.delete(id);};}
export const currentScope=()=>[...scopes.values()].map(s=>s.get()).filter(s=>s.enabled!==false).sort((a,b)=>(b.priority||0)-(a.priority||0))[0];
export const getScope=id=>{const scope=scopes.get(id)?.get();return scope?{...scope,state:getSearch(id)}:undefined;};
const counts=new Map();
export function publishSearchCount(id,state,count){const old=counts.get(id);if(old?.state===state&&old.count===count)return;counts.set(id,{state,count});listeners.forEach(fn=>fn());}
export const getSearchCount=id=>{const entry=counts.get(id);return entry?.state===getSearch(id)?entry.count:null;};
