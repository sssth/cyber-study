import { excerptKey } from './knowledgeStore.js';

export const relationLabels = {direct:'直属', contains:'包含', related:'关联'};

export function graphEdges(items, savedLinks) {
  const keys = new Set(items.map(item => item.key));
  const excerpts = new Map(items.filter(item => item.type === 'excerpt').map(item => [excerptKey(item), item.key]));
  const edges = new Map();
  function add(from, to, kind) {
    if (!keys.has(from) || !keys.has(to) || from === to) return;
    if (kind === 'related' && from > to) [from,to] = [to,from];
    const id = JSON.stringify([kind,from,to]);
    edges.set(id,{id,from,to,kind});
  }
  for (const item of items) {
    if (['excerpt','typing_work'].includes(item.type)) add('book:'+item.bookId,item.key,'direct');
    if (item.type === 'annotation') add(excerpts.get(excerptKey(item)),item.key,'direct');
    if (item.type === 'journey') for (const id of item.pointIds || []) add(item.key,'memory_point:'+id,'contains');
    if (item.type === 'music') for (const list of item.playlists || []) add('playlist:'+list.id,item.key,'contains');
  }
  for (const link of savedLinks) if (link.relationType === 'related') add(link.fromId,link.toId,'related');
  return [...edges.values()];
}

export const nodeWidth = 172, nodeHeight = 58;
export function graphLayout(items, edges) {
  const neighbors = new Map(items.map(item => [item.key,[]]));
  const child = new Set();
  for (const {from,to,kind} of edges) {
    neighbors.get(from).push(to);
    neighbors.get(to).push(from);
    if (kind !== 'related') child.add(to);
  }
  // Start with connected parents, then pack isolated nodes into the remaining rows.
  const roots = [...items].sort((a,b) =>
    Number(!neighbors.get(a.key).length) - Number(!neighbors.get(b.key).length) ||
    Number(child.has(a.key)) - Number(child.has(b.key)) ||
    neighbors.get(b.key).length - neighbors.get(a.key).length);
  const positions = new Map(), seen = new Set();
  let x=24, y=24, rowHeight=0, width=0;
  for (const root of roots) {
    if (seen.has(root.key)) continue;
    const queue = [[root.key,0]], levels = [];
    seen.add(root.key);
    for (let i=0;i<queue.length;i++) {
      const [key,depth] = queue[i];
      (levels[depth] ??= []).push(key);
      for (const neighbor of neighbors.get(key)) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push([neighbor,depth+1]);
      }
    }
    const w=(levels.length-1)*230+nodeWidth, rows=Math.max(...levels.map(level=>level.length));
    const h=(rows-1)*84+nodeHeight;
    if (x>24 && x+w>920) { x=24; y+=rowHeight+38; rowHeight=0; }
    levels.forEach((level,col)=>level.forEach((key,row)=>positions.set(key,{
      x:x+col*230, y:y+(rows-level.length)*42+row*84
    })));
    width=Math.max(width,x+w+24); x+=w+38; rowHeight=Math.max(rowHeight,h);
  }
  return {positions,width,height:y+rowHeight+24};
}
