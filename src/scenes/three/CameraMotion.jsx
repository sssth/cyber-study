import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';

const settleMs = 320;
const motionScales = [1, 0.75, 0.6];

export default function CameraMotion({ motion }) {
  const get = useThree(state => state.get);
  const state = useMemo(() => ({
    position: new Vector3(), rotation: new Quaternion(), projection: 0, camera: null,
    lastChange: 0, tier: 0, slowFrames: 0, fastFrames: 0, timer: null
  }), []);
  useEffect(() => () => {
    clearTimeout(state.timer);
    motion.current = false;
    const { gl, viewport } = get();
    if (gl.getPixelRatio() !== viewport.dpr) gl.setPixelRatio(viewport.dpr);
  }, [get, motion, state]);

  useFrame(({ camera, gl, invalidate, viewport }) => {
    const now = performance.now();
    const projection = camera.projectionMatrix.elements[5];
    const moved = state.camera === camera && (!state.position.equals(camera.position) ||
      !state.rotation.equals(camera.quaternion) || state.projection !== projection);
    state.position.copy(camera.position);
    state.rotation.copy(camera.quaternion);
    state.projection = projection;
    state.camera = camera;

    if (moved) {
      if (motion.current) {
        const interval = now - state.lastChange;
        state.slowFrames = interval > (state.tier === 0 ? 24 : 32) ? state.slowFrames + 1 : 0;
        state.fastFrames = interval <= 17 ? state.fastFrames + 1 : 0;
        if (state.tier < motionScales.length - 1 && state.slowFrames >= 2) {
          state.tier++;
          state.slowFrames = 0;
        } else if (state.tier > 0 && state.fastFrames >= 20) {
          state.tier--;
          state.fastFrames = 0;
        }
      }
      motion.current = true;
      state.lastChange = now;
      clearTimeout(state.timer);
      state.timer = setTimeout(invalidate, settleMs);
    } else if (motion.current && now - state.lastChange >= settleMs) {
      motion.current = false;
      state.slowFrames = state.fastFrames = 0;
    }

    // Keep R3F's viewport at the selected ceiling. Only the drawing buffer
    // changes so scene presses and layout updates cannot reset the scale.
    const dpr = viewport.dpr * (motion.current ? motionScales[state.tier] : 1);
    if (gl.getPixelRatio() !== dpr) gl.setPixelRatio(dpr);
  }, -0.75);
  return null;
}
