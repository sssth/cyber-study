import { BookEditor } from './LibraryShelf.jsx';
import { loadReaderState, saveReaderState } from './storage.js';

export default function CatalogBookEditor({ item, onClose, onBooksChanged, onBookDeleted }) {
  return <BookEditor key={item.id} editing={item} onClose={onClose} canDelete={Boolean(window.cyberStudy?.deleteBook)}
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
}
