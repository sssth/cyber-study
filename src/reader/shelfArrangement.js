export const arrangementKey = 'cyber-study.display-shelves.v2';
export const legacyKey = 'cyber-study.display-shelves.v1';
export const orientations = { cover: '封面朝外', spine: '书脊朝外', flat: '平躺叠放' };
export const bookSize = { width: .24, height: .34, thickness: .026, gap: .008 };
// Independent free areas leave the original ornaments untouched. Coordinates are
// relative to each bookcase's front, with real shelf heights from the room model.
export const shelfZones = [
 [[-.9,.73037,.56,0], [.9,1.17312,.55,1], [-.65,1.61651,.62,2],[.2,1.61655,.62,2],[1.05,1.61644,.52,2],[.2,2.07003,.62,3],[1.05,2.0701,.52,3]],
 [[-.6,.51986,.48,0],[-.02,.5198,.48,0],[-.6,.988,.48,1],[-.02,.98832,.48,1],[-.6,1.4589,.48,2],[-.02,1.45881,.48,2],[-.6,1.94813,.48,3],[-.02,1.94812,.48,3],[-.6,2.41791,.48,4],[-.02,2.41799,.48,4]]
].map(zones=>zones.map(([x,y,width,layer],id)=>({id,x,y,width,layer,height:.38})));
export function zoneLabel(shelf, id) {
 const zone=shelfZones[shelf][id];
 const peers=shelfZones[shelf].filter(z=>z.layer===zone.layer);
 return `第 ${zone.layer+1} 层 · ${peers.length===1?'可用区域':`${peers.indexOf(zone)+1} 号区域`}`;
}
export function loadArrangement(storage) {
 const raw=storage.getItem(arrangementKey);
 if(raw!==null) {
  const data=JSON.parse(raw);
  if(data.version!==2 || !Array.isArray(data.shelves) || data.shelves.length!==2)throw Error('陈列记录无法读取，请勿覆盖原记录。');
  data.shelves.forEach((entries,shelf)=>{
   if(!Array.isArray(entries))throw Error('陈列记录格式无效。');
   const ids=new Set(),books=new Set();
   for(const e of entries){if(!e||typeof e.id!=='string'||typeof e.bookId!=='string'||!shelfZones[shelf][e.zone]||!Object.hasOwn(orientations,e.orientation)||ids.has(e.id)||books.has(e.bookId))throw Error('陈列记录格式无效。');ids.add(e.id);books.add(e.bookId);}
  });
  return data.shelves;
 }
 const old=JSON.parse(storage.getItem(legacyKey)||'[[],[]]');
 return [0,1].map(shelf=>(Array.isArray(old[shelf])?old[shelf]:[]).flatMap((bookId,zone)=>typeof bookId==='string'&&shelfZones[shelf][zone]?[{id:`legacy-${shelf}-${zone}`,bookId,zone,orientation:'cover'}]:[]));
}
export function arrangeBooks(shelf, entries) {
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
   column.entries.forEach((entry,index)=>placements.push({...entry,position:[x+column.width/2,zone.y+(column.mode==='flat'?(index+.5)*bookSize.thickness:bookSize.height/2),shelf===0?.15:.04],stackLevel:column.mode==='flat'?index+1:null}));
   x+=column.width+bookSize.gap;
  }
 }
 return placements;
}
export function remainingCapacity(shelf,entries,zone,orientation) {
 let next=[...entries],count=0;
 while(count<300){next.push({id:`capacity-${count}`,bookId:'',zone,orientation});try{arrangeBooks(shelf,next);count++;}catch{break;}}
 return count;
}
