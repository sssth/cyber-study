import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createGpuTimer, frameProfiler } from './frameProfiler.js';

export function FrameProfilerBridge() {
  const { gl, scene } = useThree();
  const gpuRef = useRef(null);

  useEffect(() => {
    const gpuTimer = createGpuTimer(gl);
    gpuRef.current = gpuTimer;
    const originalRender = gl.render.bind(gl);

    gl.render = function profiledRender(renderScene, renderCamera) {
      if (!frameProfiler.active) {
        return originalRender(renderScene, renderCamera);
      }
      frameProfiler.beginZone('three:render');
      gpuTimer?.begin();
      try {
        return originalRender(renderScene, renderCamera);
      } finally {
        gpuTimer?.end();
        frameProfiler.endZone('three:render');
        frameProfiler.commitFrame({
          gl,
          scene: renderScene ?? scene,
          gpuAvailable: Boolean(gpuTimer?.supported)
        });
      }
    };

    return () => {
      gl.render = originalRender;
      gpuTimer?.dispose();
      gpuRef.current = null;
    };
  }, [gl, scene]);

  useFrame(() => {
    if (!frameProfiler.active) return;
    const completed = gpuRef.current ? gpuRef.current.poll() : [];
    frameProfiler.beginFrame(completed);
  }, -100);

  return null;
}

// Mounted only for a requested test; discard warm-up and hidden-tab samples.
export default function GraphicsMonitor({ onResult }) {
  const sample = useRef({ warmup: 0, elapsed: 0, frames: [], skip: true });
  useEffect(() => {
    const release = frameProfiler.retain();
    const reset = () => {
      sample.current = { warmup: 0, elapsed: 0, frames: [], skip: true };
      frameProfiler.reset();
    };
    document.addEventListener('visibilitychange', reset);
    return () => {
      document.removeEventListener('visibilitychange', reset);
      release();
    };
  }, []);
  useFrame(({ gl }, delta) => {
    const s = sample.current;
    if (s.done) return;
    if (s.skip) { s.skip = false; return; }
    if (document.hidden) { s.warmup = 0; s.elapsed = 0; s.frames = []; return; }
    s.warmup += delta;
    if (s.warmup < 2) {
      if (s.warmup - delta < 2 && s.warmup >= 2) frameProfiler.reset();
      return;
    }
    s.elapsed += delta;
    s.frames.push(delta * 1000);
    if (s.elapsed < 8) return;
    s.done = true;
    const sorted = [...s.frames].sort((a, b) => a - b);
    const summary = frameProfiler.summarize(s.frames.length);
    const renderStage = summary.stages.find((stage) => stage.name === 'three:render');
    onResult({
      fps: Math.round(s.frames.length / s.elapsed),
      p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
      p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(1),
      maxMs: sorted[sorted.length - 1].toFixed(1),
      cpuFrameMs: summary.avgCpuFrameMs,
      cpuRenderMs: renderStage?.avgMs ?? null,
      gpuMs: summary.avgGpuMs,
      stages: summary.stages,
      triangles: gl.info.render.triangles,
      calls: gl.info.render.calls,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries
    });
  });
  return null;
}

// The settings panel requests continuous rendering while live monitoring is mounted.
export function LiveGraphicsMonitor({ onUpdate }) {
  const frames = useRef({ count: 0, last: 0, intervals: [] });
  useFrame(() => {
    if (document.hidden) return;
    const now = performance.now();
    const state = frames.current;
    if (state.last) state.intervals.push(now - state.last);
    state.last = now;
    state.count++;
  });
  useEffect(() => {
    const release = frameProfiler.retain();
    let start = performance.now();
    const reset = () => {
      frames.current = { count: 0, last: 0, intervals: [] };
      start = performance.now();
      frameProfiler.reset();
      onUpdate(null);
    };
    reset();
    document.addEventListener('visibilitychange', reset);
    const timer = setInterval(() => {
      const now = performance.now();
      const state = frames.current;
      const average = state.intervals.length ? state.intervals.reduce((a, b) => a + b, 0) / state.intervals.length : null;
      const summary = frameProfiler.summarize(Math.max(10, state.count));
      onUpdate({
        hidden: document.hidden,
        fps: Math.round(state.count * 1000 / (now - start)),
        frameMs: average ? average.toFixed(1) : '—',
        cpuMs: summary.avgCpuFrameMs,
        gpuMs: summary.avgGpuMs,
        calls: summary.render?.calls ?? null,
        triangles: summary.render?.triangles ?? null
      });
      frames.current = { count: 0, last: state.last, intervals: [] };
      start = now;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', reset);
      release();
    };
  }, [onUpdate]);
  return null;
}
