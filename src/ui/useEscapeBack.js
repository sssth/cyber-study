import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { defaultBackKeys, matchesShortcut, typingTarget } from '../data/shortcuts.js';

export const PageBackKeys = createContext(defaultBackKeys);

export function catalogHandlesPageBack() {
  return Boolean(document.querySelector('.feature-overlay[data-command-scope="catalog"]:not([inert])')) &&
    !document.querySelector('dialog:modal, [inert] .feature-overlay[data-command-scope="catalog"]');
}

export function blocksPageBack() {
  return Boolean(document.querySelector('dialog[open]:not(.edit-sidebar)')) ||
    Boolean(document.querySelector('dialog[data-bulk-editor][open]') && !catalogHandlesPageBack());
}

export function matchesPageBack(event, keys = defaultBackKeys) {
  if (event.repeat || event.nativeEvent?.isComposing || event.isComposing) return false;
  if (event.key==='Escape' && event.target?.closest?.('.expression-assistant')) return false;
  if (event.key==='Escape' && event.target?.closest?.('.unified-search')?.querySelector('.search-query-menu')) return false;
  if (typingTarget(event.target) && event.key !== 'Escape' && !/^F\d+$/.test(event.key) &&
    !event.ctrlKey && !event.metaKey && !event.altKey) return false;
  return matchesShortcut(event, keys);
}

export function usePageBackMatcher() {
  const keys = useContext(PageBackKeys);
  return useCallback(event => matchesPageBack(event, keys), [keys]);
}

// Keep capture/bubble phase explicit: globe history precedes its parent page.
// Returning false leaves the event available to the next navigation layer.
export default function useEscapeBack(back, { blocked = () => false, capture = false, stop = false } = {}) {
  const matches = usePageBackMatcher();
  const latest = useRef({ back, blocked, matches });
  latest.current = { back, blocked, matches };
  useEffect(() => {
    const key = event => {
      const { back, blocked, matches } = latest.current;
      if (!matches(event) || blocked(event)) return;
      if (back(event) === false) return;
      event.preventDefault();
      if (stop) event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', key, capture);
    return () => window.removeEventListener('keydown', key, capture);
  }, [capture, stop]);
}
