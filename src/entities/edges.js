import { entityTypes } from '../entities/registry.js';
import { entityKey } from '../entities/records.js';

export const relationLabels = {direct:'直属', contains:'包含', related:'关联'};

export function graphEdges(items, savedLinks, definitions = entityTypes) {
  const keys = new Set(items.map(item => item.key));
  const edges = new Map();
  const parentIndexes = new Map();
  function add(from, to, kind) {
    if (!keys.has(from) || !keys.has(to) || from === to) return;
    if (kind === 'related' && from > to) [from,to] = [to,from];
    const id = JSON.stringify([kind,from,to]);
    edges.set(id,{id,from,to,kind});
  }
  for (const item of items) {
    const { parent, children } = definitions[item.type] ?? {};
    if (parent) {
      let ids;
      if (parent.matchKey) {
        if (!parentIndexes.has(parent)) {
          parentIndexes.set(parent, new Map(items.filter(record => record.type === parent.type)
            .map(record => [parent.matchKey(record), record.id])));
        }
        ids = [parentIndexes.get(parent).get(parent.matchKey(item))];
      } else {
        ids = [parent.id(item)].flat();
      }
      for (const id of ids) if (id) add(entityKey(parent.type, id), item.key, parent.kind ?? 'direct');
    }
    if (children) {
      for (const id of children.ids(item)) add(item.key, entityKey(children.type, id), children.kind);
    }
  }
  for (const link of savedLinks) if (link.relationType === 'related') add(link.fromId,link.toId,'related');
  return [...edges.values()];
}

