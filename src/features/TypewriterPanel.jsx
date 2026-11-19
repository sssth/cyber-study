import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { useNavigationState } from '../ui/useNavigationState.js';
import { WorkspaceActions } from './ui.jsx';
import { ContentCommand } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch,termsOf} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import { createPortal } from 'react-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import '../../shared/contentSchema.js';
import { parseMarkdownContent } from '../reader/markdownReader.js';
import { indexChapters } from '../reader/readerPosition.js';
import { memoPosition } from './memoLayout.js';
import { ActionWorkspace, FeaturePanel } from './ui.jsx';
import { createId, loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';

const font = 'KaiTi, STKaiti, "Kaiti SC", serif';

function SourceOptions({ label, name, options, value, onChange }) {
  return <fieldset className="music-create-song-picker">
    <legend>{label}</legend>
    <div className="music-create-song-options music-player-options">
      {options.map(option => <label key={option.id}>
        <input type="radio" name={name} checked={option.id === value} onChange={() => onChange(option.id)} />
        <span>{option.title}</span>
      </label>)}
      {!options.length && <p className="card-meta">没有匹配的选项</p>}
    </div>
  </fieldset>;
}

const typewriterTexts = [
  { id: 'xinjing', title: '心经', text: '观自在菩萨，行深般若波罗蜜多时，照见五蕴皆空，度一切苦厄。' },
  { id: 'daodejing', title: '道德经', text: '上善若水。水善利万物而不争，处众人之所恶，故几于道。' },
  { id: 'lunyu', title: '论语', text: '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？' },
  { id: 'zhouyi', title: '周易', text: '天行健，君子以自强不息。地势坤，君子以厚德载物。' }
];

function makePhoto(work, heading, paper) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const lines = Array.from(work.text.matchAll(/[\s\S]{1,16}/gu), (match) => match[0]);
  canvas.width = 1240;
  canvas.height = 230 + 92 * lines.length;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#302419';
  ctx.textBaseline = 'middle';
  ctx.font = '48px ' + font;
  ctx.fillText(heading || work.title, 80, 90, 1080);
  ctx.font = '64px ' + font;
  lines.forEach((line, index) => ctx.fillText(line, 80, 190 + index * 92, 1080));
  return canvas.toDataURL('image/jpeg', 0.94);
}

export default function TypewriterPanel({ onClose, importedBooks = [], initialSource = null, editItem }) {
  const search=useSearchScope({id:'typewriter',label:'抄写作品',priority:10,filters:[{key:'status',label:'抄写状态',options:[['not_started','未开始'],['in_progress','进行中'],['completed','已完成']]}]});
  const [showCompleted, setShowCompleted] = useNavigationState('typewriter','showCompleted',false);
  const [writing, setWriting] = useState(false);
  const writingSearch=useSearchScope({id:'typewriter-original',label:'当前抄写原文',priority:30,enabled:writing,filters:[]});
  const [editorOpen, setOpen] = useState(Boolean(initialSource || editItem));
  const sourceSearch = useSearchScope({
    id: 'typewriter-source', label: '来源书籍', priority: 25,
    enabled: editorOpen && !writing, filters: [],
  });
  const setEditorOpen = open => { setOpen(open); if (!open && editItem) onClose(); };
  const order = useContentOrder();
  const [works, setWorks] = useState(() => loadSpaceData('typewriter', []));
  useSearchCount('typewriter',works.filter(item=>matchesItem('typing_work',item,search)).length);
  const books = importedBooks;
  const [bookId,setBookId]=useState(editItem?.bookId || initialSource?.bookId || books[0]?.id || '');
  const [chapterId,setChapterId]=useState('whole');
  const [source,setSource]=useState(editItem ? {...editItem} : initialSource);
  const [draftId, setDraftId] = useState(editItem?.id ?? null);
  const draftRef=useRef(null);
  draftRef.current=draftId;
  const [typed, setTyped] = useState(editItem?.typedText ?? (editItem?.complete ? editItem.text : ''));
  const [message, setMessage] = useState('');
  const [work, setWork] = useState(null);
  const [heading, setHeading] = useState('');
  const [paper, setPaper] = useState('#f6e8ca');
  const book=books.find(b=>b.id===bookId);
  const blocks=useMemo(()=>parseMarkdownContent(book?.content||''),[book?.content]);
  const {chapters,chapterByBlock}=useMemo(()=>indexChapters(blocks),[blocks]);
  const bookOptions = book || !source?.bookTitle ? books : [...books, { id: bookId, title: source.bookTitle }];
  const savedChapter = source?.chapterTitle;
  const chapterOptions = [{ id: 'whole', title: '整本书' }, ...chapters.map(chapter => ({ id: chapter.id, title: chapter.text }))];
  const matchingChapter = chapters.find(chapter => chapter.text === savedChapter);
  let selectedChapterId = chapterId;
  if (source) {
    selectedChapterId = matchingChapter?.id ?? (savedChapter === '全文' || savedChapter === '整本书' ? 'whole' : 'saved-source');
    if (selectedChapterId === 'saved-source') chapterOptions.push({ id: 'saved-source', title: savedChapter || '已选原文' });
  }
  const visibleBooks = bookOptions.filter(option => textMatches([option.title, option.author], sourceSearch.query));
  useSearchCount('typewriter-source', visibleBooks.length);
  const selected=source||{bookId,bookTitle:book?.title||'',chapterTitle:chapterId==='whole'?'全文':chapters.find(c=>c.id===chapterId)?.text||'',text:blocks.filter(b=>chapterId==='whole'||chapterByBlock.get(b.id)===chapterId).map(b=>b.text).join('\n')};
  selected.title ||= `${selected.bookTitle} · ${selected.chapterTitle}`;
  const originalParts=useMemo(()=>{
    const terms=termsOf(writingSearch.query).sort((a,b)=>b.length-a.length);
    if(!terms.length)return [{text:selected.text,match:false}];
    const pattern=new RegExp(terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'giu');
    const parts=[];let cursor=0;
    for(const match of selected.text.matchAll(pattern)){
      if(match.index>cursor)parts.push({text:selected.text.slice(cursor,match.index),match:false});
      parts.push({text:match[0],match:true});cursor=match.index+match[0].length;
    }
    if(cursor<selected.text.length)parts.push({text:selected.text.slice(cursor),match:false});
    return parts;
  },[selected.text,writingSearch.query]);
  useSearchCount('typewriter-original',originalParts.filter(part=>part.match).length);
  const characters = [...typed];
  const target = [...selected.text];
  const complete = Boolean(selected.text) && typed === selected.text;
  const inkRef = useRef(null);
  const errorCount = characters.filter((char,index)=>char!==target[index]).length;

  const persist = (next) => {
    if (!saveSpaceData('typewriter', next)) {
      setMessage('保存失败，本地存储可能已满。');
      return false;
    }
    setWorks(next);
    setMessage('');
    return true;
  };

  const save = () => {
    if (!selected.text) return;
    const id = draftRef.current ?? createId('work');
    const existingWorks=loadSpaceData('typewriter',[]);
    const previous=existingWorks.find(w=>w.id===id);
    const progress=CyberContentSchema.copyState(selected.text,typed,previous?.completedAt);
    const record = { id, bookTitle:selected.bookTitle, bookId:selected.bookId, chapterTitle:selected.chapterTitle, title: selected.title, text: selected.text, ...progress, complete:progress.status==='completed', createdAt:previous ? previous.createdAt : new Date().toISOString(), updatedAt:new Date().toISOString() };
    if (persist([record, ...existingWorks.filter((item) => item.id !== id)])) {
      draftRef.current=id;setDraftId(id);return true;
    }
  };

  const latestSave=useRef(null);latestSave.current=writing?save:null;
  useEffect(()=>{if(!writing)return;const timer=setTimeout(()=>latestSave.current?.(),600);return ()=>clearTimeout(timer);},[typed,writing]);
  useEffect(()=>()=>latestSave.current?.(),[]);

  const deliver = (destination) => {
    const photo = makePhoto(work, heading, paper);
    if (destination === 'download') {
      const link = document.createElement('a');
      link.href = photo;
      link.download = work.title + '.jpg';
      link.click();
      return;
    }
    const items = loadSpaceData(destination, []);
    const today=items.find(i=>destination==='diary'&&new Date(i.date).toDateString()===new Date().toDateString());
    const item = destination === 'diary'
      ? today ? {...today,text:[today.text,heading||work.title].filter(Boolean).join('\n\n'),photos:[...(today.photos||[today.photo].filter(Boolean)),photo]} : { id: createId('diary'), text: heading || work.title, photo, photos:[photo], date: new Date().toISOString(), mood: '抄写作品' }
      : { id: createId('image'), createdAt:new Date().toISOString(), type: 'image', photo, ...memoPosition(items, 'image') };
    const saved = saveSpaceData(destination, today?items.map(i=>i.id===today.id?item:i):[item,...items]);
    if(saved){const links=loadSpaceData('content-relations',[]),fromId=`typing_work:${work.id}`,toId=`${destination}:${item.id}`;if(!links.some(l=>l.fromId===fromId&&l.toId===toId))saveSpaceData('content-relations',[...links,{id:createId('relation'),fromId,toId,relationType:'related',createdAt:new Date().toISOString()}]);}
    setMessage(saved ? '' : '保存失败，本地存储可能已满。');
  };

  const startNew = () => {
    latestSave.current?.();
    setTyped('');
    draftRef.current = null;
    setDraftId(null);
    setSource(null);
    setChapterId('whole');
    if (!book) setBookId(books[0]?.id || '');
    setMessage('');
  };
  const openWork = (item, immersive) => {
    latestSave.current?.();
    setBookId(item.bookId || books[0]?.id || '');
    setSource({bookId:item.bookId,bookTitle:item.bookTitle||item.title,chapterTitle:item.chapterTitle||'',title:item.title,text:item.text});
    draftRef.current=item.id;setDraftId(item.id);
    setTyped(item.typedText ?? (item.complete ? item.text : ''));
    setMessage('');setWriting(immersive);setEditorOpen(!immersive);
  };
  useMapSource({priority:10,detail:Boolean(writing || work),label:'抄写作品',entities:mapEntities('typing_work',writing?[{...works.find(item=>item.id===draftId),...selected,...CyberContentSchema.copyState(selected.text,typed),id:draftId}]:work?[work]:works.filter(item=>(item.status==='completed'||item.complete===true)===showCompleted&&matchesItem('typing_work',item,search)))});
  const leaveWriting = () => {if(save())setWriting(false);};
  if (writing) return createPortal(<section className="typewriter-immersive" role="dialog" aria-modal="true" aria-label="沉浸式抄写" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();leaveWriting();}}}>
    <header><h2>{selected.title}</h2><button type="button" onClick={leaveWriting}>返回作品库</button></header>
    <main>
        <div className="copying-spread">
        <section><h3>原文</h3><div className="copying-original">{originalParts.map((part,index)=>part.match ? <mark className="copying-search-hit" key={index}>{part.text}</mark> : part.text)}</div></section>
        <section><h3>抄写 {errorCount > 0 && <span className="copying-error-count" aria-label={`${errorCount} 个错字`}>{errorCount}</span>}</h3>
        <div className="copying-input-stack">
        <div ref={inkRef} className="copying-ink" aria-hidden="true">{characters.map((char,index)=><span key={index} className={char!==target[index] ? 'copying-error' : undefined}>{char}</span>)}<span className="copying-inline-hint">{target.slice(characters.length,characters.length+16).join('')}</span>{'\u200b'}</div>
        <textarea onScroll={event=>{if(inkRef.current){inkRef.current.scrollTop=event.currentTarget.scrollTop;inkRef.current.scrollLeft=event.currentTarget.scrollLeft;}}} rows="4" aria-label="抄写输入" value={typed} onChange={(event) => {
          if (event.nativeEvent.isComposing) { setTyped(event.target.value); return; }
          setTyped([...event.target.value].slice(0, target.length).join(''));
        }} onCompositionEnd={(event) => setTyped([...event.currentTarget.value].slice(0, target.length).join(''))}
          onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()}
          autoFocus autoComplete="off" />
        </div>
        </section></div>
    {message?.includes('失败') && <div role="alert">{message}</div>}</main>
  </section>,document.body);
  const editor = (<ActionWorkspace onCreate={startNew} label="新建抄写" title={draftId ? "编辑作品" : "新建作品 · 选择原文"} open={editorOpen} onOpenChange={setEditorOpen}><div className="stack-form">
        <SourceOptions label="来源书籍" name="copy-source-book" options={visibleBooks} value={bookId} onChange={id => {
          setBookId(id); setChapterId('whole'); setSource(null); setTyped('');
        }} />
        <SourceOptions label="来源章节" name="copy-source-chapter" options={chapterOptions} value={selectedChapterId} onChange={id => {
          setChapterId(id); setSource(null); setTyped('');
        }} />
        <p>{selected.title}{source ? ' · 已选原文' : ''}</p>
        <label>原文<textarea rows="8" aria-label="抄写原文" value={selected.text} onChange={event=>{setSource({...selected,text:event.target.value});setTyped('');}} /></label>
        {draftId && complete && <>{!editItem && <button type="button" onClick={()=>{setWork(works.find(item=>item.id===draftId));setHeading(selected.title);setEditorOpen(false);}}>制作图片</button>}<button type="button" onClick={()=>{setTyped('');setSource({...selected});}}>重新抄写（保存后生效）</button></>}
        <WorkspaceActions>
        <button type="button" disabled={!selected.text} onClick={()=>{if(save())setEditorOpen(false);}}>{draftId ? '保存' : '创建作品'}</button>
        {draftId && <button type="button" onClick={() => {
          if (!window.confirm('确认删除这份抄写作品？')) return;
          if (!persist(works.filter(item => item.id !== draftId))) return;
          latestSave.current = null; draftRef.current = null; setDraftId(null); setTyped(''); setEditorOpen(false);
        }}>删除</button>}
        </WorkspaceActions>
        {message && <p role="status">{message}</p>}
      </div>
      </ActionWorkspace>);
  if (editItem) return editor;
  return (
    <FeaturePanel hasMenu title="打字机" kicker="Slow Writing" onClose={onClose}>
      <div className="globe-mode-switch" aria-label="抄写作品库">{[[false,'未完成作品'],[true,'已完成作品']].map(([value,label])=><button key={String(value)} type="button" aria-pressed={showCompleted===value} onClick={()=>setShowCompleted(value)}>{label}</button>)}</div>
      {editor}
      <SearchStatus id="typewriter" label="抄写作品"/>

      {[showCompleted].map((finished) => (
        <section className="admin-list copying-library" key={String(finished)}>
          <h3>{finished ? '已完成作品库' : '未完成作品库'}</h3>
          {orderType(works,'typing_work',order).filter((item) => (item.status === 'completed' || item.complete === true) === finished && matchesItem('typing_work',item,search)).map((item) => (
            <button type="button" data-edit-item data-item-open className="admin-card copying-work-card" key={item.id} onClick={()=>openWork(item,true)}>
              <div className="copying-work-cover"><p>{item.title} · {item.completedAt ? `完成于 ${new Date(item.completedAt).toLocaleDateString('zh-CN')}` : `创建于 ${new Date(item.createdAt).toLocaleDateString('zh-CN')}`} · 已抄 {item.cursor ?? Array.from(item.typedText ?? item.text).length} 字</p><p className="calligraphy-text">{item.text}</p></div>
              <ContentActions orderItem={item} type="typing_work" id={item.id} title={item.title}/><div className="card-actions">
                <ContentCommand label={`编辑作品 · ${item.title}`} run={()=>openWork(item,false)} />
                <ContentCommand label={`删除抄写作品 · ${item.title}`} confirm run={() => {
                  if (!persist(works.filter((entry) => entry.id !== item.id))) return;
                  if (work?.id === item.id) setWork(null);
                  if (draftId === item.id) {latestSave.current=null;draftRef.current=null;setDraftId(null);setTyped('');}
                }} />
              </div>
            </button>
          ))}
        </section>
      ))}
      {work && <section className="stack-form">
        <h3>作品制作</h3>
        <label>图片标题 <input value={heading} onChange={(event) => setHeading(event.target.value)} /></label>
        <label>纸色 <select value={paper} onChange={(event) => setPaper(event.target.value)}><option value="#f6e8ca">米黄</option><option value="#fbf8ef">暖白</option></select></label>
        <img className="preview-image" src={makePhoto(work, heading, paper)} alt="作品图片预览" />
        <div className="card-actions">
          <button type="button" onClick={() => deliver('download')}>下载 JPG</button>
          <button type="button" onClick={() => deliver('diary')}>保存到日记</button>
          <button type="button" onClick={() => deliver('memo')}>添加到 Memo</button>
          <button type="button" onClick={() => setWork(null)}>关闭预览</button>
        </div>
        {message && <p role="status">{message}</p>}
      </section>}
    </FeaturePanel>
  );
}
