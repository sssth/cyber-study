import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clampCameraValue } from '../packages/cameraConfig.js';

import { matchesShortcut, movementShortcuts, typingTarget } from '../../data/shortcuts.js';
import { frameProfiler } from './frameProfiler.js';

export default function PackageCamera({ config: cameraConfig, view, roam: roamConfig, controls, inputActive, shortcuts }) {
  const settingsKey = JSON.stringify({ config: cameraConfig, roam: roamConfig });
  const { config, roam } = useMemo(() => JSON.parse(settingsKey), [settingsKey]);
  const poseKey = JSON.stringify({
    position: view?.position ?? config.position,
    fov: view?.fov ?? config.fov,
    target: view?.target,
    yaw: config.yaw ?? 0,
    pitch: config.pitch ?? -0.08
  });
  const transition = roam?.transition ?? 0.9;
  const { camera, gl, invalidate } = useThree();
  const state = useRef({
    keys: new Map(), pointer: null, wheel: 0,
    from: new Vector3(), to: new Vector3(), fromRotation: new Quaternion(), toRotation: new Quaternion(),
    angles: new Euler(0, 0, 0, 'YXZ'), movement: new Vector3(), elapsed: 0, duration: 0
  });

  useEffect(() => {
    const s = state.current;
    const pose = JSON.parse(poseKey);
    function reset(duration = 0) {
      invalidate();
      const target = new PerspectiveCamera();
      target.position.fromArray(pose.position);
      if (pose.target) target.lookAt(...pose.target);
      else target.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
      s.from.copy(camera.position);
      s.fromRotation.copy(camera.quaternion);
      s.to.copy(target.position);
      s.toRotation.copy(target.quaternion);
      s.fromFov = camera.fov;
      s.toFov = pose.fov;
      s.elapsed = 0;
      s.transitionStarted = performance.now();
      s.duration = duration;
      if (!duration) {
        camera.position.copy(s.to);
        camera.quaternion.copy(s.toRotation);
        camera.fov = s.toFov;
        camera.updateProjectionMatrix();
      }
    }
    reset(s.initialized ? transition : 0);
    s.initialized = true;
    controls.current = { reset: () => reset() };
    return () => { controls.current = null; };
  }, [camera, poseKey, transition, controls, invalidate]);

  useEffect(() => {
    if (!inputActive) return;
    const s = state.current;
    const canvas = gl.domElement;
    const down = e => {
      if (e.button === 0) {
        s.pointer = [e.clientX, e.clientY];
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const move = e => {
      if (!s.pointer) return;
      const dx = e.clientX - s.pointer[0], dy = e.clientY - s.pointer[1];
      s.pointer = [e.clientX, e.clientY];
      if (s.elapsed < s.duration) return;
      const angles = s.angles.setFromQuaternion(camera.quaternion);
      angles.y -= dx * 0.0032;
      angles.x -= dy * 0.0028;
      angles.y = roam ? angles.y : clampCameraValue(config, 'yaw', angles.y);
      angles.x = roam ? Math.min(1.45, Math.max(-1.45, angles.x)) : clampCameraValue(config, 'pitch', angles.x);
      camera.quaternion.setFromEuler(angles);
      invalidate();
    };
    const up = () => { s.pointer = null; };
    const wheel = e => {
      e.preventDefault();
      invalidate();
      if (roam) s.wheel += Math.sign(-e.deltaY) * Math.min(Math.abs(e.deltaY) * 0.0035, 0.5);
      else {
        camera.fov = clampCameraValue(config, 'fov', camera.fov + e.deltaY * 0.025);
        camera.updateProjectionMatrix();
      }
    };
    const keydown = e => {
      if (!roam || typingTarget(e.target)) return;
      const [direction] = movementShortcuts.find(([id]) => matchesShortcut(e, shortcuts[id])) ?? [];
      if (!direction) return;
      e.preventDefault();
      if (!e.repeat) s.keys.set(e.code || e.key, direction);
      invalidate();
    };
    const keyup = e => s.keys.delete(e.code || e.key);
    const clear = () => { s.keys.clear(); s.pointer = null; s.wheel = 0; };
    const local = {pointerdown:down, pointermove:move, pointerup:up, pointercancel:up, lostpointercapture:up, wheel};
    const global = {keydown, keyup, blur:clear};
    for (const [event, handler] of Object.entries(local)) canvas.addEventListener(event, handler, {passive:false});
    for (const [event, handler] of Object.entries(global)) window.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(local)) canvas.removeEventListener(event, handler);
      for (const [event, handler] of Object.entries(global)) window.removeEventListener(event, handler);
      clear();
    };
  }, [camera, config, gl, roam, inputActive, shortcuts, invalidate]);

  useFrame((_, dt) => {
    frameProfiler.measureZone('scene:camera', () => {
    const s = state.current;
    if (s.elapsed < s.duration) {
      // Measure from this transition, not the previous (possibly idle) frame.
      s.elapsed = Math.min(s.duration, (performance.now() - s.transitionStarted) / 1000);
      const t = s.elapsed / s.duration;
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(s.from, s.to, eased);
      camera.quaternion.slerpQuaternions(s.fromRotation, s.toRotation, eased);
      camera.fov = s.fromFov + (s.toFov - s.fromFov) * eased;
      camera.updateProjectionMatrix();
      invalidate();
      return;
    }
    if (!roam || (!s.keys.size && !s.wheel)) return;
    invalidate();
    const yaw = s.angles.setFromQuaternion(camera.quaternion).y;
    const held = new Set(s.keys.values());
    const forward = Number(held.has('w')) - Number(held.has('s'));
    const right = Number(held.has('d')) - Number(held.has('a'));
    const rise = Number(held.has('e')) - Number(held.has('q'));
    s.movement.set(right, rise, -forward).normalize().multiplyScalar(roam.speed * Math.min(dt, 0.05));
    s.movement.z -= s.wheel;
    s.wheel = 0;
    const x = s.movement.x, z = s.movement.z;
    camera.position.x += x * Math.cos(yaw) + z * Math.sin(yaw);
    camera.position.z += -x * Math.sin(yaw) + z * Math.cos(yaw);
    camera.position.y += s.movement.y;
    if (!rise && (x || z)) camera.position.y += (roam.eyeHeight - camera.position.y) * Math.min(dt * 2.2, 1);
    for (let i = 0; i < 3; i++) {
      camera.position.setComponent(i, Math.min(roam.max[i], Math.max(roam.min[i], camera.position.getComponent(i))));
    }
    });
  }, -1);
  return null;
}
