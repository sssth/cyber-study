import { Vector3, Ray, BackSide, LessEqualDepth, LessDepth } from 'three';
const boxes = new WeakMap();
// Only accept an outward-facing, closed six-face cuboid, not an arbitrary mesh's
// bounding box. In particular glass, open shelves and window holes cannot occlude.
export function solidBox(geometry) {
  if (boxes.has(geometry)) return boxes.get(geometry);
  boxes.set(geometry, null);
  const p = geometry.getAttribute('position'), index = geometry.index;
  if (!p || p.count > 36 || (index ? index.count : p.count) !== 36 || geometry.morphAttributes.position?.length) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox.clone(), size = box.getSize(new Vector3());
  if (Math.min(size.x, size.y, size.z) < 1e-6) return null;
  const codes = [], points = [], eps = Math.min(size.x, size.y, size.z) * 1e-5;
  for (let i = 0; i < p.count; i++) {
    const v = new Vector3().fromBufferAttribute(p, i); let code = 0;
    for (let axis = 0; axis < 3; axis++) {
      const n = v.getComponent(axis);
      if (Math.abs(n - box.max.getComponent(axis)) < eps) code |= 1 << axis;
      else if (Math.abs(n - box.min.getComponent(axis)) >= eps) return null;
    }
    points.push(v); codes.push(code);
  }
  const faces = Array.from({length:6}, () => []), a = new Vector3(), b = new Vector3(), center = box.getCenter(new Vector3());
  for (let i = 0; i < 36; i += 3) {
    const ids = [0,1,2].map(j => index ? index.getX(i+j) : i+j), tri = ids.map(id=>codes[id]);
    if (new Set(tri).size !== 3) return null;
    let face = -1;
    for (let axis = 0; axis < 3; axis++) if (tri.every(c => (c & (1<<axis)) === (tri[0] & (1<<axis)))) face = axis*2 + ((tri[0]>>axis)&1);
    if (face < 0) return null;
    a.subVectors(points[ids[1]],points[ids[0]]); b.subVectors(points[ids[2]],points[ids[0]]); a.cross(b);
    if (a.dot(b.subVectors(points[ids[0]],center)) <= 0) return null;
    faces[face].push(tri);
  }
  for (const face of faces) {
    if (face.length !== 2 || new Set(face.flat()).size !== 4) return null;
    const shared = face[0].filter(c=>face[1].includes(c));
    // The common edge must be a face diagonal (exactly two coordinate bits).
    if (shared.length !== 2 || ![3,5,6].includes(shared[0]^shared[1])) return null;
  }
  boxes.set(geometry,box); return box;
}
export function opaqueOccluder(material) {
  return material && !Array.isArray(material) &&
    (material.isMeshStandardMaterial || material.isMeshBasicMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial) &&
    material.side !== BackSide && [LessDepth, LessEqualDepth].includes(material.depthFunc) &&
    !material.stencilWrite && !material.polygonOffset && !material.alphaToCoverage && !material.transparent && material.opacity === 1 &&
    !material.alphaTest && !material.alphaHash && !material.transmission && !material.displacementMap &&
    !material.clippingPlanes?.length && !material.wireframe && material.depthWrite && material.depthTest && material.colorWrite;
}
export function boxCorners(box) {
  return Array.from({length:8},(_,i)=>new Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));
}
const ray = new Ray(), hit = new Vector3(), localEye = new Vector3(), target = new Vector3();
// All eight corners must lie inside ONE convex occlusion volume. Combining hits
// from different occluders would incorrectly hide objects visible through gaps.
export function boxFullyOccluded(eye, corners, occluder) {
  localEye.copy(eye).applyMatrix4(occluder.inverse);
  if (occluder.box.containsPoint(localEye)) return false;
  ray.origin.copy(localEye);
  for (const corner of corners) {
    target.copy(corner).applyMatrix4(occluder.inverse);
    const distance = target.distanceTo(localEye);
    ray.direction.subVectors(target,localEye).normalize();
    if (!ray.intersectBox(occluder.box,hit) || hit.distanceTo(localEye) >= distance - 1e-4) return false;
  }
  return true;
}
