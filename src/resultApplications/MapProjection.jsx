import { commands, handleCommandKey } from '../ui/commands.js';
import { rememberFocus, restoreFocus } from '../ui/focusReturn.js';
import { translate, translateError } from '../i18n/index.js';
import GlobePanel from '../features/globe/GlobePanel.jsx';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import { currentResultInput } from '../results/activeResults.js';
import { collectMemoryIds } from './resolveMemoryPoints.js';
import {loadSpaceData} from '../data/spaceStorage.js';
import {matchesShortcut} from '../data/shortcuts.js';
import UnifiedSearch from '../search/UnifiedSearch.jsx';
import ContentCommands from '../features/ContentCommands.jsx';
import ModelLoading from '../ui/ModelLoading.jsx';

export default function MapProjection({shortcuts,disabled,onOpen,onActiveChange}) {
  const [request,setRequest]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const globeBack = useRef(null);
  const dialog=useRef(null),latest=useRef();latest.current={shortcuts,disabled,onOpen,onActiveChange,request};
  const close=()=>{const old=latest.current.request;if(!old)return;window.dispatchEvent(new Event('cyber-close-search'));setRequest(null);onActiveChange(false);requestAnimationFrame(()=>{restoreFocus(old.focus);if(old.searchId)window.dispatchEvent(new CustomEvent('cyber-open-search',{detail:{id:old.searchId}}));});};
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const getSource = () => {
      if (latest.current.request || latest.current.disabled) return null;
      const source = currentResultInput('map');
      return source?.blocked ? null : source;
    };
    const open = source => {
      if (!source || source.loading) return;
      const snapshot = {
        entities: source.entities.filter(Boolean).map(({ id, type, key, deletedAt }) => ({ id, type, key, deletedAt })),
        plain: Boolean(source.plain),
        links: loadSpaceData('content-relations', []),
        focus: rememberFocus(),
        searchId: document.querySelector('.unified-search')?.dataset.searchScope ?? null
      };
      latest.current.onOpen();
      window.dispatchEvent(new Event('cyber-close-search'));
      setData(null);
      setError('');
      setRequest(snapshot);
      latest.current.onActiveChange(true);
    };
    const openFromCommand = () => open(getSource());
    const keys = event => {
      if (latest.current.request) {
        if (event.key !== 'Escape' || event.repeat) return;
        const topModal = [...document.querySelectorAll('dialog:modal')].at(-1);
        if (topModal && topModal !== dialog.current && !dialog.current?.contains(topModal)) return;
        const editor = dialog.current?.querySelector('dialog[open]:not(.edit-sidebar)');
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor && !editor.querySelector('.globe-control-workspace')) editor.dispatchEvent(new Event('cancel', { cancelable: true }));
        else if (!globeBack.current?.()) closeRef.current();
        return;
      }
      if (!matchesShortcut(event, latest.current.shortcuts.showOnGlobe)) return;
      const source = getSource();
      if (source) handleCommandKey(event, 'map', latest.current.shortcuts, () => open(source));
    };
    window.addEventListener('keydown', keys, true);
    window.addEventListener(commands.map.event, openFromCommand);
    return () => {
      window.removeEventListener('keydown', keys, true);
      window.removeEventListener(commands.map.event, openFromCommand);
    };
  },[]);
  useLayoutEffect(()=>{if(request&&!dialog.current.open)dialog.current.showModal();},[request]);
  useEffect(()=>{
    if(!request)return;let alive=true;setError('');
    Promise.resolve().then(()=>{if(!window.cyberStudy?.globe)throw Error(translate("i18n.couldNotReadMemoryPins"));return window.cyberStudy.globe('list');}).then(result=>{
      if(result.error)throw Error(result.error);if(!alive)return;
      setData({...result,selectedPoints:request.plain?[]:collectMemoryIds(request.entities,request.links,result.photos||[],result.journeys||[])});
    }).catch(e=>{if(alive)setError(e.message||translate("i18n.couldNotLoadMemoryPins"));});return()=>{alive=false;};
  },[request,attempt]);
  if(!request)return null;
  return createPortal(<dialog ref={dialog} className="map-projection" data-command-scope="projection" data-projection-mode={request.plain?"plain":"highlight"} aria-label={translate("i18n.showOnGlobe")} onCancel={e=>{if(e.target!==dialog.current)return;e.preventDefault();close();}}>
    {error?<div role="alert">{translateError(error)}<button onClick={()=>setAttempt(v=>v+1)}>{translate("i18n.retry")}</button><button onClick={close}>×</button></div>:!data?<ModelLoading/>:
      <GlobePanel workspaceHost={dialog.current} initialData={data} initialView={{selectedPoints:data.selectedPoints}} projection backRef={globeBack} onClose={close}/>}
    <ContentCommands shortcuts={shortcuts} disabled={!data} viewKey="projection"/>
    <UnifiedSearch shortcuts={shortcuts} disabled={!data} viewKey="projection"/>
  </dialog>,document.fullscreenElement||document.body);
}
