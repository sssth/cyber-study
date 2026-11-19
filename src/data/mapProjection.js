// Each visible surface supplies its complete filtered collection, not just mounted cards.
const sources = new Map();
export function registerMapSource(token, read) { sources.set(token, read); return () => sources.delete(token); }
export function currentMapSource({ snapshot = false } = {}) {
  return [...sources.values()].map(read => read()).filter(source => source.enabled !== false && (!snapshot || source.snapshotEnabled !== false))
    .sort((a,b) => (b.priority || 0) - (a.priority || 0))[0];
}
export const mapEntities = (type, items) => items.filter(Boolean).map(item => ({ id:item.id, deletedAt:item.deletedAt, type, key: `${type}:${item.id}`, record:item }));

export function captureEntities(source) {
  if (source?.loading) return {message:'当前内容正在加载，请稍后再试。', entities:[]};
  if (!source || source.blocked || source.plain) return {message:'当前页面没有可截取的实体集合。', entities:[]};
  const records = new Map();
  for (const item of source.snapshotEntities ?? source.entities ?? []) {
    if (!item?.id || !item.type) continue;
    const key = item.key || `${item.type}:${item.id}`;
    if (!records.has(key)) records.set(key,{key,type:item.type,record:item.record ?? item});
  }
  return {message:records.size?'':'当前筛选结果为空。',entities:structuredClone([...records.values()])};
}
export function collectMemoryIds(entities, links, photos, journeys) {
  const valid = new Set(photos.filter(p => !p.deletedAt && p.locationStatus === 'confirmed' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180).map(p=>p.id));
  const result = new Set(), ordinary = new Set();
  const add = id => { if (valid.has(id)) result.add(id); };
  for (const item of entities) {
    if (!item?.id || item.deletedAt) continue;
    if (item.type === 'memory_point') add(item.id);
    else if (item.type === 'journey') (journeys.find(j=>j.id===item.id&&!j.deletedAt)?.pointIds || []).forEach(add);
    else ordinary.add(item.key || `${item.type}:${item.id}`);
  }
  for (const link of links) {
    if (link.relationType !== 'related') continue;
    const target = ordinary.has(link.fromId) ? link.toId : ordinary.has(link.toId) ? link.fromId : null;
    if (target?.startsWith('memory_point:')) add(target.slice('memory_point:'.length));
  }
  return [...result];
}
