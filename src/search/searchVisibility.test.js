import test from 'node:test';
import assert from 'node:assert/strict';
import { getSearch, setSearch, suspendSearch, resumeSearch, locateEntityInScope } from './searchStore.js';
import { emptySearch } from './searchCore.js';
test('closing removes applied conditions, reopening restores text and filters', () => {
 const state={query:'书',filters:{type:'book',from:'2026-11-01'}};
 setSearch('visibility-a',state);
 suspendSearch('visibility-a',state);
 assert.deepEqual(getSearch('visibility-a'),emptySearch);
 assert.deepEqual(resumeSearch('visibility-a'),{draft:state,applied:state});
 assert.deepEqual(getSearch('visibility-a'),state);
});
test('scopes keep independent drafts and support repeated collapse',()=>{
 const a={query:'甲',filters:{}}, b={query:'乙',filters:{type:'music'}};
 setSearch('scope-a',a);suspendSearch('scope-a',a);
 setSearch('scope-b',b);suspendSearch('scope-b',b);
 assert.deepEqual(resumeSearch('scope-a').draft,a);
 suspendSearch('scope-a',a);
 assert.deepEqual(resumeSearch('scope-b').draft,b);
 assert.deepEqual(getSearch('scope-a'),emptySearch);
});
test('unfinished input is remembered without applying an invalid date',()=>{
 const applied={query:'a',filters:{}},draft={query:'a',filters:{from:'2026-'}};
 setSearch('draft',applied);suspendSearch('draft',draft);
 assert.deepEqual(resumeSearch('draft'),{draft,applied});
});

test('opening a new entity supersedes the remembered location for the same collection', () => {
 const scope = 'location-test';
 locateEntityInScope(scope, 'id', 'first');
 suspendSearch(scope);
 assert.equal(getSearch(scope), emptySearch);
 locateEntityInScope(scope, 'id', 'second');
 assert.deepEqual(resumeSearch(scope).applied, { query: '', filters: { id: 'second' } });
 setSearch(scope, { query: '', filters: {} });
 assert.deepEqual(getSearch(scope), emptySearch);
});
