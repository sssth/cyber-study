export function globeInteraction(distance) {
  const altitude = Math.max(.015, distance - 1);
  return {
    rotateSpeed: Math.min(1, Math.max(.008, altitude / 2.6)),
    zoomSpeed: Math.min(1, Math.max(.12, Math.sqrt(altitude / 2.6)))
  };
}
export function zoomGlobeDistance(distance, factor) {
  return Math.max(1.015, Math.min(5.5, 1 + (distance - 1) * factor));
}
