import { BufferGeometry, BufferAttribute } from 'three';
const cache = new WeakMap();
const unused = new Map();
const idleBudget = 32 * 1024 * 1024;
let idleBytes = 0;
function discard(entry) {
  if (unused.delete(entry)) idleBytes -= entry.bytes;
  entry.variants.delete(entry.buffer);
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
  const geometry = new BufferGeometry(), remap = new Int32Array(spec.vertexCount).fill(-1);
  const vertices = new Uint32Array(spec.vertexCount), compact = new Uint32Array(indices.length);
  let count = 0;
  for (let n = 0; n < indices.length; n++) {
    const old = indices[n];
    if (old >= spec.vertexCount) throw Error('LOD 顶点索引越界');
    if (remap[old] === -1) { remap[old] = count; vertices[count++] = old; }
    compact[n] = remap[old];
  }
  let bytes = 0;
  for (const [name, attribute] of Object.entries(base.attributes)) {
    if (attribute.isInterleavedBufferAttribute) throw Error('LOD 不支持交错顶点数据');
    const values = new attribute.array.constructor(count * attribute.itemSize);
    for (let n = 0; n < count; n++) {
      const start = vertices[n] * attribute.itemSize;
      values.set(attribute.array.subarray(start, start + attribute.itemSize), n * attribute.itemSize);
    }
    geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize, attribute.normalized));
    bytes += values.byteLength;
  }
  const compactIndices = count <= 65535 ? new Uint16Array(compact) : compact;
  geometry.setIndex(new BufferAttribute(compactIndices, 1)); bytes += compactIndices.byteLength;
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
// Used by offline validation; the renderer acquires only its currently needed tier.
export function lodGeometries(base, buffers, spec) {
  return buffers.map((buffer,i) => geometryEntry(base,buffer,spec,i).geometry);
}
export function lodCacheStats() { return { unusedBytes: idleBytes, unusedCount: unused.size, idleBudget }; }

// Conservative screen-size and measured simplification-error limits.
// Hysteresis returns to finer detail earlier than it switches to coarser detail.
export function chooseLod(pixels, quality, levels, previous = 0) {
  const thresholds = quality === 'high' ? [460, 230, 90] : quality === 'low' ? [900, 500, 220] : [700, 380, 160];
  const errorPixels = quality === 'high' ? 0.55 : quality === 'low' ? 1 : 0.75;
  let chosen = 0;
  for (let i = 0; i < levels.length; i++) {
    const margin = previous >= i + 1 ? 1.12 : 0.88;
    if (pixels < thresholds[i] * margin && pixels * levels[i].error < errorPixels * margin) chosen = i + 1;
  }
  return chosen;
}
