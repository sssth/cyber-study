export function includeDirectNeighbors(items, matches, edges) {
  const seeds = new Set(matches.map(item => item.key));
  const included = new Set(seeds);
  for (const {from, to} of edges) {
    if (seeds.has(from)) included.add(to);
    if (seeds.has(to)) included.add(from);
  }
  return items.filter(item => included.has(item.key));
}
