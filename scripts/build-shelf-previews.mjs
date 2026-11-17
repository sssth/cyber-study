// Build self-contained previews from existing LOD geometry and 1024px textures.
// No source geometry, source textures or room quality settings are modified.
import fs from 'node:fs/promises';
import path from 'node:path';
const config=JSON.parse(await fs.readFile('scene.config.json','utf8'));
const root=path.resolve(config.sceneFolder), manifestPath=path.join(root,'scene.json');
const source=await fs.readFile(manifestPath,'utf8'), manifest=JSON.parse(source);
const ids=new Set(['shelf','F26','music','movie','stone','headphones','R5-crystal-study','P30','stone-reading','R5-crystal-reading']);
const models=manifest.models.filter(m=>ids.has(m.id));
const reports=[];
for(const file of new Set(models.map(m=>m.file))) {
 const model=models.find(m=>m.file===file), input=model.qualityFiles?.low;
 if(!input || !model.lod)throw Error(`Missing preview source: ${file}`);
 const bytes=await fs.readFile(path.join(root,input)), n=bytes.readUInt32LE(12);
 const json=JSON.parse(bytes.subarray(20,20+n));
 if(json.meshes.length!==1 || json.meshes[0].primitives.length!==1)throw Error('Expected single primitive');
 const buffers=await Promise.all(json.buffers.map(b=>b.uri?fs.readFile(path.resolve(root,path.dirname(input),b.uri)):bytes.subarray(28+n)));
 const primitive=json.meshes[0].primitives[0];
 const lod=model.lod.levels[1] ?? model.lod.levels[0];
 const lodBytes=await fs.readFile(path.join(root,lod.file));
 const indices=new Uint32Array(Uint8Array.from(lodBytes).buffer);
 const unique=[...new Set(indices)], mapping=new Map(unique.map((v,i)=>[v,i]));
 const chunks=[], views=[];let offset=0;
 const append=data=>{const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;} const i=views.length;views.push({buffer:0,byteOffset:offset,byteLength:data.byteLength});chunks.push(data);offset+=data.byteLength;return i;};
 const accessors=[];
 for(const [name,index] of Object.entries(primitive.attributes)) {
  const a=json.accessors[index], view=json.bufferViews[a.bufferView];
  if(a.sparse || view.byteStride || a.componentType!==5126)throw Error(`Unsupported attribute ${name}`);
  const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type], stride=width*4;
  const buffer=buffers[view.buffer], start=(view.byteOffset??0)+(a.byteOffset??0);
  const compact=Buffer.alloc(unique.length*stride);
  unique.forEach((old,i)=>{if(old>=a.count)throw Error('LOD vertex outside source');buffer.copy(compact,i*stride,start+old*stride,start+(old+1)*stride);});
  primitive.attributes[name]=accessors.length;
  accessors.push({...a,bufferView:append(compact),byteOffset:0,count:unique.length});
 }
 const remapped=Uint32Array.from(indices,i=>mapping.get(i));
 primitive.indices=accessors.length;
 accessors.push({bufferView:append(Buffer.from(remapped.buffer)),componentType:5125,count:indices.length,type:'SCALAR'});
 for(const image of json.images??[]) {
  const v=json.bufferViews[image.bufferView],start=v.byteOffset??0;
  image.bufferView=append(buffers[v.buffer].subarray(start,start+v.byteLength));
 }
 json.accessors=accessors;json.bufferViews=views;json.buffers=[{byteLength:offset}];
 const body=Buffer.concat(chunks);const bodyPad=Buffer.alloc((4-body.length%4)%4);
 const metadata=Buffer.from(JSON.stringify(json));const metaPad=Buffer.alloc((4-metadata.length%4)%4,32);
 const j=Buffer.concat([metadata,metaPad]), bin=Buffer.concat([body,bodyPad]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 const previewFile=`models/previews/${path.basename(file)}`;
 await fs.mkdir(path.join(root,'models/previews'),{recursive:true});
 const output=Buffer.concat([header,j,binHeader,bin]);await fs.writeFile(path.join(root,previewFile),output);
 for(const m of models.filter(m=>m.file===file))m.previewFile=previewFile;
 reports.push({file,originalBytes:(await fs.stat(path.join(root,file))).size,previewBytes:output.length,triangles:indices.length/3});
}
if(await fs.readFile(manifestPath,'utf8')!==source)throw Error('Scene changed during generation');
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
