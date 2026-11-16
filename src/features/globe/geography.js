import catalog from '../../../assets/geography/runtime/catalog.json';
const packs = import.meta.glob('../../../assets/geography/runtime/regions/*.json');
export { catalog };
export const nodeById = new Map(catalog.map(node => [node.id, node]));
const cache = new Map();
export function loadRegions(countryId = null) {
  const name = countryId ? countryId.replace(':', '_') : 'world';
  const key = `../../../assets/geography/runtime/regions/${name}.json`;
  if (!cache.has(key)) cache.set(key, packs[key] ? packs[key]().then(m => m.default).catch(error => { cache.delete(key); throw error; }) : Promise.resolve([]));
  return cache.get(key);
}
let citiesPromise;
export function loadCities() { return citiesPromise ||= import('../../../assets/geography/runtime/cities.json').then(m => m.default).catch(error => { citiesPromise = null; throw error; }); }
export { polygons, contains, regionView } from './geographyMath.js';
