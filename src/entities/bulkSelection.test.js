import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedFields } from './bulkFields.js';
import { toggleVisibleIds, toggleMatchingIds, selectResults, getSelection, validateSelection, clearSelection, restoreSelection } from './entitySelection.js';
import { registerResultSource, resultEntities } from '../results/activeResults.js';
import { commonNeighbors, addRelations } from './contentRelations.js';
import { writeSelection } from './bulkWrite.js';
import { loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';

const item = (type, id) => ({ type, id, key: type + ':' + id, title: id });
function freshStorage() {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  globalThis.window = new EventTarget();
}

test('select all shares the snapshot default but respects collection-specific results', () => {
  const rows = resultEntities('book', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const source = { scopeId: 'library', matches: rows, applications: { snapshot: rows.slice(0, 2) } };
  const release = registerResultSource({}, () => source);
  try {
    selectResults(false);
    assert.deepEqual(getSelection().items.map(i => i.key), ['book:a', 'book:b']);
    selectResults(false);
    assert.equal(getSelection(), null);
    source.applications.selectAll = rows.slice(1);
    selectResults(false);
    const origin = getSelection();
    assert.equal(origin.canRelate, false);
    assert.deepEqual(origin.items.map(i => i.key), ['book:b', 'book:c']);
    clearSelection();
    restoreSelection(origin);
    assert.equal(getSelection(), origin);
    source.applications.selectAll = [rows[0]];
    validateSelection();
    assert.equal(getSelection(), null);
    restoreSelection(origin);
    selectResults(false);
    assert.equal(getSelection(), null);
  } finally { clearSelection(); release(); }
});

test('diary selection spans filtered pages while its snapshot keeps the open page', () => {
  const filtered = resultEntities('diary', [{ id: 'today' }, { id: 'yesterday' }]);
  const source = { scopeId: 'diary', matches: filtered, allowGroupRelations: true,
    applications: { selectAll: filtered, snapshot: filtered.slice(0, 1) } };
  const release = registerResultSource({}, () => source);
  try {
    selectResults(false);
    const picked = getSelection();
    assert.deepEqual([...picked.keys], ['diary:today', 'diary:yesterday']);
    assert.equal(picked.canRelate, true);
    source.applications.snapshot = filtered.slice(1);
    validateSelection();
    assert.equal(getSelection(), picked);
  } finally { clearSelection(); release(); }
});

test('editable field intersection preserves derived names', () => {
  const fields = (...types) => sharedFields(types.map(type => item(type, 'a'))).map(field => field.key);
  assert.deepEqual(fields('book', 'movie'), ['title']);
  assert.deepEqual(fields('book', 'diary'), []);
  assert.deepEqual(fields('diary', 'diary'), []);
  assert.deepEqual(fields('book', 'book'), ['title', 'author']);
  assert.ok(!fields('movie').includes('poster'));
  assert.ok(!fields('excerpt', 'annotation').includes('title'));
  assert.ok(fields('memo', 'todo').includes('text'));
});

test('bulk linking completes partial links and preserves unrelated neighbors', () => {
  freshStorage();
  const sources = [item('book', 'a'), item('book', 'b')], target = item('movie', 'm');
  addRelations([target], sources[0]);
  addRelations([sources[0]], item('diary', 'x'));
  const read = () => loadSpaceData('content-relations', []);
  assert.equal(commonNeighbors(sources, read()).size, 0);
  assert.equal(addRelations(sources, target), true);
  assert.deepEqual([...commonNeighbors(sources, read()).keys()], [target.key]);
  assert.equal(addRelations(sources, target), false);
  assert.equal(read().length, 3);
});

test('batch writes only patch selected records and support mixed collection deletion', async () => {
  freshStorage();
  saveSpaceData('movies', [{ id: 'a', title: 'A', region: ['one'] }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }]);
  saveSpaceData('diary', [{ id: 'a', text: 'entry' }]);
  const options = { completed() {} };
  await writeSelection([item('movie', 'a'), item('movie', 'b')], { review: 'shared' }, false, options);
  const movies = loadSpaceData('movies', []);
  assert.deepEqual(movies[0], { id: 'a', title: 'A', region: ['one'], text: 'shared' });
  assert.equal(movies[1].text, 'shared');
  assert.deepEqual(movies[2], { id: 'c', title: 'C' });
  await writeSelection([item('diary', 'a'), item('movie', 'a')], {}, true, options);
  assert.deepEqual(loadSpaceData('diary', []), []);
  assert.deepEqual(loadSpaceData('movies', []).map(row => row.id), ['b', 'c']);
});

test('picker select all toggles filtered candidates across pages and preserves other selections', () => {
  const scope = Array.from({length:100}, (_, i) => String(i));
  const selected = toggleMatchingIds(['outside','2'],scope);
  assert.equal(selected.length,101);
  assert.deepEqual(selected.slice(0,2),['outside','2']);
  assert.deepEqual(toggleMatchingIds(selected,scope),['outside']);
  assert.deepEqual(toggleMatchingIds(selected,[]),selected);
});

test('limited shelf selection and trash keep selections outside the current filter', () => {
  const books = Array.from({length:20}, (_,i)=>String(i));
  const selected = toggleVisibleIds(['outside'], books, 10);
  assert.equal(selected.length,10);
  assert.deepEqual(toggleVisibleIds(selected, books, 10), ['outside']);
  assert.deepEqual(toggleVisibleIds(selected, ['other'], 10), selected);
  assert.deepEqual(toggleVisibleIds(['outside','a'], ['a']), ['outside']);
  assert.deepEqual(toggleVisibleIds(['outside'], []), ['outside']);
});
