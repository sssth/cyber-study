import {slashCommand} from './logicQuery.js';
import QueryInput,{queryIssue} from './QueryInput.jsx';
import {scopeFields} from './queryFields.js';
import { commands, handleCommandKey } from '../ui/commands.js';
import { rememberFocus, restoreFocus } from '../ui/focusReturn.js';
import { frontModal } from '../ui/frontModal.js';
import { translate } from '../i18n/index.js';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {currentScope,setSearch,getScope,getSearchCount,subscribeSearch,suspendSearch,resumeSearch} from './searchStore.js';
import {matchesShortcut} from '../data/shortcuts.js';
import {usePageBackMatcher} from '../ui/useEscapeBack.js';
import {appliedExpression,changeFilter,expressionState,restoreExpression,normalizeFilter} from './filterExpression.js';

export default function UnifiedSearch({shortcuts,disabled=false,viewKey}){
 const isPageBack=usePageBackMatcher();
 const options=useRef();options.current={shortcuts,disabled,isPageBack};
 const bar=useRef(),input=useRef(),origin=useRef(),active=useRef(null),queryKeys=useRef(null);
 const focusOnOpen = useRef(null);
 const [current,setCurrent]=useState(null),[value,setValue]=useState(''),[filters,setFilters]=useState({}),[expanded,setExpanded]=useState(false),[choice,setChoice]=useState(null),[host,setHost]=useState(null);
 const draft=useRef(null);draft.current={expression:value,query:value,filters};
 const announce=id=>window.dispatchEvent(new CustomEvent('cyber-search-visibility',{detail:{id}}));
 const close=(restore=true)=>{focusOnOpen.current=null;const shouldRestore=restore&&getScope(active.current)?.autoFocus!==false;suspendSearch(active.current,draft.current);active.current=null;setCurrent(null);setExpanded(false);setChoice(null);announce(null);if(shouldRestore)restoreFocus(origin.current);};
 const findTarget = id => {
  const modal = frontModal();
  const root = document.fullscreenElement || document.body;
  const resolveHost = scope => {
   const preferred = scope.searchHost?.();
   if (modal) return preferred?.closest('dialog:modal') === modal ? preferred : null;
   if (preferred?.isConnected && root.contains(preferred) && !preferred.closest('dialog:not([open])')) return preferred;
   return root;
  };
  const scope = id ? getScope(id) : currentScope(candidate => !modal || Boolean(resolveHost(candidate)));
  if (!scope || scope.enabled === false) return null;
  const host = resolveHost(scope);
  return host ? { scope, host } : null;
 };
 const adopt=(next,host,replacement)=>{
   if(active.current&&active.current!==next.id)suspendSearch(active.current,draft.current);
   const saved=active.current===next.id?{draft:draft.current,applied:getScope(next.id).state}:resumeSearch(next.id);
   const expression=replacement??restoreExpression(saved.draft,next);
   const values=expressionState(expression,next).values;
   const applied=appliedExpression(replacement??restoreExpression(saved.applied,next),next,saved.applied);
   setSearch(next.id,applied);
   active.current=next.id;
   draft.current={expression,query:expression,filters:values};
   setCurrent(next);setValue(expression);setFilters(values);
   next.onApply?.(applied);
   setExpanded(false);setChoice(null);setHost(host);announce(next.id);
 };
 const refreshTarget = () => {
  if (!active.current) return;
  const target = findTarget();
  if (options.current.disabled || target?.scope.id !== active.current) close(false);
  else setHost(target.host);
 };
 useLayoutEffect(() => {
  const request = focusOnOpen.current;
  focusOnOpen.current = null;
  if (request && current?.id === request.id && document.activeElement === request.from) {
   input.current?.focus({ preventScroll: true });
   input.current?.select();
  }
 }, [current, host]);
 useEffect(()=>{
  const open = event => {
   if (options.current.disabled) return;
   const target = findTarget(event?.detail?.id);
   if (!target) return;
   origin.current = rememberFocus();
   focusOnOpen.current = event?.detail?.focus !== false && target.scope.autoFocus !== false
    ? { id: target.scope.id, from: document.activeElement }
    : null;
   adopt(target.scope, target.host);
  };
  const applyExpression=event=>{
   if(options.current.disabled||event.defaultPrevented)return;
   const target=findTarget();
   if(!target||target.scope.id!==event.detail?.id)return;
   origin.current=rememberFocus();
   adopt(target.scope,target.host,event.detail.query);
   event.preventDefault();
  };
  window.addEventListener('cyber-apply-expression',applyExpression);
  const toggle=()=>{if(options.current.disabled)return;if(active.current)close();else open();};
  const keys=e=>{
   const {disabled,shortcuts,isPageBack}=options.current;
   if(!disabled && active.current && queryKeys.current?.(e))return;
   if(disabled||isPageBack(e)||matchesShortcut(e,shortcuts?.openAI)||matchesShortcut(e,shortcuts?.snapshot)||matchesShortcut(e,shortcuts?.showOnGlobe))return;
   if(handleCommandKey(e,'search',shortcuts,toggle,{allowComposing:true}))return;
   if(e.key==='Escape'||e.isComposing||!active.current)return;
   if(bar.current?.contains(e.target))e.stopImmediatePropagation();
  };
  const closeForCommand=()=>{if(active.current)close(false);};
  const changed = () => queueMicrotask(refreshTarget);
  window.addEventListener('keydown',keys,true);window.addEventListener('cyber-open-search',open);window.addEventListener(commands.search.event,toggle);window.addEventListener('cyber-close-search',closeForCommand);window.addEventListener('cyber-search-scope-changed',changed);
  return()=>{window.removeEventListener('cyber-apply-expression',applyExpression);if(active.current){suspendSearch(active.current,draft.current);active.current=null;}window.removeEventListener('keydown',keys,true);window.removeEventListener('cyber-open-search',open);window.removeEventListener(commands.search.event,toggle);window.removeEventListener('cyber-close-search',closeForCommand);window.removeEventListener('cyber-search-scope-changed',changed);};
 },[]);
 useEffect(()=>{if(disabled&&active.current)close(false);},[disabled]);
 useEffect(()=>{if(active.current)close(false);},[viewKey]);
 useEffect(() => {
  if (!current || !host) return;
  const refreshHost = () => {
   if (active.current === current.id) refreshTarget();
  };
  const observer = new MutationObserver(records => {
   const changedDialog = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
    node.matches?.('dialog[open]') || node.querySelector?.('dialog[open]')
   ));
   if (!host.isConnected || changedDialog || records.some(record => record.target.matches?.('dialog') && record.type === 'attributes')) {
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
 const scope=getScope(current?.id)||current;
 const update=query=>{
   const target=getScope(active.current);
   if(!target||target.enabled===false){close(false);return;}
   const state=appliedExpression(query,target,target.state);
   const available=scopeFields(target,state.filters);
   if(queryIssue(state.query,available,target.relatedSearch)||(available.length&&slashCommand(state.query)))return;
   setSearch(target.id,state);
   target.onApply?.(state);
 };
 if(!current||!host)return null;
 const fields=scope.filters||[];
 const edit=(text,commit)=>{
   setValue(text);
   setFilters(expressionState(text,scope).values);
   if(commit)update(text);
 };
 const selectFilter=(field,input,valid=true)=>{
   const normalized=normalizeFilter(field,input);
   setFilters(previous=>({...previous,[field.key]:input}));
   if(!valid||normalized===null)return;
   const text=changeFilter(value,scope,field.key,normalized);
   setValue(text);
   setFilters({...expressionState(text,scope).values,[field.key]:input});
   update(text);
 };
 return createPortal(<div ref={bar} className={`unified-search${expanded?' has-filters':''}`} role="search" data-search-scope={current.id} aria-label={translate("i18n.search0", translate(current.label))} onClick={e=>e.stopPropagation()}>
  <div className="unified-search-row">{value.trim()&&count!=null&&<span className="search-result-count" role="status" aria-label={translate("i18n.0Results", count)}>{getScope(current.id)?.exactCount?count:count>99?'99+':count}</span>}<QueryInput key={current.id} scope={getScope(current.id)||current} inputRef={input} keyHandler={queryKeys} value={value} onEdit={edit}/>
   <button type="button" className="search-filter-toggle" aria-label={translate("i18n.filters")} aria-expanded={expanded} aria-controls="unified-search-filters" data-active={Object.values(filters).some(Boolean)||undefined} onClick={()=>{setExpanded(v=>!v);setChoice(null);}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></svg></button>
  </div>
  {expanded&&<div className="unified-search-filters" id="unified-search-filters">{fields.map(field=><label key={field.key}>{({fulltext:translate("i18n.fullText"),type:translate("i18n.type"),}[field.key]||translate(({'i18n.startDate':'i18n.from','i18n.endDate':'i18n.to'})[field.label]||field.label))}{field.type==='number'?<input type="number" aria-label={translate(field.label)} min={field.min} max={field.max} step={field.step} value={filters[field.key] ?? ''} onChange={e=>selectFilter(field,e.target.value,e.target.validity.valid)}/>:field.type==='date'?<input type="text" inputMode="numeric" aria-label={translate(field.label)} placeholder="YYYY-MM-DD" value={filters[field.key]||''} onChange={e=>selectFilter(field,e.target.value)}/>:<div className="search-choice"><button type="button" aria-label={translate(field.label)} aria-expanded={choice===field.key} onClick={()=>setChoice(v=>v===field.key?null:field.key)}>{translate(field.options.find(([id])=>id===filters[field.key])?.[1]||(field.defaultLabel||(field.key==='fulltext'?translate("i18n.metadataOnly"):translate("i18n.all"))))}<span aria-hidden="true">⌄</span></button>{choice===field.key&&<div className="search-choice-options">{[...(field.defaultLabel?[]:[['',field.key==='fulltext'?translate("i18n.metadataOnly"):translate("i18n.all")]]),...field.options].map(([id,label])=><button key={id} type="button" aria-pressed={(filters[field.key]||'')===id} onClick={event=>{event.preventDefault();setChoice(null);selectFilter(field,id);}}>{field.key==='fulltext'&&id?translate("i18n.includeFullText"):translate(label)}</button>)}</div>}</div>}</label>)}</div>}
 </div>,host);
}
