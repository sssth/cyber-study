import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleEditor } from './editGesture.js';
import { isEscapeBack } from './useEscapeBack.js';
test('surface double click toggles both ways; nested controls keep their action', () => {
  let open = false;
  const set = update => { open = update(open); };
  toggleEditor(set); assert.equal(open, true);
  toggleEditor(set); assert.equal(open, false);
  toggleEditor(set, {target: {closest: () => ({})}}, 'button');
  assert.equal(open, false);
});
test('Escape navigation ignores held keys and events consumed by an inner layer', () => {
  assert.equal(isEscapeBack({key:'Escape'}), true);
  assert.equal(isEscapeBack({key:'Escape',repeat:true}), false);
  assert.equal(isEscapeBack({key:'Escape',defaultPrevented:true}), false);
  assert.equal(isEscapeBack({key:'Enter'}), false);
});
