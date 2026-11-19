const { app, dialog, ipcMain, shell } = require('electron');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify, TextDecoder } = require('node:util');

const { atomicWrite, backup, readBook, publishBook, renameBook } = require('./bookStorage.cjs');
const { retiredBookIds } = require('./defaultSamples.cjs');

const run = promisify(execFile);
const extensions = new Set(['.md', '.markdown', '.txt', '.pdf']);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const library = () => path.join(app.getPath('userData'), 'books');
const bookDirectory = (id) => path.join(library(), hash(id));

const installer = process.platform === 'win32' ? '安装 PDF 转换组件.cmd' : '安装 PDF 转换组件.command';

async function pythonCandidates(dependencies) {
  const configuredPython = await fs.readFile(path.join(dependencies, '.python-path'), 'utf8')
    .then((value) => value.trim(), () => '');
  const explicit = [process.env.CYBER_STUDY_PYTHON, configuredPython].filter(Boolean);
  if (explicit.length) return explicit;
  return process.platform === 'win32' ? ['python', 'py'] : ['python3'];
}

async function convertPdf(original) {
  const dependencies = path.join(app.getPath('userData'), 'pdf-text-deps');
  let failure;
  for (const python of await pythonCandidates(dependencies)) {
    try {
      const { stdout } = await run(python, [path.join(__dirname, 'book_pdf.py'), original], {
        env: { ...process.env, PYTHONPATH: dependencies, PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1' },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 5 * 60 * 1000
      });
      return stdout.trim();
    } catch (error) {
      failure = error;
      // 只有「找不到解释器」才继续尝试下一个候选，其他错误直接抛出。
      if (error.code !== 'ENOENT') break;
    }
  }
  const error = failure ?? new Error('未找到 Python。');
  if (error.code === 'ENOENT' || error.stderr?.includes('ModuleNotFoundError')) {
    throw new Error(`PDF 转换组件未安装，请运行「${installer}」。`);
  }
  if (error.killed) throw new Error('PDF 转换超过 5 分钟。');
  throw new Error(error.code === 2 && error.stderr?.trim() ? error.stderr.trim() : '无法提取 PDF 正文，请检查文件。');
}


function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030', { fatal: true }).decode(bytes);
  }
}

async function toMarkdown(bytes, original, extension, title) {
  if (extension !== '.pdf') {
    const content = decodeText(bytes).replace(/\r\n?/g, '\n');
    if (!content.trim()) throw new Error('文件没有正文。');
    return content;
  }

  const body = await convertPdf(original);
  return `# ${title}\n\n${body}\n`;
}

async function listBooks() {
  await fs.mkdir(library(), { recursive: true });
  const folders = await fs.readdir(library(), { withFileTypes: true });
  const books = [];
  for (const folder of folders) {
    if (!folder.isDirectory() || !/^[a-f0-9]{64}$/.test(folder.name)) continue;
    try {
      const book = await readBook(path.join(library(), folder.name));
      if (!retiredBookIds.has(book.id)) books.push(book);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return books;
}

async function* walk(directory, onError) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    onError(directory);
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(filename, onError);
    else if (entry.isFile()) yield filename;
  }
}

async function importBook(filename, source) {
  const extension = path.extname(filename).toLowerCase();
  const bytes = await fs.readFile(filename);
  const id = `file:${hash(bytes)}`;
  const directory = bookDirectory(id);
  try {
    await readBook(directory);
    return { status: 'duplicate', source };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(directory, { recursive: true });
  const original = path.join(directory, `original${extension}`);
  await atomicWrite(original, bytes);
  const name = path.basename(filename, path.extname(filename)).replace(/[\r\n]/g, ' ');
  const content = await toMarkdown(bytes, original, extension, name);
  const metadata = {
    id, source,
    title: content.match(/^# (.+)$/m)?.[1].trim() || name,
    author: content.match(/^作者：(.+)$/m)?.[1].trim() || ''
  };
  await publishBook(directory, metadata, content);
  return { status: 'imported', source };
}

async function chooseBooks(window, folder, update) {
  const options = folder
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile', 'multiSelections'], filters: [{ name: '书籍文件', extensions: [...extensions].map((ext) => ext.slice(1)) }] };
  const picked = await dialog.showOpenDialog(window, options);
  if (picked.canceled) {
    update({ phase: 'idle' });
    return;
  }

  update({ phase: 'scanning' });
  const root = folder ? picked.filePaths[0] : null;
  const sourceFor = (file) => root ? path.relative(root, file) || path.basename(root) : path.basename(file);
  const issues = [];
  const files = root ? walk(root, (dir) => issues.push({ source: sourceFor(dir), error: '无法读取此文件夹。' })) : picked.filePaths;
  const candidates = [];
  const counts = { markdown: 0, txt: 0, pdf: 0 };
  let skipped = 0;
  for await (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (!extensions.has(extension)) {
      skipped++;
      continue;
    }
    const type = extension === '.txt' ? 'txt' : extension === '.pdf' ? 'pdf' : 'markdown';
    counts[type]++;
    candidates.push({ file, source: sourceFor(file) });
  }

  const total = candidates.length;
  const summary = { total, counts, skipped, issues };
  update({ phase: 'processing', ...summary, processed: 0 });
  const results = [];
  for (const { file, source } of candidates) {
    update({ phase: 'processing', ...summary, processed: results.length, current: source });
    try {
      results.push(await importBook(file, source));
    } catch (error) {
      const message = error.code === 'EACCES' || error.code === 'EPERM' ? '无法访问文件，请检查权限。'
        : error.code === 'ENOENT' ? '文件已移走或删除。'
        : error.code === 'ENOSPC' ? '存储空间不足。'
        : error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA' ? '无法识别文本编码。'
        : error.code ? '无法读取文件或写入书库。' : error.message;
      results.push({ source, status: 'failed', error: message });
    }
  }
  update({ phase: 'complete', ...summary, results });
}

function registerBooks(getWindow) {
  let pendingOperation = Promise.resolve();
  const handle = (name, operation) => ipcMain.handle(`books:${name}`, (event, ...args) => {
    const window = getWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('无权访问本地书库。');
    }
    if (name === 'import-state') return operation(window, ...args);
    const result = pendingOperation.then(() => operation(window, ...args));
    pendingOperation = result.catch(() => {});
    return result;
  });

  let importState = { phase: 'idle', revision: 0 };
  let pendingSave = Promise.resolve();
  let deleting = false;
  function updateImport(state) {
    importState = { ...state, revision: importState.revision + 1 };
    const sender = getWindow()?.webContents;
    if (sender && !sender.isDestroyed()) sender.send('books:progress', importState);
  }

  handle('import-state', () => importState);
  handle('import', async (window, folder) => {
    if (deleting) throw new Error('请先完成书籍删除。');
    if (['selecting', 'scanning', 'processing'].includes(importState.phase)) return importState;
    updateImport({ phase: 'selecting' });
    try {
      await chooseBooks(window, folder === true, updateImport);
    } catch {
      updateImport({ phase: 'error', error: '无法打开文件选择窗口或完成扫描，请重试。' });
    }
    return importState;
  });
  handle('list', listBooks);
  handle('migrate-legacy', async (_window, payload) => {
    if (!payload || !Array.isArray(payload.books) || typeof payload.storage !== 'object' || !payload.storage) {
      throw new Error('旧书库快照无效。');
    }
    await fs.mkdir(library(), { recursive: true });
    let needsMigration = payload.books.length > 0;
    for (const entry of await fs.readdir(library(), { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      try {
        const record = JSON.parse(await fs.readFile(path.join(library(), entry.name, 'book.json'), 'utf8'));
        if (!record.schemaVersion) needsMigration = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!needsMigration) return [];
    const snapshot = JSON.stringify(payload);
    const migrationDirectory = path.join(app.getPath('userData'), 'book-migrations');
    await fs.mkdir(migrationDirectory, { recursive: true });
    await backup(migrationDirectory, 'legacy.json', snapshot);
    const report = [];
    for (const book of payload.books) {
      try {
        await saveBook(book);
        const existing = await readBook(bookDirectory(book.id));
        report.push({ id: book.id, status: 'verified', differentContent: existing.content !== book.content });
      } catch (error) {
        report.push({ id: book?.id, status: 'failed', error: error.message });
      }
    }
    await atomicWrite(path.join(migrationDirectory, 'latest-report.json'), JSON.stringify(report, null, 2));
    return report;
  });
  handle('delete', async (window, id) => {
    if (typeof id !== 'string' || !/^(file:[a-f0-9]{64}$|local:.+)/.test(id)) {
      throw new Error('只能删除已导入的书籍。');
    }
    if (deleting || ['selecting', 'scanning', 'processing'].includes(importState.phase)) {
      throw new Error('请等待当前书库操作完成。');
    }
    deleting = true;
    try {
      await pendingSave;
      const directory = bookDirectory(id);
      const book = await readBook(directory);
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        message: `将《${book.title}》移到废纸篓？`,
        detail: '书库中的 Markdown 和随书保存的原件将移到废纸篓。知识库里的摘录和批注会保留。',
        buttons: ['取消', '移到废纸篓'],
        defaultId: 0,
        cancelId: 0
      });
      if (response !== 1) return false;
      await shell.trashItem(directory);
      return true;
    } finally {
      deleting = false;
    }
  });

  async function saveBook(book, previousContent) {
    const { id, title, author, source, content } = book;
    if (typeof id !== 'string' || !/^(file:|local:|sample:)/.test(id) ||
        [title, author, source, content].some((value) => typeof value !== 'string')) {
      throw new Error('书籍信息无效。');
    }
    const directory = bookDirectory(id);
    await fs.mkdir(directory, { recursive: true });
    let existing;
    try {
      existing = await readBook(directory);
    } catch (error) {
      if (error.code !== 'ENOENT' || id.startsWith('file:')) throw error;
    }
    if (existing) {
      if (previousContent === undefined) return existing;
      if (existing.content !== previousContent) throw new Error('Markdown 文件已修改，请重新打开应用后再试。');
      return publishBook(directory, existing, content);
    }
    return publishBook(directory, { id, title, author, source, createdAt:book.createdAt ?? book.importedAt }, content);
  }
  handle('rename', (_window, id, title) => {
    const fields = typeof title === 'object' && title ? title : null;
    if (fields) title = fields.title;
    if (fields && (typeof fields.author !== 'string' || fields.author.length > 500)) throw new Error('作者不能超过 500 个字符。');
    if (deleting || ['selecting', 'scanning', 'processing'].includes(importState.phase)) {
      throw new Error('请等待当前书库操作完成。');
    }
    if (typeof id !== 'string' || !/^(file:|local:)/.test(id) ||
        typeof title !== 'string' || !title.trim() || title.length > 500) {
      throw new Error('书名必须为 1–500 个字符。');
    }
    const result = pendingSave.then(() => renameBook(bookDirectory(id), title.trim(), fields?.author));
    pendingSave = result.catch(() => {});
    return result;
  });
  handle('save', (_window, book, previousContent) => {
    if (deleting) throw new Error('请先完成书籍删除。');
    const result = pendingSave.then(() => saveBook(book, previousContent));
    pendingSave = result.catch(() => {});
    return result;
  });
}

module.exports = { registerBooks };
