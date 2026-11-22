import { createId, loadSpaceData, saveContentData } from '../data/spaceStorage.js';
import { entityTypes } from './registry.js';

export function canRelate(a, b) {
  if (!a || !b || a.key === b.key || a.type === b.type) return false;
  const relates = (from, to) => entityTypes[from]?.parent?.type === to || entityTypes[from]?.children?.type === to;
  return !relates(a.type, b.type) && !relates(b.type, a.type);
}
export const relationExists=(links,a,b)=>links.some(l=>l.relationType==='related'&&((l.fromId===a&&l.toId===b)||(l.fromId===b&&l.toId===a)));
export function addRelations(sources, target) {
  if (!sources.length || sources.some(source => !canRelate(source, target))) {
    throw Error('这两个内容不能使用普通关联，请使用相应的直属或包含关系。');
  }
  const links = loadSpaceData('content-relations', []);
  const neighbors = new Set(links.filter(link => link.relationType === 'related' &&
    [link.toId, link.fromId].includes(target.key)).map(link => link.toId === target.key ? link.fromId : link.toId));
  const added = sources.filter(source => !neighbors.has(source.key)).map(source => ({
    id: createId('relation'), fromId: source.key, toId: target.key,
    fromTitle: source.title, toTitle: target.title, relationType: 'related', createdAt: new Date().toISOString()
  }));
  if (!added.length) return false;
  if (!saveContentData('content-relations', [...links, ...added])) throw Error('关联保存失败，请检查本地存储空间。');
  return true;
}
export const addRelation = (source, target) => addRelations([source], target);
export function removeRelations(ids) {
  const removed = new Set(ids);
  if (!saveContentData('content-relations', loadSpaceData('content-relations', []).filter(l => !removed.has(l.id)))) {
    throw Error('解除关联失败，请重试。');
  }
}
export function removeEntityRelations(key) {
  const links = loadSpaceData('content-relations', []);
  const ids = links.filter(link => link.fromId === key || link.toId === key).map(link => link.id);
  if (ids.length) removeRelations(ids);
}
export const removeRelation = id => removeRelations([id]);

export function commonNeighbors(sources, links) {
  const keys = new Set(sources.map(item => item.key));
  const groups = new Map();
  function collect(source, neighbor, link) {
    if (!keys.has(source)) return;
    if (!groups.has(neighbor)) groups.set(neighbor, new Map());
    groups.get(neighbor).set(source, link);
  }
  for (const link of links) {
    if (link.relationType !== 'related') continue;
    collect(link.fromId, link.toId, link);
    collect(link.toId, link.fromId, link);
  }
  return new Map([...groups].filter(([, group]) => group.size === keys.size));
}
