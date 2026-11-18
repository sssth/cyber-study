import {termsOf,normalize} from '../search/searchCore.js';
// Keep offsets in the original text even when normalization changes glyph width.
export function readingMatches(text, query) {
 const terms=[...new Set(termsOf(query))];if(!terms.length)return [];
 let normalized='',offset=0;const starts=[],ends=[];
 for(const char of text){const value=normalize(char);for(let i=0;i<value.length;i++){starts.push(offset);ends.push(offset+char.length);}normalized+=value;offset+=char.length;}
 const found=new Map();
 for(const term of terms){let from=0,index;while((index=normalized.indexOf(term,from))!==-1){const start=starts[index],end=ends[index+term.length-1];found.set(`${start}:${end}`,{start,end});from=index+term.length;}}
 return [...found.values()].sort((a,b)=>a.start-b.start||a.end-b.end);
}

// Keep closing quotes with the sentence; decimal points are not sentence ends.
export function sentenceRanges(text) {
 const ranges=[];let start=0;
 const endings=/[。！？!?]+[”’」』）)"']*|\.(?!\d)[”’」』）)"']*(?=\s|$)|…+[”’」』）)"']*/gu;
 for(const match of text.matchAll(endings)){const end=match.index+match[0].length;ranges.push({start,end});start=end;}
 if(start<text.length)ranges.push({start,end:text.length});
 return ranges;
}
export function retainedReadingRanges(blocks, highlights, chapterByBlock, unit='paragraph') {
 const matchingChapters=new Set(blocks.filter(b=>highlights.get(b.id)?.length).map(b=>chapterByBlock.get(b.id)));
 return new Map(blocks.map(block=>{
  const hits=highlights.get(block.id)||[];
  const ranges=unit==='chapter'||block.id===chapterByBlock.get(block.id)
   ?(matchingChapters.has(chapterByBlock.get(block.id))?[{start:0,end:block.text.length}]:[])
   :unit==='sentence'?sentenceRanges(block.text).filter(r=>hits.some(h=>h.start<r.end&&h.end>r.start))
   :hits.length?[{start:0,end:block.text.length}]:[];
  return [block.id,ranges];
 }));
}

// Only adjacent retained sentences belong to the same displayed paragraph.
export function contiguousReadingRanges(ranges) {
 const groups=[];
 for(const range of ranges){
  const last=groups.at(-1);
  if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);
  else groups.push({...range});
 }
 return groups;
}

export function nearestReadingMatch(blocks, highlights, anchor) {
 let base=0,origin=0;const candidates=[];
 for(const block of blocks){
  if(block.id===anchor?.blockId)origin=base+(anchor.offset||0);
  for(const hit of highlights.get(block.id)||[])candidates.push({blockId:block.id,offset:hit.start,position:base+hit.start});
  base+=block.text.length+1;
 }
 const nearest=candidates.reduce((best,item)=>!best||Math.abs(item.position-origin)<Math.abs(best.position-origin)?item:best,null);
 return nearest?{blockId:nearest.blockId,offset:nearest.offset}:null;
}
