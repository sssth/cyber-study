import { loadSpaceData, saveContentData, recyclePlaylists } from '../data/spaceStorage.js';
import { loadKnowledge, excerptKey } from '../features/library/knowledgeStore.js';
import { loadReaderState, saveReaderState } from '../features/library/storage.js';
import '../../shared/contentSchema.js';
import { httpUrl } from '../features/mediaUrl.js';
import { doubanSubjectId, splitMovieRegions } from '../features/movies/doubanMovie.js';
import { sharedFields } from './bulkFields.js';
import { translate } from '../i18n/index.js';

const collections = { diary: 'diary', memo: 'memo', todo: 'memo', movie: 'movies', typing_work: 'typewriter', music: 'music' };
const stale = () => Error(translate('i18n.selectionChanged'));

function write(key, data) {
  if (!saveContentData(key, data)) throw Error(translate('i18n.couldNotSaveLocalStorageMayBe'));
  window.dispatchEvent(new CustomEvent('cyber-bulk-updated', { detail: key }));
}

function normalized(values) {
  const patch = { ...values };
  for (const key of ['url', 'douban']) {
    if (!(key in patch)) continue;
    const url = httpUrl(patch[key]);
    if (!url && key === 'url') throw Error(translate('i18n.enterAValidBilibiliOrOtherWeb'));
    if (!url || (key === 'douban' && !doubanSubjectId(url))) throw Error(translate('i18n.enterTheDoubanPageForThisFilm'));
    patch[key] = url.href;
  }
  if ('region' in patch) patch.region = splitMovieRegions(patch.region);
  for (const key of ['genres', 'tags']) {
    if (key in patch) patch[key] = patch[key].split(/[,，、]/).map(s => s.trim()).filter(Boolean).slice(0, key === 'tags' ? 5 : undefined);
  }
  for(const field of ['review','tripNote','caption','note','description']){
    if(field in patch){patch.text=patch[field];delete patch[field];}
  }
  return patch;
}

function patchRecord(type, record, patch) {
  if (type === 'typing_work' && patch.sourceText) {
    const { sourceText, ...fields } = patch;
    return { ...record, ...fields, text: sourceText, ...globalThis.CyberContentSchema.copyState(sourceText, ''), complete: false };
  }
  return { ...record, ...patch };
}

function changeLocal(type, items, patch, remove) {
  const ids = new Set(items.map(item => item.id));
  const key = collections[type];
  if (key) {
    const records = loadSpaceData(key, []);
    const matches = records.filter(record => ids.has(record.id) && (key !== 'memo' || (record.type === 'todo') === (type === 'todo')));
    if (matches.length !== ids.size) throw stale();
    write(key, records.flatMap(record => !ids.has(record.id) ? [record] : remove ? [] : [patchRecord(type, record, patch)]));
  } else if (type === 'playlist') {
    if (remove) return recyclePlaylists(ids);
    const tracks = loadSpaceData('music', []);
    const playlists = new Map(tracks.flatMap(track => (track.playlists ?? []).map(list => [list.id, list])));
    for (const list of loadSpaceData('playlists', [])) playlists.set(list.id, list);
    if (items.some(item => !playlists.has(item.id))) throw stale();
    write('playlists', [...playlists.values()].flatMap(list => !ids.has(list.id) ? [list] : [{ ...list, ...patch }]));
    write('music', tracks.flatMap(track => {
      if (!track.playlists?.some(list => ids.has(list.id))) return [track];
      const playlists = track.playlists.flatMap(list => !ids.has(list.id) ? [list] : [{ ...list, ...patch }]);
      // Keep tracks outside the selection, including tracks whose last playlist was deleted.
      return [{ ...track, playlists }];
    }));
  } else if (type === 'excerpt' || type === 'annotation') {
    const data = loadKnowledge();
    const groups = new Map();
    for (const note of data.notes) if (!groups.has(excerptKey(note))) groups.set(excerptKey(note), note.id);
    const found = new Set();
    data.notes = data.notes.flatMap(note => {
      const representative = groups.get(excerptKey(note));
      const id = type === 'excerpt' ? representative : note.id;
      if (!ids.has(id)) return [note];
      found.add(id);
      if (!remove) return [{ ...note, ...patch }];
      return type === 'annotation' && representative === id ? [{ ...note, annotation: '' }] : [];
    });
    if (found.size !== ids.size) throw stale();
    write('knowledge', data);
  } else throw stale();
}

async function applySelection(items, values, remove, { books, updateBooks, removeBook, completed }) {
  const keys = new Set(sharedFields(items).map(field => field.key));
  const changes = Object.entries(values);
  if (changes.some(([key, value]) => !keys.has(key) || typeof value !== 'string')) throw stale();
  const patch = normalized(values);
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.type)) groups.set(item.type, []);
    groups.get(item.type).push(item);
  }
  const bookItems = groups.get('book') ?? [];
  if (remove && bookItems.length) {
    const result = await window.cyberStudy.deleteBooks(bookItems.map(item => item.id), items.length);
    if (result.canceled) return false;
    for (const id of result.deleted) { removeBook(id); completed('book', id); }
    if (result.error) throw Error(result.error);
  } else if (bookItems.length) {
    for (const item of bookItems) {
      if (!books.some(book => book.id === item.id)) throw stale();
      const native = window.cyberStudy?.patchBook && /^(file:|local:)/.test(item.id);
      const metadata = Object.fromEntries(Object.entries(patch).filter(([key]) => ['title', 'author'].includes(key)));
      if (native && Object.keys(metadata).length) updateBooks([await window.cyberStudy.patchBook(item.id, metadata)]);
      const state = loadReaderState();
      const record = { ...state.books[item.id] };
      for (const [key, setting] of [['title', 'customTitle'], ['author', 'customAuthor']]) {
        if (key in metadata) {
          if (native) delete record[setting];
          else record[setting] = metadata[key];
        }
      }
      state.books[item.id] = record;
      if (!saveReaderState(state)) throw Error(translate('i18n.couldNotSaveLocalStorageMayBe'));
      window.dispatchEvent(new CustomEvent('cyber-bulk-updated', { detail: 'book' }));
      completed('book', item.id);
    }
  }
  groups.delete('book');
  // Remove selected annotations first because an excerpt deletion also removes its annotations.
  const ordered = [...groups].sort(([a], [b]) => Number(b === 'annotation') - Number(a === 'annotation'));
  for (const [type, entries] of ordered) {
    if (type === 'journey' || type === 'memory_point') {
      let data = await window.cyberStudy.globe('list');
      for (const { id } of entries) {
        const journey = type === 'journey';
        const record = data[journey ? 'journeys' : 'photos']?.find(item => item.id === id && !item.deletedAt);
        if (!record) throw Error(data.error || stale().message);
        const action = journey ? 'journey' : remove ? 'update' : 'point';
        data = await window.cyberStudy.globe(action, !journey && remove ? { ids: [id], patch: { deletedAt: true } } :
          { ...record, visitStatus: record.visitStatus ?? 'visited', ...patch, remove });
        if (data.error) throw Error(data.error);
        window.dispatchEvent(new CustomEvent('cyber-bulk-globe', { detail: data }));
        completed(type, id);
      }
    } else {
      changeLocal(type, entries, patch, remove);
      for (const { id } of entries) completed(type, id);
    }
  }
  return true;
}


export async function writeSelection(items, values, remove, context) {
  if (!remove) return applySelection(items, values, false, context);
  const deleted = new Set();
  const selectedExcerpts = new Set(items.filter(item => item.type === 'excerpt').map(item => item.id));
  const annotations = new Map();
  if (selectedExcerpts.size) {
    const representatives = new Map();
    for (const note of loadKnowledge().notes) {
      const group = excerptKey(note);
      if (!representatives.has(group)) representatives.set(group, note.id);
      const id = representatives.get(group);
      if (!selectedExcerpts.has(id) || !note.annotation) continue;
      if (!annotations.has(id)) annotations.set(id, []);
      annotations.get(id).push('annotation:' + note.id);
    }
  }
  try {
    return await applySelection(items, {}, true, { ...context, completed(type, id) {
      deleted.add(type + ':' + id);
      if (type === 'excerpt') for (const key of annotations.get(id) ?? []) deleted.add(key);
      context.completed(type, id);
    } });
  } finally {
    if (deleted.size) {
      const links = loadSpaceData('content-relations', []);
      const kept = links.filter(link => !deleted.has(link.fromId) && !deleted.has(link.toId));
      if (kept.length !== links.length) write('content-relations', kept);
    }
  }
}
