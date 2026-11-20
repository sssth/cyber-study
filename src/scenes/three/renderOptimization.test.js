import test from 'node:test';
import assert from 'node:assert/strict';
import { BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { boxCorners, boxFullyOccluded, opaqueOccluder, solidBox } from './solidBox.js';
import { createAssetLifetime, releaseParser } from './assetLifetime.js';
import { chooseLod, retainLodGeometry, lodCacheStats } from './modelLod.js';

test('occluders must be complete outward cuboids, excluding missing or duplicated faces',()=>{
 const geometry=new BoxGeometry(2,2,2); assert.ok(solidBox(geometry));
 const open=geometry.clone();open.setIndex(Array.from(open.index.array).slice(3));assert.equal(solidBox(open),null);
 const duplicated=geometry.clone();const indices=duplicated.index.array;indices.set(indices.slice(0,6),6);assert.equal(solidBox(duplicated),null);
 const reversed=geometry.clone();for(let i=0;i<reversed.index.count;i+=3){const a=reversed.index.array;[a[i],a[i+1]]=[a[i+1],a[i]]}assert.equal(solidBox(reversed),null);
 const mat=new MeshStandardMaterial();assert.ok(opaqueOccluder(mat));mat.transparent=true;assert.equal(opaqueOccluder(mat),false);mat.transparent=false;mat.alphaTest=.5;assert.equal(opaqueOccluder(mat),false);mat.alphaTest=0;mat.side=BackSide;assert.equal(opaqueOccluder(mat),false);
});
test('whole bounds behind one solid hide; partial coverage, camera inside and foreground remain',()=>{
 const box=solidBox(new BoxGeometry(2,2,2)), blocker={box,inverse:new Matrix4()};
 const eye=new Vector3(0,0,5);
 const target=solidBox(new BoxGeometry(.5,.5,.5)).clone().translate(new Vector3(0,0,-3));
 assert.ok(boxFullyOccluded(eye,boxCorners(target),blocker));
 assert.equal(boxFullyOccluded(new Vector3(),boxCorners(target),blocker),false);
 assert.equal(boxFullyOccluded(eye,boxCorners(target.clone().translate(new Vector3(5,0,0))),blocker),false);
 assert.equal(boxFullyOccluded(eye,boxCorners(target.clone().translate(new Vector3(0,0,6))),blocker),false);
 const moved={box,inverse:new Matrix4().makeTranslation(-5,0,0)};
 assert.ok(boxFullyOccluded(eye.clone().add(new Vector3(5,0,0)),boxCorners(target.clone().translate(new Vector3(5,0,0))),moved));
});
test('resource ownership preserves simultaneous previews and StrictMode remounts',()=>{
 const tasks=[],disposed=[];const lifetime=createAssetLifetime((k,v)=>disposed.push([k,v]),cb=>tasks.push(cb));const value={};
 const a=lifetime.retain('room',value),b=lifetime.retain('room',value);a();tasks.splice(0).forEach(f=>f());assert.equal(disposed.length,0);
 b();const remount=lifetime.retain('room',value);tasks.splice(0).forEach(f=>f());assert.equal(disposed.length,0);
 remount();remount();tasks.splice(0).forEach(f=>f());assert.equal(disposed.length,1);assert.equal(lifetime.size,0);
 let count=0;const gltf={parser:{cache:{removeAll:()=>count++}}};releaseParser(gltf);releaseParser(gltf);assert.equal(count,1);assert.equal(gltf.parser,null);
});
test('LOD shares active geometry and bounds unused cache; disposal releases variants',()=>{
 const base=new BufferGeometry();base.setAttribute('position',new BufferAttribute(new Float32Array(240000*3),3));
 const indices=Uint32Array.from({length:240000},(_,i)=>i);base.setIndex(new BufferAttribute(indices,1));
 const spec={vertexCount:240000,sourceTriangles:80000,levels:[{triangles:80000}]};
 const buffer=indices.slice().buffer,a=retainLodGeometry(base,buffer,spec,0),b=retainLodGeometry(base,buffer,spec,0);assert.equal(a.geometry,b.geometry);
 let disposed=0;a.geometry.addEventListener('dispose',()=>{disposed++;assert.equal(a.geometry.getAttribute('position'),undefined);});a.release();assert.equal(disposed,0);
 for(let n=0;n<12;n++)retainLodGeometry(base,indices.slice().buffer,spec,0).release();
 assert.equal(disposed,0);assert.ok(lodCacheStats().unusedBytes<=lodCacheStats().idleBudget);
 b.release();base.dispose();assert.equal(disposed,1);assert.equal(base.getAttribute('position').count,240000);assert.equal(lodCacheStats().unusedBytes,0);
});

test('geometry range requests verify slices and safely accept servers ignoring Range',async()=>{
 const {referencedRange,readGeometryRange}=await import('./geometryRanges.js');
 const json={buffers:[{byteLength:12}],bufferViews:[{buffer:0,byteOffset:3,byteLength:3},{buffer:0,byteOffset:6,byteLength:3}]};
 const range=referencedRange(json,0);assert.deepEqual(range,{start:3,end:9,length:12});
 const source=Uint8Array.from({length:12},(_,i)=>i),slice=source.slice(3,9);
 const partial=await readGeometryRange('test',range,{},async(_,options)=>{assert.equal(options.headers.Range,'bytes=3-8');return new Response(slice,{status:206,headers:{'Content-Range':'bytes 3-8/12'}})});
 assert.deepEqual(new Uint8Array(partial),slice);
 const full=await readGeometryRange('test',range,{},async()=>new Response(source));assert.deepEqual(new Uint8Array(full),slice);
 await assert.rejects(()=>readGeometryRange('test',range,{},async()=>new Response(slice,{status:206,headers:{'Content-Range':'bytes 0-5/12'}})));
});

test('packaged file URLs retain the standard GLTF loading path',async()=>{
 const {geometryRanges}=await import('./geometryRanges.js');const previous=globalThis.window;
 globalThis.window={location:{href:'file:///app/index.html'}};
 try {
  const parser={json:{buffers:[{uri:'../../original.glb',byteLength:100}],bufferViews:[{buffer:0,byteOffset:10,byteLength:20}]},options:{path:'file:///app/models/quality/low/',manager:{resolveURL:u=>u}}};
  assert.equal(geometryRanges(parser).loadBufferView(0),null);
 } finally { if(previous===undefined)delete globalThis.window;else globalThis.window=previous; }
});


test('LOD uses a tighter error budget when the camera settles', () => {
  const levels = [{ error: 0.0005 }, { error: 0.002 }, { error: 0.01 }];
  assert.equal(chooseLod(600, 'low', levels), 1);
  assert.equal(chooseLod(600, 'low', levels, 1, true), 2);
  assert.equal(chooseLod(600, 'low', levels, 2), 1);
  assert.equal(chooseLod(2400, 'high', levels, 1), 0);
  assert.equal(chooseLod(900, 'medium', levels), 0);
  assert.equal(chooseLod(1000, 'high', levels, 1), 0);
});
