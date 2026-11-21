import { commands, handleCommandKey } from '../ui/commands.js';
import { rememberFocus, restoreFocus } from '../ui/focusReturn.js';
import { translate } from '../i18n/index.js';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {currentScope,setSearch,getScope,getSearchCount,subscribeSearch,suspendSearch,resumeSearch} from './searchStore.js';
import {matchesShortcut} from '../data/shortcuts.js';
import {usePageBackMatcher} from '../ui/useEscapeBack.js';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export default function UnifiedSearch({shortcuts,disabled=false,viewKey}){
 const isPageBack=usePageBackMatcher();
 const options=useRef();options.current={shortcuts,disabled,isPageBack};
 const bar=useRef(),input=useRef(),origin=useRef(),active=useRef(null),composing=useRef(false);
 const [current,setCurrent]=useState(null),[value,setValue]=useState(''),[filters,setFilters]=useState({}),[expanded,setExpanded]=useState(false),[choice,setChoice]=useState(null),[host,setHost]=useState(null);
 const draft=useRef({query:value,filters});draft.current={query:value,filters};
 const announce=id=>window.dispatchEvent(new CustomEvent('cyber-search-visibility',{detail:{id}}));
 const close=(restore=true)=>{const shouldRestore=restore&&getScope(active.current)?.autoFocus!==false;suspendSearch(active.current,draft.current);active.current=null;setCurrent(null);setExpanded(false);setChoice(null);announce(null);if(shouldRestore)restoreFocus(origin.current);};
 const hostFor=scope=>scope?.searchHost?.()||document.querySelector('dialog[open]')||document.fullscreenElement||document.body;
 const adopt=next=>{if(active.current&&active.current!==next.id)suspendSearch(active.current,draft.current);const saved=resumeSearch(next.id);active.current=next.id;draft.current=saved.draft;setCurrent(next);setValue(saved.draft.query);setFilters({...saved.draft.filters});next.onApply?.(saved.applied);setExpanded(false);setChoice(null);setHost(hostFor(next));announce(next.id);};
 useEffect(()=>{
  const open=event=>{if(options.current.disabled)return;const next=event?.detail?.id?getScope(event.detail.id):currentScope();if(!next||next.enabled===false)return;origin.current=rememberFocus();adopt(next);requestAnimationFrame(()=>{if(active.current===next.id&&getScope(next.id)?.autoFocus!==false){input.current?.focus();input.current?.select();}});};
  const toggle=()=>{if(options.current.disabled)return;if(active.current)close();else open();};
  const keys=e=>{
   const {disabled,shortcuts,isPageBack}=options.current;
   if(disabled||isPageBack(e)||matchesShortcut(e,shortcuts?.snapshot)||matchesShortcut(e,shortcuts?.showOnGlobe))return;
   if(handleCommandKey(e,'search',shortcuts,toggle,{allowComposing:true}))return;
   if(e.key==='Escape'||e.isComposing||!active.current)return;
   if(bar.current?.contains(e.target))e.stopImmediatePropagation();
  };
  const closeForCommand=()=>{if(active.current)close(false);};
  const changed=()=>{queueMicrotask(()=>{if(!active.current)return;const next=currentScope();if(options.current.disabled||!next){close(false);return;}if(next.id!==active.current)close(false);else setHost(hostFor(next));});};
  window.addEventListener('keydown',keys,true);window.addEventListener('cyber-open-search',open);window.addEventListener(commands.search.event,toggle);window.addEventListener('cyber-close-search',closeForCommand);window.addEventListener('cyber-search-scope-changed',changed);
  return()=>{if(active.current){suspendSearch(active.current,draft.current);active.current=null;}window.removeEventListener('keydown',keys,true);window.removeEventListener('cyber-open-search',open);window.removeEventListener(commands.search.event,toggle);window.removeEventListener('cyber-close-search',closeForCommand);window.removeEventListener('cyber-search-scope-changed',changed);};
 },[]);
 useEffect(()=>{if(disabled&&active.current)close(false);},[disabled]);
 useEffect(()=>{if(active.current)close(false);},[viewKey]);
 useEffect(() => {
  if (!current || !host) return;
  const refreshHost = () => {
   if (active.current === current.id) setHost(hostFor(getScope(current.id)));
  };
  const observer = new MutationObserver(records => {
   const addedDialog = records.some(record => Array.from(record.addedNodes).some(node =>
    node.matches?.('dialog[open]') || node.querySelector?.('dialog[open]')
   ));
   if (!host.isConnected || addedDialog || records.some(record => record.target.matches?.('dialog') && record.type === 'attributes')) {
    refreshHost();
   }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('fullscreenchange', refreshHost);
  return () => {
   observer.disconnect();
   document.removeEventListener('fullscreenchange', refreshHost);
  };
 }, [current, host]);
 const count=useSyncExternalStore(subscribeSearch,()=>getSearchCount(current?.id),()=>null);
 const update=(query,nextFilters)=>{const scope=getScope(active.current);if(!scope||scope.enabled===false){close(false);return;}const committed={...nextFilters};for(const key of ['from','to'])if(committed[key]&&!validDate(committed[key]))committed[key]=scope.state.filters[key]||'';setSearch(scope.id,{query,filters:committed});scope.onApply?.({query,filters:committed});};
 if(!current||!host)return null;
 const fields=getScope(current.id)?.filters||current.filters||[];
 return createPortal(<div ref={bar} className={`unified-search${expanded?' has-filters':''}`} role="search" data-search-scope={current.id} aria-label={translate("i18n.search0", translate(current.label))} onClick={e=>e.stopPropagation()}>
  <div className="unified-search-row">{value.trim()&&count!=null&&<span className="search-result-count" role="status" aria-label={translate("i18n.0Results", count)}>{getScope(current.id)?.exactCount?count:count>99?'99+':count}</span>}<input ref={input} type="text" role="searchbox" inputMode="search" aria-label={translate("i18n.search0", translate(current.label))} value={value} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={e=>{composing.current=false;setValue(e.currentTarget.value);update(e.currentTarget.value,filters);}} onChange={e=>{setValue(e.target.value);if(!composing.current&&!e.nativeEvent.isComposing)update(e.target.value,filters);}}/>
   <button type="button" className="search-filter-toggle" aria-label={translate("i18n.filters")} aria-expanded={expanded} aria-controls="unified-search-filters" data-active={Object.values(filters).some(Boolean)||undefined} onClick={()=>{setExpanded(v=>!v);setChoice(null);}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></svg></button>
  </div>
  {expanded&&<div className="unified-search-filters" id="unified-search-filters">{fields.map(field=><label key={field.key}>{({fulltext:translate("i18n.fullText"),type:translate("i18n.type"),from:translate("i18n.from"),to:translate("i18n.to")}[field.key]||translate(field.label))}{field.type==='date'?<input type="text" inputMode="numeric" aria-label={translate(field.label)} placeholder="YYYY-MM-DD" value={filters[field.key]||''} onChange={e=>{const next={...filters,[field.key]:e.target.value};setFilters(next);if(!e.target.value||validDate(e.target.value)){if(next.from&&next.to&&next.from>next.to){if(field.key==='from')next.to=next.from;else next.from=next.to;setFilters(next);}update(value,next);}}}/>:<div className="search-choice"><button type="button" aria-label={translate(field.label)} aria-expanded={choice===field.key} onClick={()=>setChoice(v=>v===field.key?null:field.key)}>{translate(field.options.find(([id])=>id===filters[field.key])?.[1]||(field.defaultLabel||(field.key==='fulltext'?translate("i18n.metadataOnly"):translate("i18n.all"))))}<span aria-hidden="true">⌄</span></button>{choice===field.key&&<div className="search-choice-options">{[...(field.defaultLabel?[]:[['',field.key==='fulltext'?translate("i18n.metadataOnly"):translate("i18n.all")]]),...field.options].map(([id,label])=><button key={id} type="button" aria-pressed={(filters[field.key]||'')===id} onClick={event=>{event.preventDefault();const next={...filters,[field.key]:id};setFilters(next);setChoice(null);update(value,next);}}>{field.key==='fulltext'&&id?translate("i18n.includeFullText"):translate(label)}</button>)}</div>}</div>}</label>)}</div>}
 </div>,host);
}
