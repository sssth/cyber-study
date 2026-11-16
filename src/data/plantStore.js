import { loadSpaceData, saveSpaceData } from './spaceStorage.js';

const minute = 60000;
const day = 1440 * minute;

function recentMinutes(periods, at) {
  return periods.reduce((total, [start, end]) =>
    total + Math.max(0, Math.min(end, at) - Math.max(start, at - day)) / minute, 0);
}

function projectPlant(plant, now) {
  const since = Math.min(plant.updatedAt ?? now, now);
  const water = plant.updatedAt === undefined ? plant.water * 20 : plant.water;
  const waterAt = at => Math.max(0, water - 20 * (at - since) / day);
  const periods = plant.focusPeriods;
  let growth = plant.growth;

  // Re-evaluate the growth rate over time, including while the app is closed.
  const lastFocus = periods.at(-1)?.[1] ?? since - day;
  const end = Math.min(now, lastFocus + day);
  for (let start = since; start < end;) {
    const next = Math.min(start + 15 * minute, end);
    const midpoint = (start + next) / 2;
    const moisture = waterAt(midpoint);
    if (moisture < 40) break;
    const multiplier = moisture >= 60 ? 1 : 0.5;
    const focus = Math.min(120, recentMinutes(periods, midpoint));
    growth += (next - start) / day * multiplier * focus / 30;
    start = next;
  }

  return {
    ...plant,
    water: waterAt(now),
    growth,
    updatedAt: now,
    focusPeriods: periods.filter(([, end]) => end > now - day)
  };
}

function readPlant() {
  return loadSpaceData('plant', {
    growth: 8, water: 2, waterings: 0, focusMinutes: 0, focusPeriods: [], lastWateredAt: null
  });
}

export function initializePlantClock(now = Date.now()) {
  const plant = readPlant();
  if (plant.updatedAt === undefined) saveSpaceData('plant', projectPlant(plant, now));
}

export function loadPlant(now = Date.now()) {
  const plant = projectPlant(readPlant(), now);
  return { ...plant, recentFocusMinutes: recentMinutes(plant.focusPeriods, now) };
}

export function addFocusMinute(minutes = 1, now = Date.now()) {
  const start = now - minutes * minute;
  const plant = projectPlant(readPlant(), start);
  const previous = plant.focusPeriods.at(-1);
  if (previous && start <= previous[1] + 1000) {
    previous[1] = now;
  } else {
    plant.focusPeriods.push([start, now]);
  }
  plant.focusMinutes += minutes;
  return saveSpaceData('plant', projectPlant(plant, now));
}

export function waterPlant(now = Date.now()) {
  const plant = projectPlant(readPlant(), now);
  const before = plant.water;
  plant.water = Math.min(100, plant.water + 30);
  plant.waterings += 1;
  plant.lastWateredAt = new Date(now).toISOString();
  return saveSpaceData('plant', plant) ? { before, after: plant.water } : null;
}
