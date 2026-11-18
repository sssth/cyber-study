import { loadReaderState } from './storage.js';
import { buildCatalog } from './contentRelations.js';
import { sampleBooks } from '../reader/sampleBooks.js';

export async function readCatalog(books) {
  // App owns the book collection and refreshes it after import, edit and delete.
  let globe = {};
  try {
    const result = await window.cyberStudy?.globe?.('list');
    if (result?.error) console.warn('个人知识库读取地球仪失败', result.error);
    else globe = result ?? {};
  } catch (error) {
    console.warn('个人知识库读取地球仪失败', error);
  }
  const overrides = loadReaderState().books;
  const library = [...sampleBooks, ...books].map(book => ({
    ...book, title: overrides[book.id]?.customTitle || book.title,
    author: overrides[book.id]?.customAuthor ?? book.author
  }));
  return buildCatalog({ books: library, globe });
}
