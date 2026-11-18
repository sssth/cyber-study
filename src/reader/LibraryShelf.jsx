import useContentOrder from '../ui/useContentOrder.js';
import { orderType } from '../data/contentOrder.js';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import DisplayViewMenu from '../ui/DisplayViewMenu.jsx';
import ShelfBookRows from './ShelfBookRows.jsx';
import { ActionWorkspace, WorkspaceActions } from '../features/ui.jsx';
import DisplayShelf from './DisplayShelf.jsx';
import { ContentCommand } from '../features/ContentCommands.jsx';
import { useEffect, useState, useRef, lazy, Suspense, useDeferredValue, useMemo, memo } from 'react';
import ContentActions from '../features/ContentActions.jsx';
import '../../shared/contentAssets.js';
import './libraryShelf.css';
const GroupPreview=memo(lazy(()=>import('./ShelfModel.jsx').then(m=>({default:m.BookGroupPreview}))));
const assets = globalThis.ContentAssets.repository('cyber-study-content-assets-v1');
export function useBookCover(book) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true, revision = 0, current;
    async function refresh() {
      const version = ++revision;
      try {
        const record = await assets.get(`book:${book.id}`);
        const asset = record.imageAssetIds?.at(-1) && await assets.asset(record.imageAssetIds.at(-1));
        const next = asset ? URL.createObjectURL(asset.blob) : null;
        if (!alive || version !== revision) { if (next) URL.revokeObjectURL(next); return; }
        if (current) URL.revokeObjectURL(current);
        current = next; setUrl(next);
      } catch { /* Keep the title cover available. */ }
    }
    refresh(); window.addEventListener('cyber-content-changed', refresh);
    return () => { alive = false; if (current) URL.revokeObjectURL(current); window.removeEventListener('cyber-content-changed', refresh); };
  }, [book.id]);
  return url;
}
export function coverHue(book) { return [...book.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 100 + 160; }
export function Cover({ book }) {
  const url = useBookCover(book);
  return <span className="shelf-cover" style={{ '--cover-hue': coverHue(book) }}>{url ? <img src={url} alt=""/> : <><span className="cover-edition">赛 博 书 房</span><strong>{book.title}</strong><span className="cover-author">{book.author === '本地导入' ? '' : book.author}</span></>}</span>;
}
export const shelfViews = [[ 'all', '全部书籍'], ['0', '展示书架一'], ['1', '展示书架二'], ['excerpts', '摘录与批注']];

export default function LibraryShelf({ books, visibleBooks, readerState, openBook, renameBook, removeBook, canDelete, busy, onViewChange, searchActive=false, searchQuery='', searchHits=[], initialShelfView='all' }) {
  const [view, setView] = useState(()=>['0','1'].includes(initialShelfView)?initialShelfView:'all');
  const matchesByBook=useMemo(()=>new Map(searchHits.map(hit=>[hit.book.id,hit.matches])),[searchHits]);
  const collection=useRef(null);
  const [collectionWidth,setCollectionWidth]=useState(null);
  const [selection,setSelection]=useState(null),[batch,setBatch]=useState(null);
  useEffect(()=>{onViewChange?.(selection?'selecting':view);},[view,selection,onViewChange]);
  const previewSelection=useDeferredValue(selection);
  const previewBooks=useMemo(()=>(previewSelection?.ids||[]).map(id=>books.find(b=>b.id===id)).filter(Boolean),[books,previewSelection]);
  function selectBook(book){setSelection(s=>({...s,ids:s.ids.includes(book.id)?s.ids.filter(id=>id!==book.id):s.ids.length<10?[...s.ids,book.id]:s.ids}));}
  function placeSelection(){if(!selection?.ids.length)return;setBatch({...selection,token:Date.now()});setView(String(selection.shelf));setSelection(null);}
  useEffect(()=>{if(!selection)return;const key=e=>{if(e.target.closest?.('input,textarea,select,[contenteditable]'))return;if(['ArrowLeft','ArrowRight','Enter','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Enter')placeSelection();else if(e.key==='Escape'){setView(String(selection.shelf));setSelection(null);}else{const modes=['flat','spine','cover'];setSelection(s=>({...s,orientation:modes[(modes.indexOf(s.orientation)+(e.key==='ArrowRight'?1:2))%3]}));}}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[selection]);
  const order = useContentOrder();
  const shownBooks = orderType(selection ? visibleBooks.filter(book=>!selection.used.includes(book.id)) : visibleBooks, 'book', order);
  useMapSource({priority:30,enabled:view==='all',entities:mapEntities('book',shownBooks)});
  const [editing, setEditing] = useState(null);
  const editBook = book => <ContentCommand label={`编辑《${book.title}》`} disabled={busy} run={() => setEditing(book)} />;
  return <section ref={collection} className="library-shelves" data-selecting={selection?true:undefined} aria-label="封面书架" style={selection?{width:collectionWidth}:undefined}>
    <DisplayViewMenu label="书架视图" options={shelfViews} value={view} onChange={id => {if(selection&&id===String(selection.shelf))placeSelection();else if(!selection){if(id==='excerpts')onViewChange(id);else setView(id);}}}>{view === 'all' && <span>{shownBooks.length} 本藏书</span>}</DisplayViewMenu>
    <ActionWorkspace command={false} showTrigger={false} title="新建陈列" open={Boolean(selection)} onOpenChange={open=>{if(!open&&selection){setView(String(selection.shelf));setSelection(null);}}}>
      {selection&&<><div className="shelf-workspace-preview"><Suspense fallback={null}><GroupPreview books={previewBooks} orientation={previewSelection?.orientation||'flat'}/></Suspense></div>
      <ShelfBookRows books={selection.ids.map(id=>books.find(b=>b.id===id)).filter(Boolean)} onToggle={selectBook}/>
      <WorkspaceActions><button disabled={!selection.ids.length} onClick={placeSelection}>确认（{selection.ids.length}/10）</button><button disabled={!selection.ids.length} onClick={()=>setSelection(s=>({...s,ids:[]}))}>清空</button></WorkspaceActions></>}
    </ActionWorkspace>
    {selection&&<ContentCommand kind="cancel-create" label="取消选书" run={()=>{setView(String(selection.shelf));setSelection(null);}}/>}
    {view === 'all' ? <div className={`cover-shelves${searchActive?' shelf-search-results':''}`}>{shownBooks.map(book => <article data-edit-item={selection?undefined:true} className={`book-card shelf-book${searchActive?' shelf-search-book':''}`} key={book.id}>
      <button data-item-open={selection?undefined:true} data-instant-selection={selection?true:undefined} className="shelf-read" aria-pressed={selection?selection.ids.includes(book.id):undefined} disabled={selection&&(selection.used.includes(book.id)||(!selection.ids.includes(book.id)&&selection.ids.length>=10))} onClick={() => selection?selectBook(book):openBook(book)} aria-label={`阅读《${book.title}》`}><Cover book={book}/><span className="shelf-book-title">{book.title}</span></button>
      {searchActive&&<section className="shelf-search-passages" aria-label={`《${book.title}》的匹配段落`} tabIndex={0}>
        {(matchesByBook.get(book.id)||[]).map(block=><button key={block.id} type="button" data-item-open={!selection?true:undefined} data-instant-selection={selection?true:undefined}
          onClick={()=>selection?selectBook(book):openBook(book,0,block.id)}>
          {block.section&&<span className="shelf-match-chapter">{block.section}</span>}
          <span className="shelf-match-text">{block.snippet}</span>
        </button>)}

      </section>}
      {!selection&&<ContentActions orderItem={book} type="book" id={book.id} title={book.title} preview={false}/>}
      <div className="shelf-book-meta"><span>{readerState.books?.[book.id]?.progress > 0 ? `已读 ${Math.round(readerState.books[book.id].progress * 100)}%` : '未开始'}</span></div>
      {!selection&&editBook(book)}
    </article>)}</div> : <DisplayShelf key={view} shelf={Number(view)} books={books} openBook={openBook} batch={batch} onBatchDone={()=>setBatch(null)} onChoose={(shelf,used)=>{setCollectionWidth(collection.current?.getBoundingClientRect().width);setSelection({shelf,used,ids:[],orientation:'flat'});setView('all');}}/>}

    {editing && <BookEditor editing={editing} renameBook={renameBook} removeBook={removeBook} busy={busy} canDelete={canDelete} onClose={() => setEditing(null)}/>}
  </section>;
}


export function BookEditor({editing, renameBook, removeBook, canDelete, busy, onClose}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <ActionWorkspace title="编辑书籍" command={false} showTrigger={false} open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <form key={editing.id} className="stack-form" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
        setSaving(true); setError('');
        try {
          await renameBook(editing, {title: String(values.get('title')).trim(), author: String(values.get('author')).trim()});
          const file = form.elements.cover.files[0];
          if (file) { await assets.add(`book:${editing.id}`, [file]); window.dispatchEvent(new Event('cyber-content-changed')); }
          onClose();
        } catch (e) { setError(e.message); } finally { setSaving(false); }
      }}>
        <label>书名<input name="title" required maxLength={500} defaultValue={editing.title}/></label>
        <label>作者<input name="author" maxLength={500} defaultValue={editing.author === '本地导入' ? '' : editing.author || ''} /></label>
        <label>封面<input name="cover" type="file" accept="image/*"/></label>
        {error && <p role="alert">{error}</p>}
        <WorkspaceActions><button disabled={saving || busy}>保存</button>
        {canDelete && !editing.id.startsWith('sample:') && <button type="button" disabled={saving || busy} onClick={async () => { setSaving(true); setError(''); try { if (await removeBook(editing)) { onClose(); } else setError('删除未完成，请重试。'); } catch (failure) { setError(failure.message); } finally { setSaving(false); } }}>删除</button>}</WorkspaceActions>
      </form>
  </ActionWorkspace>;
}
