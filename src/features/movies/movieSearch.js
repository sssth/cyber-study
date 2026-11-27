import { matchesItem } from '../../search/searchCore.js';

export const movieFilters = [
  {key:'watchStatus', label:'i18n.watchStatus', options:[['想看','i18n.wantToWatch'],['在看','i18n.watching'],['看过','i18n.watched']]},
  ...['score','personalScore'].flatMap(field => ['Min','Max'].map(bound => ({
    key:field + bound, label:'i18n.' + field + bound, type:'number', min:0, max:10, step:0.1
  }))),
  {key:'from', label:'i18n.watchedFrom', type:'date'},
  {key:'to', label:'i18n.watchedTo', type:'date'}
];

export function matchesMovie(movie, search) {
  const {from, to, watchStatus, ...filters} = search.filters;
  if (watchStatus && (movie.status || '想看') !== watchStatus) return false;
  if ((from || to) && (!movie.watchedOn || movie.watchedOn < (from || '') || (to && movie.watchedOn > to))) return false;
  for (const field of ['score','personalScore']) {
    const min = filters[field + 'Min'], max = filters[field + 'Max'];
    if (!min && !max) continue;
    const raw = movie[field];
    if (raw == null || String(raw).trim() === '' || !Number.isFinite(Number(raw))) return false;
    if ((min && Number(raw) < Number(min)) || (max && Number(raw) > Number(max))) return false;
  }
  return matchesItem('movie', movie, {...search, filters});
}
