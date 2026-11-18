const { app, ipcMain, dialog, nativeImage, protocol } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { MemoryRepository, hash } = require('./repository.cjs');
function registerGlobe(getWindow) {
  const repo = new MemoryRepository(path.join(app.getPath('userData'), 'memory-globe'), async bytes => {
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw new Error('无法解码照片，请转换为 JPEG、PNG 或 WebP 后重试。');
    const { width, height } = image.getSize();
    const resize = max => image.resize(width >= height ? { width: Math.min(max, width) } : { height: Math.min(max, height) }).toJPEG(88);
    return { preview: resize(1800), thumb: resize(360) };
  });
  let busy = false;
  const snapshot = async () => {
    const data = await repo.load();
    return { journeys: data.journeys ?? [], photos: data.photos.map(p => ({
      ...p, visitStatus: p.visitStatus ?? 'visited',
      photo: p.hash ? `study-memory://photo/${p.hash}.preview` : '',
      thumbnail: p.hash ? `study-memory://photo/${p.hash}.thumb` : ''
    })) };
  };
  ipcMain.handle('globe:request', async (event, action, input = {}) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) return { error: '无法访问记忆库。' };
    // The repository publishes its index by atomic rename. Readers can use the
    // last committed snapshot while another read or mutation is in progress.
    const reading = action === 'list';
    if (!reading && busy) return { error: '记忆库正在处理上一项操作，请稍后重试。' };
    if (!reading) busy = true;
    try {
      if (reading) return await snapshot();
      if (action === 'update') { await repo.update(input.ids, input.patch); return await snapshot(); }
      if (action === 'journey') { await repo.saveJourney(input); return await snapshot(); }
      if (action === 'point') {
        let bytes;
        if (input.attach) {
          const selection = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'], filters: [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] }] });
          if (selection.canceled) return { canceled: true };
          const file = selection.filePaths[0];
          const info = await fs.stat(file);
          if (!info.isFile() || info.size > 80 * 1024 * 1024) throw new Error('请选择 80 MB 以内的照片。');
          bytes = await fs.readFile(file);
        }
        await repo.savePoint(input, bytes);
        return await snapshot();
      }
      if (action === 'migrate') {
        const records = input.records;
        if (!Array.isArray(records)) throw new Error('旧记录格式无效。');
        const report = [];
        for (let index = 0; index < records.length; index++) {
          const old = records[index];
          try {
            if (typeof old.photo !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(old.photo) || old.photo.length > 112 * 1024 * 1024) throw new Error('旧照片内容无效。');
            const migrationKey = hash(Buffer.from(JSON.stringify(old)));
            const result = await repo.add(Buffer.from(old.photo.split(',')[1], 'base64'), {
              location: String(old.location || ''), caption: String(old.caption || ''), date: String(old.date || ''), dateSource: old.dateSource || 'legacy-unconfirmed', createdAt: old.createdAt || new Date().toISOString()
            }, migrationKey);
            report.push({ name: `旧照片 ${index + 1}`, status: result.skipped ? '已迁移' : '成功' });
          } catch (error) { report.push({ name: `旧照片 ${index + 1}`, status: '失败', reason: error.message }); }
        }
        return { ...await snapshot(), report };
      }
      if (action === 'import') {
        const selection = await dialog.showOpenDialog(getWindow(), { title: input.folder ? '选择照片文件夹' : '选择照片', properties: input.folder ? ['openDirectory'] : ['openFile', 'multiSelections'], filters: [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] }] });
        if (selection.canceled) return { canceled: true };
        const files = [], report = [];
        const walk = async folder => {
          for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) await walk(file);
            else if (entry.isFile() && /\.(jpe?g|png|webp|heic|heif)$/i.test(entry.name)) files.push(file);
          }
        };
        if (input.folder) await walk(selection.filePaths[0]); else files.push(...selection.filePaths);
        for (let index = 0; index < files.length; index++) {
          const file = files[index], name = path.basename(file);
          event.sender.send('globe:progress', { done: index, total: files.length, name });
          try {
            const info = await fs.stat(file);
            if (!info.isFile() || info.size > 80 * 1024 * 1024) throw new Error('文件不可用或超过 80 MB。');
            const result = await repo.add(await fs.readFile(file), { filename: name, originalPath: file });
            report.push({ name, status: result.skipped ? '重复，已跳过' : '成功', reason: result.inTrash ? '已有照片在回收站，可恢复。' : '' });
          } catch (error) { report.push({ name, status: '失败', reason: error.code ? '文件读取或保存失败，请检查空间和文件权限。' : error.message }); }
        }
        event.sender.send('globe:progress', { done: files.length, total: files.length, name: '' });
        return { ...await snapshot(), report };
      }
      if (action === 'backup' || action === 'restore') {
        const selection = await dialog.showOpenDialog(getWindow(), { title: action === 'backup' ? '选择备份保存位置（包含原图和精确坐标）' : '选择记忆地球备份文件夹', properties: ['openDirectory', 'createDirectory'] });
        if (selection.canceled) return { canceled: true };
        if (action === 'backup') return { backupPath: await repo.backup(selection.filePaths[0]) };
        const result = await repo.restore(selection.filePaths[0]);
        return { ...result, ...await snapshot() };
      }
      throw new Error('不支持的记忆库操作。');
    } catch (error) { return { error: error.code ? '记忆库读写失败，请检查文件权限、备份和可用空间。' : error.message }; }
    finally { if (!reading) busy = false; }
  });
  return () => protocol.handle('study-memory', async request => {
    const url = new URL(request.url);
    const match = /^\/([a-f0-9]{64})\.(preview|thumb)$/.exec(url.pathname);
    if (request.method !== 'GET' || url.host !== 'photo' || !match) return new Response(null, { status: 404 });
    try { return new Response(await fs.readFile(repo.asset(match[1], match[2])), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } }); }
    catch { return new Response(null, { status: 404 }); }
  });
}
module.exports = { registerGlobe };
