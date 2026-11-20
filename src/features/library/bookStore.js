async function withBooks(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('cyber-study-books', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('books', mode);
      const request = operation(transaction.objectStore('books'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const loadBooks = () => withBooks('readonly', (books) => books.getAll());

export const deleteLegacyBook = (id) => withBooks('readwrite', (books) => books.delete(id));
