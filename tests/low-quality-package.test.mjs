import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lowQualityPackage } from '../scripts/low-quality-package.mjs';
import { validatePackage } from '../src/scenes/packages/validatePackage.js';
import { loadGraphics, needsGraphicsCalibration } from '../src/data/graphics.js';
test('startup uses low even with an existing high preference', () => {
  globalThis.localStorage = { getItem: () => 'high' };
  assert.equal(loadGraphics().textures, 'low');
  assert.equal(needsGraphicsCalibration(), false);
  delete globalThis.localStorage;
});
test('low package is valid and contains every selected model and dependency', () => {
  const folder = JSON.parse(fs.readFileSync('scene.config.json')).sceneFolder;
  const original = JSON.parse(fs.readFileSync(`${folder}/scene.json`));
  const snapshot = JSON.stringify(original);
  const { scene, files } = lowQualityPackage(original, folder);
  validatePackage(scene);
  assert.equal(JSON.stringify(original), snapshot);
  for (const file of files) assert.ok(fs.existsSync(`${folder}/${file}`), file);
  for (let i = 0; i < scene.models.length; i++) {
    assert.equal(scene.models[i].file, original.models[i].qualityFiles?.low ?? original.models[i].file);
    assert.equal(scene.models[i].qualityFiles, undefined);
  }
});
