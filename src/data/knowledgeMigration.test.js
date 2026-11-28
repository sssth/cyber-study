import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog} from '../entities/catalog.js';
import {editKnowledgeNote, loadKnowledge} from '../features/library/knowledgeStore.js';
import {excerptKey} from './excerptKey.js';

test('opening an old library migrates both bodies and catalog IDs; editing an annotation preserves its excerpt', t=>{
 const key='cyber-study.space.v1.knowledge';
 const note={id:'n1',bookId:'b',quote:'引文',annotation:'第一条批注',ranges:[{start:2,end:4}],summary:'摘要'};
 const other={...note,id:'n2',annotation:'另一条批注'};
 const original={notes:[note,other],projects:[{id:'p'}]};
 const disk=new Map([[key,JSON.stringify(original)]]);
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value)}});
 t.after(()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;});
 const entities=buildCatalog();
 const excerpt=entities.find(r=>r.key==='excerpt:n1');
 const annotation=entities.find(r=>r.key==='annotation:n2');
 assert.equal(excerpt.text,note.quote);
 assert.equal(annotation.text,other.annotation);
 assert.equal(excerptKey(excerpt),excerptKey(annotation));
 for(const record of [excerpt,annotation,...JSON.parse(disk.get(key)).notes]){
   assert.ok(!Object.hasOwn(record,'quote')&&!Object.hasOwn(record,'annotation'));
 }
 assert.deepEqual(JSON.parse(disk.get(key)).projects,original.projects);
 const migrated=disk.get(key);
 loadKnowledge();
 assert.equal(disk.get(key),migrated);
 editKnowledgeNote('n1','新批注');
 const [first,second]=JSON.parse(disk.get(key)).notes;
 assert.deepEqual(first.excerpt,{text:note.quote});
 assert.deepEqual(first.comment,{text:'新批注'});
 assert.equal(first.summary,note.summary);
 assert.deepEqual(first.ranges,note.ranges);
 assert.equal(second.comment.text,other.annotation);
});

test('prose migration preserves both distinct bodies, memberships, and cleared edits',async()=>{
 const {encodeCollection}=await import('./knowledgeRecords.js');
 const movies=encodeCollection('movies',[{id:'m',text:'导入备注',review:'我的影评'}]);
 assert.deepEqual(movies,[{id:'m',text:'导入备注\n\n我的影评'}]);
 assert.equal(encodeCollection('movies',movies),movies);
 movies[0].text='';
 assert.equal(encodeCollection('movies',movies)[0].text,'');
 const music=encodeCollection('music',[{id:'s',text:'',note:'曲目备注',playlists:[{id:'p',description:'简介'}]}]);
 assert.deepEqual(music,[{id:'s',text:'曲目备注',playlists:[{id:'p',text:'简介'}]}]);
});
