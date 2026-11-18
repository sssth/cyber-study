import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArrangement,arrangeBooks,remainingCapacity,arrangementKey,legacyKey,bookSize,shelfZones} from './shelfArrangement.js';
const entry=(id,orientation='spine',zone=0)=>({id:String(id),bookId:`book-${id}`,orientation,zone});
test('legacy placement keeps books, original zone and facing without mutating storage',()=>{
 const values={[legacyKey]:JSON.stringify([['a',null,'b'],['c']])};const storage={getItem:k=>values[k]??null};
 const result=loadArrangement(storage);assert.deepEqual(result[0].map(e=>[e.bookId,e.zone,e.orientation]),[['a',0,'cover'],['b',2,'cover']]);assert.equal(result[1][0].bookId,'c');assert.equal(values[arrangementKey],undefined);
 assert.throws(()=>loadArrangement({getItem:k=>k===arrangementKey?'broken':null}));
});
test('spines fit many thin volumes and reject overflow with no overlaps',()=>{
 for(let shelf=0;shelf<2;shelf++)for(const zone of shelfZones[shelf]){
  const capacity=remainingCapacity(shelf,[],zone.id,'spine');assert.ok(capacity>=14);
  const entries=Array.from({length:capacity},(_,i)=>entry(i,'spine',zone.id));const p=arrangeBooks(shelf,entries);
  for(let i=1;i<p.length;i++)assert.ok(p[i].position[0]-p[i-1].position[0]>=bookSize.thickness);
  assert.throws(()=>arrangeBooks(shelf,[...entries,entry('overflow','spine',zone.id)]));
 }
});
test('lying volumes stack on one another and removing a volume repacks without floating',()=>{
 const entries=Array.from({length:10},(_,i)=>entry(i,'flat'));
 const p=arrangeBooks(0,entries);assert.equal(new Set(p.map(e=>e.position[0])).size,1);
 for(let i=1;i<p.length;i++)assert.ok(Math.abs(p[i].position[1]-p[i-1].position[1]-bookSize.thickness)<1e-8);
 const compact=arrangeBooks(0,entries.filter(e=>e.id!=='3'));assert.equal(compact[3].stackLevel,4);assert.equal(compact[3].id,'4');
 assert.ok(compact.at(-1).position[1]+bookSize.thickness/2<shelfZones[0][0].y+shelfZones[0][0].height);
});
test('mixed orientations respect region boundaries; shelves remain independent',()=>{
 const a=arrangeBooks(0,[entry(1,'spine'),entry(2,'flat'),entry(3,'flat')]);assert.equal(a[1].position[0],a[2].position[0]);assert.ok(a[1].position[0]>a[0].position[0]);
 assert.throws(()=>arrangeBooks(0,[entry(1,'cover'),entry(2,'flat')]));
 const saved={version:2,shelves:[[entry(1)], [entry(1,'flat')]]};assert.deepEqual(loadArrangement({getItem:()=>JSON.stringify(saved)}),saved.shelves);
});

test('drag saves exact position, keeps neighbours fixed and rejects blocked/colliding targets',async()=>{
 const {dropBook}=await import('./shelfArrangement.js');
 const first=dropBook(0,[],entry(1),'spine',{x:-1.05,y:.9});
 const second=dropBook(0,first.entries,entry(2),'spine',{x:-.75,y:.9});
 assert.equal(second.entries[0].x,first.entries[0].x);
 const moved=dropBook(0,second.entries,entry(2),'spine',{x:.8,y:1.3});
 assert.equal(moved.entries.find(e=>e.bookId==='book-2').zone,1);
 assert.equal(moved.entries.find(e=>e.bookId==='book-1').x,-1.05);
 assert.throws(()=>dropBook(0,first.entries,entry(2),'cover',{x:-1.05,y:.9}),/已有书籍/);
 assert.throws(()=>dropBook(0,first.entries,entry(2),'spine',{x:.2,y:.9}),/摆件/);
});
test('drop onto flat books snaps to stack and stack height cannot overflow',async()=>{
 const {dropBook}=await import('./shelfArrangement.js');let entries=[];
 for(let i=0;i<14;i++)entries=dropBook(1,entries,entry(i),'flat',{x:-.59,y:.7}).entries;
 const layout=arrangeBooks(1,entries);assert.equal(new Set(layout.map(e=>e.position[0])).size,1);assert.equal(layout.at(-1).stackLevel,14);
 assert.throws(()=>dropBook(1,entries,entry(20),'flat',{x:-.59,y:.7}),/层高/);
 const moved=dropBook(1,entries,entry(3),'flat',{x:-.02,y:1.1});
 assert.equal(arrangeBooks(1,moved.entries).filter(e=>e.zone===0).length,13);
});
test('continuous empty shelves allow placing between old slots and detect cross-slot overlap',async()=>{
 const {dropBook}=await import('./shelfArrangement.js');
 const a=dropBook(0,[],entry(1),'cover',{x:-.2,y:1.8});assert.ok(Math.abs(a.preview.position[0]+.2)<1e-6);
 assert.throws(()=>dropBook(0,a.entries,entry(2),'cover',{x:-.1,y:1.8}),/已有书籍/);
});

test('dragging a flat support transports its upper books and leaves lower books',async()=>{
 const {dropStack}=await import('./shelfArrangement.js');
 const entries=[entry(1,'flat'),entry(2,'flat'),entry(3,'flat')];
 const result=dropStack(0,entries,entries[1],{x:.9,y:1.25});
 const layout=arrangeBooks(0,result.entries);
 assert.equal(layout.find(e=>e.id==='1').zone,0);
 assert.deepEqual(layout.filter(e=>e.zone===1).map(e=>[e.id,e.stackLevel]),[['2',1],['3',2]]);
 assert.equal(result.preview.stackCount,2);
 const all=dropStack(0,entries,entries[0],{x:.9,y:1.25});
 assert.equal(all.entries.filter(e=>e.zone===1).length,3);
 const before=JSON.stringify(entries);
 assert.throws(()=>dropStack(0,entries,entries[0],{x:0,y:0}));
 assert.equal(JSON.stringify(entries),before);
});

test('new groups place atomically in stacked or upright arrangements',async()=>{
 const {dropGroup}=await import('./shelfArrangement.js');
 const books=[entry(1),entry(2),entry(3),entry(4)];
 const stack=dropGroup(0,[],books,'flat',{x:-.9,y:.9});
 assert.equal(stack.entries.length,4);
 assert.deepEqual(arrangeBooks(0,stack.entries).map(e=>e.stackLevel),[1,2,3,4]);
 const upright=dropGroup(0,[],books,'spine',{x:-1,y:.9});
 assert.equal(new Set(upright.entries.map(e=>e.x)).size,4);
 const original=[];
 assert.throws(()=>dropGroup(0,original,books,'cover',{x:-.9,y:.9}));
 assert.deepEqual(original,[]);
});

test('spines snap beside neighbours without shifting existing books',async()=>{
 const {dropBook,footprint}=await import('./shelfArrangement.js');
 const existing={...entry(1),x:-.9};
 const result=dropBook(0,[existing],entry(2),'spine',{x:-.885,y:.9});
 const added=result.entries.find(e=>e.id==='2');
 assert.ok(Math.abs(added.x-(-.9+footprint('spine')+bookSize.gap))<1e-6);
 assert.equal(result.entries.find(e=>e.id==='1').x,-.9);
 assert.doesNotThrow(()=>arrangeBooks(0,result.entries));
});

test('stack selection reports exactly the moved books in bottom-to-top order',async()=>{
 const {carriedBooks}=await import('./shelfArrangement.js');
 const layout=arrangeBooks(0,[1,2,3,4,5].map(id=>entry(id,'flat')));
 assert.deepEqual(carriedBooks(layout,'book-1').map(e=>e.id),['1','2','3','4','5']);
 assert.deepEqual(carriedBooks(layout,'book-3').map(e=>e.id),['3','4','5']);
 assert.deepEqual(carriedBooks(layout,'missing'),[]);
});

test('five flat books rotate and remain movable as one upright group after reload',async()=>{
 const {dropGroup,carriedBooks}=await import('./shelfArrangement.js');
 const original=[1,2,3,4,5].map(id=>entry(id,'flat'));
 const selected=carriedBooks(arrangeBooks(0,original),'book-1');
 const rotated=dropGroup(0,original,selected,'spine',{x:-.9,y:.75});
 assert.equal(rotated.entries.filter(e=>e.orientation==='spine').length,5);
 const restored=JSON.parse(JSON.stringify(rotated.entries));
 const group=carriedBooks(arrangeBooks(0,restored),'book-3');
 assert.equal(group.length,5);
 const moved=dropGroup(0,restored,group,'spine',{x:.9,y:1.3});
 assert.equal(moved.entries.filter(e=>e.zone===1).length,5);
 assert.equal(new Set(moved.entries.map(e=>e.x)).size,5);
 const stacked=dropGroup(0,moved.entries,carriedBooks(arrangeBooks(0,moved.entries),'book-2'),'flat',{x:.9,y:1.3});
 assert.deepEqual(arrangeBooks(0,stacked.entries).map(e=>e.stackLevel),[1,2,3,4,5]);
});

test('filtering a stack drops visible books to the shelf without changing saved layout',async()=>{
 const {filterShelfLayout}=await import('./shelfArrangement.js');
 const entries=[1,2,3,4,5].map(id=>entry(id,'flat'));
 entries.push({...entry(6,'spine',1)});
 const before=JSON.stringify(entries),full=arrangeBooks(0,entries);
 const filtered=filterShelfLayout(0,entries,new Set(['book-3','book-6']));
 assert.equal(filtered.length,2);
 const middle=filtered.find(e=>e.bookId==='book-3');
 assert.equal(middle.stackLevel,1);
 assert.equal(middle.position[1],shelfZones[0][0].y+bookSize.thickness/2);
 assert.equal(middle.position[0],full.find(e=>e.bookId==='book-3').position[0]);
 assert.equal(JSON.stringify(entries),before);
 assert.equal(arrangeBooks(0,entries).find(e=>e.bookId==='book-3').stackLevel,3);
 assert.deepEqual(filterShelfLayout(0,entries,new Set()),[]);
});

test('standing neighbours group by physical contact, with each edge removable alone',async()=>{
 const {carriedBooks}=await import('./shelfArrangement.js');
 const entries=Array.from({length:10},(_,i)=>({...entry(i),x:-1.1+i*(bookSize.thickness+bookSize.gap)}));
 const layout=arrangeBooks(0,entries);
 assert.equal(carriedBooks(layout,'book-0').length,1);
 assert.equal(carriedBooks(layout,'book-9').length,1);
 assert.equal(carriedBooks(layout,'book-4').length,10);
 const separated=arrangeBooks(0,[{...entry(1),x:-1.1,groupId:'old'},{...entry(2),x:-.6,groupId:'old'}]);
 assert.equal(carriedBooks(separated,'book-1').length,1);
 const split=layout.filter(e=>e.bookId!=='book-5');
 assert.equal(carriedBooks(split,'book-4').length,1);
 assert.equal(carriedBooks(split,'book-2').length,5);
});
test('moving a physically connected mixed row preserves each book orientation',async()=>{
 const {carriedBooks,dropGroup}=await import('./shelfArrangement.js');
 const entries=[{...entry(1,'spine'),x:-1.1},{...entry(2,'cover'),x:-.959},{...entry(3,'spine'),x:-.818}];
 const group=carriedBooks(arrangeBooks(0,entries),'book-2');assert.equal(group.length,3);
 const moved=dropGroup(0,entries,group,'cover',{x:.7,y:1.3},true);
 assert.deepEqual(moved.entries.map(e=>e.orientation),['spine','cover','spine']);
});
