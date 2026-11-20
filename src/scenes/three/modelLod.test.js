import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { BoxGeometry } from 'three';
import { chooseLod, lodGeometries } from './modelLod.js';
import { modelsForQuality } from '../packages/modelQuality.js';
import { sceneAssets } from '../packages/presentation.js';
import { validatePackage } from '../packages/validatePackage.js';
// 场景包与 LOD 生成报告都是本地大文件，不在仓库内；缺数据时这三条用例跳过。
const reportFile='work/lod-2026-11-15/generation.json';
const local = (()=>{
 if(!fs.existsSync(reportFile)||!fs.existsSync('scene.config.json'))return null;
 const {sceneFolder}=JSON.parse(fs.readFileSync('scene.config.json','utf8'));
 if(typeof sceneFolder!=='string'||!sceneFolder.trim())return null;
 const folder=sceneFolder.endsWith('/')||sceneFolder.endsWith('\\')?sceneFolder:sceneFolder+'/';
 return fs.existsSync(folder+'scene.json')?folder:null;
})();
const skip=local?false:'缺少本地场景包或 LOD 生成报告，跳过。';
const root=local??'';
const scene=local?JSON.parse(fs.readFileSync(root+'scene.json')):{models:[]};
const report=local?JSON.parse(fs.readFileSync(reportFile)):[];
test('original assets unchanged; generated indices in range and every LOD packaged',{skip},()=>{
 validatePackage(scene);const assets=sceneAssets(scene);
 for(const item of report){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(root+item.file)).digest('hex'),item.originalHash);
  for(const level of item.levels){assert.ok(assets.has(level.file));const data=fs.readFileSync(root+level.file);assert.equal(data.length,level.triangles*12);const indices=new Uint32Array(Uint8Array.from(data).buffer);assert.ok(indices.every(i=>i<item.vertexCount));}
 }
});
test('near keeps originals, far simplifies, high is conservative, boundary is stable',{skip},()=>{
 const levels=report[0].levels;
 for(const q of ['low','medium','high']){assert.equal(chooseLod(2000,q,levels),0);assert.equal(chooseLod(30,q,levels),3);}
 assert.ok(chooseLod(500,'high',levels)<=chooseLod(500,'medium',levels));
 assert.equal(chooseLod(700,'medium',levels,0),0);assert.equal(chooseLod(700,'medium',levels,1),1);
 assert.equal(chooseLod(700,'medium',levels,0,true),0);
});
test('LOD compacts exact attribute values without modifying original indices',()=>{
 const base=new BoxGeometry();base.computeBoundingBox();base.computeBoundingSphere();const original=base.index.array.slice();
 const buffer=new Uint32Array([0,1,2]).buffer;const spec={vertexCount:base.attributes.position.count,sourceTriangles:base.index.count/3,levels:[{triangles:1}]};
 const [variant]=lodGeometries(base,[buffer],spec);assert.deepEqual(variant.attributes.position.array,base.attributes.position.array.slice(0,9));assert.deepEqual(variant.attributes.uv.array,base.attributes.uv.array.slice(0,6));assert.deepEqual(base.index.array,original);assert.equal(lodGeometries(base,[buffer],spec)[0],variant);
 assert.throws(()=>lodGeometries(base,[new Uint32Array([999,0,1]).buffer],spec));
});
test('quality selection adds LOD URLs without changing placement or original manifest',{skip},()=>{
 const withUrls={...scene,assetUrl:f=>'asset:'+f,models:scene.models.map(m=>({...m,modelUrl:'asset:'+m.file}))};
 for(const quality of ['low','medium','high']){const models=modelsForQuality(withUrls,quality);for(const m of models.filter(m=>m.lod)){assert.equal(m.lodQuality,quality);assert.equal(m.lodUrls.length,3);assert.ok(m.lodUrls.every(u=>u.startsWith('asset:')));}}
 const invalid=structuredClone(scene);invalid.models.find(m=>m.lod).lod.levels[0].file='../escape.bin';assert.throws(()=>validatePackage(invalid));
});
