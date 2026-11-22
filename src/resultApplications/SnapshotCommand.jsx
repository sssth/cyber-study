import { translate, translateError } from '../i18n/index.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import { currentResultInput } from '../results/activeResults.js';
import { captureEntities } from './captureSnapshot.js';
import {snapshotMarkdown} from './snapshotMarkdown.js';
import { commands, handleCommandKey } from '../ui/commands.js';

export default function SnapshotCommand({shortcuts,disabled,projection}){
  const [message,setMessage]=useState(''),timer=useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const notice=text=>{setMessage(text);clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),3500);};
    const save=async ()=>{
      if(disabled) return;
      try {
        const source=currentResultInput('snapshot');
        if (source?.scopeId === 'entity-trash') return;
        const snapshot=captureEntities(projection && !source?.projection?undefined:source);
        if(!snapshot.entities.length){notice(translateError(snapshot.message));return;}
        const time=Date.now(),markdown=snapshotMarkdown({...snapshot,source,scope:source.scope,time});
        if(!window.cyberStudy?.snapshots) throw Error(translate("i18n.openTheDesktopAppToSaveA"));
        const name=await window.cyberStudy.snapshots.save({time,markdown});
        window.dispatchEvent(new Event('snapshots-changed'));notice(translate("i18n.snapshotSaved")+name);
      } catch(error){notice(translate("i18n.snapshotCouldNotBeSaved")+translateError(error.message));}
    };
    const keys = event => {
      if (!disabled) handleCommandKey(event, 'snapshot', shortcuts, save);
    };
    window.addEventListener('keydown',keys,true);
    window.addEventListener(commands.snapshot.event,save);
    return ()=>{
      window.removeEventListener('keydown',keys,true);
      window.removeEventListener(commands.snapshot.event,save);
    };
  },[shortcuts,disabled,projection]);
  return message && createPortal(<div role="status" style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'#17323c',color:'white',padding:'9px 18px',borderRadius:10,zIndex:99999,pointerEvents:'none'}}>{message}</div>,[...document.querySelectorAll('dialog:modal')].at(-1) || document.fullscreenElement || document.body);
}
