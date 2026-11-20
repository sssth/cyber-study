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
