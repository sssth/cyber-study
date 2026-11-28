import { loadReaderState } from '../features/library/storage.js';
import { buildCatalog } from './catalog.js';

export async function readCatalog(books) {
  let globe = {};
  let partial = false;
  try {
    const result = await globalThis.cyberStudy?.globe?.('list');
    if (result?.error) throw new Error(result.error);
    globe = result ?? {};
  } catch (error) {
    console.warn('个人知识库读取地球仪失败', error);
    partial = true;
  }
  const overrides = loadReaderState().books;
  const library = books.map(book => ({
    ...book, readingRecord:overrides[book.id], title: overrides[book.id]?.customTitle || book.title,
    author: overrides[book.id]?.customAuthor ?? book.author
  }));
  return { items: buildCatalog({ books: library, globe }), partial };
}
