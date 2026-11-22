// Store a separate entry for each entity, including annotations that share an excerpt's note ID.
import { excerptKey } from './excerptKey.js';

const types = { movies: 'movie', diary: 'diary', typewriter: 'typing_work', memo: 'memo', music: 'music', playlists: 'playlist' };
function entries(key, data) {
  if (key === 'knowledge') {
    const groups = new Set();
    const result = [];
    for (const record of data?.notes ?? []) {
      const group = excerptKey(record);
      if (!groups.has(group)) {
        result.push({ type: 'excerpt', record: { ...record, annotation: '' } });
        groups.add(group);
      }
      if (record.annotation) result.push({ type: 'annotation', record });
    }
    return result;
  }
  return (data ?? []).map(record => ({ type: key === 'memo' && record.type === 'todo' ? 'todo' : types[key], record }));
}

function commit(storage, writes) {
  const undo = [];
  try {
    for (const [key, value] of writes) {
      const previous = storage.getItem(key);
      storage.setItem(key, value);
      undo.unshift([key, previous]);
    }
  } catch (error) {
    for (const [key, value] of undo) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    throw error;
  }
}

export function archivePlaylists(storage, prefix, ids) {
  const read = key => JSON.parse(storage.getItem(prefix + '.' + key) || '[]');
  const tracks = read('music');
  const playlists = read('playlists');
  const records = new Map(tracks.flatMap(track => (track.playlists ?? []).map(list => [list.id, list])));
  for (const list of playlists) records.set(list.id, list);
  const trash = read('recycle');
  const deleted = new Set();
  for (const id of ids) {
    if (!records.has(id)) throw Error('歌单已变化，请刷新。');
    const members = tracks.flatMap(track => {
      const membership = track.playlists?.find(list => list.id === id);
      return membership ? [{ id: track.id, membership }] : [];
    });
    trash.push({ type: 'playlist', collection: 'playlists', token: crypto.randomUUID(), time: Date.now(), record: records.get(id), members });
    deleted.add('playlist:' + id);
  }
  const updated = tracks.map(track => track.playlists ? { ...track, playlists: track.playlists.filter(list => !ids.has(list.id)) } : track);
  const links = read('content-relations').filter(link => !deleted.has(link.fromId) && !deleted.has(link.toId));
  commit(storage, [['music', updated], ['playlists', playlists.filter(list => !ids.has(list.id))], ['content-relations', links], ['recycle', trash]]
    .map(([key, value]) => [prefix + '.' + key, JSON.stringify(value)]));
}

export function storeCollection(storage, prefix, key, value) {
  const name = prefix + '.' + key;
  const next = JSON.stringify(value);
  const previous = storage.getItem(name);
  if (previous === next) return;
  if ((!types[key] && key !== 'knowledge') || !previous) { storage.setItem(name, next); return; }
  const before = entries(key, JSON.parse(previous));
  const after = entries(key, value);
  const identify = item => item.type + ':' + item.record.id;
  const survivors = new Set(after.map(identify));
  const removed = before.filter(item => !survivors.has(identify(item)));
  if (key === 'music' || key === 'playlists') {
    const other = JSON.parse(storage.getItem(prefix + (key === 'music' ? '.playlists' : '.music')) || '[]');
    const embedded = tracks => tracks.flatMap(track => track.playlists ?? []);
    const extra = key === 'music' ? other : embedded(other);
    const lists = rows => key === 'music' ? embedded(rows.map(item => item.record)) : rows.map(item => item.record);
    const live = new Set([...extra, ...lists(after)].map(list => list.id));
    const missing = new Map(lists(before).filter(list => !live.has(list.id)).map(list => [list.id, list]));
    if (key === 'playlists') removed.length = 0;
    for (const record of missing.values()) removed.push({ type: 'playlist', record });
  }
  if (!removed.length) { storage.setItem(name, next); return; }
  const trashKey = prefix + '.recycle';
  const linksKey = prefix + '.content-relations';
  const trash = storage.getItem(trashKey);
  const links = storage.getItem(linksKey);
  const keys = new Set(removed.map(identify));
  const kept = JSON.parse(links || '[]').filter(link => !keys.has(link.fromId) && !keys.has(link.toId));
  const archive = JSON.parse(trash || '[]');
  for (const item of removed) archive.push({ ...item, token: crypto.randomUUID(), collection: item.type === 'playlist' ? 'playlists' : key, time: Date.now() });
  const writes = [[name, next], [trashKey, JSON.stringify(archive)]];
  if (links) writes.push([linksKey, JSON.stringify(kept)]);
  commit(storage, writes);
}

export function changeArchived(storage, prefix, token, action) {
  const trashKey = prefix + '.recycle';
  const previous = storage.getItem(trashKey);
  const archive = JSON.parse(previous || '[]');
  const entry = archive.find(item => item.token === token);
  if (!entry) throw Error('回收站记录已变化，请刷新。');
  const { collection, record, type } = entry;
  const nextArchive = JSON.stringify(archive.filter(item => item !== entry));
  if (action === 'purge') { storage.setItem(trashKey, nextArchive); return; }
  if (action !== 'restore') throw Error('回收站操作无效。');
  const key = prefix + '.' + collection;
  const data = JSON.parse(storage.getItem(key) || (collection === 'knowledge' ? '{"notes":[],"projects":[]}' : '[]'));
  if (collection === 'knowledge') {
    const existing = data.notes.find(note => note.id === record.id);
    if (existing && type === 'annotation' && !existing.annotation) existing.annotation = record.annotation;
    else if (!existing) {
      const first = data.notes.findIndex(note => excerptKey(note) === excerptKey(record));
      if (type === 'annotation' && first < 0) throw Error('请先恢复这条批注所属的摘录。');
      data.notes.splice(first < 0 ? 0 : first + Number(type === 'annotation'), 0, record);
    } else throw Error('同一记录已经存在。');
  } else {
    if (data.some(item => item.id === record.id)) throw Error('同一记录已经存在。');
    if (type === 'music') {
      const lists = JSON.parse(storage.getItem(prefix + '.playlists') || '[]');
      const active = new Set([...lists, ...data.flatMap(track => track.playlists ?? [])].map(list => list.id));
      record.playlists = (record.playlists ?? []).filter(list => active.has(list.id));
    }
    data.unshift(record);
  }
  const writes = [[trashKey, nextArchive], [key, JSON.stringify(data)]];
  if (type === 'playlist' && entry.members?.length) {
    const members = new Map(entry.members.map(member => [member.id, member.membership]));
    const musicKey = prefix + '.music';
    const tracks = JSON.parse(storage.getItem(musicKey) || '[]');
    for (const track of tracks) {
      if (members.has(track.id) && !track.playlists?.some(list => list.id === record.id)) {
        track.playlists = [...(track.playlists ?? []), members.get(track.id)];
      }
    }
    writes.push([musicKey, JSON.stringify(tracks)]);
  }
  commit(storage, writes);
}
