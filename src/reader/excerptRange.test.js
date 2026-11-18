import test from 'node:test';
import assert from 'node:assert/strict';
import {excerptRange} from './excerptRange.js';
import {saveKnowledge,loadKnowledge,updateExcerptRange,deleteExcerpt} from '../data/knowledgeStore.js';
const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
const blocks=[{id:'a',text:'前文 原摘录 后文'},{id:'b',text:'下一段文字'}];
test('selection extends and contracts across paragraphs, trimming boundary spaces',()=>{
 assert.deepEqual(excerptRange(blocks,'a',3,'b',3),{quote:'原摘录 后文\n下一段',blockId:'a',ranges:[{blockId:'a',start:3,end:9,text:'原摘录 后文'},{blockId:'b',start:0,end:3,text:'下一段'}]});
 assert.equal(excerptRange(blocks,'a',3,'a',6).quote,'原摘录');
 assert.throws(()=>excerptRange(blocks,'a',2,'a',3));
 assert.throws(()=>excerptRange(blocks,'missing',0,'b',2));
});
test('changing a range preserves all annotations and ids; deletion removes only that excerpt',()=>{
 const note={id:'1',bookId:'book',blockId:'a',quote:'原摘录',ranges:[{blockId:'a',start:3,end:6}],annotation:'想法一',createdAt:'2026-11-17'};
 saveKnowledge({projects:[],notes:[note,{...note,id:'2',annotation:'想法二'},{...note,id:'3',quote:'别的摘录'}]});
 const updated=updateExcerptRange(note,excerptRange(blocks,'a',0,'a',9));
 const notes=loadKnowledge().notes;
 assert.deepEqual(notes.slice(0,2).map(n=>[n.id,n.annotation,n.createdAt]),[['1','想法一','2026-11-17'],['2','想法二','2026-11-17']]);
 assert.equal(notes[1].quote,'前文 原摘录 后文');assert.equal(notes[2].quote,'别的摘录');
 deleteExcerpt(updated);assert.deepEqual(loadKnowledge().notes.map(n=>n.id),['3']);
});

test('range updates preserve formatting and overlapping excerpt underlines',async()=>{
 const {replaceExcerptUnderlines}=await import('./excerptRange.js');const {parseMarkdownContent,underlineMarkdown}=await import('./markdownReader.js');
 const content='# 书\n\n<u>abcdef</u> **标题** <u>xy</u>\n';
 const updated=replaceExcerptUnderlines(content,parseMarkdownContent(content),[{blockId:'block-0',start:0,end:6}],[{blockId:'block-0',start:4,end:6}],[{blockId:'block-0',start:1,end:3}],parseMarkdownContent,underlineMarkdown);
 const parts=parseMarkdownContent(updated)[0].parts;let cursor=0;const marked=[];for(const p of parts){if(p.underline)for(let i=0;i<p.text.length;i++)marked.push(cursor+i);cursor+=p.text.length;}
 assert.deepEqual(marked,[1,2,4,5,10,11]);assert.ok(updated.includes('**标题**'));
});
