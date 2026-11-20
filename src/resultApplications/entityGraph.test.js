import test from 'node:test';
import assert from 'node:assert/strict';
import { graphEdges } from '../entities/edges.js';
import { graphLayout } from './entityGraph.js';

test('graph includes distinct typed entities, their structural and manual links, and isolated nodes',()=>{
  const note={bookId:'b',blockId:'p',quote:'原文'};
  const rows=[['book','b'],['excerpt','n',note],['annotation','n',note],['annotation','n2',note],['typing_work','w',{bookId:'b'}],['journey','j',{pointIds:['p','gone']}],['memory_point','p'],['playlist','l'],['music','s',{playlists:[{id:'l'}]}],['memo','m']];
  const items=rows.map(([type,id,data])=>({type,id,key:type+':'+id,...data}));
  const saved=[['music:s','book:b'],['book:b','music:s'],['gone','book:b']].map(([fromId,toId])=>({fromId,toId,relationType:'related'}));
  const edges=graphEdges(items,saved);
  assert.deepEqual(edges.map(e=>e.kind).sort(),['contains','contains','direct','direct','direct','direct','related']);
  assert.ok(edges.some(e=>e.from==='excerpt:n'&&e.to==='annotation:n2'));
  const {positions}=graphLayout(items,edges);
  assert.equal(positions.size,items.length);
  assert.equal(new Set([...positions.values()].map(p=>p.x+','+p.y)).size,items.length);
});
