import { clearSelection, restoreSelection } from './entitySelection.js';
import { commands } from '../ui/commands.js';
import { rememberFocus, restoreFocus } from '../ui/focusReturn.js';
import { readCatalog } from './readCatalog.js';
import { translate, translateError } from '../i18n/index.js';
import useResultSource, {resultEntities} from '../results/useResultSource.js';
import { ContentCommand } from '../features/ContentCommands.jsx';
import {useSearchCount,useSearchScope} from '../search/useSearchScope.jsx';
import {matchesCatalogItem} from '../search/searchCore.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { contentAt } from '../ui/contentTargets.js';
import { contentTypes } from './registry.js';
import { canRelate, commonNeighbors, addRelations, removeRelations } from './contentRelations.js';
import { buildCatalog } from './catalog.js';
import { contentDataChangeEvent, createId, loadSpaceData, saveContentData } from '../data/spaceStorage.js';
import { memoPosition } from '../features/memo/memoLayout.js';
import { commandTargetMode, setCommandTargetMode } from '../ui/commandTarget.js';
const emptyBooks=[];
const destinations = [['diary', "i18n.todaySEntryAppendIfPresent"], ['memo', "i18n.memoNote"], ['todo', "i18n.toDo"]];
const relatedPreview = item => item?.text || item?.annotation || item?.quote || item?.caption || item?.note || item?.description;

export default function ContentRelationshipPanel({books=emptyBooks, onNavigate}){
 const dialog=useRef(null),returnFocus=useRef(null),requestId=useRef(0), editItem=useRef(null);
 const [source,setSource]=useState(null),[catalog,setCatalog]=useState([]),[category,setCategory]=useState(''),[links,setLinks]=useState([]),[tab,setTab]=useState('view'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[target,setTarget]=useState('diary'),[text,setText]=useState('');
 const members = source?.members ?? (source ? [source] : []);
 const memberTypes = [...new Set(members.map(member => member.type))];
 const accepts = item => memberTypes.length > 0 && memberTypes.every(type => canRelate({ type }, item));
 const selectionOrigin = useRef(null);
 const search=useSearchScope({id:source?`${tab==='view'?'related':'relations'}:${source.key}`:'relations',label:tab==='view'?translate("i18n.linkedContent"):translate("i18n.availableContent"),priority:100,enabled:Boolean(source),searchHost:()=>dialog.current,filters:[{key:'type',label:translate("i18n.type"),options:Object.entries(contentTypes).filter(([type])=>accepts({key:'category',type}))},{key:'fulltext',label:translate("i18n.bookText"),options:[['yes',translate("i18n.includeFullBookText")]]}],onApply:()=>{if(tab!=='view')setTab('existing');setCategory('');}});
 const close=()=>{window.dispatchEvent(new Event('cyber-close-search'));requestId.current++;dialog.current?.close();setSource(null);restoreFocus(returnFocus.current);};
 // Restore the originating filter before comparing its results with the saved
 // selection. The relation panel has its own search scope while it is open.
 useEffect(() => {
   if (source || !selectionOrigin.current) return;
   const origin = selectionOrigin.current;
   selectionOrigin.current = null;
   if (origin.searchId) window.dispatchEvent(new CustomEvent('cyber-open-search', { detail: { id: origin.searchId, focus: false } }));
   const frame = requestAnimationFrame(() => restoreSelection(origin.selection));
   return () => cancelAnimationFrame(frame);
 }, [source]);
 const refreshCatalog=useCallback(async ()=>{
  const version = ++requestId.current;
  setLoading(true);
  setError('');
  try {
   const { items, partial } = await readCatalog(books);
   if (version !== requestId.current) return;
   setCatalog(items);
   setLinks(loadSpaceData('content-relations', []));
   if (partial) setError(translate("i18n.couldNotLoadGlobeContent") + translate("i18n.otherTypesAreStillAvailableSelectRetry"));
  } catch {
   if (version === requestId.current) setError(translate("i18n.couldNotLoadLibrary"));
  } finally {
   if (version === requestId.current) setLoading(false);
  }
 },[books]);
 useEffect(()=>{
  const show = (current, item, canEdit) => {
    if ((dialog.current?.open && !current?.members) || !current?.id) return;
    window.dispatchEvent(new Event('cyber-close-search'));
    setCommandTargetMode(null);
    returnFocus.current = rememberFocus(current.element);
    editItem.current = canEdit ? item : null;
    setSource(current);
    setCatalog(buildCatalog({ books }));
    setLinks(loadSpaceData('content-relations', []));
    setCategory('');
    setTab('view');
    setText('');
    setStatus('');
    setError('');
    setTarget(destinations.find(([type]) => (current.members ?? [current]).every(member => canRelate(member, { key: 'draft', type })))?.[0] ?? '');
    if (!dialog.current.open) dialog.current.showModal();
    refreshCatalog();
  };
  const handler = event => {
    if (dialog.current?.open || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const current = contentAt(event.target);
    if (!current?.id) return;
    event.preventDefault();
    event.stopPropagation();
    show(current);
  };
  // Keep application-wide reader and player keys from acting behind the modal.
  const key = event => {
    if (!dialog.current?.open || event.target?.closest?.('[data-content-command-dialog]')) return;
    event.stopImmediatePropagation();
  };
  const showRequested = event => {
    const { source, selection } = event.detail ?? {};
    if (selection) {
      if (dialog.current?.open || !selection.canRelate) return;
      selectionOrigin.current = { selection, searchId: document.querySelector('.unified-search')?.dataset.searchScope };
      clearSelection();
    }
    show(source);
  };
  const toggle = () => {
    if (dialog.current?.open) close();
    else setCommandTargetMode(commandTargetMode() === 'relate' ? null : 'relate');
  };
  window.addEventListener(commands.relate.event, toggle);
  window.addEventListener('cyber-show-relations', showRequested);
  document.addEventListener('contextmenu', handler, true);
  document.addEventListener('keydown', key);
  return () => {
    window.removeEventListener('cyber-show-relations', showRequested);
    window.removeEventListener(commands.relate.event, toggle);
    document.removeEventListener('contextmenu', handler, true);
    document.removeEventListener('keydown', key);
    requestId.current++;
  };
 },[books, refreshCatalog]);
 useEffect(() => {
  if (!source) return;
  const update = event => {
   if (event.detail === 'content-relations') setLinks(loadSpaceData('content-relations', []));
   else refreshCatalog();
  };
  window.addEventListener(contentDataChangeEvent, update);
  return () => window.removeEventListener(contentDataChangeEvent, update);
 }, [source, refreshCatalog]);
 async function connect(item){setError('');try{setStatus(addRelations(members,item)?'':translate("i18n.theseItemsAreAlreadyLinked"));}catch(e){setError(e.message);}}
 function create(){if(!text.trim()){setError(translate("i18n.enterSomeText"));return;}const key=target==='diary'?'diary':'memo',old=loadSpaceData(key,[]),now=new Date();let record;
  if(target==='diary'){const today=old.find(i=>new Date(i.date).toDateString()===now.toDateString());record=today?{...today,text:[today.text,text.trim()].filter(Boolean).join('\n\n'),updatedAt:now.toISOString()}:{id:createId('diary'),date:now.toISOString(),text:text.trim(),mood:'',photo:'',createdAt:now.toISOString()};}
  else record={id:createId(target),type:target==='todo'?'todo':'sticky',text:text.trim(),done:false,completedAt:null,tone:'blue',...memoPosition(old,target==='todo'?'todo':'sticky'),createdAt:now.toISOString()};
  const destination={key:`${target}:${record.id}`,id:record.id,type:target,title:record.text.slice(0,40)};
  if(!accepts(destination)){setError(translate("i18n.thisTypeOfItemCannotBeLinked"));return;}
  const next=old.some(i=>i.id===record.id)?old.map(i=>i.id===record.id?record:i):[record,...old];
  if(!saveContentData(key,next)){setError(translate("i18n.couldNotSaveTheRecordCheckAvailable"));return;}
  try{addRelations(members,destination);setCatalog(items=>[...items.filter(i=>i.key!==destination.key),destination]);setText('');setStatus('');setError('');}catch(e){const rolledBack=saveContentData(key,old);setError(rolledBack?e.message:translate("i18n.theRecordWasSavedOpenItIn"));}
 }
 const liveKeys = new Set(catalog.map(item => item.key));
 const common = commonNeighbors(members, links.filter(link => liveKeys.has(link.fromId) && liveKeys.has(link.toId)));
 const related = [...common].map(([key, group]) => {
   const link = group.values().next().value;
   const item = catalog.find(entry => entry.key === key);
   const title = item?.title || (link.toId === key ? link.toTitle : link.fromTitle) || translate("i18n.sourceUnavailable");
   return { key, group, item, title, type: item?.type || key.split(':')[0] };
 });
 const candidates = tab === 'view' ? [] : catalog.filter(item => accepts(item) && !common.has(item.key) && matchesCatalogItem(item, search));
 const visibleCandidates = candidates.filter(item => !category || item.type === category);
 const visibleRelated = related.filter(record => matchesCatalogItem(record.item ?? record, search));
 useResultSource({ scopeId: source ? `${tab === 'view' ? 'related' : 'relations'}:${source.key}` : 'relations', priority:100,label:translate("i18n.relatedContent")+(source?.title || ''),enabled:Boolean(source),loading,matches:tab==='view'?visibleRelated.map(r=>r.item).filter(Boolean):tab==='existing'?visibleCandidates:source?.members?members:[catalog.find(item=>item.key===source?.key) ?? (source && {id:source.id,type:source.type,key:source.key,title:source.title})]});

 useSearchCount(source ? `${tab === 'view' ? 'related' : 'relations'}:${source.key}` : 'relations',
   loading ? null : tab === 'view' ? visibleRelated.length : visibleCandidates.length);

 const changeTab = next => {
   window.dispatchEvent(new Event('cyber-close-search'));
   setTab(next);
   setError('');
 };

 const chooseEdit = () => {
   const item = editItem.current;
   close();
   if (item?.isConnected) window.dispatchEvent(new CustomEvent('cyber-edit-presented-item', { detail: { item } }));
 };

 return createPortal(<dialog ref={dialog} className="content-relation-dialog" data-tip-page="relations" data-command-scope="relations" aria-labelledby="content-relation-title"
   onCancel={event => { event.preventDefault(); if (tab === 'view') close(); else changeTab('view'); }}
   onClick={event => event.stopPropagation()}>
   <header>
     <div><p>{tab === 'view' ? translate("i18n.relatedContent2") : translate("i18n.addLink")}</p>
       <h2 id="content-relation-title">{source?.title}</h2><small>{source?.members ? null : translate(contentTypes[source?.type])}</small>
     </div>
     <div className="relation-header-actions">
       {tab === 'view' && <button type="button" onClick={() => changeTab('existing')}>{translate("i18n.addLink")}</button>}
       {tab === 'view' && editItem.current && <button type="button" onClick={chooseEdit}>{translate("i18n.editItem")}</button>}
       {tab !== 'view' && <button type="button" onClick={() => changeTab('view')}>{translate("i18n.backToLinks")}</button>}
       <button type="button" onClick={close} aria-label={translate("i18n.closeLinksPanel")}>{translate("i18n.close")}</button>
     </div>
   </header>
   {source && <ContentCommand kind="create" createActive={tab !== 'view'} label={tab === 'view' ? translate("i18n.addLink") : translate("i18n.backToLinks")}
     run={() => changeTab(tab === 'view' ? 'existing' : 'view')} />}
   {tab !== 'view' && <nav className="relation-tabs" aria-label={translate("i18n.linkingOptions")}>
     {[['existing', translate("i18n.linkExistingContent")], ['new', translate("i18n.createAndLinkARecord")]].map(([id, label]) =>
       <button type="button" key={id} aria-pressed={tab === id} onClick={() => changeTab(id)}>{translate(label)}</button>)}
   </nav>}
   <div className="relation-dialog-body">
     {tab === 'view' && <div className="relation-overview">
       <section aria-label={translate("i18n.linkedContent")} className="relation-existing">
         <h3>{translate(source?.members ? 'i18n.commonLinks' : 'i18n.linkedContent')}{' '}<small>{common.size}</small></h3>


         {visibleRelated.map(({ key, group, item, title, type }) => {
           const preview = relatedPreview(item);
           return <article key={key} data-entity-key={key} data-edit-item>
             <h4>{item ? <button type="button" className="relation-open" onClick={() => {
               const origin = { ...catalog.find(entry => entry.key === source.key), ...source };
               selectionOrigin.current = null;
               close();
               onNavigate(item, source.members ? undefined : origin);
             }}>{title}</button> : title} <small>{translate(contentTypes[type])}</small></h4>
             {preview && <p>{preview}</p>}
             <ContentCommand label={translate("i18n.unlink0", title)} confirm run={() => {
               try {
                 removeRelations([...group.values()].map(link => link.id));
                 setStatus('');
               } catch (failure) {
                 setError(failure.message);
               }
             }} />
           </article>;
         })}
       </section>
     </div>}
     {tab === 'existing' && <div className="relation-browser">
       <nav aria-label={translate("i18n.contentType")}>
         <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>{translate("i18n.allAvailableItems")}</button>
         {Object.entries(contentTypes).filter(([type]) => accepts({ key: 'category', type })).map(([type, label]) =>
           <button type="button" key={type} aria-pressed={category === type} onClick={() => setCategory(type)}>
             {translate(label)}<span>{candidates.filter(item => item.type === type).length}</span>
           </button>)}
       </nav>
       <section aria-label={translate("i18n.availableContent")} aria-busy={loading}>
         {loading ? <p role="status">{translate("i18n.loadingContent")}</p> : visibleCandidates.length ? visibleCandidates.map(item =>
           <article data-entity-key={item.key} key={item.key}>
             <div><strong>{item.title}</strong><small>{translate(contentTypes[item.type])}</small></div>
             <button type="button" onClick={() => connect(item)}>{translate("i18n.link")}</button>
           </article>) : <></>}
       </section>
     </div>}
     {tab === 'new' && <div className="stack-form">
       <label>{translate("i18n.createIn")}<select value={target} onChange={event => setTarget(event.target.value)}>
         {destinations.filter(([type]) => accepts({ key: 'draft', type })).map(([type, label]) =>
           <option value={type} key={type}>{translate(label)}</option>)}
       </select></label>
       <label>{translate("i18n.recordText")}<textarea rows="5" value={text} onChange={event => setText(event.target.value)} /></label>
       <button type="button" onClick={create} disabled={!target || !text.trim()}>{translate("i18n.saveAndLink")}</button>
     </div>}
   </div>
   <footer>{status && <p role="status">{status}</p>}
     {error && <p role="alert">{translateError(error)}<button type="button" disabled={loading} onClick={refreshCatalog}>{translate("i18n.reload")}</button></p>}
   </footer>
 </dialog>, document.body);
}
