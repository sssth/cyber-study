import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliverCopy } from './copyDelivery.js';
import { loadSpaceData } from './spaceStorage.js';

test('retry after a failed link does not append the copy again', () => {
  const stored = new Map();
  let failLink = true;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => stored.get(key) ?? null,
      setItem(key, value) {
        if (failLink && key.endsWith('.content-relations')) throw Error('disk full');
        stored.set(key, value);
      }
    }
  });
  try {
    let copies = 0;
    const input = {
      source: { key: 'typing_work:work', type: 'typing_work' },
      destination: 'memo',
      makeItem: () => ({ id: `copy-${++copies}`, photo: 'image' })
    };
    assert.equal(deliverCopy(input), 'unlinked');
    assert.deepEqual(loadSpaceData('memo', [])[0].pendingCopyLinks, ['typing_work:work']);
    failLink = false;
    assert.equal(deliverCopy(input), 'saved');
    assert.equal(copies, 1);
    assert.deepEqual(loadSpaceData('memo', []), [{ id: 'copy-1', photo: 'image' }]);
    assert.equal(loadSpaceData('content-relations', [])[0].toId, 'memo:copy-1');
  } finally {
    delete globalThis.localStorage;
  }
});
