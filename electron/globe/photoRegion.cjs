const fs = require('node:fs/promises');
const path = require('node:path');
const regions = new Map();
async function atPoint(pack, lon, lat) {
  if (!regions.has(pack)) {
    const file = path.join(__dirname, '../../assets/geography/runtime/regions', pack + '.json');
    try { regions.set(pack, JSON.parse(await fs.readFile(file, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; regions.set(pack, []); }
  }
  const { contains } = await import('../../src/features/globe/geographyMath.js');
  return regions.get(pack).find(({ bbox: [w,s,e,n], geometry }) =>
    lon >= w && lon <= e && lat >= s && lat <= n && contains(geometry, lon, lat));
}
async function photoRegion({ latitude, longitude }) {
  if (latitude == null || longitude == null) return {};
  const country = await atPoint('world', longitude, latitude);
  if (!country) return {};
  const region = await atPoint(country.id.replace(':', '_'), longitude, latitude);
  return { country: country.name, region: region?.name || '' };
}
module.exports = { photoRegion };
