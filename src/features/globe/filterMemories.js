import { contains } from './geographyMath.js';
import { matchesItem } from '../../search/searchCore.js';

import {parseQuery} from '../../search/logicQuery.js';

function includesJourney(node,negated=false){
  if(!node)return false;
  if(node.op==='NOT')return includesJourney(node.a,!negated);
  if(node.op)return includesJourney(node.a,negated)||includesJourney(node.b,negated);
  return !negated && node.field==='type' && node.exact==='journey';
}

export function filterGlobeMemories(photos, journeys, search, region = null, geometry = null) {
  // Only the query and search mode apply here; obsolete date/status filters must not leak in.
  if (region) photos = photos.filter(p => {
    if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) return Boolean(geometry && contains(geometry, p.longitude, p.latitude));
    return region.kind === 'country' ? p.country === region.name : p.region === region.name;
  });
  const query = { query: search?.query || '', filters: {} };
  const activeJourneys = journeys.filter(j => !j.deletedAt);
  const journeySearch=includesJourney(parseQuery(query.query).tree);
  const visibleJourneys=journeySearch?activeJourneys.filter(j=>matchesItem('journey',j,query)):activeJourneys;
  const members=journeySearch?new Set(visibleJourneys.flatMap(j=>j.pointIds||[])):null;
  const visiblePhotos=photos.filter(p=>!p.deletedAt && (members?.has(p.id)||matchesItem('memory_point',p,query)));
  return {visibleJourneys,visiblePhotos,journeySearch};
}
