import { useLayoutEffect, useRef } from 'react';
import { setItemEditing } from '../data/contentOrder.js';

// Shared edit lifecycle. Drafts and save guards belong to the calling feature.
export default function useEditSession(open, onExit, { editing = true } = {}) {
  const latest = useRef(onExit);
  latest.current = onExit;
  useLayoutEffect(() => {
    if (!open) return;
    if (editing) setItemEditing(true);
    const exit = () => latest.current?.();
    window.addEventListener('cyber-exit-item-edit', exit);
    return () => {
      window.removeEventListener('cyber-exit-item-edit', exit);
      if (editing) setItemEditing(false);
    };
  }, [open, editing]);
}
