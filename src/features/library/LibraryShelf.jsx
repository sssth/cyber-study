import { toggleVisibleIds } from '../../entities/entitySelection.js';
import EntityTagsField from '../../entities/EntityTagsField.jsx';
import { displayShelves } from './sceneShelfArrangement.js';
import { translate, translateError } from '../../i18n/index.js';
import { bookActivityTime, bookReadingStatus, loadReaderState, readingStatusLabels } from './storage.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { usePageBackMatcher } from '../../ui/useEscapeBack.js';
import { orderType } from '../../data/contentOrder.js';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import DisplayViewMenu from '../../ui/DisplayViewMenu.jsx';
import ShelfBookRows from './ShelfBookRows.jsx';
import ShelfBookPreview from './ShelfBookPreview.jsx';
import { ActionWorkspace, WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import DisplayShelf from './DisplayShelf.jsx';
import { ContentCommand } from '../ContentCommands.jsx';
import { useEffect, useState, useRef, useDeferredValue, useMemo } from 'react';
import ContentActions from '../ContentActions.jsx';
import { bookCoverAssets, coverHue, useBookCover } from './bookCover.js';
import './libraryShelf.css';
export function Cover({ book, children }) {
  const url = useBookCover(book);
  return <span className="shelf-cover" style={{ '--cover-hue': coverHue(book) }}>{url ? <img src={url} alt=""/> : <><span className="cover-edition">{translate("i18n.cyberStudy")}</span><strong>{book.title}</strong><span className="cover-author">{book.author === '本地导入' ? '' : book.author}</span></>}{children}</span>;
}
export const shelfViews = [
  ['all', 'i18n.allBooks'],
  ...displayShelves.map(({ label }, index) => [String(index), label ?? String(index + 1)]),
  ['excerpts', 'i18n.excerptsAndAnnotations']
];

export default function LibraryShelf({ books, visibleBooks, readerState, openBook, renameBook, removeBook, canDelete, busy, onViewChange, searchActive=false, searchQuery='', searchHits=[], initialShelfView='all' }) {
  const isPageBack = usePageBackMatcher();
  const [view, setView] = useState(()=>displayShelves.some((_, index) => String(index) === initialShelfView)?initialShelfView:'all');
  const matchesByBook=useMemo(()=>new Map(searchHits.map(hit=>[hit.book.id,hit.matches])),[searchHits]);
  const collection=useRef(null);
  const [collectionWidth,setCollectionWidth]=useState(null);
  const [selection,setSelection]=useState(null),[batch,setBatch]=useState(null);
  useEffect(()=>{onViewChange?.(selection?'selecting':view);},[view,selection,onViewChange]);
  const previewSelection=useDeferredValue(selection);
  const previewBooks=useMemo(()=>(previewSelection?.ids||[]).map(id=>books.find(b=>b.id===id)).filter(Boolean),[books,previewSelection]);
  function selectBook(book){setSelection(s=>({...s,ids:s.ids.includes(book.id)?s.ids.filter(id=>id!==book.id):s.ids.length<10?[...s.ids,book.id]:s.ids}));}
  function placeSelection(){if(!selection?.ids.length)return;setBatch({...selection,token:Date.now()});setView(String(selection.shelf));setSelection(null);}
  function cycleOrientation(direction) {
    const modes = ['flat', 'spine', 'cover'];
    setSelection(current => ({ ...current, orientation: modes[(modes.indexOf(current.orientation) + direction + modes.length) % modes.length] }));
  }
  useEffect(() => {
    if (!selection) return;
    const key = event => {
      const back = isPageBack(event);
      if (!back && (event.target.closest?.('input,textarea,select,[contenteditable]') ||
        !['ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key))) return;
      if (!back && event.key === 'Enter' && event.target.closest?.('.shelf-orientation-controls button')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (back) {
        setView(String(selection.shelf));
        setSelection(null);
      } else if (event.key === 'Enter') {
        placeSelection();
      } else {
        cycleOrientation(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [selection, isPageBack]);
  const order = useContentOrder();
  const shownBooks = orderType(selection ? visibleBooks.filter(book=>!selection.used.includes(book.id)) : visibleBooks, 'book', order);
  if (!selection) shownBooks.sort((a, b) =>
    bookActivityTime(b, readerState.books[b.id]) - bookActivityTime(a, readerState.books[a.id]));
  useResultSource({
    scopeId: 'library', priority: 30, enabled: view === 'all', matches: resultEntities('book', shownBooks),
    selectVisible: selection ? () => setSelection(current => {
      if (!current) return current;
      const ids = toggleVisibleIds(current.ids, shownBooks.map(book => book.id), 10);
      return { ...current, ids };
    }) : undefined
  });
  const [editing, setEditing] = useState(null);
  const editBook = book => <ContentCommand label={translate("i18n.edit02", book.title)} disabled={busy} run={() => setEditing(book)} />;
  return <section ref={collection} className="library-shelves" data-local-selection={Boolean(selection?.ids.length) || undefined} data-selecting={selection?true:undefined} aria-label={translate("i18n.library")} style={selection?{width:collectionWidth}:undefined}>
    <DisplayViewMenu label={translate("i18n.shelfView")} options={shelfViews} value={view} onChange={id => {if(selection&&id===String(selection.shelf))placeSelection();else if(!selection){if(id==='excerpts')onViewChange(id);else setView(id);}}}>{view === 'all' && <span>{shownBooks.length}{' '}{translate("i18n.books")}</span>}</DisplayViewMenu>
    <ActionWorkspace command={false} showTrigger={false} title={translate("i18n.addBooksToDisplay")} open={Boolean(selection)} onOpenChange={open=>{if(!open&&selection){setView(String(selection.shelf));setSelection(null);}}}>
      {selection&&<><WorkspaceFields><ShelfBookPreview books={previewBooks} orientation={previewSelection?.orientation||'flat'} onTurn={cycleOrientation} disabled={!selection.ids.length}/>
      <ShelfBookRows books={selection.ids.map(id=>books.find(b=>b.id===id)).filter(Boolean)} onToggle={selectBook}/>
      </WorkspaceFields>
      <WorkspaceActions><button disabled={!selection.ids.length} onClick={placeSelection}>{translate("i18n.confirm2")}{selection.ids.length}/10）</button><button disabled={!selection.ids.length} onClick={()=>setSelection(s=>({...s,ids:[]}))}>{translate("i18n.clear")}</button></WorkspaceActions></>}
    </ActionWorkspace>
    {selection&&<ContentCommand kind="cancel-create" label={translate("i18n.cancelBookSelection")} run={()=>{setView(String(selection.shelf));setSelection(null);}}/>}
    {view === 'all' ? <div className={`cover-shelves${searchActive?' shelf-search-results':''}`}>{shownBooks.map(book => <article data-edit-item={selection?undefined:true} className={`book-card shelf-book${searchActive?' shelf-search-book':''}`} key={book.id}>
      <button data-item-open={selection?undefined:true} data-instant-selection={selection?true:undefined} className="shelf-read" title={book.title} aria-pressed={selection?selection.ids.includes(book.id):undefined} disabled={selection&&(selection.used.includes(book.id)||(!selection.ids.includes(book.id)&&selection.ids.length>=10))} onClick={() => selection?selectBook(book):openBook(book)} aria-label={translate("i18n.read0", book.title)}><Cover book={book}>
          {!selection && <span className="shelf-cover-caption">
            <span className="shelf-cover-reading">
              <span>{translate(readingStatusLabels[bookReadingStatus(readerState.books[book.id])])}</span>
              <span>{Math.round((readerState.books[book.id]?.progress ?? 0) * 100)}%</span>
            </span>
            <span className="shelf-cover-caption-author">{book.author || translate("i18n.unknownAuthor")}</span>
          </span>}
        </Cover><span className="shelf-book-title">{book.title}</span>
      </button>
      {searchActive&&<section className="shelf-search-passages" aria-label={translate("i18n.matchingPassagesIn0", book.title)} tabIndex={0}>
        {(matchesByBook.get(book.id)||[]).map(block=><button key={block.id} type="button" data-item-open={!selection?true:undefined} data-instant-selection={selection?true:undefined}
          onClick={()=>selection?selectBook(book):openBook(book,0,block.id)}>
          {block.section&&<span className="shelf-match-chapter">{block.section}</span>}
          <span className="shelf-match-text">{block.snippet}</span>
        </button>)}

      </section>}
      {!selection&&<ContentActions sortable={false} orderItem={book} type="book" id={book.id} title={book.title} preview={false}/>}
      {!selection&&editBook(book)}
    </article>)}</div> : <DisplayShelf key={view} shelf={Number(view)} books={books} openBook={openBook} batch={batch} onBatchDone={()=>setBatch(null)} onChoose={(shelf,used)=>{setCollectionWidth(collection.current?.getBoundingClientRect().width);setSelection({shelf,used,ids:[],orientation:'flat'});setView('all');}}/>}

    {editing && <BookEditor readingRecord={readerState.books[editing.id]} editing={editing} renameBook={renameBook} removeBook={removeBook} busy={busy} canDelete={canDelete} onClose={() => setEditing(null)}/>}
  </section>;
}


export function BookEditor({editing, readingRecord = loadReaderState().books[editing.id], renameBook, removeBook, canDelete, busy, onClose}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cover = useBookCover(editing);
  return <ActionWorkspace kind="edit" title={translate("i18n.editBook")} command={false} showTrigger={false} open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <form key={editing.id} className="stack-form" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
        setSaving(true); setError('');
        try {
          await renameBook(editing, {title: String(values.get('title')).trim(), author: String(values.get('author')).trim(), readingStatus: values.get('readingStatus')});
          const file = form.elements.cover.files[0];
          if (file) { await bookCoverAssets.add(`book:${editing.id}`, [file]); window.dispatchEvent(new Event('cyber-content-changed')); }
          onClose();
        } catch (e) { setError(e.message); } finally { setSaving(false); }
      }}>
        <WorkspaceFields><EntityTagsField type="book" item={editing}/>
          <label>{translate("i18n.title")}<input name="title" required maxLength={500} defaultValue={editing.title}/></label>
          <label>{translate("i18n.author")}<input name="author" maxLength={500} defaultValue={editing.author === '本地导入' ? '' : editing.author || ''} /></label>
          <label>{translate("i18n.readingStatus")}<select name="readingStatus" defaultValue={readingRecord?.readingStatus || ''}>
            <option value="">{translate("i18n.automatic")}{translate(readingStatusLabels[bookReadingStatus(readingRecord)])})</option>
            {Object.entries(readingStatusLabels).map(([status, label]) => <option key={status} value={status}>{translate(label)}</option>)}
          </select></label>
          <label>
            {translate("i18n.cover")}
            <input name="cover" type="file" accept="image/*" aria-label={translate("i18n.chooseNewCover")} />
          </label>
          {cover && <img className="book-editor-cover" src={cover} alt={translate("i18n.currentCover")} />}
          {error && <p role="alert">{translateError(error)}</p>}
        </WorkspaceFields>
        <WorkspaceActions><button disabled={saving || busy}>{translate("i18n.save")}</button>
        {canDelete && !editing.id.startsWith('sample:') && <button type="button" disabled={saving || busy} onClick={async () => { setSaving(true); setError(''); try { if (await removeBook(editing)) { onClose(); } else setError(translate("i18n.couldNotCompleteDeletionTryAgain")); } catch (failure) { setError(failure.message); } finally { setSaving(false); } }}>{translate("i18n.delete")}</button>}</WorkspaceActions>
      </form>
  </ActionWorkspace>;
}
