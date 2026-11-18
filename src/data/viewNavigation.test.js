import test from 'node:test';
import assert from 'node:assert/strict';
import { createReturnPoint, registerView, captureViews, restoreViews, restoredView, clearRestoredViews } from './viewNavigation.js';
test('only the latest origin can be consumed, once', () => {
  const point = createReturnPoint();
  for (let i=0;i<10000;i++) point.remember({page:i});
  assert.deepEqual(point.take(),{page:9999});
  assert.equal(point.has(),false);
  assert.equal(point.take(),null);
  point.remember({page:1});point.clear();assert.equal(point.take(),null);
});
test('restores exact menu for mounted and remounted views without retaining live registrations', () => {
  let value='todo';const remove=registerView('memo.view',()=>value,v=>{value=v;});
  const snapshot=captureViews();value='board';restoreViews(snapshot);assert.equal(value,'todo');
  remove();assert.deepEqual(captureViews(),{});assert.equal(restoredView('memo.view','board'),'todo');
  clearRestoredViews();assert.equal(restoredView('memo.view',()=> 'board'),'board');
});
