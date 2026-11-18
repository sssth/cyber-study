import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterGlobeMemories } from './filterMemories.js';
const photos = [{id:'a',location:'杭州'}, {id:'b',location:'上海'}, {id:'c',location:'杭州'}, {id:'gone',location:'杭州',deletedAt:true}];
const journeys = [{id:'one',title:'杭州周末',pointIds:['a','b','gone']}, {id:'two',title:'上海旅行',pointIds:['b','c']}];
test('default point search filters memories but leaves journey list unchanged', () => {
 const result=filterGlobeMemories(photos,journeys,{query:'杭州',filters:{from:'2099-01-01',status:'wish'}});
 assert.deepEqual(result.visiblePhotos.map(p=>p.id),['a','c']);
 assert.equal(result.visibleJourneys.length,2);
});
test('journey search includes member memories even when they do not match query', () => {
 const result=filterGlobeMemories(photos,journeys,{query:'杭州',filters:{searchBy:'journey'}});
 assert.deepEqual(result.visibleJourneys.map(j=>j.id),['one']);
 assert.deepEqual(result.visiblePhotos.map(p=>p.id),['a','b']);
});
test('journey matches union members without duplicates; no matches means no points', () => {
 assert.equal(filterGlobeMemories(photos,journeys,{query:'',filters:{searchBy:'journey'}}).visiblePhotos.length,3);
 assert.equal(filterGlobeMemories(photos,journeys,{query:'北京',filters:{searchBy:'journey'}}).visiblePhotos.length,0);
});

test('region navigation intersects both search modes and world restores the full result', () => {
 const geometry={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]};
 const located=[{id:'inside',location:'杭州',latitude:5,longitude:5},{id:'outside',location:'杭州',latitude:20,longitude:20}];
 const trips=[{id:'t',title:'杭州行',pointIds:['inside','outside']}];
 for(const searchBy of ['', 'journey']) {
  const search={query:'杭州',filters:{searchBy}};
  assert.deepEqual(filterGlobeMemories(located,trips,search,{kind:'region',name:'浙江'},geometry).visiblePhotos.map(p=>p.id),['inside']);
  assert.equal(filterGlobeMemories(located,trips,search).visiblePhotos.length,2);
  assert.equal(filterGlobeMemories(located,trips,search,{kind:'region',name:'浙江'},null).visiblePhotos.length,0);
 }
});
