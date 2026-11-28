import {searchMemberships} from '../features/globe/searchMemberships.js';
import { parseMarkdownContent } from '../features/library/markdownReader.js';
import { indexChapters } from '../features/library/readerPosition.js';
import { loadKnowledge } from '../features/library/knowledgeStore.js';
import { loadSpaceData } from '../data/spaceStorage.js';
import { entityTypes } from './registry.js';
import { entityRecord } from './records.js';

export function buildCatalog({ books = [], globe = {}, definitions = entityTypes } = {}) {
  const collections = new Map();
  function list(key) {
    if (!collections.has(key)) collections.set(key, loadSpaceData(key, []));
    return collections.get(key);
  }
  const library = new Map(books.map(book => [book.id,book]));
  const chapters = new Map();
  const notes = loadKnowledge().notes.map(note => {
    const blockId = note.blockId ?? note.ranges?.[0]?.blockId;
    const book = library.get(note.bookId);
    if (note.chapterTitle || !book?.content || !blockId) return note;
    if (!chapters.has(book.id)) {
      const index = indexChapters(parseMarkdownContent(book.content));
      const titles = new Map(index.chapters.filter(c=>c.id).map(c=>[c.id,c.text]));
      chapters.set(book.id,new Map([...index.chapterByBlock].map(([block,chapter])=>[block,titles.get(chapter)])));
    }
    return {...note,chapterTitle:chapters.get(book.id).get(blockId)};
  });
  const context = { books, globe:searchMemberships(globe.photos,globe.journeys), notes, list };
  const result = new Map();
  for (const [type, definition] of Object.entries(definitions)) {
    for (const item of definition.read(context)) {
      const entry = entityRecord(type, item, item && definition.title?.(item));
      if (entry) result.set(entry.key, entry);
    }
  }
  return [...result.values()];
}
