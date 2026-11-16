export const defaultCameraLimits = Object.freeze({
  yaw: Object.freeze([-0.85, 0.85]),
  pitch: Object.freeze([-0.5, 0.45]),
  fov: Object.freeze([45, 85])
});

export function initialCameraKey({ position, fov, yaw = 0, pitch = -0.08 }) {
  return JSON.stringify([...position, fov, yaw, pitch]);
}

export function clampCameraValue(camera, field, value) {
  const [min, max] = camera.limits?.[field] ?? defaultCameraLimits[field];
  return Math.max(min, Math.min(max, value));
}
