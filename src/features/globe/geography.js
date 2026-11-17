// 离线地理数据由 scripts/build-geography.py 生成到 assets/geography/runtime，仓库不含这份数据。
// 缺失时地球仪只保留陆地轮廓与个人足迹，区域／城市索引为空，应用其余功能不受影响。
const runtime = '../../../assets/geography/runtime';
const catalogs = import.meta.glob('../../../assets/geography/runtime/catalog.json', { eager: true, import: 'default' });
export const catalog = catalogs[`${runtime}/catalog.json`] ?? [];
export const nodeById = new Map(catalog.map(node => [node.id, node]));
const packs = import.meta.glob('../../../assets/geography/runtime/regions/*.json');
const cityPacks = import.meta.glob('../../../assets/geography/runtime/cities.json');
const cache = new Map();
export function loadRegions(countryId = null) {
  const name = countryId ? countryId.replace(':', '_') : 'world';
  const key = `${runtime}/regions/${name}.json`;
  if (!cache.has(key)) cache.set(key, packs[key] ? packs[key]().then(m => m.default).catch(error => { cache.delete(key); throw error; }) : Promise.resolve([]));
  return cache.get(key);
}
let citiesPromise;
export function loadCities() {
  const key = `${runtime}/cities.json`;
  return citiesPromise ||= cityPacks[key] ? cityPacks[key]().then(m => m.default).catch(error => { citiesPromise = null; throw error; }) : Promise.resolve([]);
}
export { polygons, contains, regionView } from './geographyMath.js';
