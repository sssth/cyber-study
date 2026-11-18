// One return snapshot, never a growing navigation stack.
const views = new Map();
let restored = null;
export function registerView(key, read, apply) {
  const entry = { read, apply }; views.set(key, entry);
  return () => { if (views.get(key) === entry) views.delete(key); };
}
export function captureViews() { return Object.fromEntries([...views].map(([key, entry]) => [key, entry.read()])); }
export function restoredView(key, fallback) { return restored && Object.hasOwn(restored, key) ? restored[key] : typeof fallback === 'function' ? fallback() : fallback; }
export function hasRestoredView(key) { return Boolean(restored && Object.hasOwn(restored, key)); }
export function restoreViews(snapshot) { restored = snapshot || null; for (const [key, entry] of views) if (restored && Object.hasOwn(restored, key)) entry.apply?.(restored[key]); }
export function clearRestoredViews() { restored = null; }

export function createReturnPoint() {
  let origin = null;
  return {
    remember(value) { origin = value; },
    has() { return origin !== null; },
    take() { const value = origin; origin = null; return value; },
    clear() { origin = null; }
  };
}
