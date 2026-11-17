import test from 'node:test';import assert from 'node:assert/strict';
import {matchesItem,textMatches,emptySearch} from './searchCore.js';
import {registerScope,currentScope,setSearch,getSearch} from './searchStore.js';
test('Chinese short queries, complete body and multi-field AND',()=>{
 assert(matchesItem('diary',{text:'开头'.repeat(100)+'杭州的雨天'},{query:'杭州 雨天'}));
 assert(matchesItem('music',{title:'ＡＢＣ',artist:'歌手'},{query:'abc 歌'}));
 assert(!textMatches(['杭州晴天','雨中散步'],'"杭州 雨天"'));
 assert(!matchesItem('diary',{text:'杭州',deletedAt:'today'},{query:'杭州'}));
});
test('dates and status filter without searching technical ids',()=>{
 assert(matchesItem('todo',{id:'杭州',text:'读书',done:false},{query:'',filters:{status:'open'}}));
 assert(!matchesItem('todo',{id:'杭州',text:'读书'},{query:'杭州'}));
 assert(!matchesItem('diary',{text:'a',date:'2026-11-12'},{query:'',filters:{from:'2026-11-13'}}));
 assert(!matchesItem('memo',{text:'a'}, {query:'',filters:{from:'2026-11-13'}}));
});
test('nearest scope wins; query states independent and survive unregister',()=>{
 const a=registerScope('test-global',()=>({id:'test-global',priority:0}));
 const b=registerScope('test-book',()=>({id:'test-book',priority:30}));
 const c=registerScope('test-rel',()=>({id:'test-rel',priority:100}));
 assert.equal(currentScope().id,'test-rel');c();assert.equal(currentScope().id,'test-book');
 setSearch('test-book',{query:'山',filters:{}});assert.equal(getSearch('test-global'),emptySearch);
 b();assert.equal(currentScope().id,'test-global');assert.equal(getSearch('test-book').query,'山');a();
});

test('result counts are invalidated when query or filters change',async()=>{
 const {publishSearchCount,getSearchCount}=await import('./searchStore.js');
 const first={query:'杭州',filters:{}};setSearch('count-test',first);publishSearchCount('count-test',first,105);assert.equal(getSearchCount('count-test'),105);
 const next={query:'杭州',filters:{type:'book'}};setSearch('count-test',next);assert.equal(getSearchCount('count-test'),null);
 publishSearchCount('count-test',first,106);assert.equal(getSearchCount('count-test'),null);
 publishSearchCount('count-test',next,0);assert.equal(getSearchCount('count-test'),0);
});
