import test from 'node:test';
import assert from 'node:assert/strict';
import { captureEntities } from './captureSnapshot.js';
import { collectMemoryIds } from './resolveMemoryPoints.js';
import { resultEntities, currentResultInput, registerResultSource } from '../results/activeResults.js';
test('snapshot freezes complete filtered records in order, retaining distinct types',()=>{
 const note={id:'1',quote:'摘录',tags:['阅读']};const excerpts=resultEntities('excerpt',[note]);
 const result=captureEntities({entities:[...excerpts,...excerpts,...resultEntities('annotation',[note])]});
 note.tags.push('changed');assert.deepEqual(result.entities.map(item=>item.key),['excerpt:1','annotation:1']);
 assert.deepEqual(result.entities[0].record,{id:'1',text:'摘录',comment:{text:''},tags:['阅读']});
 for(const source of [undefined,{blocked:true},{plain:true},{loading:true},{entities:[]}]) assert.ok(captureEntities(source).message);
});
const photos=['a','b','c','d'].map(id=>({id,latitude:0,longitude:0,locationStatus:'confirmed'}));
const link=(a,b)=>({fromId:a,toId:b,relationType:'related'});
test('direct points, journey members and bidirectional one-hop relations deduplicate',()=>{
 assert.deepEqual(collectMemoryIds([{type:'memory_point',id:'a'},{type:'journey',id:'j'},{type:'book',id:'b'}],[link('memory_point:c','book:b'),link('book:b','memory_point:a')],photos,[{id:'j',pointIds:['a','b']}]),['a','b','c']);
});
test('does not traverse other entities, linked journeys, or invalid/deleted coordinates',()=>{
 const rows=[...photos,{id:'bad',latitude:null,longitude:0,locationStatus:'confirmed'},{id:'deleted',latitude:0,longitude:0,locationStatus:'confirmed',deletedAt:'now'}];
 assert.deepEqual(collectMemoryIds([{type:'book',id:'b'}],[link('book:b','journey:j'),link('book:b','music:s'),link('music:s','memory_point:a'),link('book:b','memory_point:bad'),link('book:b','memory_point:deleted')],rows,[{id:'j',pointIds:['b']}]),[]);
 assert.deepEqual(collectMemoryIds([],[],photos,[]),[]);
});
test('top surface wins, including a 3D no-op; unmount releases its scope',()=>{
 const remove=registerResultSource('list',()=>({priority:10,matches:[{id:1}]}));
 const removeDetail=registerResultSource('detail',()=>({priority:100,blocked:true}));
 assert.equal(currentResultInput('map').blocked,true);removeDetail();assert.equal(currentResultInput('map').entities.length,1);remove();assert.equal(currentResultInput('map'),null);
});
