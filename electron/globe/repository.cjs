const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { photoTitle } = require('./photoTitle.cjs');
const { metadata } = require('./metadata.cjs');
const { readablePhoto } = require('./photoInput.cjs');
const { photoRegion } = require('./photoRegion.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const coordinates = (lat, lon) => typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
async function atomic(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, data, { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
const textModule=import('../entityText.mjs');
async function migrateLibrary(data){
  const {migrateEntityText}=await textModule;
  let changed=false;
  for(const [key,type] of [['photos','memory_point'],['journeys','journey'],['deletedJourneys','journey']]){
    if(!Array.isArray(data?.[key]))continue;
    data[key]=data[key].map(row=>{
      const next=migrateEntityText(type,row);
      if(next!==row)changed=true;
      return next;
    });
  }
  return changed;
}
function validate(data) {
  if (data?.version !== 2 || !Array.isArray(data.photos) || !Array.isArray(data.migrations)) throw new Error('记忆库格式不正确，未修改现有数据。');
  const ids = new Set();
  for (const p of data.photos) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || (p.hash != null && !validHash(p.hash)) || typeof p.location !== 'string' || typeof p.text !== 'string' || typeof p.date !== 'string' || !['pending', 'confirmed'].includes(p.locationStatus) || (p.locationStatus === 'confirmed' && !coordinates(p.latitude, p.longitude))) throw new Error('记忆库记录损坏，未修改现有数据。');
    ids.add(p.id);
  }
  const journeys = data.journeys ?? [];
  if (!Array.isArray(journeys) || new Set(journeys.map(j => j?.id)).size !== journeys.length ||
      journeys.some(j => !j || typeof j.id !== 'string' || typeof j.title !== 'string' || typeof j.text !== 'string' || !Array.isArray(j.pointIds) || j.pointIds.some(id => !ids.has(id)) || new Set(j.pointIds).size !== j.pointIds.length)) throw new Error('旅程记录损坏。');
  const trashed = new Set(data.photos.filter(point => point.deletedAt).map(point => point.id));
  for (const journey of journeys) journey.pointIds = journey.pointIds.filter(id => !trashed.has(id));
  return data;
}
class MemoryRepository {
  constructor(root, decode) { this.root = root; this.decode = decode; }
  asset(key, kind) { if (!validHash(key) || !['original', 'preview', 'thumb'].includes(kind)) throw new Error('图片引用无效。'); return path.join(this.root, 'assets', `${key}.${kind}`); }
  async load() {
    await fs.mkdir(path.join(this.root, 'assets'), { recursive: true });
    const file=path.join(this.root,'library.json');
    try {
      // All reads and mutations wait for the first atomic upgrade.
      this.upgrade??=(async()=>{
        const data=JSON.parse(await fs.readFile(file,'utf8'));
        if(await migrateLibrary(data))await this.commit(data);
      })().catch(error=>{if(error.code!=='ENOENT'){this.upgrade=null;throw error;}});
      await this.upgrade;
      return validate(JSON.parse(await fs.readFile(file,'utf8')));
    } catch (error) { if (error.code === 'ENOENT') return { version: 2, photos: [], migrations: [] }; throw error; }
  }
  async commit(data) { validate(data); await atomic(path.join(this.root, 'library.json'), JSON.stringify(data, null, 2)); }
  async beginImport() {
    const data = await this.load();
    return { data, byHash: new Map(data.photos.map(photo => [photo.hash, photo])), pending: 0 };
  }
  async flushImport(batch) {
    if (!batch.pending) return;
    await this.commit(batch.data);
    batch.pending = 0;
  }
  async add(bytes, details = {}, migrationKey = '', batch = null) {
    if (!bytes.length || bytes.length > 80 * 1024 * 1024) throw new Error('请选择 80 MB 以内的照片。');
    const data = batch?.data ?? await this.load();
    if (migrationKey && data.migrations.includes(migrationKey)) return { skipped: true };
    const key = hash(bytes);
    const duplicate = batch ? batch.byHash.get(key) : data.photos.find(p => p.hash === key);
    if (duplicate && !migrationKey) return { skipped: true, duplicate: duplicate.id, inTrash: Boolean(duplicate.deletedAt) };
    const readable = await readablePhoto(bytes);
    const pictures = await this.decode(readable);
    for (const [kind, content] of Object.entries({ original: bytes, ...pictures })) await atomic(this.asset(key, kind), content);
    const meta = metadata(readable);
    const area = migrationKey ? {} : await photoRegion(meta);
    const record = { id: randomUUID(), hash: key, location: '', text: '', time: meta.time || '', date: meta.date || '', dateSource: meta.date ? 'exif' : 'unknown', latitude: meta.latitude ?? null, longitude: meta.longitude ?? null, locationSource: meta.latitude != null ? 'exif' : 'unknown', locationStatus: meta.latitude != null ? 'confirmed' : 'pending', ...area, createdAt: new Date().toISOString(), deletedAt: null, ...(await textModule).migrateEntityText('memory_point',details) };
    // Never accept legacy random longitude as a coordinate.
    if (migrationKey) Object.assign(record, { latitude: null, longitude: null, locationSource: 'unknown', locationStatus: 'pending' });
    if (record.filename && !record.title) record.title = photoTitle(record);
    data.photos.push(record);
    if (migrationKey) data.migrations.push(migrationKey);
    if (batch) {
      batch.byHash.set(key, record);
      batch.pending++;
    } else await this.commit(data);
    return { record };
  }
  async update(ids, patch) {
    const data = await this.load();
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !data.photos.some(p => p.id === id))) throw new Error('照片记录不存在，请刷新后重试。');
    patch=(await textModule).migrateEntityText('memory_point',patch);
    const allowed = ['country', 'region', 'city', 'cityId', 'location', 'text', 'date', 'dateSource', 'latitude', 'longitude', 'locationSource', 'locationStatus', 'deletedAt'];
    const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
    for (const key of ['location', 'text', 'date']) if (key in safe && (typeof safe[key] !== 'string' || safe[key].length > 10000)) throw new Error('输入内容无效。');
    if (safe.date && (!/^\d{4}-\d{2}-\d{2}$/.test(safe.date) || Number.isNaN(Date.parse(safe.date)))) throw new Error('拍摄日期无效。');
    if ('deletedAt' in safe && safe.deletedAt !== null) safe.deletedAt = new Date().toISOString();
    data.photos = data.photos.map(p => ids.includes(p.id) ? { ...p, ...safe } : p);
    await this.commit(data); return data;
  }
  async savePoint(input, bytes) {
    input=(await textModule).migrateEntityText('memory_point',input);
    const data = await this.load();
    const previous = input.id ? data.photos.find(p => p.id === input.id && !p.deletedAt) : null;
    if (input.id && !previous) throw new Error('找不到这个记忆点。');
    const fields = {};
    for (const key of ['title', 'location', 'text', 'date', 'time', 'country', 'region', 'city', 'cityId']) {
      const value = input[key] ?? '';
      if (typeof value !== 'string' || value.length > 10000) throw new Error('记忆点内容无效。');
      fields[key] = value.trim();
    }
    if (!fields.title && !fields.location && !fields.text && !previous?.hash && !bytes) throw new Error('请填写地点、文字或添加照片。');
    const hasCoords = input.latitude != null || input.longitude != null;
    if (hasCoords && !coordinates(input.latitude, input.longitude)) throw new Error('请输入有效的纬度和经度。');
    if (!['visited', 'wish'].includes(input.visitStatus)) throw new Error('请选择到访状态。');
    const journeys = data.journeys ?? [];
    const {addJourneys = [], removeJourneys = []} = input;
    if (![addJourneys,removeJourneys].every(ids=>Array.isArray(ids) && ids.every(id=>typeof id === 'string'))
      || addJourneys.some(id=>!journeys.some(journey=>journey.id===id))) throw new Error('找不到这段旅程。');
    let key = previous?.hash ?? null;
    if (bytes) {
      if (!bytes.length || bytes.length > 80 * 1024 * 1024) throw new Error('请选择 80 MB 以内的照片。');
      key = hash(bytes);
      const pictures = await this.decode(await readablePhoto(bytes));
      for (const [kind, content] of Object.entries({ original: bytes, ...pictures })) await atomic(this.asset(key, kind), content);
    }
    const point = { ...previous, ...fields, photoCrop: input.photoCrop === undefined ? (bytes ? null : previous?.photoCrop) : input.photoCrop, id: previous?.id ?? randomUUID(), hash: key,
      dateSource: previous && fields.date === previous.date ? previous.dateSource : fields.date ? 'user' : 'unknown',
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
      visitStatus: input.visitStatus, locationStatus: hasCoords ? 'confirmed' : 'pending',
      locationSource: hasCoords && previous?.latitude === input.latitude && previous?.longitude === input.longitude && (previous?.cityId || '') === (input.cityId || '') ? previous.locationSource : hasCoords ? (fields.cityId ? 'city-center' : 'manual') : 'unknown',
      createdAt: previous?.createdAt ?? new Date().toISOString(), deletedAt: null };
    if (previous) data.photos = data.photos.map(p => p.id === point.id ? point : p);
    else data.photos.push(point);
    for (const journey of journeys) {
      if (removeJourneys.includes(journey.id)) journey.pointIds = journey.pointIds.filter(id=>id!==point.id);
      else if (addJourneys.includes(journey.id) && !journey.pointIds.includes(point.id)) journey.pointIds.push(point.id);
    }
    await this.commit(data);
  }
  async saveJourney(input) {
    input=(await textModule).migrateEntityText('journey',input);
    const data = await this.load();
    const journeys = data.journeys ?? [];
    if (input.id && !journeys.some(j => j.id === input.id)) throw new Error('找不到这段旅程。');
    if (input.remove && input.id) {
      data.deletedJourneys ??= [];
      data.deletedJourneys.push({ ...journeys.find(j => j.id === input.id), deletedAt: new Date().toISOString() });
      data.journeys = journeys.filter(j => j.id !== input.id);
    }
    else {
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 || typeof input.text !== 'string' || input.text.length > 10000 || !Array.isArray(input.pointIds)) throw new Error('请填写有效的旅程名称和内容。');
      if(input.startDate&&input.endDate&&input.endDate<input.startDate)throw new Error('结束日期不能早于开始日期。');
      const createdAt = input.id ? journeys.find(j => j.id === input.id)?.createdAt : new Date().toISOString();
      const journey = { createdAt, startDate:input.startDate||null,endDate:input.endDate||null, id: input.id ?? randomUUID(), title: input.title.trim(), text: input.text, pointIds: [...new Set(input.pointIds)] };
      data.journeys = input.id ? journeys.map(j => j.id === input.id ? journey : j) : [...journeys, journey];
    }
    await this.commit(data);
  }
  async recycle(type, id, action) {
    const data = await this.load();
    const points = type === 'memory_point';
    if (!points && type !== 'journey') throw Error('记录类型无效。');
    const collection = points ? 'photos' : 'deletedJourneys';
    const record = data[collection]?.find(item => item.id === id && item.deletedAt);
    if (!record) throw Error('回收站记录不存在。');
    if (action === 'purge' || !points) data[collection] = data[collection].filter(item => item !== record);
    if (action === 'restore') {
      delete record.deletedAt;
      if (!points) {
        data.journeys ??= [];
        if (data.journeys.some(j => j.id === id)) throw Error('旅途已存在。');
        record.pointIds = record.pointIds.filter(id => data.photos.some(p => p.id === id && !p.deletedAt));
        data.journeys.push(record);
      }
    } else if (action !== 'purge') throw Error('回收站操作无效。');
    await this.commit(data);
    if (action === 'purge' && points && record.hash && !data.photos.some(p => p.hash === record.hash)) {
      for (const kind of ['original','preview','thumb']) await fs.rm(this.asset(record.hash, kind), { force: true });
    }
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
    const incoming = JSON.parse(await fs.readFile(path.join(folder, 'library.json'), 'utf8'));
    await migrateLibrary(incoming);
    validate(incoming);
    const current = await this.load();
    const prepared = [];
    for (const key of new Set(incoming.photos.map(p => p.hash).filter(Boolean))) {
      const file = path.join(folder, 'assets', `${key}.original`);
      const info = await fs.lstat(file);
      if (!info.isFile() || info.size > 80 * 1024 * 1024) throw new Error('备份图片无效。');
      const bytes = await fs.readFile(file);
      if (hash(bytes) !== key) throw new Error('备份图片校验失败，现有记录未改变。');
      const pictures = await this.decode(await readablePhoto(bytes));
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
    current.deletedJourneys ??= [];
    for (const journey of incoming.deletedJourneys ?? []) {
      if (![...current.journeys, ...current.deletedJourneys].some(j => j.id === journey.id)) current.deletedJourneys.push(journey);
    }
    current.migrations = [...new Set([...current.migrations, ...incoming.migrations])];
    await this.commit(current);
    return { added, total: incoming.photos.length };
  }
}
module.exports = { MemoryRepository, coordinates, hash, validate };
