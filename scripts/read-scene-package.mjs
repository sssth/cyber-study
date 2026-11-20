import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePackage } from '../src/scenes/packages/validatePackage.js';

export const shelfManifestFile = 'display-shelves.json';

export function readScenePackage(folder) {
  const scene = JSON.parse(readFileSync(join(folder, 'scene.json'), 'utf8'));
  if (scene.displayShelves === undefined) {
    try {
      const { displayShelfStorage, displayShelves } = JSON.parse(readFileSync(join(folder, shelfManifestFile), 'utf8'));
      if (!Array.isArray(displayShelves)) throw Error('display-shelves.json 必须包含 displayShelves 数组。');
      Object.assign(scene, { displayShelfStorage, displayShelves });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return validatePackage(scene);
}
