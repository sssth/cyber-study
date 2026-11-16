import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {validatePackage} from '../../src/scenes/packages/validatePackage.js';
const require=createRequire(import.meta.url);
const {MemoryRepository}=require('../../electron/globe/repository.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'cyber-fixture-'));
const repo=new MemoryRepository(workspace,async bytes=>({preview:bytes,thumb:bytes}));
const valid=path.join(root,'11_备份恢复/地球仪_有效');
assert.equal((await repo.restore(valid)).added,4);
assert.equal((await repo.restore(valid)).added,0);
const before=await repo.load();assert.equal(before.photos.filter(p=>p.deletedAt).length,1);
assert.equal(before.photos.filter(p=>p.locationStatus==='pending').length,1);
for(const name of ['地球仪_缺原图','地球仪_版本错误']){
 await assert.rejects(()=>repo.restore(path.join(root,'11_备份恢复',name)));
 assert.deepEqual(await repo.load(),before);
}
validatePackage(JSON.parse(await fs.readFile(path.join(root,'12_场景包/正常功能阵列/scene.json'),'utf8')));
for(const name of ['重复ID','路径越界','非法视野'])assert.throws(()=>validatePackage(JSON.parse(require('node:fs').readFileSync(path.join(root,'12_场景包/异常',name,'scene.json'),'utf8'))));
validatePackage(JSON.parse(await fs.readFile(path.join(root,'12_场景包/异常/缺失模型/scene.json'),'utf8')));
console.log('通过：备份首次与幂等恢复、删除/待确认状态、错误备份保留现状、正常场景及三种结构拒绝；缺失模型需加载器运行验证。');
await fs.rm(workspace,{recursive:true,force:true});
