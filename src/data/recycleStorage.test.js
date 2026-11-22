import test from 'node:test';
import assert from 'node:assert/strict';
import { archivePlaylists, changeArchived, storeCollection } from './recycleStorage.js';

function fixture() {
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  return { storage, read: key => JSON.parse(storage.getItem('test.' + key) ?? '[]'),
    save: (key, items) => storeCollection(storage, 'test', key, items),
    change: (row, action) => changeArchived(storage, 'test', row.token, action) };
}
test('deleted entities leave active relations and can be restored or purged independently', () => {
  const { read, save, change } = fixture();
  const note = { id: '1', text: 'note', type: 'sticky' }, todo = { id: '2', type: 'todo', done: true };
  save('memo', [note, todo]);
  save('content-relations', [{ fromId: 'memo:1', toId: 'music:t' }]);
  save('memo', []);
  assert.deepEqual(read('content-relations'), []);
  const [first, second] = read('recycle');
  change(first, 'restore');
  change(second, 'purge');
  assert.deepEqual(read('memo'), [note]);
  assert.deepEqual(read('recycle'), []);
});
test('playlist restore reuses surviving songs and preserves per-track order', () => {
  const { storage, read, save, change } = fixture();
  const list = { id: 'p', title: 'Playlist', description: 'notes' };
  save('playlists', [list]);
  save('music', [{ id: 's', playlists: [{ id: 'p', position: 7 }] }]);
  archivePlaylists(storage, 'test', new Set(['p']));
  assert.deepEqual(read('music'), [{ id: 's', playlists: [] }]);
  assert.equal(read('recycle').length, 1);
  change(read('recycle')[0], 'restore');
  assert.deepEqual(read('playlists'), [list]);
  assert.deepEqual(read('music')[0].playlists, [{ id: 'p', position: 7 }]);
});
test('excerpt and annotation sharing an ID restore separately', () => {
  const { read, save, change } = fixture();
  const note = { id: 'e', bookId: 'b', quote: 'quote', annotation: 'annotation' };
  save('knowledge', { notes: [note], projects: [] });
  save('knowledge', { notes: [], projects: [] });
  const [excerpt, annotation] = read('recycle');
  assert.throws(() => change(annotation, 'restore'));
  change(excerpt, 'restore');
  assert.equal(read('knowledge').notes[0].annotation, '');
  change(annotation, 'restore');
  assert.deepEqual(read('knowledge').notes, [note]);
});
test('archive failure rolls back deletion', () => {
  const { storage, read, save } = fixture();
  save('movies', [{ id: 'film' }]);
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'test.recycle') throw Error('quota');
    return set(key,value);
  };
  assert.throws(() => save('movies', []));
  assert.deepEqual(read('movies'), [{ id: 'film' }]);
});
