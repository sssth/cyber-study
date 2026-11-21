import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { defaultBackKeys, matchesShortcut, typingTarget } from '../data/shortcuts.js';

export const PageBackKeys = createContext(defaultBackKeys);

export function blocksPageBack() {
  return Boolean(document.querySelector('dialog[open]:not(.edit-sidebar), dialog[data-bulk-editor][open]'));
}

export function matchesPageBack(event, keys = defaultBackKeys) {
  if (event.repeat || event.nativeEvent?.isComposing || event.isComposing) return false;
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
