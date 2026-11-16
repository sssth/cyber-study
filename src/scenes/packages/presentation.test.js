import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneAssets, validatePresentation } from './presentation.js';

const faces = ['front', 'right', 'back', 'left', 'up', 'down'];
const regional = () => ({
  regions: Object.fromEntries(faces.map(face => [face, `textures/${face}.png`])),
  tanHalfFov: 80 / 65, aspect: 1774 / 1576,
  front: { file: 'textures/original.png', tanHalfFov: 80 / 65, aspect: 1672 / 941, blend: 0.006 }
});
const scene = panorama => ({
  camera: {}, models: [{ file: 'room.glb' }], appearance: {
    defaultTheme: 'day', themes: { day: {
      label: 'Day', background: '#000000', fog: '#000000', fogDensity: 0,
      exposure: 1, lights: [], panorama
    } }
  }
});

test('regional scene packages include all six views and the untouched photo', () => {
  const data = scene(regional());
  validatePresentation(data, new Set());
  const files = sceneAssets(data);
  assert.equal(files.size, 8);
  assert.ok(files.has('textures/original.png'));
  for (const face of faces) assert.ok(files.has(`textures/${face}.png`));
  assert.ok(!files.has(undefined));
});

test('reject incomplete faces, escaping paths and projections with uncovered directions', () => {
  for (const edit of [
    p => { delete p.regions.right; },
    p => { p.regions.back = '../outside.png'; },
    p => { p.aspect = 1.5; },
    p => { delete p.front; },
    p => { p.front.blend = 0; }
  ]) {
    const p = regional(); edit(p);
    assert.throws(() => validatePresentation(scene(p), new Set()));
  }
});

test('single-image panorama packages retain their asset and validation behavior', () => {
  const data = scene({ file: 'textures/panorama.jpg' });
  validatePresentation(data, new Set());
  assert.deepEqual([...sceneAssets(data)], ['room.glb', 'textures/panorama.jpg']);
});

test('optional sky repair is packaged and cannot escape the scene directory', () => {
  const p = regional();
  p.skyRepair = 'textures/sky-repair.png';
  validatePresentation(scene(p), new Set());
  assert.ok(sceneAssets(scene(p)).has(p.skyRepair));
  p.skyRepair = '../sky-repair.png';
  assert.throws(() => validatePresentation(scene(p), new Set()));
});
