import test from 'node:test';import assert from 'node:assert/strict';import {prioritizeShelfBooks} from './shelfPointerPriority.js';
const hit=(key,value)=>({object:{parent:{userData:{[key]:value}}}});
test('book wins against its own shelf, empty shelf remains clickable',()=>{const shelf=hit('sceneFurnitureId','shelf'),book=hit('sceneBookShelf','shelf');assert.deepEqual(prioritizeShelfBooks([shelf,book]),[book,shelf]);assert.deepEqual(prioritizeShelfBooks([shelf]),[shelf]);});
test('other furniture and bookcases keep their depth priority',()=>{const other=hit('sceneFurnitureId','F26'),shelf=hit('sceneFurnitureId','shelf'),book=hit('sceneBookShelf','shelf');assert.deepEqual(prioritizeShelfBooks([other,shelf,book]),[other,book,shelf]);});
