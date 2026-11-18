import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSingleClick } from './singleClick.js';
const wait = () => new Promise(resolve => setTimeout(resolve, 25));
test('single click navigates once; double click cancels navigation', async () => {
  const gate = createSingleClick(10); let count = 0;
  gate.run(1, () => count++); await wait(); assert.equal(count, 1);
  gate.run(1, () => count++); gate.run(2, () => count++);
  await wait(); assert.equal(count, 1);
  gate.run(1, () => count++); gate.cancel(); await wait(); assert.equal(count, 1);
});
