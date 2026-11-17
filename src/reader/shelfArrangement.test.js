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
