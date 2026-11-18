import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
export async function prepareReleaseParts(zip) {
 const size=(await fs.stat(zip)).size;
 if(size<2*1024**3)return;
 const chunk=1500*1000**2;
 // Copy tail first, then truncate the original to avoid a second full-size copy.
 const parts=[];
 for(let start=chunk,index=2;start<size;start+=chunk,index++) {
  const target=zip+'.'+String(index).padStart(3,'0');
  await pipeline(createReadStream(zip,{start,end:Math.min(start+chunk,size)-1}),createWriteStream(target));
  parts.push(path.basename(target));
 }
 await fs.truncate(zip,chunk);await fs.rename(zip,zip+'.001');parts.unshift(path.basename(zip+'.001'));
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
 const cmd='#!/bin/zsh\nset -e\ncd "$(dirname "$0")"\ncat '+parts.map(quote).join(' ')+' > '+quote(path.basename(zip))+'.tmp\nmv '+quote(path.basename(zip))+'.tmp '+quote(path.basename(zip))+'\necho "合并完成，请解压 ZIP。"\n';
 const script=path.join(path.dirname(zip),'合并完整画质包.command');await fs.writeFile(script,cmd,{mode:0o755});
 await fs.writeFile(path.join(path.dirname(zip),'分卷说明.md'),'# 完整画质版上传与下载\n\n上传所有 .zip.001、.zip.002 等分卷，以及「合并完整画质包.command」。每份均低于 GitHub Release 单文件限制。\n\n下载者将全部分卷和合并脚本放在同一文件夹，双击脚本，生成完整 ZIP 后解压。分卷不能单独解压。\n');
 console.log('完整版超过 GitHub 单文件限制，已生成分卷：',parts.join(', '));
}
