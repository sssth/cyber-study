import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameProfiler, createGpuTimer } from './frameProfiler.js';

test('frameProfiler is inactive by default and activates via reference-counted leases', () => {
  const profiler = createFrameProfiler();
  assert.equal(profiler.active, false);

  profiler.beginFrame();
  profiler.measureZone('scene:cull', () => 42);
  profiler.commitFrame();
  assert.equal(profiler.summarize().frameCount, 0);

  const releaseA = profiler.retain();
  const releaseB = profiler.retain();
  assert.equal(profiler.active, true);

  releaseA();
  assert.equal(profiler.active, true);
  releaseB();
  assert.equal(profiler.active, false);
});

test('frameProfiler records per-stage timings, percentiles, and GPU samples', () => {
  const profiler = createFrameProfiler();
  profiler.enable();

  for (let i = 0; i < 5; i++) {
    profiler.beginFrame([2.5 + i * 0.5]);
    profiler.beginZone('scene:cull');
    profiler.endZone('scene:cull');
    const result = profiler.measureZone('three:render', () => 'ok');
    assert.equal(result, 'ok');
    profiler.commitFrame({
      gl: {
        info: {
          render: { calls: 12, triangles: 3400, points: 0, lines: 2 },
          memory: { geometries: 8, textures: 5 },
          programs: [{}, {}]
        }
      },
      scene: {
        userData: {
          renderOptimizationStats: { occluded: 1, outside: 2, singleSided: 3, occluders: 4 }
        }
      },
      gpuAvailable: true
    });
  }

  const summary = profiler.summarize();
  assert.equal(summary.frameCount, 5);
  assert.equal(summary.gpuSupported, true);
  assert.equal(summary.avgGpuMs, 3.5);
  assert.equal(summary.render.calls, 12);
  assert.equal(summary.render.triangles, 3400);
  assert.equal(summary.optimization.occluded, 1);
  assert.ok(summary.stages.some((stage) => stage.name === 'three:render'));
  assert.ok(summary.stages.some((stage) => stage.name === 'scene:cull'));

  const snap = profiler.snapshot();
  assert.equal(snap.recentFrames.length, 5);
});

test('createGpuTimer safely returns null when WebGL2 timer extension is unavailable', () => {
  assert.equal(createGpuTimer(null), null);
  assert.equal(createGpuTimer({ getContext: () => ({}) }), null);
});
