import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import { blocksPageBack } from '../ui/useEscapeBack.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { useNavigationState } from '../ui/useNavigationState.js';
import { excerptRange, replaceExcerptUnderlines } from '../reader/excerptRange.js';
import { ContentCommand } from './ContentCommands.jsx';
import {useSearchCount,useSearchScope} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from './ContentActions.jsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeaturePanel, ActionWorkspace, WorkspaceActions } from './ui.jsx';
import ExcerptAnnotations from '../reader/ExcerptAnnotations.jsx';
import { parseMarkdownContent, underlineMarkdown } from '../reader/markdownReader.js';
import { highlightRanges, indexChapters } from '../reader/readerPosition.js';
import { loadKnowledge, groupExcerpts, excerptKey, updateExcerptRange, deleteExcerpt } from '../data/knowledgeStore.js';

function KnowledgeWorkspace({ editItem, shelfMenu, navigationItem, onStartCopy, onClose, version = 0, importedBooks = [], onBooksChanged, onOpenNote, suspended = false }) {

  const [detailKey, setDetailKey] = useNavigationState('knowledge','detailKey',() => ['excerpt', 'annotation'].includes(navigationItem?.type) ? excerptKey(navigationItem) : null);
  const [editKey,setLocalEditKey]=useState(editItem ? excerptKey(editItem) : null),[rangeEditing,setRangeEditing]=useState(false),[editError,setEditError]=useState(''),[editBusy,setEditBusy]=useState(false);
  const setEditKey = key => { setLocalEditKey(key); if (editItem && !key) onClose(); };
  const [revision, setRevision] = useState(0);
  const notes = useMemo(() => loadKnowledge().notes, [version, revision]);
  const groups = useMemo(() => groupExcerpts(notes), [notes]);
  const sources = useMemo(() => {
    const books = new Map(importedBooks.map((book) => [book.id, book]));
    const result = new Map();
    for (const id of new Set(notes.map((note) => note.bookId))) {
      const book = books.get(id);
      if (!book?.content) continue;
      const blocks = parseMarkdownContent(book.content);
      result.set(id, { book, blocks, ...indexChapters(blocks) });
    }
    return result;
  }, [importedBooks, notes]);
  const order = useContentOrder();
  const representatives = [...groups.values()].map(items => items[0]);
  const entries = orderType(representatives, 'excerpt', order).map(note => {
    const key = excerptKey(note);
    const items = groups.get(key);
    const source = sources.get(note.bookId);
    const blockId = note.blockId ?? note.ranges?.[0]?.blockId ??
      source?.blocks.find((block) => block.text.includes(note.quote))?.id;
    const chapterId = source?.chapterByBlock.get(blockId);
    const chapter = source?.chapters.find((item) => item.id === chapterId)?.text ?? note.chapterTitle ?? '';
    return { key, items, note, source, blockId, chapterId, chapter };
  });
  const books = new Map(notes.map((note) => [note.bookId, note.bookTitle]));
  const search=useSearchScope({id:'knowledge',label:'摘录与批注',priority:shelfMenu?40:10,enabled:!suspended,filters:[{key:'bookId',label:'来源书籍',options:[...books]}]});
  const bookId=search.filters.bookId||'';
  const filtered = entries.filter(({ note, items, chapter }) =>
    (!bookId || note.bookId === bookId) && (!search.filters.id||items.some(i=>i.id===search.filters.id)) &&
    textMatches([note.bookTitle,chapter,note.quote,...items.flatMap(item=>[item.annotation,...(item.tags??[])])],search.query));
  useSearchCount('knowledge',filtered.length);
  useLayoutEffect(() => {
    if (!editItem || detailKey) window.dispatchEvent(new Event('cyber-close-search'));
  }, [detailKey, editItem]);
  const editingEntry=entries.find(e=>e.key===editKey);
  const detail = entries.find((entry) => entry.key === detailKey);
  useMapSource({priority:shelfMenu?40:10,enabled:!suspended&&!detail,entities:mapEntities('excerpt',filtered.map(({note,chapter,items})=>({...note,chapterTitle:chapter,notes:items})))});

  async function mutateExcerpt(note, selection) {
    const source=sources.get(note.bookId),old=source?.book;
    let updated;
    if(old&&note.markdownUnderline&&globalThis.cyberStudy?.saveBookMarkdown){
      const others=loadKnowledge().notes.filter(n=>n.bookId===note.bookId&&excerptKey(n)!==excerptKey(note));
      const content=replaceExcerptUnderlines(old.content,source.blocks,note.ranges||[],others.flatMap(n=>n.ranges||[]),selection?.ranges||[],parseMarkdownContent,underlineMarkdown);
      if(content!==old.content)updated=await globalThis.cyberStudy.saveBookMarkdown({...old,content},old.content);
    }
    try{
      const result=selection?updateExcerptRange(note,selection):deleteExcerpt(note);
      if(updated)onBooksChanged?.([updated]);
      return result;
    }catch(error){
      if(updated){try{await globalThis.cyberStudy.saveBookMarkdown(old,updated.content);}catch{onBooksChanged?.([updated]);throw Error('摘录保存失败，原文划线已更新，请重试以同步。');}}
      throw error;
    }
  }

  if (suspended) return null;
  if (detail) {
    const closeDetail = () => { setDetailKey(null); setRangeEditing(false); if (editItem) onClose(); };
    const content = <ExcerptDetail annotationId={navigationItem?.type === 'annotation' ? navigationItem.id : undefined} compact={Boolean(editItem)} entry={detail} onClose={closeDetail}
      rangeEditing={rangeEditing} onSaveRange={mutateExcerpt} onRangeSaved={note => {
        if (editItem) { onClose(); return; }
        setDetailKey(excerptKey(note)); setRangeEditing(false); setRevision(v => v + 1);
      }} onOpenNote={onOpenNote} onChange={() => setRevision(v => v + 1)} />;
    if (editItem) return <ActionWorkspace command={false} showTrigger={false} title="编辑摘录范围" open onOpenChange={open => { if (!open) closeDetail(); }}>{content}</ActionWorkspace>;
    return createPortal(content, document.body);
  }

  const editor = (<ActionWorkspace command={false} showTrigger={false} title="编辑摘录" open={Boolean(editingEntry)} onOpenChange={open=>{if(!open)setEditKey(null);}}>
      {editingEntry&&<><blockquote className="excerpt-edit-preview">{editingEntry.note.quote}</blockquote><p>{[editingEntry.note.bookTitle,editingEntry.chapter].filter(Boolean).join(' · ')}</p>
      <button type="button" onClick={()=>{setEditKey(null);onStartCopy?.({bookId:editingEntry.note.bookId,bookTitle:editingEntry.note.bookTitle,chapterTitle:editingEntry.chapter||'摘录',text:editingEntry.note.quote});}}>开始抄写</button>
      <button type="button" disabled={!editingEntry.source} onClick={()=>{setRangeEditing(true);setDetailKey(editKey);setLocalEditKey(null);}}>调整摘录范围</button>
      {editError&&<p role="alert">{editError}</p>}
      <WorkspaceActions><button onClick={()=>setEditKey(null)}>完成</button><button disabled={editBusy} onClick={async()=>{if(!window.confirm('删除这条摘录及其全部批注？'))return;setEditBusy(true);try{await mutateExcerpt(editingEntry.note,null);setEditKey(null);setRevision(v=>v+1);}catch(e){setEditError(e.message);}finally{setEditBusy(false);}}}>删除摘录</button></WorkspaceActions></>}
    </ActionWorkspace>);
  if (editItem) return editor;
  return <FeaturePanel hasMenu={Boolean(shelfMenu)} wide title="知识库" onClose={onClose}>
    {editor}
    {shelfMenu}
    <div className="knowledge-browser">
      <section className="knowledge-results" aria-label="摘录列表">
        {!filtered.length && <></>}
        {filtered.map(({ key, items, note, chapter }) => {
          const characters = Array.from(note.quote);
          const preview = characters.length > 120 ? characters.slice(0, 120).join('').trimEnd() + '…' : note.quote;
          return <button key={key} data-item-open type="button" className="knowledge-result" onClick={() => setDetailKey(key)}>
            <span>
              <span className="card-kicker">{[note.bookTitle, chapter].filter(Boolean).join(' · ')}</span>
              <span className="knowledge-preview">“{preview}”</span>
            </span>
            <ContentCommand label={`管理摘录与批注 · ${note.quote.slice(0, 48)}`} run={() => {setEditKey(key);setEditError('');}} />
            <ContentActions orderItem={note} type="excerpt" id={note.id} title={note.quote?.slice(0,40)}/><span className="knowledge-note-count">{items.filter((item) => item.annotation).length} 条批注</span>
          </button>;
        })}
      </section>
    </div>
  </FeaturePanel>;
}



function ExcerptDetail({ annotationId, compact, entry, rangeEditing, onSaveRange, onRangeSaved, onClose, onOpenNote, onChange }) {
  const { key, items, note, source, blockId, chapterId, chapter } = entry;
  const original = useRef(null);
  const [rangeDraft,setRangeDraft]=useState(null),[rangeError,setRangeError]=useState(''),[rangeBusy,setRangeBusy]=useState(false);
  const chapterBlocks = chapterId === undefined ? [] : source.blocks.filter((block) => source.chapterByBlock.get(block.id) === chapterId);
  const highlights = highlightRanges(chapterBlocks, new Map([[key, rangeDraft?[{...note,...rangeDraft}]:items]]));
  useEffect(() => {
    const focus = original.current?.querySelector('mark') ?? original.current?.querySelector('[data-excerpt-focus]');
    if (focus) {
      const pane = original.current;
      pane.scrollTop += focus.getBoundingClientRect().top - pane.getBoundingClientRect().top - 28;
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !blocksPageBack(event)) { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [key, chapterId, blockId]);

  return <section className={compact ? "catalog-range-editor" : "knowledge-detail"} role={compact ? undefined : "dialog"} aria-modal={compact ? undefined : true} aria-label="摘录详情">
    {!compact && <header>
      <h2>{[note.bookTitle, chapter].filter(Boolean).join(' · ')}</h2>
      <div>
        {source && <button type="button" onClick={() => onOpenNote({ ...note, blockId })}>回跳原文</button>}
        <button type="button" onClick={onClose}>返回列表</button>
      </div>
    </header>}
    <article ref={original} className="knowledge-original" aria-label="章节原文" tabIndex={0} onPointerUp={()=>{
      if(!rangeEditing)return;
      const selection=getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
      const range=selection.getRangeAt(0),element=node=>(node.nodeType===1?node:node.parentElement)?.closest('[data-range-block]');
      const start=element(range.startContainer),end=element(range.endContainer);
      if(!start||!end||!original.current.contains(start)||!original.current.contains(end))return;
      const offset=(el,node,index)=>{const before=range.cloneRange();before.selectNodeContents(el);before.setEnd(node,index);return Math.max(0,before.toString().length-(chapterBlocks.find(b=>b.id===el.dataset.rangeBlock)?.prefix.length||0));};
      try{setRangeDraft(excerptRange(chapterBlocks,start.dataset.rangeBlock,offset(start,range.startContainer,range.startOffset),end.dataset.rangeBlock,offset(end,range.endContainer,range.endOffset)));setRangeError('');}catch(e){setRangeError(e.message);}
    }}>
      {chapterBlocks.length ? chapterBlocks.map((block) => {
        const Element = block.type === 'heading' ? 'h3' : 'p';
        const ranges = highlights.get(block.id) ?? [];
        const cuts = [...new Set([0, block.text.length, ...ranges.flatMap(({ start, end }) => [start, end])])]
          .filter((cut) => cut >= 0 && cut <= block.text.length).sort((a, b) => a - b);
        return <Element key={block.id} data-range-block={block.id} data-excerpt-focus={block.id === blockId ? '' : undefined}>
          {block.prefix}{cuts.slice(0, -1).map((start, index) => {
            const end = cuts[index + 1];
            const text = block.text.slice(start, end);
            return ranges.some((range) => range.start <= start && range.end >= end) ? <mark key={start}>{text}</mark> : text;
          })}
        </Element>;
      }) : <>
        <p>当前书库里找不到对应章节，以下是已保存的摘录。</p>
        <blockquote><mark>{note.quote}</mark></blockquote>
      </>}
    </article>
    <aside className="knowledge-annotations" aria-label="摘录批注">
      {rangeEditing&&<div className="excerpt-range-editor"><p>在原文中重新选取摘录范围。</p>{rangeDraft&&<blockquote>{rangeDraft.quote}</blockquote>}<button disabled={!rangeDraft||rangeBusy} onClick={async()=>{setRangeBusy(true);try{const updated=await onSaveRange(note,rangeDraft);getSelection()?.removeAllRanges();setRangeDraft(null);onRangeSaved(updated);}catch(e){setRangeError(e.message);}finally{setRangeBusy(false);}}}>保存范围</button>{rangeError&&<p role="alert">{rangeError}</p>}</div>}
      {!compact && <><ContentActions type="excerpt" id={note.id} title={note.quote?.slice(0,24)}/><h3>批注</h3>
      <ExcerptAnnotations key={key} notes={items} annotationId={annotationId} onChange={onChange} /></>}
    </aside>
  </section>;
}

export default KnowledgeWorkspace;
