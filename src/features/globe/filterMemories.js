import { contains } from './geographyMath.js';
import { matchesItem } from '../../search/searchCore.js';

export function filterGlobeMemories(photos, journeys, search, region = null, geometry = null) {
  // Only the query and search mode apply here; obsolete date/status filters must not leak in.
  if (region) photos = photos.filter(p => {
    if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) return Boolean(geometry && contains(geometry, p.longitude, p.latitude));
    return region.kind === 'country' ? p.country === region.name : p.region === region.name;
  });
  const query = { query: search?.query || '', filters: {} };
  const activeJourneys = journeys.filter(j => !j.deletedAt);
  if (search?.filters?.searchBy === 'journey') {
    const visibleJourneys = activeJourneys.filter(j => matchesItem('journey', j, query));
    const ids = new Set(visibleJourneys.flatMap(j => j.pointIds || []));
    return { visibleJourneys, visiblePhotos: photos.filter(p => !p.deletedAt && ids.has(p.id)) };
  }
  return { visibleJourneys: activeJourneys, visiblePhotos: photos.filter(p => matchesItem('memory_point', p, query)) };
}
