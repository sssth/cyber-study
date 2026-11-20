import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readScenePackage } from '../scripts/read-scene-package.mjs';
import { selectScene, writeIndependentScene } from '../scripts/independent-scene.mjs';
function glb(data) {
 const j=Buffer.from(JSON.stringify(data));const pad=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(pad);
 const h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+pad.length,8);h.writeUInt32LE(pad.length,12);h.writeUInt32LE(0x4e4f534a,16);return Buffer.concat([h,pad]);
}
test('extracts only selected ranges, deduplicates them, and preserves accessor offsets',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'independent-scene-'));
 try {
  const source=path.join(root,'source'),output=path.join(root,'out');await fs.mkdir(source);await fs.mkdir(output);
  await fs.writeFile(path.join(source,'full.bin'),Buffer.from('UNUSED__DATA____UNUSED'));
  const data={asset:{version:'2.0'},buffers:[{uri:'full.bin',byteLength:21}],bufferViews:[{buffer:0,byteOffset:8,byteLength:4}],accessors:[{bufferView:0,byteOffset:1,componentType:5121,count:3,type:'SCALAR'}]};
  await fs.writeFile(path.join(source,'low.glb'),glb(data));
  const original={models:[{file:'high.glb',previewFile:'preview.glb',qualityFiles:{low:'low.glb',medium:'medium.glb'}}]};
  const scene=selectScene(original,'low');await writeIndependentScene(scene,source,output);
  const saved=await fs.readFile(path.join(output,'low.glb'));const j=JSON.parse(saved.subarray(20).toString());
  assert.equal(j.accessors[0].byteOffset,1);assert.equal(j.bufferViews[0].byteOffset,0);
  assert.equal((await fs.readFile(path.join(output,j.buffers[0].uri))).toString(),'DATA');
  assert.equal(scene.assetDependencies.length,1);assert.equal(scene.models[0].previewFile,'low.glb');
  assert.equal(original.models[0].file,'high.glb');await assert.rejects(fs.access(path.join(output,'high.glb')));
  assert.deepEqual(selectScene(original,'full').models,original.models);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('publishing a scene embeds a separate shelf declaration in its manifest', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'display-shelves-'));
 try {
  const source = path.join(root, 'source');
  const output = path.join(root, 'output');
  await fs.mkdir(source);
  await fs.mkdir(output);
  const model = { id: 'bookcase', file: 'shelf.glb', position: [0, 0, 0], width: 1.8 };
  const scene = { version: 1, name: 'Test room', models: [model], camera: { position: [0, 1, 2], fov: 60 } };
  const layout = {
   displayShelfStorage: 'test-room',
   displayShelves: [{ model: 'bookcase', depth: 0.15, height: 0.38, zones: [[0, 1, 1.5, 0]], regions: [[[0], -0.75, 0.75]] }]
  };
  await fs.writeFile(path.join(source, 'scene.json'), JSON.stringify(scene));
  await fs.writeFile(path.join(source, 'display-shelves.json'), JSON.stringify(layout));
  await fs.writeFile(path.join(source, model.file), glb({ asset: { version: '2.0' } }));
  await writeIndependentScene(selectScene(readScenePackage(source), 'full'), source, output);
  assert.deepEqual(readScenePackage(output).displayShelves, layout.displayShelves);
  assert.equal(readScenePackage(output).displayShelfStorage, layout.displayShelfStorage);
 } finally {
  await fs.rm(root, { recursive: true, force: true });
 }
});
