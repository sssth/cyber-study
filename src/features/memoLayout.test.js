import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMemoChanges } from './memoLayout.js';

test('saving a stale board preserves newly created excerpt memos', () => {
  const original = { id: 'a', text: 'original', x: 16 };
  const excerpt = { id: 'b', text: 'excerpt' };
  assert.deepEqual(mergeMemoChanges([original, excerpt], [original], [{ ...original, x: 40 }]),
    [{ ...original, x: 40 }, excerpt]);
  assert.deepEqual(mergeMemoChanges([original, excerpt], [original], []), [excerpt]);
});
test('adding from a stale board preserves existing records and newer edits', () => {
  const old = { id: 'a', text: 'old' };
  const latest = { ...old, text: 'updated' };
  const added = { id: 'c', text: 'new' };
  assert.deepEqual(mergeMemoChanges([latest], [old], [old, added]), [latest, added]);
});

test('todo clicks toggle in the collection and hide completed board items', async () => {
  const { clickedTodo, memoSize } = await import('./memoLayout.js');
  const item = { id: 'todo', type: 'todo', text: '买书', done: false };
  const done = clickedTodo(item, 'board', 'today');
  assert.equal(done.done, true);
  assert.equal(clickedTodo(done, 'board').showOnBoard, false);
  assert.equal(clickedTodo(done, 'board').done, true);
  assert.equal(clickedTodo(done, 'todo').done, false);
  assert(memoSize(item).width < memoSize({ ...item, text: '很长的待办内容'.repeat(20) }).width);
  assert(memoSize({ ...item, text: '很长的待办内容'.repeat(20) }).height <= 220);
  assert.deepEqual(memoSize({ ...item, width: 150, height: 88 }), { width: 150, height: 88 });
});
