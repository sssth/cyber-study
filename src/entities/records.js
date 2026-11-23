import { entityTags } from './tags.js';

export const entityKey = (type, id) => `${type}:${id}`;

export function entityRecord(type, record, title) {
  if (!record?.id || record.deletedAt) return null;
  return {
    ...record, tags: entityTags(type, record), type, id: record.id, key: entityKey(type, record.id),
    title: title || record.title || record.text?.slice(0, 40) || '未命名内容'
  };
}
