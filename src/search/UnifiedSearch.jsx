import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {currentScope,setSearch,getScope,getSearchCount,subscribeSearch} from './searchStore.js';
import {matchesShortcut} from '../data/shortcuts.js';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export default function UnifiedSearch({shortcuts,disabled=false,viewKey}){
 const options=useRef({shortcuts,disabled});options.current={shortcuts,disabled};
 const bar=useRef(),input=useRef(),origin=useRef(),active=useRef(null),composing=useRef(false);
 const [current,setCurrent]=useState(null),[value,setValue]=useState(''),[filters,setFilters]=useState({}),[expanded,setExpanded]=useState(false),[choice,setChoice]=useState(null),[host,setHost]=useState(null);
 const announce=id=>window.dispatchEvent(new CustomEvent('cyber-search-visibility',{detail:{id}}));
 const close=(restore=true)=>{active.current=null;setCurrent(null);setExpanded(false);setChoice(null);announce(null);if(restore&&origin.current?.isConnected)origin.current.focus({preventScroll:true});};
 const adopt=next=>{active.current=next.id;setCurrent(next);setValue(next.state.query);setFilters({...next.state.filters});setExpanded(false);setChoice(null);setHost(document.querySelector('dialog[open]')||document.body);announce(next.id);};
 useEffect(()=>{
  const open=event=>{if(options.current.disabled)return;const next=event?.detail?.id?getScope(event.detail.id):currentScope();if(!next||next.enabled===false)return;origin.current=document.activeElement;adopt(next);requestAnimationFrame(()=>{if(active.current===next.id){input.current?.focus();input.current?.select();}});};
  const keys=e=>{if(matchesShortcut({key:e.key,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,shiftKey:e.shiftKey,target:e.target,isComposing:false,defaultPrevented:false},options.current.shortcuts?.search)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){if(active.current)close();else open();}return;}if(e.isComposing||!active.current)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}if(bar.current?.contains(e.target))e.stopImmediatePropagation();};
  const closeForCommand=()=>{if(active.current)close(false);};
  const changed=()=>{queueMicrotask(()=>{if(!active.current)return;const next=currentScope();if(options.current.disabled||!next){close(false);return;}if(next.id!==active.current)close(false);});};
  window.addEventListener('keydown',keys,true);window.addEventListener('cyber-open-search',open);window.addEventListener('cyber-close-search',closeForCommand);window.addEventListener('cyber-search-scope-changed',changed);
  return()=>{window.removeEventListener('keydown',keys,true);window.removeEventListener('cyber-open-search',open);window.removeEventListener('cyber-close-search',closeForCommand);window.removeEventListener('cyber-search-scope-changed',changed);};
 },[]);
 useEffect(()=>{if(disabled&&active.current)close(false);},[disabled]);
 useEffect(()=>{if(active.current)close(false);},[viewKey]);
 const count=useSyncExternalStore(subscribeSearch,()=>getSearchCount(current?.id),()=>null);
 const update=(query,nextFilters)=>{const scope=getScope(active.current);if(!scope||scope.enabled===false){close(false);return;}const committed={...nextFilters};for(const key of ['from','to'])if(committed[key]&&!validDate(committed[key]))committed[key]=scope.state.filters[key]||'';setSearch(scope.id,{query,filters:committed});scope.onApply?.({query,filters:committed});};
 if(!current||!host)return null;
 const fields=getScope(current.id)?.filters||current.filters||[];
 return createPortal(<div ref={bar} className={`unified-search${expanded?' has-filters':''}`} role="search" aria-label={`搜索${current.label}`} onClick={e=>e.stopPropagation()}>
  <div className="unified-search-row">{value.trim()&&count!=null&&<span className="search-result-count" role="status" aria-label={`${count} 个结果`}>{count>99?'99+':count}</span>}<input ref={input} type="search" aria-label={`搜索${current.label}`} placeholder={`搜索${current.label}`} value={value} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={e=>{composing.current=false;setValue(e.currentTarget.value);update(e.currentTarget.value,filters);}} onChange={e=>{setValue(e.target.value);if(!composing.current&&!e.nativeEvent.isComposing)update(e.target.value,filters);}}/>
   {fields.length>0&&<button type="button" className="search-filter-toggle" aria-label="筛选" aria-expanded={expanded} aria-controls="unified-search-filters" data-active={Object.values(filters).some(Boolean)||undefined} onClick={()=>setExpanded(v=>!v)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></svg></button>}
  </div>
  {expanded&&<div className="unified-search-filters" id="unified-search-filters">{fields.map(field=><label key={field.key}>{({fulltext:'正文',type:'类型',from:'起始',to:'截止'}[field.key]||field.label)}{field.type==='date'?<input type="text" inputMode="numeric" aria-label={field.label} placeholder="YYYY-MM-DD" value={filters[field.key]||''} onChange={e=>{const next={...filters,[field.key]:e.target.value};setFilters(next);if(!e.target.value||validDate(e.target.value)){if(next.from&&next.to&&next.from>next.to){if(field.key==='from')next.to=next.from;else next.from=next.to;setFilters(next);}update(value,next);}}}/>:<div className="search-choice"><button type="button" aria-label={field.label} aria-expanded={choice===field.key} onClick={()=>setChoice(v=>v===field.key?null:field.key)}>{field.options.find(([id])=>id===filters[field.key])?.[1]||(field.key==='fulltext'?'仅资料':'全部')}<span aria-hidden="true">⌄</span></button>{choice===field.key&&<div className="search-choice-options">{[['',field.key==='fulltext'?'仅资料':'全部'],...field.options].map(([id,label])=><button key={id} type="button" aria-pressed={(filters[field.key]||'')===id} onClick={()=>{const next={...filters,[field.key]:id};setFilters(next);setChoice(null);update(value,next);}}>{field.key==='fulltext'&&id?'含全文':label}</button>)}</div>}</div>}</label>)}<button type="button" className="search-filter-reset" onClick={()=>{setFilters({});update(value,{});}} aria-label="清除筛选">清除</button></div>}
 </div>,host);
}
