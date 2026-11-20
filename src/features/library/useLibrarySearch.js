import { useMemo } from 'react';
import { hasSearch, matchesItem, textMatches } from '../../search/searchCore.js';

export default function useLibrarySearch(books, bookIds, search, enabled, parseBook) {
  const available = useMemo(() => {
    if (!bookIds) return books;
    const ids = new Set(bookIds);
    return books.filter(book => ids.has(book.id));
  }, [books, bookIds]);

  const term = search.query.trim().toLocaleLowerCase();
  const hits = useMemo(() => {
    if (!enabled || !term) return [];
    return available.flatMap(book => {
      if (!matchesItem('book', book, { query: '', filters: search.filters })) return [];
      const blocks = parseBook(book.content);
      const matches = blocks.flatMap(block => {
        if (!textMatches([block.text], search.query)) return [];
        const index = block.text.toLocaleLowerCase().indexOf(term);
        const start = Math.max(0, index - 36);
        return [{ ...block, snippet: block.text.slice(start, index + term.length + 50) }];
      });
      return matches.length ? [{ book, matches }] : [];
    });
  }, [available, enabled, parseBook, search, term]);

  const visibleBooks = useMemo(() => {
    if (!enabled || !hasSearch(search)) return available;
    const hitIds = new Set(hits.map(hit => hit.book.id));
    return available.filter(book => hitIds.has(book.id) || matchesItem('book', book, search));
  }, [available, enabled, hits, search]);

  return { hits, visibleBooks };
}
