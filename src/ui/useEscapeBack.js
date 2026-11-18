import { useEffect } from 'react';

export function blocksPageBack(event) {
  return Boolean(document.querySelector(event.key === 'Escape' ? 'dialog[open]:not(.edit-sidebar)' : 'dialog[open]'));
}

export function isEscapeBack(event) {
  return event.key === 'Escape' && !event.repeat && !event.defaultPrevented;
}

// Keep capture/bubble phase explicit: globe history precedes its parent page.
// Returning false leaves the event available to the next navigation layer.
export default function useEscapeBack(back, { blocked = () => false, capture = false, stop = false, matches = isEscapeBack } = {}) {
  useEffect(() => {
    const key = event => {
      if (!matches(event) || blocked(event)) return;
      if (back(event) === false) return;
      event.preventDefault();
      if (stop) event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', key, capture);
    return () => window.removeEventListener('keydown', key, capture);
  }, [back, blocked, capture, stop, matches]);
}
