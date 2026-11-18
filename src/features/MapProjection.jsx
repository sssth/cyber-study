import GlobePanel from './GlobePanel.jsx';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {currentMapSource,collectMemoryIds} from '../data/mapProjection.js';
import {loadSpaceData} from '../data/spaceStorage.js';
import {matchesShortcut} from '../data/shortcuts.js';
import {currentScope} from '../search/searchStore.js';
import UnifiedSearch from '../search/UnifiedSearch.jsx';
import ContentCommands from './ContentCommands.jsx';
import ModelLoading from '../ui/ModelLoading.jsx';

export default function MapProjection({shortcuts,disabled,onOpen,onActiveChange}) {
  const [request,setRequest]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const globeBack = useRef(null);
  const dialog=useRef(null),latest=useRef();latest.current={shortcuts,disabled,onOpen,onActiveChange,request};
  const close=()=>{const old=latest.current.request;if(!old)return;window.dispatchEvent(new Event('cyber-close-search'));setRequest(null);onActiveChange(false);requestAnimationFrame(()=>{old.focus?.isConnected&&old.focus.focus({preventScroll:true});if(old.searchId)window.dispatchEvent(new CustomEvent('cyber-open-search',{detail:{id:old.searchId}}));});};
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const keys=e=>{
      if(latest.current.request){if(e.key==='Escape'&&!e.repeat){
        const topModal=[...document.querySelectorAll('dialog:modal')].at(-1);
        if(topModal && topModal!==dialog.current && !dialog.current?.contains(topModal))return;
        const editor=dialog.current?.querySelector('dialog[open]:not(.edit-sidebar)');
        e.preventDefault();e.stopImmediatePropagation();
        if(editor && !editor.querySelector('.globe-control-workspace'))editor.dispatchEvent(new Event('cancel',{cancelable:true}));
        else if(!globeBack.current?.())closeRef.current();
      }return;}
      if(latest.current.disabled||e.isComposing||!matchesShortcut(e,latest.current.shortcuts.showOnGlobe))return;
      const source=currentMapSource();if(!source||source.blocked)return;
      e.preventDefault();e.stopImmediatePropagation();if(e.repeat||source.loading)return;
      const snapshot={entities:(source.entities||[]).filter(Boolean).map(({id,type,key,deletedAt})=>({id,type,key,deletedAt})),plain:Boolean(source.plain),links:loadSpaceData('content-relations',[]),focus:document.activeElement,searchId:document.querySelector('.unified-search')?currentScope()?.id:null};
      latest.current.onOpen();window.dispatchEvent(new Event('cyber-close-search'));
      setData(null);setError('');setRequest(snapshot);latest.current.onActiveChange(true);
    };
    window.addEventListener('keydown',keys,true);return()=>window.removeEventListener('keydown',keys,true);
  },[]);
  useLayoutEffect(()=>{if(request&&!dialog.current.open)dialog.current.showModal();},[request]);
  useEffect(()=>{
    if(!request)return;let alive=true;setError('');
    Promise.resolve().then(()=>{if(!window.cyberStudy?.globe)throw Error('无法读取记忆点');return window.cyberStudy.globe('list');}).then(result=>{
      if(result.error)throw Error(result.error);if(!alive)return;
      setData({...result,selectedPoints:request.plain?[]:collectMemoryIds(request.entities,request.links,result.photos||[],result.journeys||[])});
    }).catch(e=>{if(alive)setError(e.message||'记忆点读取失败');});return()=>{alive=false;};
  },[request,attempt]);
  if(!request)return null;
  return createPortal(<dialog ref={dialog} className="map-projection" data-projection-mode={request.plain?"plain":"highlight"} aria-label="在地球仪中显示" onCancel={e=>{if(e.target!==dialog.current)return;e.preventDefault();close();}}>
    {error?<div role="alert">{error}<button onClick={()=>setAttempt(v=>v+1)}>重试</button><button onClick={close}>×</button></div>:!data?<ModelLoading/>:
      <GlobePanel workspaceHost={dialog.current} initialData={data} initialView={request.plain ? undefined : {selectedPoints:data.selectedPoints}} projection backRef={globeBack} onClose={close}/>}
    <ContentCommands shortcuts={shortcuts} disabled={!data} viewKey="projection"/>
    <UnifiedSearch shortcuts={shortcuts} disabled={!data} viewKey="projection"/>
  </dialog>,document.fullscreenElement||document.body);
}
