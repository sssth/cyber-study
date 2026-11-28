import {knowledgeEntity} from '../../data/knowledgeRecords.js';
import { groupExcerpts, excerptKey } from './knowledgeStore.js';

export default {
  id: 'shelf', label: 'i18n.library', description: 'i18n.openLibrary',
  entities: {
    book: {
      label: 'i18n.book', read: ({ books }) => books,
      search: ['author'], fullText: 'content', create: true,
      target: { view: 'book' },
      snapshot: 'author:作者 source:来源 content:书籍阅读正文'
    },
    excerpt: {
      label: 'i18n.excerpt', read: ({ notes }) => [...groupExcerpts(notes).values()].map(group => knowledgeEntity('excerpt',group[0])),
      title: record => record.text?.slice(0, 40),
      search: ['text', 'bookTitle', 'chapterTitle'], target: { view: 'excerpts', scope: 'knowledge' },
      parent: { type: 'book', id: record => record.bookId },
      snapshot: 'bookTitle:来源书名 chapterTitle:章节 text:摘录原文'
    },
    annotation: {
      label: 'i18n.annotation', read: ({ notes }) => notes.filter(note => note.annotation).map(note=>knowledgeEntity('annotation',note)),
      title: record => record.text?.slice(0, 40),
      search: ['text', 'bookTitle', 'chapterTitle'], target: { view: 'excerpts', scope: 'knowledge' },
      parent: { type: 'excerpt', matchKey: excerptKey },
      snapshot: 'bookTitle:来源书名 chapterTitle:章节'
    }
  }
};
