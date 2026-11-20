import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadReaderState, saveReaderState } from './storage.js';

export default function useReadingSession(bookId) {
  const [state, setState] = useState(loadReaderState);
  const latest = useRef(state);
  const mounted = useRef(false);
  const pending = useRef(null);
  const timer = useRef(null);

  const update = useCallback(change => {
    const next = change(latest.current);
    latest.current = next;
    saveReaderState(next);
    if (mounted.current) setState(next);
  }, []);

  const flushPosition = useCallback(() => {
    clearTimeout(timer.current);
    const change = pending.current;
    pending.current = null;
    if (change) update(change);
  }, [update]);

  const queuePosition = change => {
    pending.current = change;
    clearTimeout(timer.current);
    timer.current = setTimeout(flushPosition, 220);
  };

  useLayoutEffect(() => {
    mounted.current = true;
    window.addEventListener('pagehide', flushPosition);
    return () => {
      mounted.current = false;
      flushPosition();
      window.removeEventListener('pagehide', flushPosition);
    };
  }, [flushPosition]);

  useEffect(() => {
    if (!bookId) return;
    let last = Date.now();
    const isActive = () => document.visibilityState === 'visible' && document.hasFocus();
    let active = isActive();
    let sessionSeconds = 0;

    function flushTime() {
      const now = Date.now();
      const seconds = active ? Math.min(15, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      if (!seconds) return;
      sessionSeconds += seconds;
      update(current => {
        const book = current.books[bookId] ?? {};
        return {
          ...current,
          books: {
            ...current.books,
            [bookId]: {
              ...book,
              totalReadingSeconds: (book.totalReadingSeconds || 0) + seconds,
              lastSessionSeconds: sessionSeconds,
              lastReadAt: new Date(now).toISOString()
            }
          }
        };
      });
    }

    function syncVisibility() {
      flushTime();
      active = isActive();
    }

    function suspend() {
      flushTime();
      active = false;
    }

    const interval = setInterval(flushTime, 10000);
    window.addEventListener('focus', syncVisibility);
    window.addEventListener('blur', suspend);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', syncVisibility);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      flushTime();
      clearInterval(interval);
      window.removeEventListener('focus', syncVisibility);
      window.removeEventListener('blur', suspend);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', syncVisibility);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [bookId, update]);

  return { state, update, queuePosition, flushPosition };
}
