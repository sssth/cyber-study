import test from 'node:test';
import assert from 'node:assert/strict';
import { entityTags, saveEntityTags } from './tags.js';
import { queryEntities } from '../search/searchCore.js';
import { entityTypes } from './registry.js';

test('search covers existing tags, saved edits and clearing tags for each entity type', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
  const items = Object.keys(entityTypes).map(type => ({ type, id: 'shared-id', title: '标题', tags: ['旧标签'] }));
  const find = query => queryEntities(items,{query, filters:{}});
  assert.equal(find('旧标签').length,items.length);
  for (const item of items.filter(item => item.type !== 'movie')) {
    const tag = '专属-' + item.type;
    saveEntityTags(item.type,item.id,'风景， ' + tag + ',风景');
    assert.deepEqual(entityTags(item.type,item),['风景',tag]);
    assert.ok(find(tag).includes(item));
    saveEntityTags(item.type,item.id,'');
    assert.deepEqual(entityTags(item.type,item),[]);
    assert.ok(!find(tag).includes(item));
  }
  assert.deepEqual(find('旧标签').map(item=>item.type),['movie']);
});
