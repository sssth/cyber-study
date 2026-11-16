import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Mounted only for a requested test; discard warm-up and hidden-tab samples.
export default function GraphicsMonitor({ onResult }) {
  const sample = useRef({ warmup: 0, elapsed: 0, frames: [], skip: true });
  useEffect(() => {
    const reset = () => { sample.current = { warmup: 0, elapsed: 0, frames: [], skip: true }; };
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, []);
  useFrame(({ gl }, delta) => {
    const s = sample.current;
    if (s.done) return;
    if (s.skip) { s.skip = false; return; }
    if (document.hidden) { s.warmup = 0; s.elapsed = 0; s.frames = []; return; }
    s.warmup += delta;
    if (s.warmup < 2) return;
    s.elapsed += delta;
    s.frames.push(delta * 1000);
    if (s.elapsed < 8) return;
    s.done = true;
    const sorted = [...s.frames].sort((a, b) => a - b);
    onResult({ fps: Math.round(s.frames.length / s.elapsed), p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(1), triangles: gl.info.render.triangles, calls: gl.info.render.calls, textures: gl.info.memory.textures });
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
    let start = performance.now();
    const reset = () => {
      frames.current = { count: 0, last: 0, intervals: [] };
      start = performance.now();
      onUpdate(null);
    };
    reset();
    document.addEventListener('visibilitychange', reset);
    const timer = setInterval(() => {
      const now = performance.now();
      const state = frames.current;
      const average = state.intervals.length ? state.intervals.reduce((a, b) => a + b, 0) / state.intervals.length : null;
      onUpdate({ hidden: document.hidden, fps: Math.round(state.count * 1000 / (now - start)), frameMs: average ? average.toFixed(1) : '—' });
      frames.current = { count: 0, last: state.last, intervals: [] };
      start = now;
    }, 1000);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', reset); };
  }, [onUpdate]);
  return null;
}
