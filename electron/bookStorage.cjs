const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const hash = (value) => createHash('sha256').update(value).digest('hex');

async function atomicWrite(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function backup(directory, name, data) {
  const destination = path.join(directory, 'migration-backup');
  await fs.mkdir(destination, { recursive: true });
  const bytes = Buffer.from(data);
  const filename = path.join(destination, `${name}-${hash(bytes)}`);
  try {
    await fs.writeFile(filename, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!(await fs.readFile(filename)).equals(bytes)) throw new Error('迁移备份校验失败。');
}

async function describeFiles(directory) {
  const files = [];
  for (const name of await fs.readdir(directory)) {
    if (name !== 'book.md' && !/^original\.(md|markdown|txt|pdf)$/i.test(name)) continue;
    const bytes = await fs.readFile(path.join(directory, name));
    const stat = await fs.stat(path.join(directory, name));
    files.push({
      id: hash(name), role: name === 'book.md' ? 'reading' : 'original',
      path: name, format: path.extname(name).slice(1),
      sha256: hash(bytes), size: stat.size, modifiedAt: stat.mtime.toISOString()
    });
  }
  return files;
}

function conversionFields(files,bookId){const reference=role=>{const file=files?.find(f=>f.role===role);return file?`${bookId}:${file.id}`:null;};return {originalFormat:files?.find(f=>f.role==='original')?.format||null,readingFormat:'markdown',parseStatus:'ready',originalAssetId:reference('original'),readingAssetId:reference('reading')};}
async function publishBook(directory, metadata, content) {
  await atomicWrite(path.join(directory, 'book.md'), content);
  const record = {
    schemaVersion: 2,
    book: { id: metadata.id, title: metadata.title, author: metadata.author, source: metadata.source },
    files: await describeFiles(directory)
  };
  await atomicWrite(path.join(directory, 'book.json'), JSON.stringify(record, null, 2));
  return { ...record.book, ...conversionFields(record.files,record.book.id), content, markdownFile: true };
}

async function readBook(directory) {
  const filename = path.join(directory, 'book.json');
  const raw = await fs.readFile(filename);
  const metadata = JSON.parse(raw);
  if (metadata.schemaVersion && metadata.schemaVersion !== 2) throw new Error('书库数据版本不受支持。');
  const content = await fs.readFile(path.join(directory, 'book.md'), 'utf8');
  if (metadata.schemaVersion === 2) return { ...metadata.book, ...conversionFields(metadata.files,metadata.book.id), content, markdownFile: true };
  await backup(directory, 'book.json', raw);
  await backup(directory, 'book.md', content);
  const record = {
    schemaVersion: 2,
    book: { id: metadata.id, title: metadata.title, author: metadata.author, source: metadata.source },
    files: await describeFiles(directory)
  };
  await atomicWrite(filename, JSON.stringify(record, null, 2));
  await atomicWrite(path.join(directory, 'migration.json'), JSON.stringify({
    from: 1, to: 2, status: 'complete', bookId: metadata.id,
    completedAt: new Date().toISOString(), backup: 'migration-backup'
  }, null, 2));
  return { ...record.book, ...conversionFields(record.files,record.book.id), content, markdownFile: true };
}

async function renameBook(directory, title) {
  const book = await readBook(directory);
  const filename = path.join(directory, 'book.json');
  const record = JSON.parse(await fs.readFile(filename, 'utf8'));
  await atomicWrite(filename, JSON.stringify({ ...record, book: { ...record.book, title } }, null, 2));
  return { ...book, title };
}

module.exports = { atomicWrite, backup, readBook, publishBook, renameBook };
