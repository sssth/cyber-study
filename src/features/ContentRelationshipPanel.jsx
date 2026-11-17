import { ContentCommand } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope} from '../search/useSearchScope.jsx';
import {matchesCatalogItem} from '../search/searchCore.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sampleBooks } from '../reader/sampleBooks.js';
import { contentAt, contentTypes, canRelate, relationExists, addRelation, removeRelation, buildCatalog } from '../data/contentRelations.js';
import { createId, loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';
import { memoPosition } from './memoLayout.js';
const emptyBooks=[];
const destinations = [['diary', '今日日记（已有则追加）'], ['memo', 'Memo 便签'], ['todo', '待办']];
const relatedPreview = item => item?.annotation || item?.quote || item?.text || item?.caption || item?.note || item?.description;

export default function ContentRelationshipPanel({books=emptyBooks, onNavigate}){
 const dialog=useRef(null),returnFocus=useRef(null),requestId=useRef(0), editItem=useRef(null);
 const [source,setSource]=useState(null),[catalog,setCatalog]=useState([]),[category,setCategory]=useState(''),[links,setLinks]=useState([]),[tab,setTab]=useState('view'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[target,setTarget]=useState('diary'),[text,setText]=useState('');
 const search=useSearchScope({id:source?`${tab==='view'?'related':'relations'}:${source.key}`:'relations',label:tab==='view'?'已关联内容':'可关联内容',priority:100,enabled:Boolean(source),filters:[{key:'type',label:'类型',options:Object.entries(contentTypes).filter(([type])=>source&&canRelate(source,{key:'category',type}))},{key:'fulltext',label:'书籍正文',options:[['yes','包含书籍全文']]}],onApply:()=>{if(tab!=='view')setTab('existing');setCategory('');}});
 const close=()=>{window.dispatchEvent(new Event('cyber-close-search'));requestId.current++;dialog.current?.close();setSource(null);returnFocus.current?.isConnected&&returnFocus.current.focus({preventScroll:true});};
 const refreshCatalog=useCallback(async ()=>{
  const version=++requestId.current;setLoading(true);setError('');const errors=[];
  const results=await Promise.allSettled([window.cyberStudy?.listBooks?.()||Promise.resolve([]),window.cyberStudy?.globe?.('list')||Promise.resolve({})]);
  if(version!==requestId.current)return;
  const storedBooks=results[0].status==='fulfilled'?results[0].value:[];
  const globe=results[1].status==='fulfilled'?results[1].value:{};
  if(results[0].status==='rejected')errors.push('书库读取失败');
  if(results[1].status==='rejected'||globe?.error)errors.push('地球仪内容读取失败');
  const items=buildCatalog({books:[...sampleBooks,...books,...(Array.isArray(storedBooks)?storedBooks:[])],globe:globe?.error?{}:globe});
  setCatalog(items);setLinks(loadSpaceData('content-relations',[]));
  
  setError(errors.length?errors.join('；')+'。其他类型仍可使用，可点击重试。':'');setLoading(false);
 },[books]);
 useEffect(()=>{
  const show = (current, item, canEdit) => {
    if (dialog.current?.open || !current?.id) return;
    window.dispatchEvent(new Event('cyber-close-search'));
    returnFocus.current = current.element;
    editItem.current = canEdit ? item : null;
    setSource(current);
    setCatalog(buildCatalog({ books: [...sampleBooks, ...books] }));
    setLinks(loadSpaceData('content-relations', []));
    setCategory('');
    setTab('view');
    setText('');
    setStatus('');
    setError('');
    setTarget(destinations.find(([type]) => canRelate(current, { key: 'draft', type }))?.[0] ?? '');
    dialog.current.showModal();
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
  const preview = event => show(event.detail.source, event.detail.item, event.detail.canEdit);
  // Keep application-wide reader and player keys from acting behind the modal.
  const key = event => {
    if (!dialog.current?.open || event.target?.closest?.('[data-content-command-dialog]')) return;
    event.stopImmediatePropagation();
  };
  document.addEventListener('contextmenu', handler, true);
  window.addEventListener('cyber-show-relations', preview);
  document.addEventListener('keydown', key);
  return () => {
    document.removeEventListener('contextmenu', handler, true);
    window.removeEventListener('cyber-show-relations', preview);
    document.removeEventListener('keydown', key);
    requestId.current++;
  };
 },[books, refreshCatalog]);
 useEffect(()=>{if(!source)return;const update=()=>setLinks(loadSpaceData('content-relations',[]));window.addEventListener('cyber-content-changed',update);return()=>window.removeEventListener('cyber-content-changed',update);},[source]);
 async function connect(item){setError('');try{setStatus(addRelation(source,item)?'已建立关联。':'已经关联，无需重复添加。');}catch(e){setError(e.message);}}
 function create(){if(!text.trim()){setError('请输入记录文字。');return;}const key=target==='diary'?'diary':'memo',old=loadSpaceData(key,[]),now=new Date();let record;
  if(target==='diary'){const today=old.find(i=>new Date(i.date).toDateString()===now.toDateString());record=today?{...today,text:[today.text,text.trim()].filter(Boolean).join('\n\n'),updatedAt:now.toISOString()}:{id:createId('diary'),date:now.toISOString(),text:text.trim(),mood:'',photo:'',createdAt:now.toISOString()};}
  else record={id:createId(target),type:target==='todo'?'todo':'sticky',text:text.trim(),done:false,completedAt:null,tone:'blue',...memoPosition(old,target==='todo'?'todo':'sticky'),createdAt:now.toISOString()};
  const destination={key:`${target}:${record.id}`,id:record.id,type:target,title:record.text.slice(0,40)};
  if(!canRelate(source,destination)){setError('当前类型不能与这种记录关联。');return;}
  const next=old.some(i=>i.id===record.id)?old.map(i=>i.id===record.id?record:i):[record,...old];
  if(!saveSpaceData(key,next)){setError('记录保存失败，请检查本地空间。');return;}
  try{addRelation(source,destination);setCatalog(items=>[...items.filter(i=>i.key!==destination.key),destination]);setText('');setStatus(target==='diary'?'已记入今日日记并关联。':'记录已创建并关联。');setError('');}catch(e){const rolledBack=saveSpaceData(key,old);setError(rolledBack?e.message:'记录已保存但关联失败，请在对应模块查看后重试关联。');}
 }
 const existing = source ? links.filter(link => link.relationType === 'related' &&
   (link.fromId === source.key || link.toId === source.key)) : [];
 const related = existing.map(link => {
   const fromSource = link.fromId === source.key;
   const key = fromSource ? link.toId : link.fromId;
   const item = catalog.find(entry => entry.key === key);
   const title = item?.title || (fromSource ? link.toTitle : link.fromTitle) || '来源暂不可用';
   return { link, item, title, type: item?.type || key.split(':')[0] };
 });
 const candidates = source ? catalog.filter(item => canRelate(source, item) &&
   !relationExists(links, source.key, item.key) && matchesCatalogItem(item, search)) : [];
 const visibleCandidates = candidates.filter(item => !category || item.type === category);
 const visibleRelated = related.filter(record => matchesCatalogItem(record.item ?? record, search));

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

 return createPortal(<dialog ref={dialog} className="content-relation-dialog" aria-labelledby="content-relation-title"
   onCancel={event => { event.preventDefault(); if (tab === 'view') close(); else changeTab('view'); }}
   onClick={event => event.stopPropagation()}>
   <header>
     <div><p>{tab === 'view' ? '内容关联' : '添加关联'}</p>
       <h2 id="content-relation-title">{source?.title}</h2><small>{contentTypes[source?.type]}</small>
     </div>
     <div className="relation-header-actions">
       {tab === 'view' && editItem.current && <button type="button" onClick={chooseEdit}>编辑条目</button>}
       {tab !== 'view' && <button type="button" onClick={() => changeTab('view')}>返回已关联</button>}
       <button type="button" onClick={close} aria-label="关闭关联面板">关闭</button>
     </div>
   </header>
   {source && <ContentCommand kind="create" label={tab === 'view' ? '添加关联' : '返回已关联'}
     run={() => changeTab(tab === 'view' ? 'existing' : 'view')} />}
   {tab !== 'view' && <nav className="relation-tabs" aria-label="添加关联方式">
     {[['existing', '关联已有内容'], ['new', '新建关联记录']].map(([id, label]) =>
       <button type="button" key={id} aria-pressed={tab === id} onClick={() => changeTab(id)}>{label}</button>)}
   </nav>}
   <div className="relation-dialog-body">
     {tab === 'view' && <div className="relation-overview">
       <section aria-label="已关联内容" className="relation-existing">
         <h3>已关联内容 <small>{existing.length}</small></h3>
         {!existing.length && <p>暂无关联条目。</p>}
         {existing.length > 0 && !visibleRelated.length && <p>没有匹配的关联条目。</p>}
         {visibleRelated.map(({ link, item, title, type }) => {
           const preview = relatedPreview(item);
           return <article key={link.id} data-edit-item>
             <h4>{item ? <button type="button" className="relation-open" onClick={() => {
               const origin = { ...catalog.find(entry => entry.key === source.key), ...source };
               close();
               onNavigate(item, origin);
             }}>{title}</button> : title} <small>{contentTypes[type]}</small></h4>
             {preview && <p>{preview}</p>}
             <ContentCommand label={`解除关联 · ${title}`} confirm run={() => {
               try {
                 removeRelation(link.id);
                 setStatus('已解除关联。');
               } catch (failure) {
                 setError(failure.message);
               }
             }} />
           </article>;
         })}
       </section>
     </div>}
     {tab === 'existing' && <div className="relation-browser">
       <nav aria-label="内容类型">
         <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>全部可关联</button>
         {Object.entries(contentTypes).filter(([type]) => canRelate(source, { key: 'category', type })).map(([type, label]) =>
           <button type="button" key={type} aria-pressed={category === type} onClick={() => setCategory(type)}>
             {label}<span>{candidates.filter(item => item.type === type).length}</span>
           </button>)}
       </nav>
       <section aria-label="可关联内容" aria-busy={loading}>
         {loading ? <p role="status">正在读取内容…</p> : visibleCandidates.length ? visibleCandidates.map(item =>
           <article key={item.key}>
             <div><strong>{item.title}</strong><small>{contentTypes[item.type]}</small></div>
             <button type="button" onClick={() => connect(item)}>关联</button>
           </article>) : <p className="empty-state">暂无可关联内容。</p>}
       </section>
     </div>}
     {tab === 'new' && <div className="stack-form">
       <label>创建到<select value={target} onChange={event => setTarget(event.target.value)}>
         {destinations.filter(([type]) => canRelate(source, { key: 'draft', type })).map(([type, label]) =>
           <option value={type} key={type}>{label}</option>)}
       </select></label>
       <label>记录文字<textarea rows="5" value={text} onChange={event => setText(event.target.value)} /></label>
       <button type="button" onClick={create} disabled={!target || !text.trim()}>保存并关联</button>
     </div>}
   </div>
   <footer><p role="status">{status}</p>
     {error && <p role="alert">{error}<button type="button" disabled={loading} onClick={refreshCatalog}>重新读取</button></p>}
   </footer>
 </dialog>, document.body);
}
