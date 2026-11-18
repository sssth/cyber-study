import test from 'node:test';
import assert from 'node:assert/strict';
import { moveBefore, loadOrder, saveOrder } from './contentOrder.js';
test('reordering preserves every item and supports both directions', () => {
  assert.deepEqual(moveBefore(['a','b','c'], 'c','a'), ['c','a','b']);
  assert.deepEqual(moveBefore(['a','b','c'], 'a','c'), ['b','a','c']);
  assert.deepEqual(moveBefore(['a','b'], 'a','a'), ['a','b']);
  assert.deepEqual(moveBefore(['a','b'], 'x','b'), ['a','b']);
});
test('saved order survives reads and keeps content types separate', () => {
  let value = null;
  globalThis.localStorage = {getItem: () => value, setItem: (_, next) => { value = next; }};
  globalThis.window = { dispatchEvent() {} };
  saveOrder('book', ['book:b','book:a']);
  saveOrder('music', ['music:c']);
  assert.deepEqual(loadOrder('book'), ['book:b','book:a']);
  assert.deepEqual(loadOrder('music'), ['music:c']);
  value = '{broken';
  assert.deepEqual(loadOrder('book'), []);
});

test('successive drops put the dragged book immediately before its target', () => {
  const first = moveBefore(['book:a','book:b','book:c','book:d'], 'book:d', 'book:b');
  assert.deepEqual(first, ['book:a','book:d','book:b','book:c']);
  const second = moveBefore(first, 'book:a', 'book:c');
  assert.deepEqual(second, ['book:d','book:b','book:a','book:c']);
  // A filtered-out item keeps its place in the persisted collection.
  const filteredDrop = moveBefore(second, 'book:c', 'book:d');
  assert.deepEqual(filteredDrop, ['book:c','book:d','book:b','book:a']);
});

import { orderCatalog, orderType, reorderVisible } from './contentOrder.js';
test('shared order permutes only visible same-type slots and survives adding a newer item', () => {
  const rows = ['book','movie','book','music','book','book'].map((type,i) => ({
    type, id:String(i), createdAt:new Date(1700000000000-i*1000).toISOString()
  }));
  const ids = items => items.map(item=>item.id);
  const updated = reorderVisible({},'book',[rows[0],rows[4],rows[5]],'book:5','book:0');
  assert.deepEqual(ids(orderCatalog(rows,updated)), ['5','1','2','3','0','4']);
  assert.deepEqual(ids(orderType(rows.filter(item=>item.type==='book'),'book',updated)), ['5','2','0','4']);
  const latest = {type:'book',id:'new',createdAt:'2026-01-01'};
  assert.deepEqual(ids(orderCatalog([...rows,latest],updated)), ['new','5','1','2','3','0','4']);
  assert.deepEqual(ids(orderCatalog(rows,{book:['book:4','book:2','book:0']})), ['4','1','2','3','0','5']);
});
