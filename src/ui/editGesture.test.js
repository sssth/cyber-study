import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleEditor } from './editGesture.js';
import { matchesPageBack } from './useEscapeBack.js';
test('surface double click toggles both ways; nested controls keep their action', () => {
  let open = false;
  const set = update => { open = update(open); };
  toggleEditor(set); assert.equal(open, true);
  toggleEditor(set); assert.equal(open, false);
  toggleEditor(set, {target: {closest: () => ({})}}, 'button');
  assert.equal(open, false);
});
test('Page back follows the current binding and respects typing and consumed events', () => {
  assert.equal(matchesPageBack({key:'Escape'}), true);
  assert.equal(matchesPageBack({key:'Escape',repeat:true}), false);
  assert.equal(matchesPageBack({key:'Escape',defaultPrevented:true}), false);
  assert.equal(matchesPageBack({key:'Escape'}, []), false);
  assert.equal(matchesPageBack({key:'Escape'}, ['F8']), false);
  assert.equal(matchesPageBack({key:'F8',target:{tagName:'TEXTAREA'}}, ['F8']), true);
  assert.equal(matchesPageBack({key:'b',target:{tagName:'TEXTAREA'}}, ['B']), false);
  assert.equal(matchesPageBack({key:'b',target:{tagName:'DIV'}}, ['B']), true);
});
