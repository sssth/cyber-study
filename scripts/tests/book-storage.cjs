const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { backup, readBook, readLibrary, publishBook } = require('../../electron/bookStorage.cjs');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'book-storage-'));
  try {
    const metadata = { id: 'local:legacy:10', title: '旧书', author: '作者', source: '旧书.txt' };
    const content = '# 旧书\n\n## 第一章\n正文<u>划线</u>。';
    const original = Buffer.from('原件');
    await fs.writeFile(path.join(directory, 'book.json'), JSON.stringify(metadata));
    await fs.writeFile(path.join(directory, 'book.md'), content);
    await fs.writeFile(path.join(directory, 'original.txt'), original);
    assert.equal((await readBook(directory)).content, content);
    const record = JSON.parse(await fs.readFile(path.join(directory, 'book.json')));
    assert.equal(record.schemaVersion, 2);
    const { createdAt, ...migratedMetadata } = record.book;
    assert.deepEqual(migratedMetadata, metadata);
    assert.equal(createdAt, (await fs.stat(directory)).birthtime.toISOString());
    assert.equal(record.files.length, 2);
    assert.equal((await readBook(directory)).id, metadata.id);
    const snapshots = await fs.readdir(path.join(directory, 'migration-backup'));
    assert.equal(snapshots.length, 2);
    assert.equal(await fs.readFile(path.join(directory, 'migration-backup', snapshots.find(name => name.startsWith('book.md-'))), 'utf8'), content);
    await publishBook(directory, metadata, content + '新增正文');
    assert.equal((await readBook(directory)).content, content + '新增正文');
    assert.deepEqual(await fs.readFile(path.join(directory, 'original.txt')), original);
    await backup(directory, 'legacy.json', '{"notes":[]}');
    await backup(directory, 'legacy.json', '{"notes":[]}');
    assert.equal((await fs.readdir(path.join(directory, 'migration-backup'))).length, 3);
    // Recover the exact pre-migration metadata and text from verified backups.
    for (const name of ['book.json', 'book.md']) {
      await fs.copyFile(path.join(directory, 'migration-backup', snapshots.find(file => file.startsWith(name + '-'))), path.join(directory, name));
    }
    assert.equal((await readBook(directory)).content, content);
    const library = path.join(directory, 'library');
    const healthy = path.join(library, 'a'.repeat(64));
    const damaged = path.join(library, 'b'.repeat(64));
    await fs.mkdir(healthy, { recursive: true });
    await fs.mkdir(damaged);
    await publishBook(healthy, metadata, content);
    await fs.writeFile(path.join(damaged, 'book.json'), '{');
    await fs.mkdir(path.join(library, 'c'.repeat(64)));
    const invalid = path.join(library, 'd'.repeat(64));
    await fs.mkdir(invalid);
    await fs.writeFile(path.join(invalid, 'book.json'), JSON.stringify({ schemaVersion: 2, book: {} }));
    await fs.writeFile(path.join(invalid, 'book.md'), content);
    const report = await readLibrary(library);
    assert.deepEqual(report.books.map(book => book.id), [metadata.id]);
    assert.deepEqual(report.failures.map(failure => failure.directory).sort(), ['b'.repeat(64), 'd'.repeat(64)]);
    console.log('旧书迁移、重复加载、原件保护、快照去重和备份恢复通过。');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
