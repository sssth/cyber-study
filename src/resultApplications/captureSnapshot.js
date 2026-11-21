export function collectEntities(source) {
  if (source?.loading) return {message:'当前内容正在加载，请稍后再试。', entities:[]};
  if (!source || source.blocked || source.plain) return {message:'当前页面没有可截取的实体集合。', entities:[]};
  const records = new Map();
  for (const item of source.entities ?? []) {
    if (!item?.id || !item.type) continue;
    const key = item.key || `${item.type}:${item.id}`;
    if (!records.has(key)) records.set(key,{key,type:item.type,record:item.record ?? item});
  }
  return {message:records.size?'':'当前筛选结果为空。',entities:[...records.values()]};
}

export function captureEntities(source) {
  return structuredClone(collectEntities(source));
}
