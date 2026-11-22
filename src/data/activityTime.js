import { loadSpaceData, saveSpaceData } from './spaceStorage.js';
import { addFocusMinute, loadPlant } from './plantStore.js';

export const day = 86400000;
const key = 'activity-time';
export const focusAreas = ['reading', 'copying', 'diary'];
export function loadActivity(now = Date.now()) {
  return loadSpaceData(key, { since: now, legacy: loadPlant(now).focusMinutes * 60000, totals: {}, periods: {} });
}
export function initializeActivity() {
  if (!loadSpaceData(key, null)) saveSpaceData(key, loadActivity());
}
export function recordActivity(area, start, end) {
  if (!(end > start)) return;
  const data = loadActivity(start);
  data.totals[area] = (data.totals[area] || 0) + end - start;
  const periods = (data.periods[area] ?? []).filter(([, to]) => to > end - 7 * day);
  const last = periods.at(-1);
  if (last && last[1] === start) last[1] = end;
  else periods.push([start, end]);
  data.periods[area] = periods;
  saveSpaceData(key, data);
  if (area !== 'music') addFocusMinute((end - start) / 60000, end);
}
export function duration(data, area, days, now) {
  if (!days) return data.totals[area] || 0;
  return (data.periods[area] || []).reduce((total, [start, end]) =>
    total + Math.max(0, Math.min(end, now) - Math.max(start, now - days * day)), 0);
}
