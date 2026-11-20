export const arrangementKey = 'cyber-study.display-shelves.v2';
export const legacyKey = 'cyber-study.display-shelves.v1';
export const orientations = { cover: '封面朝外', spine: '书脊朝外', flat: '平躺叠放' };
export const bookSize = { width: .24, height: .34, thickness: .026, gap: .008 };
export const footprint = mode => mode === 'flat' ? bookSize.height : mode === 'spine' ? bookSize.thickness : bookSize.width;

// Placement has no knowledge of specific models or the number of shelves in the room.
export function createShelfArrangement(shelves, { storage = 'loft-v02' } = {}) {
 const key = storage === 'loft-v02' ? arrangementKey : `${arrangementKey}.${storage}`;
 const shelfZones = shelves.map(({ zones, height }) => zones.map(([x, y, width, layer], id) => ({ id, x, y, width, layer, height })));
 const shelfRegions = shelves.map(({ regions }, shelf) => regions.map(([zones, left, right]) => ({
  ...shelfZones[shelf][zones[0]], zones, x: (left + right) / 2, width: right - left
 })));
 function zoneLabel(shelf, id) {
  const zone=shelfZones[shelf][id];
  const peers=shelfZones[shelf].filter(z=>z.layer===zone.layer);
  return `第 ${zone.layer+1} 层 · ${peers.length===1?'可用区域':`${peers.indexOf(zone)+1} 号区域`}`;
 }
 function loadArrangement(storage) {
  const raw=storage.getItem(key);
  if(raw!==null) {
   const data=JSON.parse(raw);
   if(data.version!==2 || !Array.isArray(data.shelves) || data.shelves.length!==shelves.length)throw Error('陈列记录无法读取，请勿覆盖原记录。');
   data.shelves.forEach((entries,shelf)=>{
    if(!Array.isArray(entries))throw Error('陈列记录格式无效。');
    const ids=new Set(),books=new Set();
    for(const e of entries){if(!e||typeof e.id!=='string'||typeof e.bookId!=='string'||!shelfZones[shelf][e.zone]||!Object.hasOwn(orientations,e.orientation)||ids.has(e.id)||books.has(e.bookId))throw Error('陈列记录格式无效。');ids.add(e.id);books.add(e.bookId);}
   });
   return data.shelves;
  }
  const old=JSON.parse(key === arrangementKey ? storage.getItem(legacyKey) || '[]' : '[]');
  return shelves.map((_, shelf)=>(Array.isArray(old[shelf])?old[shelf]:[]).flatMap((bookId,zone)=>typeof bookId==='string'&&shelfZones[shelf][zone]?[{id:`legacy-${shelf}-${zone}`,bookId,zone,orientation:'cover'}]:[]));
 }
 function autoArrangeBooks(shelf, entries) {
  const placements=[];
  for(const zone of shelfZones[shelf]) {
   const columns=[];
   for(const entry of entries.filter(e=>e.zone===zone.id)) {
    let column=columns.at(-1);
    if(entry.orientation==='flat' && column?.mode==='flat' && (column.entries.length+1)*bookSize.thickness<=zone.height)column.entries.push(entry);
    else columns.push({mode:entry.orientation,entries:[entry],width:entry.orientation==='flat'?bookSize.height:entry.orientation==='spine'?bookSize.thickness:bookSize.width});
   }
   const width=columns.reduce((n,c)=>n+c.width,0)+Math.max(0,columns.length-1)*bookSize.gap;
   if(width>zone.width+1e-6)throw Error(`${zoneLabel(shelf,zone.id)}放不下了，请换个区域或改用书脊朝外、平躺叠放。`);
   let x=zone.x-width/2;
   for(const column of columns){
    column.entries.forEach((entry,index)=>placements.push({...entry,position:[x+column.width/2,zone.y+(column.mode==='flat'?(index+.5)*bookSize.thickness:bookSize.height/2),shelves[shelf].depth],stackLevel:column.mode==='flat'?index+1:null}));
    x+=column.width+bookSize.gap;
   }
  }
  return placements;
 }
 function remainingCapacity(shelf,entries,zone,orientation) {
  let next=[...entries],count=0;
  while(count<300){next.push({id:`capacity-${count}`,bookId:'',zone,orientation});try{arrangeBooks(shelf,next);count++;}catch{break;}}
  return count;
 }

 function arrangeBooks(shelf, entries) {
  if(!entries.some(e=>Number.isFinite(e.x)))return autoArrangeBooks(shelf,entries);
  const placed=[];
  for(const zone of shelfRegions[shelf]) {
   const columns=[];
   const add=entry=>{
    const width=footprint(entry.orientation);
    let x=entry.x;
    if(!Number.isFinite(x)) {
     const stack=entry.orientation==='flat'&&columns.find(c=>c.mode==='flat'&&(c.entries.length+1)*bookSize.thickness<=zone.height);
     if(stack)x=stack.x;
     else {x=zone.x-zone.width/2+width/2;for(const c of [...columns].sort((a,b)=>a.x-b.x)){if(x+width/2+bookSize.gap<=c.x-c.width/2)break;x=Math.max(x,c.x+c.width/2+bookSize.gap+width/2);}}
    }
    if(x-width/2<zone.x-zone.width/2-1e-6||x+width/2>zone.x+zone.width/2+1e-6)throw Error('这个位置超出可用区域，请移回绿色区域。');
    const overlap=columns.find(c=>Math.abs(c.x-x)<(c.width+width)/2+bookSize.gap-1e-6);
    if(overlap){
     if(entry.orientation!=='flat'||overlap.mode!=='flat'||Math.abs(overlap.x-x)>.001)throw Error('这里已有书籍，请换个位置，或用平躺方式叠放。');
     if((overlap.entries.length+1)*bookSize.thickness>zone.height)throw Error('这叠书已到层高上限，请另选位置。');
     overlap.entries.push(entry);
    }else columns.push({x,width,mode:entry.orientation,entries:[entry]});
   };
   const local=entries.filter(e=>zone.zones.includes(e.zone));
   local.filter(e=>Number.isFinite(e.x)).forEach(add);local.filter(e=>!Number.isFinite(e.x)).forEach(add);
   for(const c of columns)c.entries.forEach((e,i)=>placed.push({...e,x:c.x,position:[c.x,zone.y+(e.orientation==='flat'?(i+.5)*bookSize.thickness:bookSize.height/2),shelves[shelf].depth],stackLevel:e.orientation==='flat'?i+1:null}));
  }
  return placed;
 }
 // Freeze existing positions before a drag so moving one book never recenters its neighbours.
 function dropBook(shelf, entries, book, orientation, point) {
  const zone=shelfRegions[shelf].find(z=>point.x>=z.x-z.width/2&&point.x<=z.x+z.width/2&&point.y>=z.y-.04&&point.y<=z.y+z.height);
  if(!zone)throw Error('这里是摆件或不可摆放区域，请选择绿色区域。');
  const layout=arrangeBooks(shelf,entries);
  const existing=entries.find(e=>e.bookId===book.bookId);
  let next=layout.filter(e=>e.id!==existing?.id).map(({position,stackLevel,...e})=>({...e,x:position[0]}));
  const half=footprint(orientation)/2;
  let x=Math.max(zone.x-zone.width/2+half,Math.min(zone.x+zone.width/2-half,point.x));
  if(orientation==='flat'){
   const stack=next.find(e=>zone.zones.includes(e.zone)&&e.orientation==='flat'&&Math.abs(e.x-x)<bookSize.height/2);
   if(stack)x=stack.x;
  }
  // Snap to a nearby free edge rather than requiring pixel-perfect spine gaps.
  if(orientation!=='flat') {
   const neighbours=next.filter(e=>zone.zones.includes(e.zone));
   const candidates=neighbours.flatMap(e=>[-1,1].map(side=>e.x+side*(footprint(e.orientation)/2+half+bookSize.gap)))
    .filter(value=>Math.abs(value-x)<=.065&&value-half>=zone.x-zone.width/2-1e-6&&value+half<=zone.x+zone.width/2+1e-6)
    .filter(value=>neighbours.every(e=>Math.abs(e.x-value)>=(footprint(e.orientation)/2+half+bookSize.gap)-1e-6))
    .sort((a,b)=>Math.abs(a-x)-Math.abs(b-x));
   if(candidates.length)x=candidates[0];
  }
  const candidate={id:existing?.id||book.id,bookId:book.bookId,zone:zone.id,orientation,x,...((book.groupId||existing?.groupId)?{groupId:book.groupId||existing.groupId}:{})};
  next.push(candidate);
  const preview=arrangeBooks(shelf,next).find(e=>e.id===candidate.id);
  return {entries:next,preview};
 }

 // Moving a support book carries only the books resting above it.
 function dropStack(shelf, entries, book, point) {
  const layout=arrangeBooks(shelf,entries);
  const base=layout.find(e=>e.bookId===book.bookId);
  if(!base||base.orientation!=='flat'||book.orientation!=='flat')return dropBook(shelf,entries,book,book.orientation,point);
  const carried=layout.filter(e=>e.orientation==='flat'&&Math.abs(e.position[0]-base.position[0])<.001&&Math.abs((e.position[1]-(e.stackLevel-.5)*bookSize.thickness)-(base.position[1]-(base.stackLevel-.5)*bookSize.thickness))<.001&&e.stackLevel>=base.stackLevel).sort((a,b)=>a.stackLevel-b.stackLevel);
  const ids=new Set(carried.map(e=>e.id));
  const frozen=layout.filter(e=>!ids.has(e.id)).map(({position,stackLevel,...e})=>({...e,x:position[0]}));
  const result=dropBook(shelf,frozen,book,'flat',point);
  const placed=result.entries.at(-1);
  const next=[...result.entries,...carried.slice(1).map(e=>({id:e.id,bookId:e.bookId,zone:placed.zone,orientation:'flat',x:placed.x}))];
  arrangeBooks(shelf,next); // Validate the entire stack before any persistence.
  return {entries:next,preview:{...result.preview,stackCount:carried.length}};
 }

 function dropGroup(shelf, entries, books, orientation, point, preserveOrientations=false) {
  const ids=new Set(books.map(b=>b.bookId));
  let next=arrangeBooks(shelf,entries).filter(e=>!ids.has(e.bookId)).map(({position,stackLevel,...e})=>({...e,x:position[0]}));
  const zone=shelfRegions[shelf].find(z=>point.x>=z.x-z.width/2&&point.x<=z.x+z.width/2&&point.y>=z.y-.04&&point.y<=z.y+z.height);
  if(!zone)throw Error('这里是不可摆放区域。');
  const modes=books.map(book=>preserveOrientations?book.orientation:orientation);
  const flat=modes.every(mode=>mode==='flat');
  const widths=modes.map(footprint);
  const width=flat?widths[0]:widths.reduce((sum,w)=>sum+w,0)+Math.max(0,books.length-1)*bookSize.gap;
  if(width>zone.width+1e-6)throw Error('这组书放不下，请换一个区域。');
  const start=Math.max(zone.x-zone.width/2+widths[0]/2,Math.min(point.x,zone.x+zone.width/2-width+widths[0]/2));
  let first,offset=0;
  const groupId=books.length>1?`group:${books[0].id}`:books[0]?.groupId;
  for(const [index,book] of books.entries()) {
   if(index&&!flat)offset+=(widths[index-1]+widths[index])/2+bookSize.gap;
   const result=dropBook(shelf,next,{...book,groupId},modes[index],{x:(first?.x??start)+offset,y:point.y});
   next=result.entries;first??=result.preview;
  }
  return {entries:next,preview:{...first,stackCount:orientation==='flat'?books.length:1}};
 }

 // A filtered view is a projection only: keep horizontal anchors, compact visible
 // flat stacks, and leave the persisted arrangement completely untouched.
 function filterShelfLayout(shelf, entries, visibleBookIds) {
  const full=arrangeBooks(shelf,entries);
  return arrangeBooks(shelf,full.filter(e=>visibleBookIds.has(e.bookId)).map(({position,stackLevel,...e})=>({...e,x:position[0]})));
 }

 return { arrangementKey: key, shelves, shelfZones, shelfRegions, zoneLabel, loadArrangement, remainingCapacity,
  arrangeBooks, dropBook, dropStack, dropGroup, filterShelfLayout };
}

// Bottom-to-top order, shared by selection, the sidebar, and drag previews.
export function carriedBooks(layout, bookId) {
 const base=layout.find(e=>e.bookId===bookId);
 if(!base)return [];
 if(base.orientation!=='flat') {
  const row=layout.filter(e=>e.orientation!=='flat'&&Math.abs(e.position[1]-base.position[1])<.002).sort((a,b)=>a.position[0]-b.position[0]);
  const index=row.findIndex(e=>e.bookId===bookId);
  const touching=(a,b)=>Math.abs((b.position[0]-a.position[0])-(footprint(a.orientation)+footprint(b.orientation))/2)<=bookSize.gap+.002;
  let left=index,right=index;
  while(left>0&&touching(row[left-1],row[left]))left--;
  while(right<row.length-1&&touching(row[right],row[right+1]))right++;
  return index===left||index===right?[base]:row.slice(left,right+1);
 }
 const floor=base.position[1]-(base.stackLevel-.5)*bookSize.thickness;
 return layout.filter(e=>e.orientation==='flat'&&Math.abs(e.position[0]-base.position[0])<.001&&Math.abs(e.position[1]-(e.stackLevel-.5)*bookSize.thickness-floor)<.001&&e.stackLevel>=base.stackLevel).sort((a,b)=>a.stackLevel-b.stackLevel);
}

