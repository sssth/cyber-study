import { matchesShortcut } from '../data/shortcuts.js';

export const commands = {
  search: { event: 'cyber-toggle-search', shortcut: 'search' },
  create: { event: 'cyber-toggle-create', shortcut: 'createContent' },
  edit: { event: 'cyber-toggle-edit' },
  relate: { event: 'cyber-toggle-relate' },
  snapshot: { event: 'cyber-save-snapshot', shortcut: 'snapshot' },
  map: { event: 'cyber-show-on-globe', shortcut: 'showOnGlobe' }
};

export function invokeCommand(id, target = window) {
  return target.dispatchEvent(new Event(commands[id].event, { bubbles: true }));
}

export function handleCommandKey(event, id, shortcuts, execute, { allowComposing = false } = {}) {
  const input = allowComposing ? {
    key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
    altKey: event.altKey, shiftKey: event.shiftKey, target: event.target,
    isComposing: false, defaultPrevented: false
  } : event;
  if (!matchesShortcut(input, shortcuts?.[commands[id].shortcut])) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.repeat) execute(event);
  return true;
}
