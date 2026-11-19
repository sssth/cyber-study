import '../../shared/contentAssets.js';
import { arrangementKey, loadArrangement } from '../reader/shelfArrangement.js';

const orderKey = 'cyber-study-content-order-v1';
const musicKey = 'cyber-study.space.v1.music';
const playlistsKey = 'cyber-study.space.v1.playlists';
const moviesKey = 'cyber-study.space.v1.movies';
const copyKey = 'cyber-study.space.v1.typewriter';

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedOrder(defaults, types) {
  const current = readStored(orderKey) ?? {};
  const slots = { ...current.slots };
  for (const type of types) {
    const existing = new Set(current[type] ?? []);
    const missing = Object.entries(defaults.slots[type] ?? {}).filter(([key]) => !existing.has(key));
    slots[type] = { ...Object.fromEntries(missing), ...slots[type] };
  }
  save(orderKey, { ...current, slots });
}

export async function initializeDefaultSamples() {
  const desktop = window.cyberStudy?.defaultSamples;
  const music = !readStored(musicKey)?.length && !readStored(playlistsKey)?.length;
  const movies = !readStored(moviesKey)?.length;
  const samples = await desktop?.read({ music, movies });
  if (!samples?.storage) return;

  const assets = globalThis.ContentAssets.repository('cyber-study-content-assets-v1');
  for (const { id, name, bytes } of samples.covers) {
    const key = `book:${id}`;
    if (!(await assets.get(key)).imageAssetIds.length) {
      await assets.add(key, [new File([bytes], name, { type: 'image/webp' })]);
    }
  }

  const { storage, retiredBookIds } = samples;
  try {
    const kept = new Set(retiredBookIds);
    const hasUserArrangement = loadArrangement(localStorage).some(shelf => shelf.some(entry => !kept.has(entry.bookId)));
    if (!hasUserArrangement) save(arrangementKey, storage[arrangementKey]);
  } catch (error) {
    console.warn('保留无法读取的书架陈列记录', error);
  }

  const types = ['book', 'memory_point', 'journey'];
  if (movies) {
    save(moviesKey, storage[moviesKey]);
    types.push('movie');
  }
  if (music) {
    save(musicKey, storage[musicKey]);
    save(playlistsKey, storage[playlistsKey]);
    types.push('music', 'playlist');
  }
  if (!readStored(copyKey)?.length) {
    save(copyKey, storage[copyKey]);
    types.push('typing_work');
  }
  seedOrder(storage[orderKey], types);
  await desktop.finish();
}
