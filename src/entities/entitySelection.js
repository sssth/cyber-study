import { currentResultInput } from '../results/activeResults.js';
import { collectEntities } from '../resultApplications/captureSnapshot.js';
import { entityTypes } from './registry.js';
import { contentElements } from '../ui/contentTargets.js';

let selection = null;
const listeners = new Set();
export const subscribeSelection = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getSelection = () => selection;

function publish(next) {
  selection = next;
  listeners.forEach(listener => listener());
}

export function clearSelection() {
  if (selection) publish(null);
}

// Toggle only the matching rows; preserve the order of earlier selections.
export function toggleMatchingIds(selected, visible) {
  const matches = new Set(visible);
  if (!matches.size) return selected;
  const picked = new Set(selected);
  if ([...matches].every(id => picked.has(id))) return selected.filter(id => !matches.has(id));
  return [...new Set([...selected, ...matches])];
}

// Local pickers use the same select-all command while keeping their own item IDs.
export function toggleVisibleIds(selected, visible, limit = Infinity) {
  const next = new Set(selected);
  for (const id of visible) {
    if (next.size >= limit) break;
    next.add(id);
  }
  if (next.size > selected.length) return [...next];
  const matches = new Set(visible);
  return selected.filter(id => !matches.has(id));
}

function selectionInput() {
  const source = currentResultInput('snapshot');
  return source && { ...source, entities: source.applications?.selectAll ?? source.entities };
}

// Use the same registered context-menu targets as single-item linking. A paged
// collection can explicitly support all its results, including unmounted pages.
function supportsLinks(source, items) {
  if (source.allowGroupRelations !== undefined) return source.allowGroupRelations;
  const targets = globalThis.document?.querySelectorAll('[data-content-target], [data-entity-key][data-relation-gesture]') ?? [];
  const keys = new Set();
  for (const node of targets) {
    if (!node.checkVisibility() || node.closest('[inert]')) continue;
    keys.add(contentElements.get(node)?.key ?? (node.hasAttribute('data-relation-gesture') && node.dataset.entityKey));
  }
  return items.every(item => keys.has(item.key));
}

export function selectResults(projection) {
  if (selection) {
    clearSelection();
    return '';
  }
  const source = selectionInput();
  const { entities, message } = collectEntities(projection && !source?.projection ? null : source);
  if (entities.length < 2) return message;
  const items = entities.map(({ key, type, record }) => ({
    key, type, id: record.id, imageMemo: type === 'memo' && Boolean(record.photo || record.type === 'image'), title: entityTypes[type]?.title?.(record) || record.title || record.text?.slice(0, 40) || record.id
  }));
  publish({ scopeId: source.scopeId, items, keys: new Set(items.map(item => item.key)), canRelate: supportsLinks(source, items) });
  return '';
}

function matchesResults(picked) {
  const source = selectionInput();
  if (!source || source.loading || source.plain || source.blocked || source.scopeId !== picked.scopeId) return false;
  const keys = new Set(source.entities.filter(item => item?.id && item.type).map(item => item.key || `${item.type}:${item.id}`));
  return keys.size === picked.keys.size && [...keys].every(key => picked.keys.has(key));
}

export function validateSelection() {
  if (selection && !matchesResults(selection)) clearSelection();
}

export function restoreSelection(picked) {
  if (picked && matchesResults(picked)) publish(picked);
}
