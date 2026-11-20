import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteLegacyBook, loadBooks } from './bookStore.js';

async function loadLibrary() {
  const desktop = globalThis.cyberStudy;
  if (!desktop?.listBooks) return { books: await loadBooks(), warnings: [] };

  const warnings = [];
  try {
    const books = await loadBooks();
    const storage = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith('cyber-study')) storage[key] = localStorage.getItem(key);
    }
    const report = await desktop.migrateLegacyBooks({ books, storage });
    for (const item of report) {
      if (item.status === 'verified') await deleteLegacyBook(item.id);
    }
    if (report.some(item => item.status === 'failed')) {
      warnings.push('i18n.someOlderBooksCouldNotBeMigrated');
    }
  } catch (error) {
    console.warn('无法迁移旧书库', error);
    warnings.push('i18n.someOlderBooksCouldNotBeMigrated');
  }

  const { books, failures } = await desktop.listBooks({ includeFailures: true });
  if (failures.length) {
    console.warn('部分书籍无法读取', failures);
    warnings.push('i18n.someBooksCouldNotBeRead');
  }
  return { books, warnings };
}

export default function useBookLibrary() {
  const [books, setBooks] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const loading = useRef(null);
  const deletedDuringLoad = useRef(new Set());

  useEffect(() => {
    let active = true;
    loading.current ??= loadLibrary();
    loading.current.then(result => {
      if (!active) return;
      const deleted = deletedDuringLoad.current;
      deletedDuringLoad.current = new Set();
      loading.current = null;
      setBooks(current => {
        const existing = new Set(current.map(book => book.id));
        return [...current, ...result.books.filter(book => !existing.has(book.id) && !deleted.has(book.id))];
      });
      setWarnings(result.warnings);
    }).catch(error => {
      if (!active) return;
      loading.current = null;
      deletedDuringLoad.current.clear();
      console.warn('无法读取本地书库', error);
      setWarnings(['i18n.couldNotLoadTheLocalLibrary']);
    });
    return () => { active = false; };
  }, []);

  const updateBooks = useCallback(incoming => {
    for (const book of incoming) deletedDuringLoad.current.delete(book.id);
    setBooks(current => {
      const byId = new Map(current.map(book => [book.id, book]));
      for (const book of incoming) byId.set(book.id, book);
      return [...byId.values()];
    });
  }, []);

  const removeBook = useCallback(id => {
    if (loading.current) deletedDuringLoad.current.add(id);
    setBooks(current => current.filter(book => book.id !== id));
  }, []);

  return { books, warnings, updateBooks, removeBook };
}
