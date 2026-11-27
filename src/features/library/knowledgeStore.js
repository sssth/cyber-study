import { excerptKey } from '../../data/excerptKey.js';
export { excerptKey };
import { createId, loadSpaceData, saveSpaceData } from '../../data/spaceStorage.js';

const fallback = {
  notes: [],
  projects: []
};

export function loadKnowledge() {
  const data = loadSpaceData('knowledge', fallback);
  return {
    notes: Array.isArray(data.notes) ? data.notes.map(note =>
      Object.hasOwn(excerptTypes, note.excerptType) ? note : { ...note, excerptType: 'highlight' }
    ) : [],
    projects: Array.isArray(data.projects) ? data.projects : []
  };
}

export function saveKnowledge(data) {
  if (!saveSpaceData('knowledge', data)) throw new Error('保存失败，本地存储可能已满。');
}

export const creatableExcerptTypes = { highlight: 'i18n.excerptHighlight', underline: 'i18n.excerptUnderline', bookmark: 'i18n.excerptBookmark' };
export const excerptTypes = { ...creatableExcerptTypes, hidden: 'i18n.excerptHidden' };
export const defaultExcerptColor = '#70c9bc';
export const excerptColors = {
  [defaultExcerptColor]: 'i18n.colorTeal',
  '#f0cb68': 'i18n.colorGold',
  '#f5a36c': 'i18n.colorOrange',
  '#ee91ac': 'i18n.colorPink',
  '#8dbdf6': 'i18n.colorLightBlue',
  '#b4a2ee': 'i18n.purple'
};

export function excerptAppearance(note) {
  return {
    excerptType: Object.hasOwn(excerptTypes, note?.excerptType) ? note.excerptType : 'highlight',
    color: /^#[0-9a-f]{6}$/i.test(note?.color) ? note.color : defaultExcerptColor
  };
}

function applyAppearance(data, key, appearance) {
  data.notes = data.notes.map(note => excerptKey(note) === key ? { ...note, ...appearance } : note);
}

export function updateExcerptAppearance(note, changes) {
  const data = loadKnowledge();
  applyAppearance(data, excerptKey(note), excerptAppearance({ ...note, ...changes }));
  saveKnowledge(data);
}

export function addKnowledgeNote({ bookId, bookTitle, chapterTitle, quote, annotation = '', tags = [], progress = 0, blockId = null, side = 'left', markdownUnderline = false, ranges, excerptType, color }, { updateAppearance = false } = {}) {
  const data = loadKnowledge();
  const note = {
    id: createId('note'),
    bookId,
    bookTitle,
    chapterTitle,
    quote,
    annotation,
    tags,
    progress,
    blockId,
    side,
    markdownUnderline,
    ...excerptAppearance({ excerptType, color }),
    ranges,
    source: bookTitle,
    createdAt: new Date().toISOString(),
    origin: 'user'
  };
  // Keep the excerpt's representative ID when appending another annotation.
  const groupKey = excerptKey(note);
  const first = data.notes.findIndex(existing => excerptKey(existing) === groupKey);
  if (first >= 0) {
    if (updateAppearance && excerptAppearance(data.notes[first]).excerptType === 'hidden') {
      throw Error('这段文字已有隐藏摘录，请在摘录汇总中编辑。');
    }
    if (updateAppearance) applyAppearance(data, groupKey, excerptAppearance(note));
    if (!annotation && updateAppearance) {
      saveKnowledge(data);
      return data.notes[first];
    }
    Object.assign(note, excerptAppearance(data.notes[first]));
  }
  data.notes.splice(first + 1, 0, note);
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
  data.notes = data.notes.map((note) => note.id === id ? { ...note, annotation, annotationCreatedAt: !note.annotation && annotation ? new Date().toISOString() : note.annotationCreatedAt } : note);
  saveKnowledge(data);
}



export function removeExcerptAnnotation(note) {
  const related = loadKnowledge().notes.filter((item) => excerptKey(item) === excerptKey(note));
  if (related.length > 1 && related[0].id !== note.id) return deleteKnowledgeNote(note.id);
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

export function updateExcerptRange(note, selection) {
 const data=loadKnowledge(),key=excerptKey(note);
 if(!selection.quote?.trim()||!selection.ranges?.length)throw Error('摘录范围不能为空。');
 let updated;
 data.notes=data.notes.map(item=>{
  if(excerptKey(item)!==key)return item;
  const next={...item,quote:selection.quote,blockId:selection.blockId,ranges:selection.ranges,updatedAt:new Date().toISOString()};
  updated??=next;return next;
 });
 if(!updated)throw Error('这条摘录已不存在，请返回列表刷新。');
 saveKnowledge(data);return updated;
}
export function deleteExcerpt(note) {
 const data=loadKnowledge(),key=excerptKey(note);
 data.notes=data.notes.filter(item=>excerptKey(item)!==key);
 saveKnowledge(data);
}
