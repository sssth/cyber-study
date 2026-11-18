const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const markdownName = /\.(?:md|markdown)$/i;

function snapshotStore(root) {
  const directory = path.join(root, '快照保存');
  async function prepare() {
    await fs.mkdir(directory, { recursive:true });
    if (!(await fs.lstat(directory)).isDirectory()) throw Error('快照目录不可用。');
  }
  return {
    async list() {
      await prepare();
      return (await fs.readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile() && markdownName.test(entry.name)).map(entry=>entry.name).sort().reverse();
    },
    async read(name) {
      if (typeof name !== 'string' || /[\\/:\0]/.test(name) || !markdownName.test(name)) throw Error('无效的快照名称。');
      await prepare();
      const file=path.join(directory,name);
      if (!(await fs.lstat(file)).isFile()) throw Error('快照不是普通文件。');
      const handle=await fs.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try { return await handle.readFile('utf8'); } finally { await handle.close(); }
    },
    async save({markdown,time}) {
      if(typeof markdown!=='string' || !markdown.trim()) throw Error('快照为空。');
      const date=new Date(time);
      if (!Number.isFinite(date.getTime())) throw Error('快照时间无效。');
      const stamp=date.toLocaleDateString('sv-SE')+'_'+date.toTimeString().slice(0,8).replaceAll(':','');
      await prepare();
      for(let index=1;;index++){
        const name='书房快照_'+stamp+(index===1?'':'_'+String(index).padStart(2,'0'))+'.md';
        const file=path.join(directory,name);
        let handle;
        try { handle=await fs.open(file,'wx',0o600); } catch(error){ if(error.code==='EEXIST') continue; throw error; }
        try { await handle.writeFile(markdown); } catch(error){ await handle.close(); await fs.unlink(file); throw error; }
        await handle.close(); return name;
      }
    }
  };
}
module.exports={snapshotStore};
