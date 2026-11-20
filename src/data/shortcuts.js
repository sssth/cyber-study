import { translate, translateFixedText } from '../i18n/index.js';

export const viewShortcut = id => `view:${id}`;

export const movementShortcuts = [
  ['w', "i18n.moveForward", ['W', '↑']],
  ['a', "i18n.moveLeft", ['A', '←']],
  ['s', "i18n.moveBackward", ['S', '↓']],
  ['d', "i18n.moveRight", ['D', '→']],
  ['q', "i18n.moveDown", ['Q']],
  ['e', "i18n.moveUp", ['E']]
];

export function shortcutGroups(scene) {
  return [
    ["i18n.general", 'global', [
      ['showOnGlobe', "i18n.showOnGlobe", ['Shift+Cmd+X', 'Ctrl+Shift+X']],
      ['snapshot', "i18n.saveSnapshot", ['Shift+Cmd+S', 'Ctrl+Shift+S']],
      ['search', "i18n.searchAndFilterTheCurrentCollection", ['Shift+Cmd+Z', 'Ctrl+Shift+Z']],
      ['createContent', "i18n.createContentOnTheCurrentPage", ['Shift+Cmd+A', 'Ctrl+Shift+A']]
    ]],
    ["i18n.studyScene", 'scene', [
      ...(scene.appearance?.nightTheme ? [['dayNight', "i18n.switchBetweenDayAndNight", ['L']]] : []),
      ...(scene.views ?? []).map(({ id, label }, index) =>
        [viewShortcut(id), () => translate("i18n.switchView", translateFixedText(label)), index < 9 ? [String(index + 1)] : []]),
      ...(scene.roam ? movementShortcuts : [])
    ]],
    ["i18n.reader", 'reader', [
      ['previousPage', "i18n.previousPagePaginatedReading", ['←']],
      ['nextPage', "i18n.nextPagePaginatedReading", ['→']],
      ['readerBack', "i18n.goBack", ['Esc']]
    ]],
    ["i18n.musicPlayer", 'music', [
      ['previousTrack', "i18n.previousTrack", ['Shift+←']],
      ['nextTrack', "i18n.nextTrack", ['Shift+→']],
      ['toggleMusic', "i18n.playPause", ['Shift+Space']]
    ]],
    ["i18n.roomMenu", 'menu', [['closeMenu', "i18n.closeMenu", ['Esc']]]],
    ["i18n.memoBoard", 'memo', [['addTodo', "i18n.addAToDoInTheInput", ['Enter']]]]
  ].filter(([, , actions]) => actions.length);
}

const storageKey = 'cyber-study.shortcuts.v1';

export function loadShortcuts(groups) {
  let saved;
  try {
    saved = localStorage.getItem(storageKey);
    saved = JSON.parse(saved);
  } catch {
    saved = null;
  }
  return Object.fromEntries(groups.flatMap(([, , actions]) => actions.map(([id, , defaults]) => {
    const stored = saved?.[id];
    // Migrate the former search bindings; Escape belongs to navigation.
    const keys = id === 'search' && Array.isArray(stored) && stored.some(key => ['Cmd+K', 'Ctrl+K', 'Esc'].includes(key)) ? defaults : stored;
    return [id, Array.isArray(keys) && keys.every(key => typeof key === 'string') ? keys : defaults];
  })));
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
