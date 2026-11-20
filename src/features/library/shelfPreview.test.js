import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sceneAssets } from '../../scenes/packages/presentation.js';
import { validatePackage } from '../../scenes/packages/validatePackage.js';
import { createAssetLifetime } from '../../scenes/three/assetLifetime.js';
const root=JSON.parse(fs.readFileSync('scene.config.json')).sceneFolder;
const scene=JSON.parse(fs.readFileSync(path.join(root,'scene.json')));
const parse=file=>{const bytes=fs.readFileSync(path.join(root,file));return {bytes,json:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))};};
test('shelf previews are packaged, self-contained and substantially smaller with valid compact geometry',()=>{
 validatePackage(scene);const assets=sceneAssets(scene);
 const models=scene.models.filter(m=>m.previewFile);assert.equal(models.length,10);
 for(const model of models){
  assert.ok(assets.has(model.previewFile));
  const {bytes,json}=parse(model.previewFile), original=parse(model.file), low=parse(model.qualityFiles.low).json;
  assert.ok(bytes.length<original.bytes.length*.2,model.id);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(json.buffers.length,1);assert.equal(json.buffers[0].uri,undefined);
  assert.deepEqual(json.nodes,low.nodes);assert.deepEqual(json.materials,low.materials);
  const p=json.meshes[0].primitives[0], positions=json.accessors[p.attributes.POSITION];
  assert.deepEqual(positions.min,low.accessors[low.meshes[0].primitives[0].attributes.POSITION].min);
  assert.deepEqual(positions.max,low.accessors[low.meshes[0].primitives[0].attributes.POSITION].max);
  const a=json.accessors[p.indices],v=json.bufferViews[a.bufferView],binStart=28+bytes.readUInt32LE(12);
  for(let i=0;i<a.count;i++)assert.ok(bytes.readUInt32LE(binStart+v.byteOffset+i*4)<positions.count);
  for(const view of json.bufferViews)assert.ok(view.byteOffset+view.byteLength<=json.buffers[0].byteLength);
  for(const image of json.images)assert.ok(Number.isInteger(image.bufferView)&&!image.uri);
 }
});
test('preview idle cache survives switches, cancels expiry on reuse and releases once after idle',()=>{
 const micro=[],timers=new Map(),disposed=[];let id=0;
 const lifetime=createAssetLifetime((k)=>disposed.push(k),fn=>micro.push(fn),{schedule:fn=>{timers.set(++id,fn);return id;},cancel:key=>timers.delete(key)});
 const flush=()=>micro.splice(0).forEach(fn=>fn());const value={};
 const a=lifetime.retain('shelf',value,60000),b=lifetime.retain('shelf',value,60000);a();b();flush();
 assert.equal(timers.size,1);assert.equal(disposed.length,0);
 const c=lifetime.retain('shelf',value,60000);assert.equal(timers.size,0);c();flush();
 for(const fn of timers.values())fn();assert.deepEqual(disposed,['shelf']);assert.equal(lifetime.size,0);
 const normal=lifetime.retain('room',{});normal();flush();assert.deepEqual(disposed,['shelf','room']);
});
