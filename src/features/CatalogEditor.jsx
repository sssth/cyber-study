import { useState } from 'react';
import { BookEditor } from '../reader/LibraryShelf.jsx';
import { loadReaderState, saveReaderState } from '../data/storage.js';
import { removeExcerptAnnotation } from '../data/knowledgeStore.js';
import Annotation from './Annotation.jsx';
import KnowledgeWorkspace from './KnowledgeWorkspace.jsx';
import MemoryEditor from './globe/MemoryEditor.jsx';
import { DiaryPanel, MemoBoard } from './DiaryMemo.jsx';
import { MovieCollection } from './MediaCollections.jsx';
import TypewriterPanel from './TypewriterPanel.jsx';
import { ActionWorkspace } from './ui.jsx';

function GlobeEditor({item, catalog, onClose}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = async (action, input) => {
    setBusy(true);
    setError('');
    try {
      const result = await window.cyberStudy.globe(action, input);
      if (result.error) throw new Error(result.error);
      return result;
    } catch (failure) {
      setError(failure.message);
      return null;
    } finally { setBusy(false); }
  };
  const props = {photos: catalog.filter(entry => entry.type === 'memory_point'), busy, request};
  if (item.type === 'journey') return <MemoryEditor {...props} mode="journey" editJourney={item} error={error} onClose={onClose}/>;
  return <ActionWorkspace command={false} showTrigger={false} title="编辑记忆点" open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <MemoryEditor {...props} mode="point" initialPoint={item} onSaved={onClose} onDelete={async id => {
      if (window.confirm('删除这个记忆点？') && await request('update', {ids:[id], patch:{deletedAt:true}})) onClose();
    }}/>
    {error && <p role="alert">{error}</p>}
  </ActionWorkspace>;
}

export default function CatalogEditor({item, catalog, books, onBooksChanged, onBookDeleted, onStartCopy, onOpenNote, onClose}) {
  const props = {editItem:item, onClose};
  switch (item.type) {
    case 'movie': return <MovieCollection {...props}/>;
    case 'diary': return <DiaryPanel {...props}/>;
    case 'memo':
    case 'todo': return <MemoBoard {...props}/>;
    case 'typing_work': return <TypewriterPanel {...props} importedBooks={books}/>;
    case 'memory_point':
    case 'journey': return <GlobeEditor item={item} catalog={catalog} onClose={onClose}/>;
    case 'excerpt': return <KnowledgeWorkspace {...props} importedBooks={books} onBooksChanged={onBooksChanged} onStartCopy={onStartCopy} onOpenNote={onOpenNote}/>;
    case 'annotation': return <ActionWorkspace command={false} showTrigger={false} title="编辑批注" open onOpenChange={open => { if (!open) onClose(); }}>
      <Annotation editOnly note={item} onSaved={onClose} onCancel={onClose} onDelete={() => {removeExcerptAnnotation(item); onClose();}}/>
    </ActionWorkspace>;
    case 'book': return <BookEditor editing={item} onClose={onClose} canDelete={Boolean(window.cyberStudy?.deleteBook)}
      renameBook={async (book, values) => {
        const { readingStatus, ...metadata } = values;
        const storedLocally = !window.cyberStudy?.renameBook || !/^(file:|local:)/.test(book.id);
        if (!storedLocally) onBooksChanged([await window.cyberStudy.renameBook(book.id, metadata)]);
        const state = loadReaderState();
        state.books[book.id] = {
          ...state.books[book.id], readingStatus,
          ...(storedLocally ? { customTitle: metadata.title, customAuthor: metadata.author } : {})
        };
        saveReaderState(state);
      }}
      removeBook={async book => {
        const removed = await window.cyberStudy.deleteBook(book.id);
        if (removed) onBookDeleted(book.id);
        return removed;
      }}/>;
    default: return null; // Music editors share the mounted player's collection and playback state.
  }
}
