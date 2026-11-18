export function excerptRange(blocks, startId, start, endId, end) {
 const first=blocks.findIndex(b=>b.id===startId),last=blocks.findIndex(b=>b.id===endId);
 if(first<0||last<first)throw Error('请选择同一章节内的原文。');
 const ranges=blocks.slice(first,last+1).flatMap((b,i)=>{
  const from=i===0?start:0,to=b.id===endId?end:b.text.length;
  if(from<0||to> b.text.length||from>to)throw Error('选区位置无效，请重新选择。');
  const raw=b.text.slice(from,to),text=raw.trim();
  return text?[{blockId:b.id,start:from+raw.length-raw.trimStart().length,end:to-(raw.length-raw.trimEnd().length),text}]:[];
 });
 if(!ranges.length)throw Error('请选择要保留的文字。');
 return {quote:ranges.map(r=>r.text).join('\n'),blockId:ranges[0].blockId,ranges};
}

// Remove only this excerpt's underline coverage; preserve unrelated formatting
// and reapply coverage belonging to overlapping excerpts.
export function replaceExcerptUnderlines(content, blocks, oldRanges, retainedRanges, newRanges, parse, underline) {
 const affected=new Set(oldRanges.map(r=>r.blockId));
 const desired=[];
 for(const block of blocks){
  if(block.code||!affected.has(block.id))continue;
  let cursor=0;
  for(const part of block.parts){
   let pieces=part.underline?[[cursor,cursor+part.text.length]]:[];
   for(const r of oldRanges.filter(r=>r.blockId===block.id))pieces=pieces.flatMap(([a,b])=>r.end<=a||r.start>=b?[[a,b]]:[[a,Math.max(a,r.start)],[Math.min(b,r.end),b]].filter(([x,y])=>y>x));
   desired.push(...pieces.map(([start,end])=>({blockId:block.id,start,end})));cursor+=part.text.length;
  }
 }
 for(const block of [...blocks].reverse())if(!block.code&&affected.has(block.id)){
  const end=content.indexOf('\n',block.start),stop=end<0?content.length:end;
  content=content.slice(0,block.start)+content.slice(block.start,stop).replace(/<\/?u>/g,'')+content.slice(stop);
 }
 desired.push(...retainedRanges.filter(r=>affected.has(r.blockId)),...newRanges);
 for(const r of desired){const block=parse(content).find(b=>b.id===r.blockId);if(block&&!block.code)content=underline(content,block,r.start,r.end);}
 return content;
}
