const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { metadata } = require('./metadata.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const coordinates = (lat, lon) => typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
async function atomic(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, data, { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
function validate(data) {
  if (data?.version !== 2 || !Array.isArray(data.photos) || !Array.isArray(data.migrations)) throw new Error('记忆库格式不正确，未修改现有数据。');
  const ids = new Set();
  for (const p of data.photos) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || (p.hash != null && !validHash(p.hash)) || typeof p.location !== 'string' || typeof p.caption !== 'string' || typeof p.date !== 'string' || !['pending', 'confirmed'].includes(p.locationStatus) || (p.locationStatus === 'confirmed' && !coordinates(p.latitude, p.longitude))) throw new Error('记忆库记录损坏，未修改现有数据。');
    ids.add(p.id);
  }
  const journeys = data.journeys ?? [];
  if (!Array.isArray(journeys) || new Set(journeys.map(j => j?.id)).size !== journeys.length ||
      journeys.some(j => !j || typeof j.id !== 'string' || typeof j.title !== 'string' || typeof j.note !== 'string' || !Array.isArray(j.pointIds) || j.pointIds.some(id => !ids.has(id)) || new Set(j.pointIds).size !== j.pointIds.length)) throw new Error('旅程记录损坏。');
  return data;
}
class MemoryRepository {
  constructor(root, decode) { this.root = root; this.decode = decode; }
  asset(key, kind) { if (!validHash(key) || !['original', 'preview', 'thumb'].includes(kind)) throw new Error('图片引用无效。'); return path.join(this.root, 'assets', `${key}.${kind}`); }
  async load() {
    await fs.mkdir(path.join(this.root, 'assets'), { recursive: true });
    try { return validate(JSON.parse(await fs.readFile(path.join(this.root, 'library.json'), 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return { version: 2, photos: [], migrations: [] }; throw error; }
  }
  async commit(data) { validate(data); await atomic(path.join(this.root, 'library.json'), JSON.stringify(data, null, 2)); }
  async add(bytes, details = {}, migrationKey = '') {
    if (!bytes.length || bytes.length > 80 * 1024 * 1024) throw new Error('请选择 80 MB 以内的照片。');
    const data = await this.load();
    if (migrationKey && data.migrations.includes(migrationKey)) return { skipped: true };
    const key = hash(bytes);
    const duplicate = data.photos.find(p => p.hash === key);
    if (duplicate && !migrationKey) return { skipped: true, duplicate: duplicate.id, inTrash: Boolean(duplicate.deletedAt) };
    const pictures = await this.decode(bytes);
    for (const [kind, content] of Object.entries({ original: bytes, ...pictures })) await atomic(this.asset(key, kind), content);
    const meta = metadata(bytes);
    const record = { id: randomUUID(), hash: key, location: '', caption: '', date: meta.date || '', dateSource: meta.date ? 'exif' : 'unknown', latitude: meta.latitude ?? null, longitude: meta.longitude ?? null, locationSource: meta.latitude != null ? 'exif' : 'unknown', locationStatus: 'pending', createdAt: new Date().toISOString(), deletedAt: null, ...details };
    // Never accept legacy random longitude as a coordinate.
    if (migrationKey) Object.assign(record, { latitude: null, longitude: null, locationSource: 'unknown', locationStatus: 'pending' });
    data.photos.push(record);
    if (migrationKey) data.migrations.push(migrationKey);
    await this.commit(data);
    return { record };
  }
  async update(ids, patch) {
    const data = await this.load();
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !data.photos.some(p => p.id === id))) throw new Error('照片记录不存在，请刷新后重试。');
    const allowed = ['country', 'region', 'city', 'cityId', 'location', 'caption', 'date', 'dateSource', 'latitude', 'longitude', 'locationSource', 'locationStatus', 'deletedAt'];
    const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
    for (const key of ['location', 'caption', 'date']) if (key in safe && (typeof safe[key] !== 'string' || safe[key].length > 10000)) throw new Error('输入内容无效。');
    if (safe.date && (!/^\d{4}-\d{2}-\d{2}$/.test(safe.date) || Number.isNaN(Date.parse(safe.date)))) throw new Error('拍摄日期无效。');
    if ('deletedAt' in safe && safe.deletedAt !== null) safe.deletedAt = new Date().toISOString();
    data.photos = data.photos.map(p => ids.includes(p.id) ? { ...p, ...safe } : p);
    await this.commit(data); return data;
  }
  async savePoint(input, bytes) {
    const data = await this.load();
    const previous = input.id ? data.photos.find(p => p.id === input.id && !p.deletedAt) : null;
    if (input.id && !previous) throw new Error('找不到这个记忆点。');
    const fields = {};
    for (const key of ['location', 'caption', 'date', 'time', 'country', 'region', 'city', 'cityId']) {
      const value = input[key] ?? '';
      if (typeof value !== 'string' || value.length > 10000) throw new Error('记忆点内容无效。');
      fields[key] = value.trim();
    }
    if (!fields.location && !fields.caption && !previous?.hash && !bytes) throw new Error('请填写地点、文字或添加照片。');
    const hasCoords = input.latitude != null || input.longitude != null;
    if (hasCoords && !coordinates(input.latitude, input.longitude)) throw new Error('请输入有效的纬度和经度。');
    if (!['visited', 'wish'].includes(input.visitStatus)) throw new Error('请选择到访状态。');
    let key = previous?.hash ?? null;
    if (bytes) {
      if (!bytes.length || bytes.length > 80 * 1024 * 1024) throw new Error('请选择 80 MB 以内的照片。');
      key = hash(bytes);
      const pictures = await this.decode(bytes);
      for (const [kind, content] of Object.entries({ original: bytes, ...pictures })) await atomic(this.asset(key, kind), content);
    }
    const point = { ...previous, ...fields, id: previous?.id ?? randomUUID(), hash: key,
      dateSource: fields.date === previous?.date ? previous.dateSource : fields.date ? 'user' : 'unknown',
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
      visitStatus: input.visitStatus, locationStatus: hasCoords ? 'confirmed' : 'pending',
      locationSource: hasCoords ? (fields.cityId ? 'city-center' : 'manual') : 'unknown',
      createdAt: previous?.createdAt ?? new Date().toISOString(), deletedAt: null };
    if (previous) data.photos = data.photos.map(p => p.id === point.id ? point : p);
    else data.photos.push(point);
    await this.commit(data);
  }
  async saveJourney(input) {
    const data = await this.load();
    const journeys = data.journeys ?? [];
    if (input.id && !journeys.some(j => j.id === input.id)) throw new Error('找不到这段旅程。');
    if (input.remove && input.id) data.journeys = journeys.filter(j => j.id !== input.id);
    else {
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 || typeof input.note !== 'string' || input.note.length > 10000 || !Array.isArray(input.pointIds)) throw new Error('请填写有效的旅程名称和内容。');
      const journey = { id: input.id ?? randomUUID(), title: input.title.trim(), note: input.note, pointIds: [...new Set(input.pointIds)] };
      data.journeys = input.id ? journeys.map(j => j.id === input.id ? journey : j) : [...journeys, journey];
    }
    await this.commit(data);
  }
  async backup(parent) {
    const data = await this.load();
    const target = path.join(parent, `记忆地球备份-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`);
    await fs.mkdir(path.join(target, 'assets'), { recursive: true });
    for (const key of new Set(data.photos.map(p => p.hash).filter(Boolean))) for (const kind of ['original', 'preview', 'thumb']) await fs.copyFile(this.asset(key, kind), path.join(target, 'assets', `${key}.${kind}`));
    // Manifest is written last: incomplete copies are not restorable backups.
    await atomic(path.join(target, 'library.json'), JSON.stringify(data, null, 2));
    return target;
  }
  async restore(folder) {
    const incoming = validate(JSON.parse(await fs.readFile(path.join(folder, 'library.json'), 'utf8')));
    const current = await this.load();
    const prepared = [];
    for (const key of new Set(incoming.photos.map(p => p.hash).filter(Boolean))) {
      const file = path.join(folder, 'assets', `${key}.original`);
      const info = await fs.lstat(file);
      if (!info.isFile() || info.size > 80 * 1024 * 1024) throw new Error('备份图片无效。');
      const bytes = await fs.readFile(file);
      if (hash(bytes) !== key) throw new Error('备份图片校验失败，现有记录未改变。');
      const pictures = await this.decode(bytes);
      // Rebuild derivatives rather than trusting external preview files.
      for (const [kind, content] of Object.entries({ original: bytes, ...pictures })) await atomic(this.asset(key, kind), content);
      prepared.push(key);
    }
    let added = 0;
    for (const record of incoming.photos) {
      if (current.photos.some(p => p.id === record.id)) continue;
      current.photos.push(record); added++;
    }
    current.journeys ??= [];
    for (const journey of incoming.journeys ?? []) {
      if (!current.journeys.some(j => j.id === journey.id)) current.journeys.push(journey);
    }
    current.migrations = [...new Set([...current.migrations, ...incoming.migrations])];
    await this.commit(current);
    return { added, total: incoming.photos.length };
  }
}
module.exports = { MemoryRepository, coordinates, hash, validate };
