export function memoPosition(items, type, width = 600, height = 420) {
  const cardHeight = type === 'image' ? 140 : 96;
  for (let y = 16; y + cardHeight <= height; y += 24) {
    for (let x = 16; x + 180 <= width; x += 24) {
      const overlaps = items.some((item) =>
        x < item.x + (item.width ?? 180) + 8 && x + 188 > item.x &&
        y < item.y + (item.height ?? (item.type === 'image' ? 140 : 96)) + 8 && y + cardHeight + 8 > item.y);
      if (!overlaps) return { x, y };
    }
  }
  const offset = items.length % 9 * 16;
  return { x: 16 + offset, y: 16 + offset };
}
