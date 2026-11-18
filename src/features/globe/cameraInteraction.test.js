import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globeInteraction, zoomGlobeDistance } from './cameraInteraction.js';
test('close views progressively reduce dragging and zoom speed', () => {
 const world=globeInteraction(3.6), province=globeInteraction(1.15), city=globeInteraction(1.02);
 assert.equal(world.rotateSpeed,1);
 assert.ok(city.rotateSpeed < province.rotateSpeed && province.rotateSpeed < world.rotateSpeed);
 assert.ok(city.zoomSpeed < province.zoomSpeed && province.zoomSpeed < world.zoomSpeed);
 assert.ok(city.rotateSpeed > 0);
});
test('zoom buttons scale altitude without jumping to the surface', () => {
 assert.ok(Math.abs(zoomGlobeDistance(1.15,.8)-1.12)<1e-10);
 assert.equal(zoomGlobeDistance(1.015,.8),1.015);
 assert.equal(zoomGlobeDistance(5.5,1.25),5.5);
});
