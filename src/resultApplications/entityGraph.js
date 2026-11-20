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
