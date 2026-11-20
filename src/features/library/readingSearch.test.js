import test from 'node:test';import assert from 'node:assert/strict';import {readingMatches} from './readingSearch.js';
test('counts occurrences rather than paragraphs',()=>{assert.equal(readingMatches('字'.repeat(90),'字').length,90);assert.equal(readingMatches('文字','').length,0);});
test('matches keep offsets across Unicode, case, and full-width glyphs',()=>{const text='😀Ａbc abc';const hits=readingMatches(text,'ABC');assert.deepEqual(hits,[{start:2,end:5},{start:6,end:9}]);assert.deepEqual(hits.map(r=>text.slice(r.start,r.end)),['Ａbc','abc']);});
test('duplicate terms are counted once and quoted phrases match together',()=>{assert.equal(readingMatches('甲乙 甲乙','甲 甲').length,2);assert.deepEqual(readingMatches('alpha beta alpha','"alpha beta"'),[{start:0,end:10}]);});

test('sentence boundaries include Chinese and English endings, quotes and decimals',async()=>{
 const {sentenceRanges}=await import('./readingSearch.js');
 const text='没有。得到！“得到了？” Value 3.14 is good. Next? 尾句';
 assert.deepEqual(sentenceRanges(text).map(r=>text.slice(r.start,r.end)),['没有。','得到！','“得到了？”',' Value 3.14 is good.',' Next?',' 尾句']);
});
test('paragraph, sentence and chapter crops keep original offsets',async()=>{
 const {retainedReadingRanges}=await import('./readingSearch.js');
 const blocks=[{id:'a',text:'没有。得到。结束。'},{id:'b',text:'同章其他段。'},{id:'c',text:'另一章。'}];
 const chapters=new Map([['a','one'],['b','one'],['c','two']]);
 const hits=new Map(blocks.map(b=>[b.id,readingMatches(b.text,'得')]));
 assert.deepEqual(retainedReadingRanges(blocks,hits,chapters).get('a'),[{start:0,end:9}]);
 assert.deepEqual(retainedReadingRanges(blocks,hits,chapters,'sentence').get('a'),[{start:3,end:6}]);
 const whole=retainedReadingRanges(blocks,hits,chapters,'chapter');
 assert.equal(whole.get('b').length,1);assert.equal(whole.get('c').length,0);
 assert.equal(retainedReadingRanges(blocks,hits,chapters).get('b').length,0);
});

test('cropping preserves chapter titles and keeps separated sentences apart',async()=>{
 const {retainedReadingRanges,contiguousReadingRanges}=await import('./readingSearch.js');
 const blocks=[{id:'title',text:'第一章'},{id:'a',text:'得到。得到了。无关。得知。'},{id:'b',text:'得意。'},{id:'other',text:'第二章'}];
 const chapters=new Map([['title','title'],['a','title'],['b','title'],['other','other']]);
 const hits=new Map(blocks.map(b=>[b.id,readingMatches(b.text,'得')]));
 const kept=retainedReadingRanges(blocks,hits,chapters,'sentence');
 assert.deepEqual(kept.get('title'),[{start:0,end:3}]);
 assert.deepEqual(kept.get('other'),[]);
 assert.deepEqual(contiguousReadingRanges(kept.get('a')).map(r=>blocks[1].text.slice(r.start,r.end)),['得到。得到了。','得知。']);
 assert.deepEqual(contiguousReadingRanges(kept.get('b')).map(r=>blocks[2].text.slice(r.start,r.end)),['得意。']);
});

test('nearest match follows original text position, including earlier matches',async()=>{
 const {nearestReadingMatch}=await import('./readingSearch.js');
 const blocks=Array.from({length:10},(_,i)=>({id:String(i),text:'文字'.repeat(10)}));
 const hits=new Map([['2',[{start:4,end:5}]],['8',[{start:4,end:5}]]]);
 assert.deepEqual(nearestReadingMatch(blocks,hits,{blockId:'3',offset:0}),{blockId:'2',offset:4});
 assert.deepEqual(nearestReadingMatch(blocks,hits,{blockId:'7',offset:0}),{blockId:'8',offset:4});
 assert.equal(nearestReadingMatch(blocks,new Map(),{blockId:'3',offset:0}),null);
});
