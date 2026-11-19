import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {captureEntities,currentMapSource} from '../data/mapProjection.js';
import {snapshotMarkdown} from '../data/snapshotMarkdown.js';
import {matchesShortcut} from '../data/shortcuts.js';
import {currentScope} from '../search/searchStore.js';

export default function SnapshotCommand({shortcuts,disabled,projection}){
  const [message,setMessage]=useState(''),timer=useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const notice=text=>{setMessage(text);clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),3500);};
    const save=async ()=>{
      if(disabled) return;
      try {
        const source=currentMapSource({snapshot:true}),snapshot=captureEntities(projection && !source?.projection?undefined:source);
        if(!snapshot.entities.length){notice(snapshot.message);return;}
        const time=Date.now(),markdown=snapshotMarkdown({...snapshot,source,scope:currentScope(),time});
        if(!window.cyberStudy?.snapshots) throw Error('请在桌面应用中保存快照');
        const name=await window.cyberStudy.snapshots.save({time,markdown});
        window.dispatchEvent(new Event('snapshots-changed'));notice('快照已保存：'+name);
      } catch(error){notice('快照未保存：'+error.message);}
    };
    const keys=event=>{
      if(disabled || event.isComposing || !matchesShortcut(event,shortcuts.snapshot)) return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.repeat) save();
    };
    window.addEventListener('keydown',keys,true);
    window.addEventListener('cyber-save-snapshot',save);
    return ()=>{
      window.removeEventListener('keydown',keys,true);
      window.removeEventListener('cyber-save-snapshot',save);
    };
  },[shortcuts,disabled,projection]);
  return message && createPortal(<div role="status" style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'#17323c',color:'white',padding:'9px 18px',borderRadius:10,zIndex:99999,pointerEvents:'none'}}>{message}</div>,[...document.querySelectorAll('dialog:modal')].at(-1) || document.fullscreenElement || document.body);
}
