import { entityKey } from '../entities/records.js';
import { currentScope, getScope } from '../search/searchStore.js';

const sources = new Map();

export function registerResultSource(token, read) {
  sources.set(token, read);
  return () => sources.delete(token);
}

export function currentResultSource(application) {
  return [...sources.values()].map(read => read())
    .filter(source => (!source.onlyFor || source.onlyFor === application) && source.enabled !== false && source.applications?.[application] !== false)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}

export const resultEntities = (type, records) => records.filter(Boolean).map(record => ({
  id: record.id, deletedAt: record.deletedAt, type, key: entityKey(type, record.id), record
}));

export function resultInput(source, application) {
  if (!source) return null;
  const scope = source.scopeId ? getScope(source.scopeId) : currentScope();
  return {
    ...source,
    matches: source.matches ?? [],
    entities: source.applications?.[application] ?? source.matches ?? [],
    scope
  };
}

export function currentResultInput(application) {
  return resultInput(currentResultSource(application), application);
}
