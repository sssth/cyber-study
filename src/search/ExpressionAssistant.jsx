import {useEffect,useRef,useState} from 'react';
import {translate as t} from '../i18n/index.js';
import {getScope} from './searchStore.js';
import {readAssistantReply,searchCapabilities,validCandidate} from './expressionAssistant.js';
import {matchesShortcut,defaultChatKeys} from '../data/shortcuts.js';
import {snapshotPrompt} from '../data/snapshotPrompt.js';
import system from './expressionPrompt.txt?raw';

export default function AssistantConversation({general,scopeId,targetScope,open,onClose,shortcuts}){
 const [draft,setDraft]=useState(''),[turns,setTurns]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [files,setFiles]=useState([]);
 useEffect(()=>{
   if(!general)return;
   let active=true;
   const attach=({detail})=>{detail.saved.then(name=>{
     if(active)setFiles(items=>items.includes(name)?items:[...items,name]);
   },()=>{});};
   window.addEventListener('cyber-snapshot-attachment',attach);
   return ()=>{active=false;window.removeEventListener('cyber-snapshot-attachment',attach);};
 },[general]);
 const [copied,setCopied]=useState(false);
 const generation=useRef(0),pending=useRef(false),bottom=useRef(),input=useRef();
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 useEffect(()=>{if(open)bottom.current?.scrollIntoView({block:'nearest'});},[turns,open,busy,error]);
 async function send(event){
   event.preventDefault();
   const request=draft.trim(),scope=targetScope??getScope(scopeId);
   if(pending.current||(!request&&!(general&&files.length))||(!general&&(!scope||scope.enabled===false)))return;
   const ticket=++generation.current;
   pending.current=true;setCopied(false);setBusy(true);setError('');
   try{
     const ai=window.cyberStudy?.ai;
     if(!ai?.chatCurrent)throw Error(t('i18n.expressionDesktop'));
     let response,reply,content;
     if(general){
       const documents=await Promise.all(files.map(async name=>({name,text:await window.cyberStudy.snapshots.read(name)})));
       if(generation.current!==ticket)return;
       content=snapshotPrompt(request,documents);
       const messages=turns.flatMap(turn=>[{role:'user',content:turn.content},{role:'assistant',content:turn.reply.text}]);
       response=await ai.chatCurrent({messages:[...messages,{role:'user',content}]});
       reply={text:response.content};
     }else{
       const payload={...searchCapabilities(scope,t),today:new Date().toLocaleDateString('sv-SE'),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,request};
       if(turns.length)payload.conversation=turns;
       response=await ai.chatCurrent({system,messages:[{role:'user',content:JSON.stringify(payload)}]});
       if(generation.current!==ticket)return;
       try{reply=readAssistantReply(response?.content,targetScope??getScope(scopeId));}catch{}
       if(!reply)throw Error(t('i18n.expressionInvalid'));
     }
     if(generation.current!==ticket)return;
     setTurns(previous=>[...previous,general?{request,content,files,reply}:{request,reply}]);setDraft('');
     if(general)setFiles(items=>items.filter(name=>!files.includes(name)));
   }catch(failure){if(generation.current===ticket)setError(failure.message||t('i18n.expressionInvalid'));}
   finally{if(generation.current===ticket){pending.current=false;setBusy(false);}}
 }
 function reset(){
   generation.current++;pending.current=false;setCopied(false);setBusy(false);setTurns([]);setDraft('');setError('');
   input.current?.focus();
 }
 async function apply(){
   const query=turns.at(-1)?.reply.query,scope=targetScope??getScope(scopeId);
   if(!scope||!validCandidate(query,scope)){setError(t('i18n.expressionInvalid'));return;}
   if(targetScope){
     try{await navigator.clipboard.writeText(query);setCopied(true);}
     catch{setError(t('i18n.aiCopyFailed'));}
     return;
   }
   const handled=!window.dispatchEvent(new CustomEvent('cyber-apply-expression',{cancelable:true,detail:{id:scopeId,query}}));
   if(!handled){setError(t('i18n.expressionScopeChanged'));return;}
   reset();onClose();
 }
 if(!open)return null;
 const description=t(general?'i18n.aiQuestion':'i18n.expressionDescribe');
 return <>
   {!general&&!targetScope&&<small>{t(getScope(scopeId)?.label||'')}</small>}
   <div className="expression-turns" role="log">{turns.map(({request,reply,files:sentFiles},index)=><div key={index}>
     <p>{request}</p>{sentFiles?.map(name=><small className="sent-snapshot" key={name}>{t('i18n.attachedSnapshot',name)}</small>)}{reply.query?<code>{reply.query}</code>:<div>{reply.text||reply.ask||reply.unsupported}</div>}
   </div>)}<span ref={bottom}/></div>
   {error&&<p role="alert">{error}</p>}
   <form onSubmit={send}>
     {general&&files.length>0&&<div className="snapshot-attachments" aria-label={t('i18n.snapshotFiles')}>{files.map(name=>
       <button type="button" disabled={busy} key={name} aria-label={t('i18n.removeAttachment',name)} onClick={()=>setFiles(items=>items.filter(file=>file!==name))}>{name} ×</button>
     )}</div>}
     <textarea ref={input} aria-label={description} placeholder={description} rows={3}
     readOnly={busy} value={draft} onChange={e=>setDraft(e.target.value)}
     onKeyDown={e=>{
       if(e.nativeEvent.isComposing||e.keyCode===229)return;
       if(matchesShortcut(e,shortcuts?.sendMessage??defaultChatKeys.sendMessage)){e.preventDefault();e.stopPropagation();e.currentTarget.form.requestSubmit();}
     }}/>
     <footer className={general?'snapshot-actions':undefined}>
       <button type="submit" disabled={busy||(!draft.trim()&&!(general&&files.length))}>{t(busy?(general?'i18n.replying':'i18n.expressionPending'):'i18n.expressionSend')}</button>
       {!general&&<><button type="button" onClick={reset}>{t('i18n.aiReset')}</button>
       <button type="button" disabled={busy||Boolean(error)||Boolean(draft.trim())||!turns.at(-1)?.reply.query} onClick={apply}>{t(targetScope?(copied?'i18n.aiCopied':'i18n.aiCopyQuery'):'i18n.expressionApply')}</button></>}
     </footer>
   </form>
 </>;
}
