import { translate, translateError } from '../../i18n/index.js';
import { persistExcerptChange } from './excerptPersistence.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import { blocksPageBack, usePageBackMatcher } from '../../ui/useEscapeBack.js';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import { useNavigationState, useNavigationScroll } from '../../ui/useNavigationState.js';
import { excerptRange } from './excerptRange.js';
import { ContentCommand } from '../ContentCommands.jsx';
import {useSearchCount,useSearchScope} from '../../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeaturePanel, ActionWorkspace, WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import ExcerptAnnotations from './ExcerptAnnotations.jsx';
import { parseMarkdownContent } from './markdownReader.js';
import { highlightRanges, indexChapters } from './readerPosition.js';
import { loadKnowledge, groupExcerpts, excerptAppearance, excerptTypes, excerptKey } from './knowledgeStore.js';

function KnowledgeWorkspace({ editItem, shelfMenu, navigationItem, onStartCopy, onClose, version = 0, importedBooks = [], onBooksChanged, onOpenNote, suspended = false }) {

  const [detailKey, setDetailKey] = useNavigationState('knowledge','detailKey',() => ['excerpt', 'annotation'].includes(navigationItem?.type) ? excerptKey(navigationItem) : null, { preferInitial:Boolean(navigationItem) });
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
  const search=useSearchScope({id:'knowledge',label:translate("i18n.excerptsAndAnnotations"),priority:shelfMenu?40:10,enabled:!suspended,filters:[{key:'bookId',label:translate("i18n.sourceBook"),options:[...books]}]});
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
  useResultSource({ scopeId: 'knowledge', priority:shelfMenu?40:10,enabled:!suspended&&!detail,matches:resultEntities('excerpt',filtered.map(({note,chapter,items})=>({...note,chapterTitle:chapter,notes:items})))});

  function mutateExcerpt(note, selection) {
    const source = sources.get(note.bookId);
    return persistExcerptChange(note, selection, source?.book, source?.blocks, onBooksChanged);
  }

  if (suspended) return null;
  if (detail) {
    const closeDetail = () => { setDetailKey(null); setRangeEditing(false); if (editItem) onClose(); };
    const content = <ExcerptDetail key={detail.key} annotationId={navigationItem?.type === 'annotation' ? navigationItem.id : undefined} compact={Boolean(editItem)} entry={detail} onClose={closeDetail}
      rangeEditing={rangeEditing} onSaveRange={mutateExcerpt} onRangeSaved={note => {
        if (editItem) { onClose(); return; }
        setDetailKey(excerptKey(note)); setRangeEditing(false); setRevision(v => v + 1);
      }} onOpenNote={onOpenNote} onChange={() => setRevision(v => v + 1)} />;
    if (editItem) return <ActionWorkspace command={false} showTrigger={false} kind="edit" title={translate("i18n.editExcerptRange")} open onOpenChange={open => { if (!open) closeDetail(); }}>{content}</ActionWorkspace>;
    return createPortal(content, document.body);
  }

  const editor = (<ActionWorkspace command={false} showTrigger={false} kind="edit" title={translate("i18n.editExcerpt")} open={Boolean(editingEntry)} onOpenChange={open=>{if(!open)setEditKey(null);}}>
      {editingEntry&&<><WorkspaceFields><blockquote className="excerpt-edit-preview">{editingEntry.note.quote}</blockquote><p>{[editingEntry.note.bookTitle,editingEntry.chapter].filter(Boolean).join(' · ')}</p>
      <button type="button" onClick={()=>{setEditKey(null);onStartCopy?.({bookId:editingEntry.note.bookId,bookTitle:editingEntry.note.bookTitle,chapterTitle:editingEntry.chapter||translate("i18n.excerpt"),text:editingEntry.note.quote});}}>{translate("i18n.startTypingPractice")}</button>
      <button type="button" disabled={!editingEntry.source} onClick={()=>{setRangeEditing(true);setDetailKey(editKey);setLocalEditKey(null);}}>{translate("i18n.adjustExcerptRange")}</button>
      {editError&&<p role="alert">{translateError(editError)}</p>}
      </WorkspaceFields>
      <WorkspaceActions><button onClick={()=>setEditKey(null)}>{translate("i18n.done")}</button><button disabled={editBusy} onClick={async()=>{if(!window.confirm(translate("i18n.deleteThisExcerptAndAllItsAnnotations")))return;setEditBusy(true);try{await mutateExcerpt(editingEntry.note,null);setEditKey(null);setRevision(v=>v+1);}catch(e){setEditError(e.message);}finally{setEditBusy(false);}}}>{translate("i18n.deleteExcerpt")}</button></WorkspaceActions></>}
    </ActionWorkspace>);
  if (editItem) return editor;
  return <FeaturePanel scopeId="knowledge" hasMenu={Boolean(shelfMenu)} wide title="i18n.excerptsAndAnnotations" onClose={onClose}>
    {editor}
    {shelfMenu}
    <div className="knowledge-browser">
      <section className="knowledge-results" aria-label={translate("i18n.excerpts")}>
        {!filtered.length && <></>}
        {filtered.map(({ key, items, note, chapter }) => {
          const characters = Array.from(note.quote);
          const preview = characters.length > 120 ? characters.slice(0, 120).join('').trimEnd() + '…' : note.quote;
          return <button key={key} data-item-open type="button" className="knowledge-result" onClick={() => setDetailKey(key)}>
            <span>
              <span className="card-kicker">{[note.bookTitle, chapter].filter(Boolean).join(' · ')}</span>
              <span className="knowledge-preview">“{preview}”</span>
            </span>
            <ContentCommand label={translate("i18n.manageExcerptsAndAnnotations0", note.quote.slice(0, 48))} run={() => {setEditKey(key);setEditError('');}} />
            <ContentActions orderItem={note} type="excerpt" id={note.id} title={note.quote?.slice(0,40)}/><span className="knowledge-note-count">{translate(excerptTypes[excerptAppearance(note).excerptType])} · {items.filter((item) => item.annotation).length}{' '}{translate("i18n.annotations")}</span>
          </button>;
        })}
      </section>
    </div>
  </FeaturePanel>;
}



function ExcerptDetail({ annotationId, compact, entry, rangeEditing, onSaveRange, onRangeSaved, onClose, onOpenNote, onChange }) {
  const isPageBack = usePageBackMatcher();
  const { key, items, note, source, blockId, chapterId, chapter } = entry;
  const original = useRef(null);
  const detailRoot = useRef(null);
  const [rangeDraft,setRangeDraft]=useState(null),[rangeError,setRangeError]=useState(''),[rangeBusy,setRangeBusy]=useState(false);
  const chapterBlocks = chapterId === undefined ? [] : source.blocks.filter((block) => source.chapterByBlock.get(block.id) === chapterId);
  const highlights = highlightRanges(chapterBlocks, new Map([[key, rangeDraft?[{...note,...rangeDraft}]:items]]));
  useLayoutEffect(() => {
    const focus = original.current?.querySelector('mark') ?? original.current?.querySelector('[data-excerpt-focus]');
    if (focus) {
      const pane = original.current;
      pane.scrollTop += focus.getBoundingClientRect().top - pane.getBoundingClientRect().top - 28;
    }
  }, [key, chapterId, blockId]);
  useLayoutEffect(() => {
    const closeOnBack = event => {
      if (!isPageBack(event) || blocksPageBack()) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', closeOnBack);
    return () => document.removeEventListener('keydown', closeOnBack);
  }, [isPageBack, onClose]);
  useNavigationScroll(`excerpt.detail.${compact ? 'edit' : 'read'}`, detailRoot, '[data-scroll-memory]');

  return <section ref={detailRoot} className={compact ? "catalog-range-editor" : "knowledge-detail"} role={compact ? undefined : "dialog"} aria-modal={compact ? undefined : true} aria-label={translate("i18n.excerptDetails")}>
    {!compact && <header>
      <h2>{[note.bookTitle, chapter].filter(Boolean).join(' · ')}</h2>
      <div>
        {source && <button type="button" onClick={() => onOpenNote({ ...note, blockId })}>{translate("i18n.goToSource")}</button>}
        <button type="button" onClick={onClose}>{translate("i18n.backToList")}</button>
      </div>
    </header>}
    <article ref={original} data-scroll-memory={`original-${key}`} className="knowledge-original" aria-label={translate("i18n.chapterText")} tabIndex={0} onPointerUp={()=>{
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
            const range = ranges.find(range => range.start <= start && range.end >= end);
            return range ? <mark key={start} data-excerpt-type={range.excerptType} style={{ '--excerpt-color': range.color }}
              data-bookmark-start={range.excerptType === 'bookmark' && start === range.start ? '' : undefined}>{text}</mark> : text;
          })}
        </Element>;
      }) : <>
        <p>{translate("i18n.thisChapterIsUnavailableInTheLibrary")}</p>
        <blockquote>{excerptAppearance(note).excerptType === 'hidden' ? note.quote : <mark data-excerpt-type={excerptAppearance(note).excerptType}
          data-bookmark-start={excerptAppearance(note).excerptType === 'bookmark' ? '' : undefined}
          style={{ '--excerpt-color': excerptAppearance(note).color }}>{note.quote}</mark>}</blockquote>
      </>}
    </article>
    <aside data-scroll-memory={`annotations-${key}`} className="knowledge-annotations" aria-label={translate("i18n.excerptAnnotations")}>
      {rangeEditing&&<div className="excerpt-range-editor"><p>{translate("i18n.selectANewExcerptRangeInThe")}</p>{rangeDraft&&<blockquote>{rangeDraft.quote}</blockquote>}<button disabled={!rangeDraft||rangeBusy} onClick={async()=>{setRangeBusy(true);try{const updated=await onSaveRange(note,rangeDraft);getSelection()?.removeAllRanges();setRangeDraft(null);onRangeSaved(updated);}catch(e){setRangeError(e.message);}finally{setRangeBusy(false);}}}>{translate("i18n.saveRange")}</button>{rangeError&&<p role="alert">{translateError(rangeError)}</p>}</div>}
      {!compact && <><ContentActions type="excerpt" id={note.id} title={note.quote?.slice(0,24)}/><h3>{translate("i18n.annotation")}</h3>
      <ExcerptAnnotations key={key} notes={items} annotationId={annotationId} onChange={onChange} /></>}
    </aside>
  </section>;
}

export default KnowledgeWorkspace;
