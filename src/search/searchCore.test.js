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

test('each registered entity type matches a manually assigned tag', async () => {
 const {entityTypes} = await import('../entities/registry.js');
 for (const type of Object.keys(entityTypes)) {
   assert.ok(matchesItem(type, {id:'tag-test',tags:['我的分类']}, {query:'我的分类'}), type);
 }
});

test('RELATED expands filtered matches across types in either direction, once', async () => {
 const {queryRelatedEntities} = await import('./searchCore.js');
 const items = [
   ['book','杭州'], ['movie','杭州'], ['memo','桥'], ['music','雨'], ['journey','关联 RELATED']
 ].map(([type,title])=>({type,title,key:type+':1',id:'1'}));
 const edges = [[0,2],[3,0],[2,3],[2,1],[2,4],[2,0]].map(([a,b])=>({from:items[a].key,to:items[b].key}));
 const find = (query,filters={}) => queryRelatedEntities(items,{query,filters},edges).map(item=>item.type);
 assert.deepEqual(find('title:杭州 RELATED',{type:'book'}),['book','memo','music']);
 assert.deepEqual(find('杭州 RELATED'),['book','movie','memo','music']);
 assert.deepEqual(find('杭州'),['book','movie']);
 assert.deepEqual(find('北京 RELATED'),[]);
 assert.deepEqual(find('"关联"'),['journey']);
 assert.deepEqual(find('title:关联'),['journey']);
 assert.deepEqual(find('关联'),['journey']);
 assert.deepEqual(find('"RELATED"'),['journey']);
 assert.deepEqual(find('title:RELATED'),['journey']);
 assert.deepEqual(find('RELATED'),[]);
 assert.deepEqual(find('桥 OR 雨 RELATED'),['book','memo','music']);
 assert.deepEqual(find('(桥 OR 雨) RELATED'),['book','movie','memo','music','journey']);
 assert.deepEqual(find('桥 AND 杭州 RELATED'),['memo']);
 assert.deepEqual(find('NOT 杭州 RELATED'),['journey']);
 assert.deepEqual(find('NOT 桥 AND 雨 OR 杭州'),['book','movie','music']);
 assert.deepEqual(find('桥 RELATED AND 雨 RELATED'),['book','memo','music']);
 assert.deepEqual(find('(杭州 RELATED) RELATED'),[]);
});
