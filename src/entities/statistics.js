import { loadSpaceData } from '../data/spaceStorage.js';
import { day, duration, focusAreas } from '../data/activityTime.js';
import { bookReadingStatus, loadReaderState } from '../features/library/storage.js';
import { excerptAppearance } from '../features/library/knowledgeStore.js';
import { graphEdges } from './edges.js';
import { contentTypes } from './registry.js';
import { translate as t } from '../i18n/index.js';

const periods = ['', '.day', '.week'];
const timed = area => periods.map(period => area + period);
const typeIds = Object.keys(contentTypes).map(type => 'count.' + type);
export const groups = {
  focus: [...timed('focus'), ...focusAreas.flatMap(timed)],
  entities: ['total', 'newWeek', 'related', 'contains', 'direct', ...typeIds],
  reading: ['books', 'inProgress', 'finished', 'excerpts', 'underlines', 'highlights', 'bookmarks', 'annotations', 'annotationCharacters', 'newExcerpts', 'newAnnotations', ...timed('reading')],
  music: ['songs', 'playlists', 'orphanSongs', ...timed('music')],
  journeys: ['trips', 'points', 'includedPoints', 'freePoints', 'wishPoints', 'visitedPoints', 'visitedCities', 'visitedRegions', 'visitedCountries'],
  memo: ['notes', 'todos', 'remaining', 'done', 'completion'],
  journal: ['entries', 'days', 'recentDays', 'monthDays', 'streakDays', 'characters', ...timed('diary')],
  copying: ['works', 'openWorks', 'doneWorks', 'copiedCharacters', ...timed('copying')]
};
const defaults = {
  focus: ['focus', 'focus.day'], entities: ['total'], reading: ['excerpts','annotations'],
  music: ['songs','playlists'], journeys: ['points','trips'], memo: ['todos','completion'],
  journal: ['entries','days'], copying: ['works','openWorks']
};
export const newGroup = id => ({ id, items: [...defaults[id]] });
export const layoutKey = 'statistics-layout-v2';
export function readLayout() {
  const saved = loadSpaceData(layoutKey, null);
  if (Array.isArray(saved)) return saved.filter(group => group && Object.hasOwn(groups, group.id) && Array.isArray(group.items))
    .map(group => ({ id: group.id, items: [...new Set(group.items)].filter(id => groups[group.id].includes(id)) }));
  const result = [];
  for (const old of loadSpaceData('statistics-blocks', ['focus','entities'])) {
    const id = ({ links: 'entities', todos: 'memo' })[old] ?? old;
    if (!Object.hasOwn(groups,id)) continue;
    let group = result.find(group => group.id === id);
    if (!group) { group = { id, items: [] }; result.push(group); }
    group.items = [...new Set([...group.items, ...(old === 'links' ? ['related','direct','contains'] : defaults[id])])];
  }
  return result;
}
export const groupName = id => t('i18n.statsGroup_' + id);
export function itemName(id) {
  if (id.startsWith('count.')) return t('i18n.statsCount',t(contentTypes[id.slice(6)]));
  const [base, period] = id.split('.');
  const name = t('i18n.statsItem_' + base);
  return period ? t('i18n.statsPeriod_' + period, name) : name;
}
const characterCount = text => Array.from((text ?? '').replace(/\s/g, '')).length;

function journalDays(entries, now) {
  // Map local calendar dates to consecutive day numbers, including across DST.
  const dayNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / day;
  const today = dayNumber(new Date(now));
  const days = new Set();
  for (const { date } of entries) {
    if (!date) continue;
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T00:00:00' : date);
    if (Number.isFinite(parsed.getTime())) days.add(dayNumber(parsed));
  }
  const within = length => [...days].filter(n => n <= today && n > today - length).length;
  let cursor = days.has(today) ? today : today - 1;
  let streakDays = 0;
  while (days.has(cursor--)) streakDays++;
  return { days: days.size, recentDays: within(7), monthDays: within(30), streakDays };
}

function visitedPlaces(points) {
  const normalize = name => (name ?? '').normalize('NFKC').trim().toLowerCase();
  const countries = new Set(), regions = new Set(), cities = new Set();
  const namedCities = new Set();
  const manualCities = new Set();
  for (const point of points) {
    const country = normalize(point.country), region = normalize(point.region), city = normalize(point.city);
    if (country) countries.add(country);
    if (region) regions.add(JSON.stringify([country, region]));
    const place = JSON.stringify([country, region, city]);
    if (point.cityId) {
      cities.add(point.cityId);
      if (city) namedCities.add(place);
    } else if (city) manualCities.add(place);
  }
  let visitedCities = cities.size;
  for (const place of manualCities) if (!namedCities.has(place)) visitedCities++;
  return { visitedCities, visitedRegions: regions.size, visitedCountries: countries.size };
}

export function entityMetrics(items, now) {
  const counts = {};
  const byType = type => items.filter(item => item.type === type);
  for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
  const count = type => counts[type] || 0;
  const recent = value => { const date = Date.parse(value); return date <= now && date >= now - 7 * day; };
  const reader = loadReaderState().books;
  const books = byType('book').map(book => bookReadingStatus(reader[book.id]));
  const edges = graphEdges(items,loadSpaceData('content-relations', []));
  const done = byType('todo').filter(item => item.done).length;
  const finishedWorks = byType('typing_work').filter(item => item.complete);
  const diary = byType('diary');
  const excerpts = byType('excerpt');
  const points = byType('memory_point');
  const visited = points.filter(point => point.visitStatus !== 'wish');
  const memberIds = new Set(byType('journey').flatMap(trip => trip.pointIds ?? []));
  const included = points.filter(point => memberIds.has(point.id)).length;
  const metrics = {
    total: items.length,
    newWeek: items.filter(item => recent(item.type === 'annotation' ? item.annotationCreatedAt ?? item.createdAt : item.createdAt ?? item.importedAt ?? (item.type === 'diary' ? item.date : null))).length,
    books: books.length, inProgress: books.filter(value => value === 'reading').length, finished: books.filter(value => value === 'finished').length,
    excerpts: excerpts.length, underlines: excerpts.filter(note => note.excerptType === 'underline').length,
    highlights: excerpts.filter(note => excerptAppearance(note).excerptType === 'highlight').length, bookmarks: excerpts.filter(note => note.excerptType === 'bookmark').length,
    annotations: count('annotation'), annotationCharacters: byType('annotation').reduce((sum, item) => sum + characterCount(item.text ?? item.annotation), 0),
    newExcerpts: byType('excerpt').filter(item => recent(item.createdAt)).length,
    newAnnotations: byType('annotation').filter(item => recent(item.annotationCreatedAt ?? item.createdAt)).length,
    songs: count('music'), playlists: count('playlist'), orphanSongs: byType('music').filter(item => !item.playlists?.length).length,
    points: count('memory_point'), trips: count('journey'), includedPoints: included, freePoints: count('memory_point') - included,
    visitedPoints: visited.length, wishPoints: points.length - visited.length, ...visitedPlaces(visited),
    notes: count('memo'), todos: count('todo'), done, remaining: count('todo') - done,
    completion: count('todo') ? Math.round(100 * done / count('todo')) + '%' : '—',
    entries: diary.length, ...journalDays(diary, now),
    characters: diary.reduce((sum, entry) => sum + characterCount(entry.text), 0),
    works: count('typing_work'), openWorks: count('typing_work') - finishedWorks.length, doneWorks: finishedWorks.length,
    copiedCharacters: finishedWorks.reduce((sum, work) => sum + characterCount(work.typedText ?? work.text), 0)
  };
  for (const type of Object.keys(contentTypes)) metrics['count.'+type] = count(type);
  for (const kind of ['direct','contains','related']) metrics[kind] = edges.filter(edge => edge.kind === kind).length;
  return metrics;
}
export function activityMetric(id, data, now) {
  const [area, period] = id.split('.');
  if (![...focusAreas, 'focus', 'music'].includes(area)) return null;
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 0;
  const ms = area === 'focus' ? focusAreas.reduce((sum,key) => sum + duration(data,key,days,now), days ? 0 : data.legacy) : duration(data,area,days,now);
  return Math.floor(ms/60000) + ' ' + t('i18n.min');
}
