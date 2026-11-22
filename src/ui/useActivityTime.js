import { useEffect } from 'react';
import { recordActivity } from '../data/activityTime.js';

function startClock(activeArea, requiresFocus) {
  let start = Date.now();
  let running = !requiresFocus || (!document.hidden && document.hasFocus());
  const checkpoint = () => {
    const now = Date.now();
    if (running) recordActivity(activeArea(), start, now);
    start = now;
  };
  const pause = () => { checkpoint(); running = false; };
  const sync = () => {
    checkpoint();
    running = !requiresFocus || (!document.hidden && document.hasFocus());
  };
  const timer = window.setInterval(checkpoint, 15000);
  const listeners = [[window, 'pagehide', pause], [window, 'pageshow', sync]];
  if (requiresFocus) listeners.push([window, 'focus', sync], [window, 'blur', pause], [document, 'visibilitychange', sync]);
  for (const [target, event, listener] of listeners) target.addEventListener(event, listener);
  return { checkpoint, stop() {
    clearInterval(timer);
    for (const [target, event, listener] of listeners) target.removeEventListener(event, listener);
  } };
}

// Detail views can overlap. Only the most recently opened focus view accrues time.
const focusViews = new Map();
let focusClock;
export default function useActivityTime(area, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (area === 'music') {
      const clock = startClock(() => area, false);
      return () => { clock.checkpoint(); clock.stop(); };
    }
    const token = {};
    focusClock?.checkpoint();
    focusViews.set(token, area);
    focusClock ??= startClock(() => [...focusViews.values()].at(-1), true);
    return () => {
      focusClock.checkpoint();
      focusViews.delete(token);
      if (!focusViews.size) { focusClock.stop(); focusClock = undefined; }
    };
  }, [area, enabled]);
}
