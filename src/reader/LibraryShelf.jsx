import DisplayShelf from './DisplayShelf.jsx';
import { ContentCommand } from '../features/ContentCommands.jsx';
import { useEffect, useState } from 'react';
import ContentActions from '../features/ContentActions.jsx';
import '../../shared/contentAssets.js';
import './libraryShelf.css';
const assets = globalThis.ContentAssets.repository('cyber-study-content-assets-v1');
export function useBookCover(book) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true, revision = 0, current;
    async function refresh() {
      const version = ++revision;
      try {
        const record = await assets.get(`book:${book.id}`);
        const asset = record.imageAssetIds?.[0] && await assets.asset(record.imageAssetIds[0]);
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
  return <span className="shelf-cover" style={{ '--cover-hue': coverHue(book) }}>{url ? <img src={url} alt=""/> : <><span className="cover-edition">赛 博 书 房</span><strong>{book.title}</strong><span className="cover-author">{book.author || '私人藏书'}</span></>}</span>;
}
export default function LibraryShelf({ books, visibleBooks, readerState, openBook, renameBook, removeBook, canDelete, busy }) {
  const [view, setView] = useState('all');
  const editBook = book => <>
    {renameBook &&
      <ContentCommand label={`修改书名 · ${book.title}`} value={book.title} disabled={busy} run={title => renameBook(book, title)} />}
    {canDelete && !book.id.startsWith('sample:') &&
      <ContentCommand label={`删除《${book.title}》`} disabled={busy} run={() => removeBook(book)} />}
  </>;
  return <section className="library-shelves" aria-label="封面书架">
    <div className="shelf-view-bar"><div role="group" aria-label="书架视图">{[['all', '全部书籍'], ['0', '展示书架一'], ['1', '展示书架二']].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div><span>{view === 'all' ? `${visibleBooks.length} 本藏书` : '按层自由陈列'}</span></div>
    {view === 'all' ? <div className="cover-shelves">{!visibleBooks.length && <p>这里还没有符合条件的书籍。</p>}{visibleBooks.map(book => <article className="book-card shelf-book" key={book.id}>
      <button data-item-open className="shelf-read" onClick={() => openBook(book)} aria-label={`阅读《${book.title}》`}><Cover book={book}/><span className="shelf-book-title">{book.title}</span></button>
      <ContentActions type="book" id={book.id} title={book.title} preview={false}/>
      <div className="shelf-book-meta"><span>{readerState.books?.[book.id]?.progress > 0 ? `已读 ${Math.round(readerState.books[book.id].progress * 100)}%` : '未开始'}</span>{editBook(book)}</div>
    </article>)}</div> : <DisplayShelf key={view} shelf={Number(view)} books={books} openBook={openBook}/>}

  </section>;
}
