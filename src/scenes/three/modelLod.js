import { BufferGeometry, BufferAttribute } from 'three';
const cache = new WeakMap();
const unused = new Map();
const idleBudget = 32 * 1024 * 1024;
let idleBytes = 0;
function discard(entry) {
  if (unused.delete(entry)) idleBytes -= entry.bytes;
  entry.variants.delete(entry.buffer);
  // Variants own their index only. Three removes all attached GPU
  // attributes on dispose, so detach the base mesh's shared attributes first.
  entry.geometry.attributes = {};
  entry.geometry.morphAttributes = {};
  entry.geometry.dispose();
}
function geometryEntry(base, buffer, spec, i) {
  if (base.getAttribute('position').count !== spec.vertexCount || base.index?.count !== spec.sourceTriangles * 3) throw Error('LOD 与原模型不匹配');
  if (buffer.byteLength !== spec.levels[i].triangles * 12) throw Error('LOD 数据长度无效');
  let variants = cache.get(base);
  if (!variants) {
    variants = new Map(); cache.set(base, variants);
    base.addEventListener('dispose', () => { for (const entry of [...variants.values()]) discard(entry); });
  }
  if (variants.has(buffer)) return variants.get(buffer);
  const indices = new Uint32Array(buffer);
  for (let n = 0; n < indices.length; n++) {
    if (indices[n] >= spec.vertexCount) throw Error('LOD 顶点索引越界');
  }
  for (const attribute of Object.values(base.attributes)) {
    if (attribute.isInterleavedBufferAttribute) throw Error('LOD 不支持交错顶点数据');
  }
  const geometry = new BufferGeometry();
  geometry.attributes = base.attributes;
  geometry.morphAttributes = base.morphAttributes;
  geometry.morphTargetsRelative = base.morphTargetsRelative;
  const indexValues = spec.vertexCount <= 65535 ? new Uint16Array(indices) : indices;
  geometry.setIndex(new BufferAttribute(indexValues, 1));
  const bytes = indexValues.byteLength;
  geometry.boundingBox = base.boundingBox; geometry.boundingSphere = base.boundingSphere;
  const entry = { geometry, buffer, variants, bytes, users: 0 };
  variants.set(buffer, entry); return entry;
}
export function retainLodGeometry(base, buffer, spec, level) {
  const entry = geometryEntry(base, buffer, spec, level);
  if (unused.delete(entry)) idleBytes -= entry.bytes;
  entry.users++;
  let released = false;
  return { geometry: entry.geometry, release() {
    if (released) return; released = true;
    if (--entry.users === 0 && entry.variants.has(entry.buffer)) {
      unused.set(entry,true); idleBytes += entry.bytes;
      while (idleBytes > idleBudget) discard(unused.keys().next().value);
    }
  } };
}
// Used by offline validation; compacts referenced vertices to verify attribute integrity.
export function lodGeometries(base, buffers, spec) {
  return buffers.map((buffer, i) => {
    const entry = geometryEntry(base, buffer, spec, i);
    if (entry.compacted) return entry.compacted;
    const indices = new Uint32Array(buffer);
    const geometry = new BufferGeometry(), remap = new Int32Array(spec.vertexCount).fill(-1);
    const vertices = new Uint32Array(spec.vertexCount), compact = new Uint32Array(indices.length);
    let count = 0;
    for (let n = 0; n < indices.length; n++) {
      const old = indices[n];
      if (remap[old] === -1) { remap[old] = count; vertices[count++] = old; }
      compact[n] = remap[old];
    }
    for (const [name, attribute] of Object.entries(base.attributes)) {
      const values = new attribute.array.constructor(count * attribute.itemSize);
      for (let n = 0; n < count; n++) {
        const start = vertices[n] * attribute.itemSize;
        values.set(attribute.array.subarray(start, start + attribute.itemSize), n * attribute.itemSize);
      }
      geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize, attribute.normalized));
    }
    const compactIndices = count <= 65535 ? new Uint16Array(compact) : compact;
    geometry.setIndex(new BufferAttribute(compactIndices, 1));
    geometry.boundingBox = base.boundingBox; geometry.boundingSphere = base.boundingSphere;
    entry.compacted = geometry;
    return geometry;
  });
}
export function lodCacheStats() { return { unusedBytes: idleBytes, unusedCount: unused.size, idleBudget }; }

// Bound projected simplification error in screen pixels. Hold the current
// level around its boundary so small camera movements do not swap index buffers.
export function chooseLod(pixels, quality, levels, previous = 0, moving = false) {
  const lowQuality = quality === 'low';
  const thresholds = quality === 'high' ? [460, 230, 90] : [700, 380, 160];
  const errorPixels = lowQuality ? (moving ? 2 : 0.9) : quality === 'high' ? 0.55 : 0.75;
  if (lowQuality && pixels >= 1800) return 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    const margin = previous > i ? 1.12 : 0.88;
    if ((lowQuality || pixels < thresholds[i] * margin) && pixels * levels[i].error < errorPixels * margin) return i + 1;
  }
  return 0;
}
