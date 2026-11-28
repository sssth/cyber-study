import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {matchesShortcut} from '../data/shortcuts.js';
import {translate as t} from '../i18n/index.js';
import {currentScope} from '../search/searchStore.js';
import AssistantConversation from '../search/ExpressionAssistant.jsx';
import {frontModal} from './frontModal.js';

function currentPage(){
 const modal=frontModal(),host=modal||document.fullscreenElement||document.body;
 const scope=currentScope(candidate=>!modal||candidate.searchHost?.()?.closest('dialog:modal')===modal);
 const surface=[...host.querySelectorAll('[data-tip-page]')].findLast(el=>!el.closest('[inert],[hidden]')&&el.checkVisibility());
 const page=[scope?.id,scope?.entityView,scope?.textOnly,surface?.dataset.tipPage,surface?.querySelector('.feature-body')?.dataset.scrollMemory];
 return {host,scopeId:scope?.id,key:JSON.stringify(page)};
}

export default function AIWindow({shortcuts,viewKey,showLauncher}){
 const [page,setPage]=useState(currentPage),[open,setOpen]=useState(false),[mode,setMode]=useState('general');
 const panel=useRef(),drag=useRef(),origin=useRef();
 useLayoutEffect(()=>{
   const sync=()=>{const next=currentPage();setPage(old=>old.key===next.key&&old.host===next.host?old:next);};
   const observer=new MutationObserver(records=>{
     if(records.some(r=>r.type==='attributes'||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches('dialog,[data-tip-page]')||n.querySelector('dialog,[data-tip-page]')))))sync();
   });
   observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-tip-page','data-scroll-memory','open','inert','hidden']});
   window.addEventListener('cyber-search-scope-changed',sync);document.addEventListener('fullscreenchange',sync);sync();
   return ()=>{observer.disconnect();window.removeEventListener('cyber-search-scope-changed',sync);document.removeEventListener('fullscreenchange',sync);};
 },[viewKey]);
 function close(){setOpen(false);if(origin.current?.isConnected)origin.current.focus({preventScroll:true});}
 function toggle(){if(open)close();else{origin.current=document.activeElement;setOpen(true);}}
 useEffect(()=>{
   const key=e=>{if(!matchesShortcut(e,shortcuts?.openAI))return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)toggle();};
   window.addEventListener('keydown',key,true);return ()=>window.removeEventListener('keydown',key,true);
 },[open,shortcuts]);
 function start(e){
   if(e.button!==0||e.target.closest('button'))return;
   const rect=panel.current.getBoundingClientRect();
   drag.current={x:e.clientX-rect.left,y:e.clientY-rect.top};
   e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e){
   if(!drag.current)return;
   const el=panel.current;
   const x=Math.max(0,Math.min(innerWidth-el.offsetWidth,e.clientX-drag.current.x));
   const y=Math.max(0,Math.min(innerHeight-el.offsetHeight,e.clientY-drag.current.y));
   el.style.left=x+'px';el.style.top=y+'px';el.style.right='auto';
   el.style.maxWidth='calc(100vw - '+x+'px)';el.style.maxHeight='calc(100dvh - '+y+'px)';
 }
 useEffect(()=>{
   const fit=()=>{const el=panel.current;if(!el?.style.left)return;el.style.left='';el.style.right='';el.style.top='';el.style.maxWidth='';el.style.maxHeight='';};
   window.addEventListener('resize',fit);return ()=>window.removeEventListener('resize',fit);
 },[]);
 const selected=page.scopeId?mode:'general';
 return createPortal(<>
   {showLauncher&&<button className="ai-rail-button" type="button" title={[t('i18n.openAIWindow'),shortcuts?.openAI?.join(' / ')].filter(Boolean).join(' · ')} aria-expanded={open} onClick={toggle}>AI</button>}
   <section hidden={!open} ref={panel} className="expression-assistant" role="dialog" aria-label="AI"
     onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing){e.stopPropagation();close();}}}>
     <header onPointerDown={start} onPointerMove={move} onLostPointerCapture={()=>{drag.current=null;}}><h2>AI</h2><button aria-label={t('i18n.close')} onClick={close}>×</button></header>
     <div className="ai-modes">{['general','expression'].map(id=><button type="button" key={id} disabled={id==='expression'&&!page.scopeId} aria-pressed={selected===id} onClick={()=>setMode(id)}>{t(id==='general'?'i18n.snapshot':'i18n.expressionAI')}</button>)}</div>
     {['general','expression'].map(id=><AssistantConversation key={JSON.stringify([viewKey,page.key,id])} general={id==='general'} scopeId={page.scopeId} shortcuts={shortcuts} open={open&&selected===id} onClose={close}/>)}
   </section>
 </>,page.host);
}
