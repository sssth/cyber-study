import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globePosition, memoryPlaces } from './geo.js';
test('coordinates match Three sphere UV orientation, poles and radius', () => {
  const near = (actual, expected) => actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-10));
  near(globePosition(0, 0), [1, 0, 0]); near(globePosition(0, 90), [0, 0, -1]); near(globePosition(90, 0), [0, 1, 0]); near(globePosition(-90, 120), [0, -1, 0]); near(globePosition(0, 180), [-1, 0, 0]);
  assert.ok(Math.abs(Math.hypot(...globePosition(30, 120, 3.6)) - 3.6) < 1e-10);
});
test('only confirmed valid active photos are grouped, with dateline normalization', () => {
  const base = { latitude: 0, longitude: 180, locationStatus: 'confirmed', date: '' };
  const grouped = memoryPlaces([{ ...base, id: 'a' }, { ...base, id: 'b', longitude: -180 }, { ...base, id: 'pending', locationStatus: 'pending' }, { ...base, deletedAt: 'now' }, { ...base, latitude: 91 }, { ...base, longitude: NaN }, { ...base, latitude: '0' }]);
  assert.equal(grouped.length, 1); assert.equal(grouped[0].photos.length, 2); assert.equal(grouped[0].longitude, -180);
});
test('nearby distinct coordinates stay distinct and input order is not mutated', () => {
  const photos = [{id:'a',latitude:30,longitude:120,locationStatus:'confirmed',date:'2020-01-01'},{id:'b',latitude:30,longitude:120,locationStatus:'confirmed',date:'2025-01-01'},{id:'c',latitude:30.0001,longitude:120,locationStatus:'confirmed'}];
  const places=memoryPlaces(photos);assert.equal(places.length,2);assert.equal(places[0].photos[0].id,'b');assert.equal(photos[0].id,'a');
});
