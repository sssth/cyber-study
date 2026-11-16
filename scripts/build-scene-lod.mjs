// Offline, attribute-aware LOD indices. Original geometry and textures stay intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// Reuse the simplifier already shipped in this project's installed dependency tree.
const installed = createRequire(import.meta.url);
const rendererDependencies = createRequire(installed.resolve('@react-three/drei'));
const { MeshoptSimplifier } = await import(pathToFileURL(rendererDependencies.resolve('meshoptimizer/simplifier')).href);
const { MeshoptEncoder } = await import(pathToFileURL(rendererDependencies.resolve('meshoptimizer/encoder')).href);
const root = path.resolve('场景包/3D版Loft v0.2');
const targets = ["F14_piano_bench.glb", "F15_record_cabinet.glb", "F16_tower_speaker.glb", "F19_bar_counter.glb", "F20_bar_stool.glb", "F23_reading_chaise.glb", "F24_footstool.glb", "F25_side_table.glb", "F26_book_wall.glb", "L03_desk_lamp.glb", "N8_F03.glb", "N8_F06.glb", "N8_F18.glb", "N8_P01.glb", "N8_P13.glb", "P12_rock_sculpture.glb", "P21_coffee_machine.glb", "P22_grinder.glb", "P23_bottle_set.glb", "P27_reading_rug.glb", "P30_glass_ball.glb", "R4_vinyl_slot.glb", "R5_P11.glb", "R5_P13.glb", "T18_P08_memo_pad.glb", "T18_P09_mug.glb", "T18_P10_floating_crystal.glb", "T18_P24_wine_glass_set.glb", "T18_P25_decanter_tray.glb", "T18_P28_glass_candle.glb", "T18_P29_coffee_set.glb", "T18_P31_headphone_stand.glb", "T18_bookshelf_04.glb", "T18_diary_13.glb", "T18_disc_player_12.glb", "T18_globe_16.glb", "T18_memo_pad_14.glb", "T18_plant_18.glb", "T18_robot_cat_19.glb", "T18_turntable_11.glb", "T18_typewriter_17.glb"];
const manifestSource = await fs.readFile(path.join(root, 'scene.json'), 'utf8');
const manifest = JSON.parse(manifestSource);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function read(file) {
 const bytes=await fs.readFile(path.join(root,file)); const n=bytes.readUInt32LE(12);
 const json=JSON.parse(bytes.subarray(20,20+n));
 const buffers=await Promise.all(json.buffers.map(b=>b.uri?fs.readFile(path.resolve(root,path.dirname(file),b.uri)):bytes.subarray(28+n)));
 function accessor(i) {
  const a=json.accessors[i],v=json.bufferViews[a.bufferView];
  if(a.sparse || a.normalized || v.byteStride) throw Error('Unsupported accessor layout');
  const Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];
  const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const offset=(v.byteOffset??0)+(a.byteOffset??0);
  const raw=buffers[v.buffer].subarray(offset,offset+a.count*width*Type.BYTES_PER_ELEMENT);
  return new Type(Uint8Array.from(raw).buffer);
 }
 return {bytes,json,accessor};
}
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const report=[];
for(const name of targets) {
 const file='models/'+name;const src=await read(file);
 if(src.json.meshes.length!==1 || src.json.meshes[0].primitives.length!==1) throw Error('LOD requires one primitive');
 const p=src.json.meshes[0].primitives[0];
 const pos=src.accessor(p.attributes.POSITION),normal=src.accessor(p.attributes.NORMAL),uv=src.accessor(p.attributes.TEXCOORD_0);
 const indices=new Uint32Array(src.accessor(p.indices));
 const attrs=new Float32Array(pos.length/3*5);
 for(let i=0;i<pos.length/3;i++)attrs.set([normal[i*3],normal[i*3+1],normal[i*3+2],uv[i*2],uv[i*2+1]],i*5);
 const geometryHash=hash(Buffer.from(pos.buffer));
 for(const variant of new Set(manifest.models.filter(m=>m.file===file).flatMap(m=>Object.values(m.qualityFiles??{})))) {
  const v=await read(variant), vp=v.json.meshes[0].primitives[0];
  for(const attribute of ['POSITION','NORMAL','TEXCOORD_0']) if(hash(Buffer.from(v.accessor(vp.attributes[attribute]).buffer))!==hash(Buffer.from(src.accessor(p.attributes[attribute]).buffer)))throw Error('Quality geometry differs: '+variant);
  if(hash(Buffer.from(v.accessor(vp.indices).buffer))!==hash(Buffer.from(src.accessor(p.indices).buffer)))throw Error('Quality indices differ');
 }
 const levels=[];
 for(const [ratio,error] of [[0.5,0.003],[0.2,0.006],[0.1,0.01]]) {
  const [result,actualError]=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,attrs,5,[1,1,1,2,2],null,Math.floor(indices.length*ratio/3)*3,error,['LockBorder']);
  const [remap, unique] = MeshoptEncoder.reorderMesh(result, true, false);
  const inverse = new Uint32Array(unique);
  for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) inverse[remap[i]] = i;
  for (let i = 0; i < result.length; i++) result[i] = inverse[result[i]];
  const dest=`models/lod/${name.slice(0,-4)}-${Math.round(ratio*100)}.bin`;
  await fs.mkdir(path.dirname(path.join(root,dest)),{recursive:true});
  await fs.writeFile(path.join(root,dest),Buffer.from(result.buffer,result.byteOffset,result.byteLength));
  levels.push({file:dest,triangles:result.length/3,error:actualError});
 }
 const lod={vertexCount:pos.length/3,sourceTriangles:indices.length/3,levels};
 for(const m of manifest.models)if(m.file===file)m.lod=lod;
 report.push({file,originalHash:hash(src.bytes),geometryHash,...lod});
 console.log(JSON.stringify(report.at(-1)));
}
manifest.assetDependencies=[...new Set([...(manifest.assetDependencies??[]),...report.flatMap(r=>r.levels.map(l=>l.file))])];
if (await fs.readFile(path.join(root, 'scene.json'), 'utf8') !== manifestSource) throw Error('场景配置在生成期间已改变，请重试');
await fs.writeFile(path.join(root,'scene.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile('work/lod-2026-11-15/generation.json',JSON.stringify(report,null,2)+'\n');
