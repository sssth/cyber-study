import {defaultEnabled} from '../../search/typedFields.js';
import {parseQuery,positiveTerms} from '../../search/logicQuery.js';
import { useMemo } from 'react';
import { hasSearch, matchesItem, textMatches } from '../../search/searchCore.js';

import { bookReadingStatus, readingStatusLabels } from './storage.js';

export const bookFilters = [{
  key: 'readingStatus', label: 'i18n.readingStatus', options: Object.entries(readingStatusLabels)
}];

export default function useLibrarySearch(books, bookIds, search, enabled, parseBook, readingRecords) {
  const available = useMemo(() => {
    const ids = bookIds && new Set(bookIds);
    const status = enabled && search.filters.readingStatus;
    return books.filter(book => (!ids || ids.has(book.id)) &&
      (!status || bookReadingStatus(readingRecords[book.id]) === status));
  }, [books, bookIds, readingRecords, enabled, search.filters.readingStatus]);

  const term = search.query.trim().toLocaleLowerCase();
  const parsed=parseQuery(search.query);
  const structuredBooks=useMemo(()=>{
    if(!enabled || !parsed.structured)return [];
    return available.filter(book=>{
      const blocks=parseBook(book.content);
      return matchesItem('book',{...book,readingRecord:readingRecords[book.id]},search,undefined,{'正文':blocks.map(block=>block.text)});
    });
  },[available,enabled,parsed,parseBook,search,readingRecords]);

  const hits = useMemo(() => {
    if (!enabled || !term || !parsed.structured && !defaultEnabled({type:'book',key:'content',defaultOn:true})) return [];
    const bodyTerms=parsed.structured?positiveTerms(parsed.tree,['正文','content']):[];
    if(parsed.structured && !bodyTerms.length)return [];
    return (parsed.structured?structuredBooks:available).flatMap(book => {
      if (!matchesItem('book', book, { query: '', filters: search.filters })) return [];
      const matches = parseBook(book.content).flatMap(block => {
        const hit=parsed.structured?bodyTerms.find(word=>textMatches([block.text],word)):term;
        if(!hit || (!parsed.structured && !textMatches([block.text],search.query)))return [];
        const index=Math.max(0,block.text.toLocaleLowerCase().indexOf(hit));
        return [{...block,snippet:block.text.slice(Math.max(0,index-36),index+hit.length+50)}];
      });
      return matches.length ? [{ book, matches }] : [];
    });
  }, [available, enabled, parseBook, parsed, structuredBooks, search, term]);

  const visibleBooks = useMemo(() => {
    if (!enabled || !hasSearch(search)) return available;
    if(parsed.structured)return structuredBooks;
    const hitIds = new Set(hits.map(hit => hit.book.id));
    return available.filter(book => hitIds.has(book.id) || matchesItem('book',{...book,readingRecord:readingRecords[book.id]},search));
  }, [available, enabled, hits, parsed, structuredBooks, search,readingRecords]);

  return { hits, visibleBooks };
}
