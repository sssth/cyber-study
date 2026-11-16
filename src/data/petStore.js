import { loadSpaceData, saveSpaceData } from './spaceStorage.js';

const hour = 3600000;
const day = 24 * hour;
const moodWindow = 10 * 60000;

export function loadPet(now = Date.now()) {
  const pet = loadSpaceData('pet', { mood: 45, bond: 10, pets: 0, lastPettedAt: null, moodTouches: [] });
  const lastTouch = Date.parse(pet.lastPettedAt);
  const elapsed = Number.isFinite(lastTouch) ? Math.max(0, now - lastTouch) : 0;
  return {
    ...pet,
    mood: 55 + (pet.mood - 55) * 2 ** (-elapsed / (6 * hour)),
    bond: Math.max(10, pet.bond - Math.max(0, elapsed / day - 3))
  };
}

export function petCat(now = Date.now()) {
  const pet = loadPet(now);
  const today = new Date(now).toDateString();
  const dailyCount = pet.touchDay === today ? pet.dailyCount : 0;
  const recent = pet.moodTouches.filter(time => time > now - moodWindow);
  const next = {
    ...pet,
    activePetId: 'cat',
    mood: Math.min(100, pet.mood + ([12, 6, 3][recent.length] ?? 0)),
    bond: Math.min(100, pet.bond + ([3, 2, 1][dailyCount] ?? 0)),
    pets: pet.pets + 1,
    lastPettedAt: new Date(now).toISOString(),
    moodTouches: [...recent.slice(-2), now],
    touchDay: today,
    dailyCount: Math.min(3, dailyCount + 1)
  };
  return saveSpaceData('pet', next) ? { before: pet, after: next } : null;
}
