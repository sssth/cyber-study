import {globalSearchFilters} from './pageModes.js';
import { translate } from '../i18n/index.js';
import useResultSource, {resultEntities} from '../results/useResultSource.js';
import {useEffect,useMemo,useState} from 'react';
import {useSearchCount,useSearchScope} from './useSearchScope.jsx';
import {queryRelatedEntities,searchValues,hasSearch} from './searchCore.js';
import { contentTypes } from '../entities/registry.js';
import { readCatalog } from '../entities/readCatalog.js';

import {graphEdges} from '../entities/edges.js';
import {loadSpaceData} from '../data/spaceStorage.js';
import {parseQuery} from './logicQuery.js';

export default function GlobalSearch({books,enabled,onOpen}){
 const [visible,setVisible]=useState(false),[items,setItems]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[limit,setLimit]=useState(40),[revision,setRevision]=useState(0);
 const state=useSearchScope({id:'global',relatedSearch:true,label:translate("i18n.entireStudy"),priority:0,enabled,filters:globalSearchFilters(),onApply:()=>{setVisible(true);setLimit(40);}});
 useEffect(()=>{if(!enabled)setVisible(false);},[enabled]);
 useEffect(()=>{const change=e=>{setVisible(e.detail.id==='global');setLimit(40);};window.addEventListener('cyber-search-visibility',change);return()=>window.removeEventListener('cyber-search-visibility',change);},[]);
 useEffect(() => {
  if (!visible || !enabled) return;
  let active = true;
  setLoading(true);
  setError('');
  readCatalog(books).then(({ items: catalog, partial }) => {
   if (!active) return;
   setItems(catalog);
   if (partial) setError('i18n.someContentCouldNotBeReadResults');
  }).catch(error => {
   if (!active) return;
   console.warn('无法读取全局搜索目录', error);
   setError('i18n.someContentCouldNotBeReadResults');
  }).finally(() => {
   if (active) setLoading(false);
  });
  return () => { active = false; };
 }, [visible, enabled, books, revision]);

 useEffect(() => {
  if (!visible || !enabled) return;
  const refresh = () => setRevision(value => value + 1);
  window.addEventListener('cyber-content-changed', refresh);
  return () => window.removeEventListener('cyber-content-changed', refresh);
 }, [visible, enabled]);

 const parsed=parseQuery(state.query,true);
 const expand=parsed.related;
 const titleTerm=parsed.tree?.op==='RELATED' && parsed.tree.a.value || state.query.trim().toLowerCase();
 const edges=useMemo(()=>expand?graphEdges(items,loadSpaceData('content-relations',[])):[],[expand,items,revision]);
 const results=queryRelatedEntities(items,state,edges).sort((a,b)=>{return Number(b.title.toLowerCase()===titleTerm)-Number(a.title.toLowerCase()===titleTerm)||a.title.localeCompare(b.title,'zh-CN');});
 useResultSource({ scopeId: 'global', priority:0,enabled,loading:visible&&hasSearch(state)&&loading,plain:!visible||!hasSearch(state),matches:visible&&hasSearch(state)?results:[]});
 useSearchCount('global',loading?null:results.length);
 if(!visible||!enabled||!hasSearch(state)||(!loading&&!error&&!results.length))return null;
 return <aside className="global-search-surface" aria-label={translate("i18n.globalSearchResults")}>{loading?<p role="status">{translate("i18n.readingStudyContent")}</p>:<><div className="global-search-results">{results.slice(0,limit).map(item=><button data-entity-key={item.key} key={item.key} onClick={()=>{setVisible(false);onOpen(item);}}><small>{translate(contentTypes[item.type])}</small><strong>{item.title}</strong><span>{searchValues(item.type,item).flat(Infinity).filter(v=>typeof v==='string'&&v!==item.title).join(' · ').slice(0,180)}</span></button>)}</div>{results.length>limit&&<button onClick={()=>setLimit(n=>n+40)}>{translate("i18n.showMore")}</button>}</>}{error&&<p role="alert">{translate(error)}<button onClick={()=>setRevision(v=>v+1)}>{translate("i18n.retry2")}</button></p>}</aside>;
}
