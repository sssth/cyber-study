// Names used by earlier storage formats, scoped to the entity owning the prose.
export const legacyTextKeys = {
  movie:['review'], journey:['note','description'], memory_point:['caption'],
  music:['note'], playlist:['description']
};
export function migrateEntityText(type, record) {
  const keys=legacyTextKeys[type];
  if (!record || !keys?.some(key=>Object.hasOwn(record,key))) return record;
  const next={...record};
  if([record.text,...keys.map(key=>record[key])].some(value=>value!=null && typeof value!=='string'))throw Error('描述字段格式无效，无法迁移。');
  const parts=[record.text,...keys.map(key=>record[key])].filter(value=>typeof value==='string' && value.trim());
  next.text=[...new Set(parts)].join('\n\n');
  for(const key of keys) delete next[key];
  return next;
}
