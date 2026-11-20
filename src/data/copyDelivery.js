import { addRelation } from '../entities/contentRelations.js';
import { loadSpaceData, saveContentData, saveSpaceData } from './spaceStorage.js';

export function deliverCopy({ source, destination, makeItem }) {
  let items = loadSpaceData(destination, []);
  let item = items.find(entry => entry.pendingCopyLinks?.includes(source.key));
  if (!item) {
    const record = makeItem(items);
    item = { ...record, pendingCopyLinks: [...(record.pendingCopyLinks ?? []), source.key] };
    items = items.some(entry => entry.id === item.id)
      ? items.map(entry => entry.id === item.id ? item : entry)
      : [item, ...items];
    if (!saveContentData(destination, items)) return 'unsaved';
  }

  try {
    addRelation(source, {
      key: `${destination}:${item.id}`,
      type: destination,
      title: item.title || item.text?.slice(0, 40)
    });
  } catch {
    return 'unlinked';
  }

  const pending = item.pendingCopyLinks.filter(key => key !== source.key);
  const updated = { ...item };
  if (pending.length) updated.pendingCopyLinks = pending;
  else delete updated.pendingCopyLinks;
  saveSpaceData(destination, items.map(entry => entry.id === item.id ? updated : entry));
  return 'saved';
}
