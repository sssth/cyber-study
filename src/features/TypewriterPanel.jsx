import { ContentCommand } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import { useState, useEffect, useMemo, useRef } from 'react';
import '../../shared/contentSchema.js';
import { sampleBooks } from '../reader/sampleBooks.js';
import { parseMarkdownContent } from '../reader/markdownReader.js';
import { indexChapters } from '../reader/readerPosition.js';
import { memoPosition } from './memoLayout.js';
import { ActionWorkspace, FeaturePanel } from './ui.jsx';
import { createId, loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';

const font = 'KaiTi, STKaiti, "Kaiti SC", serif';

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

export default function TypewriterPanel({ onClose, importedBooks = [], initialSource = null }) {
  const search=useSearchScope({id:'typewriter',label:'抄写作品',priority:10,filters:[{key:'status',label:'抄写状态',options:[['not_started','未开始'],['in_progress','进行中'],['completed','已完成']]}]});
  const [editorOpen, setEditorOpen] = useState(Boolean(initialSource));
  const [works, setWorks] = useState(() => loadSpaceData('typewriter', []));
  useSearchCount('typewriter',works.filter(item=>matchesItem('typing_work',item,search)).length);
  const books = useMemo(()=>[...sampleBooks,...importedBooks], [importedBooks]);
  const [bookId,setBookId]=useState(initialSource?.bookId || books[0]?.id || '');
  const [chapterId,setChapterId]=useState('whole');
  const [source,setSource]=useState(initialSource);
  const [draftId, setDraftId] = useState(null);
  const draftRef=useRef(null);
  draftRef.current=draftId;
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');
  const [work, setWork] = useState(null);
  const [heading, setHeading] = useState('');
  const [paper, setPaper] = useState('#f6e8ca');
  const book=books.find(b=>b.id===bookId);
  const blocks=useMemo(()=>parseMarkdownContent(book?.content||''),[book?.content]);
  const {chapters,chapterByBlock}=useMemo(()=>indexChapters(blocks),[blocks]);
  const selected=source||{bookId,bookTitle:book?.title||'',chapterTitle:chapterId==='whole'?'全文':chapters.find(c=>c.id===chapterId)?.text||'',text:blocks.filter(b=>chapterId==='whole'||chapterByBlock.get(b.id)===chapterId).map(b=>b.text).join('\n')};
  selected.title ||= `${selected.bookTitle} · ${selected.chapterTitle}`;
  const characters = [...typed];
  const target = [...selected.text];
  const complete = Boolean(selected.text) && typed === selected.text;
  const visibleStart=Math.max(0,characters.length-120);

  const persist = (next, success) => {
    if (!saveSpaceData('typewriter', next)) {
      setMessage('保存失败，本地存储可能已满。');
      return false;
    }
    setWorks(next);
    setMessage(success);
    return true;
  };

  const save = () => {
    if (!selected.text) return;
    const id = draftRef.current ?? createId('work');
    const existingWorks=loadSpaceData('typewriter',[]);
    const previous=existingWorks.find(w=>w.id===id);
    const progress=CyberContentSchema.copyState(selected.text,typed,previous?.completedAt);
    const record = { id, bookId:selected.bookId, chapterTitle:selected.chapterTitle, title: previous?.title || selected.title, text: selected.text, ...progress, complete:progress.status==='completed', createdAt:previous?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
    if (persist([record, ...existingWorks.filter((item) => item.id !== id)], complete ? '作品已完成并保存。' : '草稿已保存。')) {
      draftRef.current=id;setDraftId(id);
    }
  };

  const latestSave=useRef(null);latestSave.current=typed?save:null;
  useEffect(()=>{if(!typed)return;const timer=setTimeout(()=>latestSave.current?.(),600);return ()=>clearTimeout(timer);},[typed]);
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
      : { id: createId('image'), type: 'image', photo, ...memoPosition(items, 'image') };
    const saved = saveSpaceData(destination, today?items.map(i=>i.id===today.id?item:i):[item,...items]);
    if(saved){const links=loadSpaceData('content-relations',[]),fromId=`typing_work:${work.id}`,toId=`${destination}:${item.id}`;if(!links.some(l=>l.fromId===fromId&&l.toId===toId))saveSpaceData('content-relations',[...links,{id:createId('relation'),fromId,toId,relationType:'related',createdAt:new Date().toISOString()}]);}
    setMessage(saved ? (destination === 'diary' ? '已保存到日记。' : '已添加到 Memo。') : '保存失败，本地存储可能已满。');
  };

  const startNew = () => {
    latestSave.current?.();
    setTyped('');
    draftRef.current = null;
    setDraftId(null);
    setSource(null);
    setMessage('');
  };
  return (
    <FeaturePanel title="打字机" kicker="Slow Writing" onClose={onClose}>
      <ActionWorkspace onCreate={startNew} label="新建抄写" title="抄写作品" open={editorOpen} onOpenChange={setEditorOpen}><div className="stack-form">
        <label>来源书籍<select aria-label="抄写书籍" value={bookId} disabled={Boolean(draftId || typed)} onChange={e=>{setBookId(e.target.value);setChapterId('whole');setSource(null);}}>{books.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
        <label>来源章节<select aria-label="抄写章节" value={chapterId} disabled={Boolean(draftId || typed)} onChange={e=>{setChapterId(e.target.value);setSource(null);}}><option value="whole">整本书</option>{chapters.map(c=><option key={c.id} value={c.id}>{c.text}</option>)}</select></label>
        <p>{selected.title}{source ? ' · 已选原文' : ''}</p>
        <ContentCommand kind="create" label="新建另一份作品" run={startNew} />
        <div className="calligraphy-text copying-sheet" aria-label="抄写字模">
          {target.slice(visibleStart,visibleStart+480).map((char, offset) => {const index=visibleStart+offset;return <span key={index} className={characters[index] === undefined ? 'template-char' : characters[index] === char ? '' : 'incorrect-char'}>{characters[index] ?? char}</span>;})}
        </div>
        <textarea rows="4" aria-label="抄写输入" value={typed} onChange={(event) => {
          if (event.nativeEvent.isComposing) { setTyped(event.target.value); return; }
          setTyped([...event.target.value].slice(0, target.length).join(''));
        }} onCompositionEnd={(event) => setTyped([...event.currentTarget.value].slice(0, target.length).join(''))}
          onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()}
          autoComplete="off" placeholder="原文" />
        <p className="card-meta">进度 {Math.min(characters.length, target.length)}/{target.length}</p>
        <button type="button" disabled={!selected.text} onClick={save}>{complete ? '保存完成作品' : '保存草稿'}</button>
        {draftId && <button type="button" onClick={() => {
          if (!window.confirm('确认删除这份抄写作品？')) return;
          if (!persist(works.filter(item => item.id !== draftId), '作品已删除。')) return;
          latestSave.current = null; draftRef.current = null; setDraftId(null); setTyped(''); setEditorOpen(false);
        }}>删除作品</button>}
        <p role="status">{message}</p>
      </div>
      </ActionWorkspace>
      <SearchStatus id="typewriter" label="抄写作品"/>
      {!works.some(item=>matchesItem('typing_work',item,search))&&<p role="status">没有匹配的抄写作品。</p>}
      {[false, true].map((finished) => (
        <section className="admin-list" key={String(finished)}>
          <h3>{finished ? '已完成作品库' : '未完成作品库'}</h3>
          {works.filter((item) => (item.complete !== false) === finished && matchesItem('typing_work',item,search)).map((item) => (
            <article className="admin-card" key={item.id}>
              <div><p>{item.title} · {item.completedAt ? `完成于 ${new Date(item.completedAt).toLocaleDateString('zh-CN')}` : `创建于 ${new Date(item.createdAt).toLocaleDateString('zh-CN')}`} · 已抄 {item.cursor ?? Array.from(item.typedText ?? item.text).length} 字</p><p className="calligraphy-text">{item.text}</p></div>
              <ContentActions type="typing_work" id={item.id} title={item.title}/><div className="card-actions">
                {finished ? <button data-item-open type="button" onClick={() => {
                  setWork(item); setHeading(item.title); setMessage('');
                }}>制作图片</button> : null}
                <ContentCommand label={`继续抄写 · ${item.title}`} run={() => {
                  const legacy = typewriterTexts.find(entry => entry.id === item.textId);
                  setEditorOpen(true);
                  setBookId(item.bookId || books[0]?.id || '');
                  setSource({ bookId: item.bookId, bookTitle: item.title, chapterTitle: item.chapterTitle || '',
                    title: item.title, text: item.status ? item.text : legacy?.text || item.text });
                  setDraftId(item.id);
                  setTyped(item.typedText ?? item.text);
                }} />
                <ContentCommand label={`删除抄写作品 · ${item.title}`} confirm run={() => {
                  if (!persist(works.filter((entry) => entry.id !== item.id), '作品已删除。')) return;
                  if (work?.id === item.id) setWork(null);
                  if (draftId === item.id) {latestSave.current=null;draftRef.current=null;setDraftId(null);setTyped('');}
                }} />
              </div>
            </article>
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
        <p role="status">{message}</p>
      </section>}
    </FeaturePanel>
  );
}
