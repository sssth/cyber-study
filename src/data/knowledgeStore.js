import { createId, loadSpaceData, saveSpaceData } from './spaceStorage.js';

const fallback = {
  notes: [],
  projects: []
};

export function loadKnowledge() {
  const data = loadSpaceData('knowledge', fallback);
  return {
    notes: Array.isArray(data.notes) ? data.notes : [],
    projects: Array.isArray(data.projects) ? data.projects : []
  };
}

export function saveKnowledge(data) {
  if (!saveSpaceData('knowledge', data)) throw new Error('保存失败，本地存储可能已满。');
}

export function addKnowledgeNote({ bookId, bookTitle, quote, annotation = '', tags = [], progress = 0, blockId = null, side = 'left', markdownUnderline = false, ranges }) {
  const data = loadKnowledge();
  const note = {
    id: createId('note'),
    bookId,
    bookTitle,
    quote,
    annotation,
    tags,
    progress,
    blockId,
    side,
    markdownUnderline,
    ranges,
    source: bookTitle,
    createdAt: new Date().toISOString(),
    origin: 'user'
  };
  data.notes = [note, ...data.notes];
  saveKnowledge(data);
  return note;
}

export function deleteKnowledgeNote(noteId) {
  const data = loadKnowledge();
  data.notes = data.notes.filter((note) => note.id !== noteId);
  saveKnowledge(data);
  return data;
}

export function editKnowledgeNote(id, annotation) {
  const data = loadKnowledge();
  data.notes = data.notes.map((note) => note.id === id ? { ...note, annotation } : note);
  saveKnowledge(data);
}

export function excerptKey(note) {
  return JSON.stringify([note.bookId, note.blockId ?? note.progress, note.quote, note.ranges?.[0]?.start ?? null]);
}

export function removeExcerptAnnotation(note) {
  const related = loadKnowledge().notes.filter((item) => excerptKey(item) === excerptKey(note));
  if (related.length > 1) return deleteKnowledgeNote(note.id);
  editKnowledgeNote(note.id, '');
  return loadKnowledge();
}

export function groupExcerpts(notes) {
  const groups = new Map();
  for (const note of notes) {
    const key = excerptKey(note);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  return groups;
}
