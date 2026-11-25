// Only level-three page headings and their single-line bullets are executable content.
export function parseUsageTips(source) {
  const pages = new Map();
  let entries;
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('#')) {
      const id = /^###\s+.*\[([\w-]+)\]\s*$/.exec(line)?.[1];
      entries = id ? [] : null;
      if (id) pages.set(id, entries);
    } else if (entries && line.startsWith('- ')) {
      const [zh, en] = line.slice(2).split(' || ').map(value => value.trim());
      if (zh) entries.push({ 'zh-CN': zh, en: en || zh });
    }
  }
  return pages;
}

export function usageTipAt(pages, page, step) {
  const local = pages.get(page);
  if (!local) return null;
  const global = pages.get('global') || [];
  if (!local.length) return global[step % global.length] ?? null;
  if (!step) return local[0];
  const count = local.length - 1;
  const index = step - 1;
  if (!count) return global[index % global.length] ?? local[0];
  if (!global.length) return local[1 + index % count];

  const perGroup = Math.min(2, count);
  const group = Math.floor(index / (perGroup + 1));
  const offset = index % (perGroup + 1);
  if (offset === perGroup) return global[group % global.length];
  return local[1 + (group * perGroup + offset) % count];
}
