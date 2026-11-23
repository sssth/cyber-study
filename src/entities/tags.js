import { loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';

const storageKey = (type, id) => 'entity-tags.' + type + ':' + id;
export function entityTags(type, item) {
  if (!item?.id || type === 'movie') return item?.tags ?? [];
  return loadSpaceData(storageKey(type, item.id), null) ?? item.tags ?? [];
}
export function saveEntityTags(type, id, text) {
  const tags = [...new Set(text.split(/[,，、\n]/u).map(tag => tag.trim()).filter(Boolean))];
  return saveSpaceData(storageKey(type, id), tags);
}
