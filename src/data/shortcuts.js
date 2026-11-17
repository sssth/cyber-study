export const viewShortcut = id => `view:${id}`;

export const movementShortcuts = [
  ['w', '向前移动', ['W', '↑']],
  ['a', '向左移动', ['A', '←']],
  ['s', '向后移动', ['S', '↓']],
  ['d', '向右移动', ['D', '→']],
  ['q', '下降', ['Q']],
  ['e', '上升', ['E']]
];

export function shortcutGroups(scene) {
  return [
    ['通用', 'global', [
      ['search', '搜索与筛选当前集合', ['Cmd+K', 'Ctrl+K']],
      ['createContent', '新建当前页面的内容', ['Shift+Cmd+A', 'Ctrl+Shift+A']]
    ]],
    ['书房场景', 'scene', [
      ...(scene.appearance?.nightTheme ? [['dayNight', '切换白天和黑夜', ['L']]] : []),
      ...(scene.views ?? []).map(({ id, label }, index) =>
        [viewShortcut(id), `切换视角 · ${label}`, index < 9 ? [String(index + 1)] : []]),
      ...(scene.roam ? movementShortcuts : [])
    ]],
    ['阅读器', 'reader', [
      ['previousPage', '上一页（分页阅读）', ['←']],
      ['nextPage', '下一页（分页阅读）', ['→']],
      ['readerBack', '返回上一级', ['Esc']]
    ]],
    ['音乐播放器', 'music', [
      ['previousTrack', '上一首', ['Shift+←']],
      ['nextTrack', '下一首', ['Shift+→']],
      ['toggleMusic', '播放 / 暂停', ['Shift+Space']]
    ]],
    ['互动菜单', 'menu', [['closeMenu', '关闭菜单', ['Esc']]]],
    ['Memo 板', 'memo', [['addTodo', '添加待办（输入框内）', ['Enter']]]]
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
    const keys = saved?.[id];
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
