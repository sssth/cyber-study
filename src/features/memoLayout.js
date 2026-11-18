export function memoPosition(items, type, width = 600, height = 420, size) {
  const cardHeight = size?.height || (type === 'image' ? 140 : 96);
  const cardWidth = size?.width || 180;
  for (let y = 16; y + cardHeight <= height; y += 24) {
    for (let x = 16; x + cardWidth <= width; x += 24) {
      const overlaps = items.some((item) =>
        x < item.x + memoSize(item).width + 8 && x + cardWidth + 8 > item.x &&
        y < item.y + memoSize(item).height + 8 && y + cardHeight + 8 > item.y);
      if (!overlaps) return { x, y };
    }
  }
  const offset = items.length % 9 * 16;
  return { x: 16 + offset, y: 16 + offset };
}

// Apply only edits made against the displayed snapshot, preserving newer records.
export function mergeMemoChanges(latest, before, after) {
  const previous = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  const result = latest.filter(item => !previous.has(item.id) || next.has(item.id)).map(item => {
    const old = previous.get(item.id), edited = next.get(item.id);
    if (!old || !edited) return item;
    const changes = Object.fromEntries(Object.entries(edited).filter(([key, value]) => value !== old[key]));
    return { ...item, ...changes };
  });
  const ids = new Set(latest.map(item => item.id));
  return [...result, ...after.filter(item => !previous.has(item.id) && !ids.has(item.id))];
}

export function memoSize(item) {
  if (item.width && item.height) return { width: item.width, height: item.height };
  if (item.photo) return { width: item.width || 180, height: item.height || 140 };
  const lines = String(item.text || '').split('\n');
  const units = line => [...line].reduce((n, c) => n + (/[^\x00-\xff]/.test(c) ? 14 : 7.5), 0);
  const padding = item.type === 'todo' ? 54 : 28;
  const width = item.width || Math.min(280, Math.max(100, Math.ceil(Math.max(...lines.map(units)) + padding)));
  const rows = lines.reduce((n, line) => n + Math.max(1, Math.ceil(units(line) / (width - padding))), 0);
  return { width, height: item.height || Math.min(220, Math.max(48, rows * 24 + 24)) };
}

export function clickedTodo(item, view, now = new Date().toISOString()) {
  if (view === 'board' && item.done) return { ...item, showOnBoard: false };
  return { ...item, done: !item.done, completedAt: item.done ? null : now };
}
