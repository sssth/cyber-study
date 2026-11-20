import { loadKnowledge } from '../features/library/knowledgeStore.js';
import { loadSpaceData } from '../data/spaceStorage.js';
import { entityTypes } from './registry.js';
import { entityRecord } from './records.js';

export function buildCatalog({ books = [], globe = {}, definitions = entityTypes } = {}) {
  const collections = new Map();
  function list(key) {
    if (!collections.has(key)) collections.set(key, loadSpaceData(key, []));
    return collections.get(key);
  }
  const context = { books, globe, notes: loadKnowledge().notes, list };
  const result = new Map();
  for (const [type, definition] of Object.entries(definitions)) {
    for (const item of definition.read(context)) {
      const entry = entityRecord(type, item, item && definition.title?.(item));
      if (entry) result.set(entry.key, entry);
    }
  }
  return [...result.values()];
}
