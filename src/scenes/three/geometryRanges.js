// Quality GLBs reference geometry inside the original GLB. On HTTP servers that
// support byte ranges, read only those bytes, without copying assets on disk.
export function referencedRange(json, bufferIndex) {
  const views = (json.bufferViews ?? []).filter(v => v.buffer === bufferIndex);
  if (!views.length || views.some(v => v.extensions)) return null;
  const start = Math.min(...views.map(v => v.byteOffset ?? 0));
  const end = Math.max(...views.map(v => (v.byteOffset ?? 0) + v.byteLength));
  const length = json.buffers[bufferIndex].byteLength;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= length ? { start, end, length } : null;
}
export async function readGeometryRange(url, range, options = {}, request = fetch) {
  const response = await request(url, {
    headers: { ...options.headers, Range: `bytes=${range.start}-${range.end - 1}` },
    credentials: options.credentials ?? 'same-origin'
  });
  if (!response.ok) throw Error('Geometry range request failed');
  const bytes = await response.arrayBuffer();
  if (response.status === 206) {
    const expected = `bytes ${range.start}-${range.end - 1}/`;
    if (!response.headers.get('Content-Range')?.startsWith(expected) || bytes.byteLength !== range.end - range.start) throw Error('Invalid geometry range response');
    return bytes;
  }
  // Static file servers may ignore Range. Preserve correctness in that case.
  if (response.status === 200 && bytes.byteLength === range.length) return bytes.slice(range.start,range.end);
  throw Error('Unexpected geometry response length');
}
export function geometryRanges(parser) {
  const buffers = new Map();
  return { name: 'STUDY_geometry_ranges', loadBufferView(index) {
    const view = parser.json.bufferViews[index], buffer = parser.json.buffers[view.buffer];
    if (!buffer.uri || !/\.glb$/i.test(buffer.uri) || view.extensions) return null;
    const range = referencedRange(parser.json,view.buffer); if (!range) return null;
    const url = parser.options.manager.resolveURL(new URL(buffer.uri,new URL(parser.options.path,window.location.href)).href);
    if (!/^https?:/i.test(url)) return null;
    if (!buffers.has(view.buffer)) buffers.set(view.buffer, readGeometryRange(url,range,{
      headers: parser.options.requestHeader,
      credentials: parser.options.crossOrigin === 'use-credentials' ? 'include' : 'same-origin'
    }).catch(() => null));
    return buffers.get(view.buffer).then(bytes => bytes
      ? bytes.slice((view.byteOffset ?? 0)-range.start,(view.byteOffset ?? 0)-range.start+view.byteLength)
      : parser.loadBufferView(index));
  } };
}
export function extendSceneLoader(loader) { loader.register(geometryRanges); }
