import assert from 'node:assert/strict';
import test from 'node:test';
import {matchesItem,matchesCatalogItem} from './searchCore.js';
import {entityRecord} from '../entities/records.js';
import {parseQuery} from './logicQuery.js';
import {scopeFields} from './queryFields.js';

test('field NONE checks actual applicable data and preserves literal NONE',()=>{
 const rows=[{type:'book',title:'书'},{type:'memory_point',location:'  ',city:'杭州'},{type:'memory_point',location:'NONE'}];
 const find=query=>rows.filter(item=>matchesCatalogItem(item,{query,filters:{}}));
 assert.deepEqual(find('地点：NONE AND NOT 城市:NONE'),[rows[1]]);
 assert.deepEqual(find('location:"NONE"'),[rows[2]]);
 assert.deepEqual(find('NOT 地点:NONE'),[rows[2]]);
 assert.ok(matchesCatalogItem(entityRecord('memory_point',{id:'p',location:'苏州'},'苏州'),{query:'名称:NONE',filters:{}}));
});
test('OR, implicit AND, parentheses and NOT have deterministic precedence',()=>{
 const book={title:'活着',author:'余华',tags:['重读']};
 for(const query of ['作者:余华 OR 作者:甲 AND 标签:空','(作者:甲 OR 作者:余华) 标签:重读','NOT (作者:甲 OR 标签:空)','book.title:活着'])
   assert.ok(matchesItem('book',book,{query}));
 assert.equal(matchesItem('book',book,{query:'(作者:余华 OR 作者:甲) 标签:空'}),false);
 for(const q of ['作者:', '作者:"余', '作者:余 OR','(作者:余']) assert.ok(parseQuery(q).error);
 assert.equal(parseQuery('https://example.org').structured,false);
});
test('menus respect collection scope, active mode and catalog full text',()=>{
 const names=(id,filters)=>scopeFields({id},filters).map(f=>f.name);
 assert.ok(names('library').includes('正文'));
 assert.ok(scopeFields({id:'entity-catalog'}).some(f=>f.type==='book'&&f.key==='content'));
 assert.ok(scopeFields({id:'global'},{fulltext:'yes'}).some(f=>f.type==='book'&&f.key==='content'));
 assert.deepEqual(names('music',{musicTarget:'artist'}),['歌手']);
 assert.ok(names('movie').includes('观看状态'));
});

test('stored property names group titles across entities and keep distinct text properties separate',async()=>{
 const {fieldMenuRows}=await import('./queryFields.js');
 const rows=fieldMenuRows(scopeFields({id:'entity-catalog'}),true);
 assert.equal(rows.filter(row=>row.key==='title').length,1);
 assert.ok(rows.find(row=>row.key==='title').shared);
 assert.equal(rows.find(row=>row.key==='artist').shared,false);
 for(const type of ['book','playlist','music']){
   assert.ok(matchesItem(type,{title:'海'},{query:'Title:海'}));
 }
 assert.equal(matchesItem('playlist',{title:'海'},{query:'book.title:海'}),false);
 const state=query=>({query,filters:{fulltext:'yes'}});
 assert.ok(matchesCatalogItem({type:'book',content:'海'},state('content:海')));
 assert.equal(matchesCatalogItem({type:'book',content:'海'},state('text:海')),false);
 assert.ok(matchesItem('diary',{text:'海'},state('text:海')));
});

test('field ownership uses the properties written by journey and annotation editors',async()=>{
 const {fieldMenuRows}=await import('./queryFields.js');
 const fields=scopeFields({id:'entity-catalog'});
 assert.deepEqual(fields.filter(f=>f.key==='description').map(f=>f.type),[]);
 assert.ok(fields.some(f=>f.type==='annotation'&&f.key==='text'&&f.sourceKey==='text'));
 const rows=fieldMenuRows(fields,true);
 assert.equal(rows.find(row=>row.key==='tags').hint,'全部实体');
 assert.deepEqual(new Set(rows.filter(row=>row.key==='bookTitle').map(row=>row.group)),new Set(['摘录专属','批注专属','抄写作品专属']));
 assert.equal(rows.find(row=>row.key==='location').group,'记忆点专属');
 assert.equal(matchesItem('journey',{description:'旧记事'},{query:'旧记事'}),false);
});

test('menu order and actual keyword search agree with the collection scopes', async()=>{
 const {fieldMenuRows}=await import('./queryFields.js');
 const keys=id=>fieldMenuRows(scopeFields({id}),true).map(row=>row.key);
 const geo=['country','region','city','location'];
 assert.deepEqual(keys('globe').slice(0,3),['tags','title','text']);
 const catalog=keys('entity-catalog');
 assert.deepEqual(catalog.slice(0,3),['tags','title','text']);
 assert.ok(!catalog.includes('type'));
 assert.deepEqual(catalog.slice(catalog.indexOf('country'),catalog.indexOf('country')+4),geo);
 for(const [type,fields] of Object.entries({music:['album','genre'],playlist:['description'],journey:['note','description'],memory_point:['caption','filename']})){
   for(const key of fields)assert.equal(matchesCatalogItem({type,title:'名称',[key]:'测试词'},{query:'测试词',filters:{}}),false);
 }
 assert.ok(matchesItem('movie',{genres:['科幻']},{query:'科幻'}));
});

test('excerpt and annotation share text while the group searches both original properties', async()=>{
 const {matchFields}=await import('./searchCore.js');
 const {fieldMenuRows}=await import('./queryFields.js');
 const keys=fieldMenuRows(scopeFields({id:'knowledge'}),true).map(f=>f.key);
 assert.equal(keys.filter(k=>k==='text').length,1);
 assert.ok(!keys.includes('quote')&&!keys.includes('annotation'));
 const row={quote:'原句',annotation:'评论'};
 for(const [type,word,other] of [['excerpt','原句','评论'],['annotation','评论','原句']]){
   assert.ok(matchesItem(type,row,{query:'text:'+word}));
   assert.ok(!matchesItem(type,row,{query:'text:'+other}));
 }
 assert.ok(matchFields([],{'摘录原文':row.quote,'批注':[row.annotation]},'text:原句 AND text:评论'));
 assert.ok(matchesItem('annotation',{text:'旧批注'},{query:'text:旧批注'}));
});

test('movie collection actually searches genre and origin, separately from geographic region',async()=>{
 const {matchesMovie}=await import('../features/movies/movieSearch.js');
 const film={genres:['科幻'],region:['日本']}, point={region:'日本'};
 for(const query of ['科幻','日本','genres:科幻 AND movie.region:日本'])
   assert.ok(matchesMovie(film,{query,filters:{}}));
 assert.ok(!matchesItem('memory_point',point,{query:'movie.region:日本'}));
 assert.ok(!matchesMovie(film,{query:'region:日本',filters:{}}));
 assert.ok(matchesItem('memory_point',point,{query:'region:日本'}));
});

test('typed bounds, date spellings, choices and missing fields in entity queries',()=>{
 const film={type:'movie',score:'0',personalScore:'8.2',status:'想看',watchedOn:'2021-01-01',poster:'poster.jpg'};
 const match=q=>matchesCatalogItem(film,{query:q,filters:{}});
 for(const q of ['TYPE movie AND score:0','TYPE book OR TYPE movie','score:FROM 0 TO 6','score: TO 0','personalScore:from 8','watchedOn:2021年1月1号','watchedOn:FROM 2021-1-1 TO 2021年01月01日','photo:YES AND type:movie','movie.status:想看'])assert.ok(match(q),q);
 for(const q of ['score:NONE','score:FROM 1','photo:NO','done:NO','NOT done:NO','personalScore:8','watchedOn:2021-2-29','movie.status:想'])assert.equal(match(q),false,q);
 for(const q of ['score:FROM','score:FROM 8 TO 1','score:TO hello'])assert.ok(parseQuery(q).error,q);
 assert.ok(matchesItem('todo',{}, {query:'done:NO AND showOnBoard:YES'}));
 assert.ok(matchesItem('book',{readingRecord:{progress:0.6}}, {query:'readingStatus:在读'}));
 assert.ok(matchesItem('memory_point',{hash:'real'}, {query:'photo:YES AND location:NONE'}));
 assert.ok(matchesItem('diary',{photos:['saved']}, {query:'photo:YES'}));
 assert.ok(matchesCatalogItem({type:'book',content:'独特原文'},{query:'content:独特原文'}));
 assert.equal(match('想看'),false);
});

test('settings groups fields by actual ownership across entity types',async()=>{
 const {settingsFieldRows,entityFields}=await import('./queryFields.js');
 for(const type of ['book','diary','movie']){
   const rows=settingsFieldRows(entityFields(type,true),true);
   assert.deepEqual([...new Set(rows.map(row=>row.group))],['公共字段','专属字段']);
   const boundary=rows.findIndex(row=>row.group==='专属字段');
   assert.ok(rows.slice(boundary).every(row=>row.group==='专属字段'));
   for(const key of ['tags','createdAt','photo',type==='diary'?'text':'title']){
     assert.equal(rows.find(row=>row.key===key)?.group,'公共字段');
   }
   const key={book:'author',diary:'mood',movie:'movie.region'}[type];
   assert.equal(rows.find(row=>row.key===key)?.group,'专属字段');
 }
});

test('feature-local shared keys stay specific in the settings menu',async()=>{
 const {settingsFieldRows,entityFields}=await import('./queryFields.js');
 for(const [type,key] of [['excerpt','bookTitle'],['music','provider'],['playlist','showSource'],['todo','tone'],['memo','showOnBoard'],['journey','startDate'],['memory_point','date'],['typing_work','completedAt']]){
   assert.equal(settingsFieldRows(entityFields(type),true).find(row=>row.key===key)?.group,'专属字段');
 }
 for(const type of ['excerpt','typing_work']){
   assert.equal(settingsFieldRows(entityFields(type),true).find(row=>row.key==='updatedAt')?.group,'公共字段');
 }
});

test('descriptive bodies share text; source books are searchable by name',async()=>{
 const {entityFields}=await import('./queryFields.js');
 for(const [type,old] of Object.entries({movie:'review',journey:'note',memory_point:'caption',playlist:'description',music:'note'})){
   const fields=entityFields(type);
   assert.ok(fields.some(f=>f.key==='text'&&!f.defaultOn));
   assert.ok(!fields.some(f=>f.key===old));
   assert.ok(matchesItem(type,{text:'原文'}, {query:'text:原文'}));
 }
 for(const type of ['excerpt','annotation','typing_work']){
   assert.ok(!entityFields(type).some(f=>f.key==='bookId'));
   assert.ok(matchesItem(type,{bookId:'b',bookTitle:'书名'},{query:'bookTitle:书名'}));
 }
});

test('private provider choices belong to the selected entity',async()=>{
 const {fieldMenuRows}=await import('./queryFields.js');
 const rows=fieldMenuRows(scopeFields({id:'entity-catalog'}),true);
 assert.deepEqual(rows.filter(r=>r.key==='provider').map(r=>r.token).sort(),['music.provider:','playlist.provider:']);
 assert.equal(rows.filter(r=>r.key==='text').length,1);
 assert.match(rows.find(r=>r.key==='text').hint,/电影/);
 assert.ok(matchesItem('playlist',{provider:'qq'},{query:'playlist.provider:qq'}));
 assert.ok(!matchesItem('music',{provider:'qq'},{query:'playlist.provider:qq'}));
 assert.ok(matchesItem('music',{provider:'qq'},{query:'provider:qq'}));
 assert.ok(matchesItem('diary',{date:'2021-01-01'},{query:'diary.date:FROM 2021年1月1号'}));
});
