import { translate, translateFixedText } from '../i18n/index.js';

export const viewShortcut = id => `view:${id}`;

export const defaultBackKeys = ['Esc'];
export const defaultChatKeys = { sendMessage: ['Enter'], insertNewline: ['Shift+Enter'] };
export const movementShortcuts = [
  ['w', "i18n.moveForward", ['W']],
  ['a', "i18n.moveLeft", ['A']],
  ['s', "i18n.moveBackward", ['S']],
  ['d', "i18n.moveRight", ['D']],
  ['q', "i18n.moveDown", ['Q']],
  ['e', "i18n.moveUp", ['E']]
];
const formerMovementArrows = { w: '↑', a: '←', s: '↓', d: '→' };

export function shortcutGroups(scene) {
  return [
    ["i18n.general", 'global', [
      ['openAI', 'i18n.openAIWindow', ['Shift+Cmd+D', 'Alt+Shift+D']],
      ['search', "i18n.searchEntities", ['Shift+Cmd+Z', 'Alt+Shift+Z']],
      ['createContent', "i18n.createEntity", ['Shift+Cmd+A', 'Alt+Shift+A']],
      ['snapshot', "i18n.saveEntitySnapshot", ['Shift+Cmd+S', 'Alt+Shift+S']],
      ['showOnGlobe', "i18n.showEntityLocation", ['Shift+Cmd+X', 'Alt+Shift+X']],
      ['selectAll', 'i18n.selectEntities', ['Cmd+A', 'Ctrl+A']],
      ['back', "i18n.goBack", defaultBackKeys]
    ]],
    ["i18n.studyScene", 'scene', [
      ...(scene.appearance?.nightTheme ? [['dayNight', "i18n.switchBetweenDayAndNight", ['L']]] : []),
      ...(scene.views ?? []).map(({ id, label }, index) =>
        [viewShortcut(id), () => translate("i18n.switchView", translateFixedText(label)), index < 9 ? [String(index + 1)] : []]),
      ...(scene.roam ? movementShortcuts : [])
    ]],
    ["i18n.reader", 'reader', [
      ['previousPage', "i18n.previousPagePaginatedReading", ['←']],
      ['nextPage', "i18n.nextPagePaginatedReading", ['→']]
    ]],
    ["i18n.recordPlayer", 'music', [
      ['previousTrack', "i18n.previousTrack", ['Shift+←']],
      ['nextTrack', "i18n.nextTrack", ['Shift+→']],
      ['toggleMusic', "i18n.playPause", ['Shift+Space']]
    ]],
    ["i18n.aiChat", 'chat', [
      ['sendMessage', "i18n.send", defaultChatKeys.sendMessage],
      ['insertNewline', "i18n.insertNewline", defaultChatKeys.insertNewline]
    ]]
  ].filter(([, , actions]) => actions.length);
}

const storageKey = 'cyber-study.shortcuts.v3';

export function defaultShortcuts(groups) {
  return Object.fromEntries(groups.flatMap(([, , actions]) => actions.map(([id, , keys]) => [id, keys])));
}

export function loadShortcuts(groups) {
  let saved;
  let legacy;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) {
      saved = JSON.parse(localStorage.getItem('cyber-study.shortcuts.v2'));
      const previous = saved?.openAI;
      if (Array.isArray(previous) && previous.length === 1 && previous[0] === 'Shift+Cmd+D' &&
          !Object.values(saved).some(keys => Array.isArray(keys) && keys.includes('Alt+Shift+D'))) {
        saved.openAI = [...previous, 'Alt+Shift+D'];
      }
    }
  } catch {
    saved = null;
  }
  try {
    legacy = JSON.parse(localStorage.getItem('cyber-study.shortcuts.v1'));
  } catch {
    legacy = null;
  }
  return Object.fromEntries(Object.entries(defaultShortcuts(groups)).map(([id, defaults]) => {
    if (Array.isArray(saved?.[id]) && saved[id].every(key => typeof key === 'string')) return [id, saved[id]];
    const stored = legacy?.[id];
    if (!Array.isArray(stored) || !stored.every(key => typeof key === 'string')) return [id, defaults];
    // Search used to be assigned to Escape, which is the default for page navigation.
    if (id === 'search' && stored.some(key => ['Cmd+K', 'Ctrl+K', 'Esc'].includes(key))) return [id, defaults];
    const windowsDefault = defaults.find(key => key.startsWith('Alt+Shift+'));
    const formerDefault = windowsDefault?.replace('Alt+', 'Ctrl+');
    const migrated = stored.filter(key => key !== formerMovementArrows[id])
      .map(key => key === formerDefault ? windowsDefault : key);
    return [id, stored.length && !migrated.length ? defaults : [...new Set(migrated)]];
  }));
}

export function saveShortcuts(bindings) {
  localStorage.setItem(storageKey, JSON.stringify(bindings));
}

export const typingTarget = target =>
  target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);

const keyLabels = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', ' ': 'Space'
};

export function shortcutKey(event) {
  const { key } = event;
  if (!key || event.isComposing || ['Control', 'Alt', 'Shift', 'Meta', 'Tab', 'Dead', 'Process', 'Unidentified'].includes(key)) return null;
  return [
    event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift',
    event.metaKey && 'Cmd', keyLabels[key] ?? (key.length === 1 ? key.toUpperCase() : key)
  ].filter(Boolean).join('+');
}

export function matchesShortcut(event, keys) {
  if (event.defaultPrevented) return false;
  if (['Enter', ' '].includes(event.key) && event.target?.closest?.('button, a[href], [role="button"]')) return false;
  return keys?.includes(shortcutKey(event));
}

export function translateShortcutLabel(label) {
  return typeof label === 'function' ? label() : translate(label);
}
