const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MemoryRepository } = require('./repository.cjs');
const { metadata } = require('./metadata.cjs');
const decode = async bytes => {
  if (bytes.toString() === 'bad') throw new Error('decode failure');
  return { preview: Buffer.from('preview'), thumb: Buffer.from('thumb') };
};
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-globe-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, repo: new MemoryRepository(path.join(root, 'library'), decode) };
}
test('import, duplicate detection, reopen, confirm location, trash and restore preserve records', async t => {
  const { root, repo } = await fixture(t);
  const { record } = await repo.add(Buffer.from('photo'));
  assert.equal(record.locationStatus, 'pending');
  assert.equal(record.date, '');
  assert.equal((await repo.add(Buffer.from('photo'))).skipped, true);
  await repo.update([record.id], { latitude: 0, longitude: 0, locationStatus: 'confirmed', caption: 'equator' });
  await repo.update([record.id], { deletedAt: true });
  const reopened = new MemoryRepository(path.join(root, 'library'), decode);
  assert.equal((await reopened.load()).photos[0].latitude, 0);
  assert.equal((await reopened.add(Buffer.from('photo'))).inTrash, true);
  await reopened.update([record.id], { deletedAt: null });
  assert.equal((await reopened.load()).photos[0].caption, 'equator');
  assert.equal((await reopened.load()).photos[0].locationStatus, 'confirmed');
});
test('migration is idempotent and never accepts legacy random coordinates', async t => {
  const { repo } = await fixture(t);
  const record = (await repo.add(Buffer.from('old'), { latitude: 34, longitude: 99, date: '2025-01-02' }, 'legacy-1')).record;
  assert.equal(record.latitude, null);
  assert.equal(record.locationStatus, 'pending');
  assert.equal((await repo.add(Buffer.from('old'), {}, 'legacy-1')).skipped, true);
  assert.equal((await repo.load()).photos.length, 1);
});
test('invalid coordinates and decode failure never change manifest', async t => {
  const { repo } = await fixture(t);
  const { record } = await repo.add(Buffer.from('good'));
  await assert.rejects(repo.add(Buffer.from('bad')));
  await assert.rejects(repo.update([record.id], { latitude: 91, longitude: 0, locationStatus: 'confirmed' }));
  assert.equal((await repo.load()).photos.length, 1);
  assert.equal((await repo.load()).photos[0].locationStatus, 'pending');
});
test('full backup restores into empty library, preserves trash, and merges without overwriting edits', async t => {
  const { root, repo } = await fixture(t);
  const { record } = await repo.add(Buffer.from('original'));
  await repo.update([record.id], { caption: 'backed up', deletedAt: true });
  const folder = await repo.backup(root);
  const target = new MemoryRepository(path.join(root, 'restored'), decode);
  assert.equal((await target.restore(folder)).added, 1);
  assert.deepEqual(await fs.readFile(target.asset(record.hash, 'original')), Buffer.from('original'));
  assert.ok((await target.load()).photos[0].deletedAt);
  await target.update([record.id], { caption: 'newer edit' });
  assert.equal((await target.restore(folder)).added, 0);
  assert.equal((await target.load()).photos[0].caption, 'newer edit');
});
test('damaged backup and path traversal hash rejected without changing library', async t => {
  const { root, repo } = await fixture(t);
  const { record } = await repo.add(Buffer.from('original'));
  const folder = await repo.backup(root);
  const before = await repo.load();
  await fs.writeFile(path.join(folder, 'assets', `${record.hash}.original`), 'tampered');
  await assert.rejects(repo.restore(folder));
  assert.deepEqual(await repo.load(), before);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'library.json')));
  manifest.photos[0].hash = '../../secret';
  await fs.writeFile(path.join(folder, 'library.json'), JSON.stringify(manifest));
  await assert.rejects(repo.restore(folder));
  assert.deepEqual(await repo.load(), before);
});
test('unreadable manifest is not silently replaced by an empty library', async t => {
  const { repo } = await fixture(t);
  await repo.load();
  await fs.writeFile(path.join(repo.root, 'library.json'), '{broken');
  await assert.rejects(repo.add(Buffer.from('photo')));
  assert.equal(await fs.readFile(path.join(repo.root, 'library.json'), 'utf8'), '{broken');
});
test('malformed or absent EXIF stays unknown', () => {
  for (const data of [Buffer.alloc(0), Buffer.from('png'), Buffer.from('ffd8ffe1ffff', 'hex')]) assert.deepEqual(metadata(data), {});
});
test('JPEG EXIF captures date and southern/western GPS coordinates', () => {
  const tiff = Buffer.alloc(220);
  tiff.write('II'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  const entry = (at, tag, type, count, value) => { tiff.writeUInt16LE(tag, at); tiff.writeUInt16LE(type, at + 2); tiff.writeUInt32LE(count, at + 4); tiff.writeUInt32LE(value, at + 8); };
  tiff.writeUInt16LE(2, 8); entry(10, 0x8769, 4, 1, 40); entry(22, 0x8825, 4, 1, 70);
  tiff.writeUInt16LE(1, 40); entry(42, 0x9003, 2, 20, 130); tiff.write('2024:03:12 11:22:33\0', 130);
  tiff.writeUInt16LE(4, 70); entry(72, 1, 2, 2, 83); entry(84, 2, 5, 3, 152); entry(96, 3, 2, 2, 87); entry(108, 4, 5, 3, 176);
  for (const [offset, values] of [[152, [33, 30, 0]], [176, [70, 15, 0]]]) values.forEach((v, i) => { tiff.writeUInt32LE(v, offset + i * 8); tiff.writeUInt32LE(1, offset + i * 8 + 4); });
  const header = Buffer.from('ffd8ffe10000457869660000', 'hex'); header.writeUInt16BE(tiff.length + 8, 4);
  assert.deepEqual(metadata(Buffer.concat([header, tiff])), { date: '2024-03-12', latitude: -33.5, longitude: -70.25 });
});

test('photo-free points and ordered journeys survive trash, backup and restore', async t => {
  const {root, repo} = await fixture(t);
  const {record} = await repo.add(Buffer.from('trip photo'));
  await repo.savePoint({location:'京都', visitStatus:'wish', latitude:35, longitude:135, country:'日本', city:'京都'});
  const point = (await repo.load()).photos.find(p => p.hash === null);
  assert.equal(point.visitStatus, 'wish');
  await repo.saveJourney({title:'京都旅行', note:'两站', pointIds:[point.id, record.id]});
  await repo.update([point.id], {deletedAt:true});
  const backup = await repo.backup(root);
  const restored = new MemoryRepository(path.join(root,'new-library'), decode);
  await restored.restore(backup);
  const data = await restored.load();
  assert.deepEqual(data.journeys[0].pointIds, [point.id, record.id]);
  assert.ok(data.photos.find(p => p.id === point.id).deletedAt);
  await restored.update([point.id], {deletedAt:null});
  await restored.saveJourney({id:data.journeys[0].id, remove:true});
  assert.equal((await restored.load()).photos.length, 2);
});
