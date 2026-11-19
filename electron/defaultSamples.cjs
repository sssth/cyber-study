const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./bookStorage.cjs');

const bundledSamples = path.join(__dirname, '..', 'assets', 'default-samples');
const retiredBookIds = new Set([
  'sample:数字花园读书法.txt', 'sample:深度工作的十二个夜晚.txt',
  'sample:潮汐观测手记.txt', 'sample:雨夜信号.txt'
]);

async function readIfPresent(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function defaultSamples(userData) {
  const marker = path.join(userData, 'default-samples-v1');
  const readState = () => readIfPresent(marker);

  const source = path.join(bundledSamples, 'profile');
  function copyMissing(directory) {
    return fs.cp(path.join(source, directory), path.join(userData, directory), {
      recursive: true, force: false, mode: constants.COPYFILE_FICLONE
    });
  }

  async function seedGlobe() {
    const index = path.join('memory-globe', 'library.json');
    const target = path.join(userData, index);
    const existing = JSON.parse(await readIfPresent(target));
    if (existing && (existing.photos?.length || existing.journeys?.length || existing.migrations?.length)) return;
    await copyMissing(path.join('memory-globe', 'assets'));
    await atomicWrite(target, await fs.readFile(path.join(source, index)));
  }

  async function prepare() {
    let state = await readState();
    if (!state) {
      await fs.mkdir(userData, { recursive: true });
      await atomicWrite(marker, 'files');
      state = 'files';
    }
    if (state !== 'files') return;

    await copyMissing('books');
    await seedGlobe();
    await atomicWrite(marker, 'renderer');
  }

  let pending;
  function start() {
    pending ??= prepare().finally(() => { pending = null; });
    return pending;
  }

  async function read({ music, movies } = {}) {
    await start();
    const state = await readState();
    if (state === 'complete') return {};

    if (music === true) await copyMissing('music-cache');
    if (movies === true) await copyMissing('movie-posters');
    const { storage, covers } = JSON.parse(await fs.readFile(path.join(bundledSamples, 'samples.json'), 'utf8'));
    const images = await Promise.all(covers.map(async ({ id, name, file }) => ({
      id, name, bytes: await fs.readFile(path.join(bundledSamples, 'covers', file))
    })));
    return { storage, covers: images, retiredBookIds: [...retiredBookIds] };
  }

  async function finish() {
    if (await readState() === 'renderer') await atomicWrite(marker, 'complete');
  }

  return { start, read, finish };
}

module.exports = { defaultSamples, retiredBookIds };
