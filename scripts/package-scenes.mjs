import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { selectScene, writeIndependentScene } from './independent-scene.mjs';
import { validatePackage } from '../src/scenes/packages/validatePackage.js';
import { sceneAssets } from '../src/scenes/packages/presentation.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await fs.readFile(path.join(root,'scene.config.json'),'utf8'));
const source=path.resolve(root,config.sceneFolder);
const original=validatePackage(JSON.parse(await fs.readFile(path.join(source,'scene.json'),'utf8')));
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const output=path.join(root,'场景发布包',date);await fs.mkdir(output,{recursive:true});
const report=[];
for(const tier of ['low','full']) {
 const edition=tier==='low'?'低画质版':'完整版';
 const name=`Loft-v0.2-场景包-${edition}`;
 const folder=path.join(output,name);
 // Regenerate only this script's named scene output.
 await fs.rm(folder,{recursive:true,force:true});await fs.mkdir(folder,{recursive:true});
 const scene=selectScene(original,tier);
 await writeIndependentScene(scene,source,folder);
 validatePackage(scene);
 let bytes=0;
 for(const f of sceneAssets(scene)) bytes+=(await fs.stat(path.join(folder,f))).size;
 const zip=path.join(output,`${name}.zip`);
 await fs.rm(zip,{force:true});
 const result=spawnSync('/usr/bin/ditto',['-c','-k','--norsrc','--keepParent',folder,zip],{stdio:'inherit'});
 if(result.status!==0)throw result.error??Error('场景压缩失败');
 report.push({版本:edition,目录:name,压缩包:path.basename(zip),资源字节:bytes,ZIP字节:(await fs.stat(zip)).size});
 console.log(JSON.stringify(report.at(-1)));
}
await fs.writeFile(path.join(output,'场景包清单.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(output,'上传与使用说明.md'),`# GitHub 场景资源发布\n\n这里仅含场景资源，不含 APP、Electron、应用源码或用户数据。\n\n上传两个 ZIP：\n- Loft-v0.2-场景包-低画质版.zip：仅低画质所需独立资源。\n- Loft-v0.2-场景包-完整版.zip：低、中、高三档资源。\n\n解压后，每个文件夹直接包含 scene.json、models、textures、sounds。将文件夹放入项目场景包目录，并让 scene.config.json 中的 sceneFolder 指向它。应用默认低画质启动，完整版可手动切换画质。\n\n源码仓库与资源文件分开保存；ZIP 用于 GitHub Release 附件，不提交到源码仓库。\n`);
