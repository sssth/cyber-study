import { sceneAssets } from '../../src/scenes/packages/presentation.js';
import { validatePackage } from '../../src/scenes/packages/validatePackage.js';

const manifestName = 'scene.json';
const glbMagic = 0x46546c67;
const jsonChunk = 0x4e4f534a;
const binaryChunk = 0x004e4942;

export async function openFolder(directory) {
  let manifest;
  try {
    manifest = await directory.getFileHandle(manifestName);
  } catch (error) {
    if (error.name !== 'NotFoundError' && error.name !== 'TypeMismatchError') throw error;
    throw Error('文件夹根目录缺少 scene.json。请选择单个场景包文件夹。');
  }
  return { root: directory.name, directory, manifest, checks: new Map() };
}

async function inspectPath(folder, path, allowed) {
  const parts = path.split('/');
  const name = parts.pop();
  let file;
  try {
    let directory = folder.directory;
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    file = await (await directory.getFileHandle(name)).getFile();
  } catch (error) {
    if (error.name === 'NotFoundError' || error.name === 'TypeMismatchError') throw Error('缺少场景资源文件。');
    throw error;
  }
  if (/\.glb$/i.test(path)) {
    file = await embedPackageBuffers(file, path, folder, allowed);
    await inspectModel(file);
  }
  else if (!file.size) throw Error('资源文件为空。');
  return file;
}

// Preview uses blob URLs, so package-relative shared buffers must be embedded in
// a temporary File. The on-disk package and its quality resource sharing stay intact.
async function embedPackageBuffers(file, path, folder, allowed) {
  const header = new DataView(await file.slice(0, 20).arrayBuffer());
  if (header.byteLength < 20 || header.getUint32(0, true) !== glbMagic) return file;
  const jsonLength = header.getUint32(12, true);
  if (20 + jsonLength > file.size) return file;
  let gltf;
  try { gltf = JSON.parse(await file.slice(20, 20 + jsonLength).text()); } catch { return file; }
  if (!(gltf.buffers ?? []).some(buffer => buffer.uri && !buffer.uri.startsWith('data:'))) return file;
  const buffers = [];
  for (const buffer of gltf.buffers) {
    if (!buffer.uri) {
      buffers.push(new Uint8Array(await file.slice(28 + jsonLength).arrayBuffer()));
      continue;
    }
    if (typeof buffer.uri !== 'string' || /[:\\?#%]/.test(buffer.uri) || buffer.uri.startsWith('/')) throw Error('共享资源路径无效。');
    const parts = path.split('/').slice(0, -1);
    for (const part of buffer.uri.split('/')) {
      if (part === '..') { if (!parts.length) throw Error('共享资源不能超出场景包。'); parts.pop(); }
      else if (part && part !== '.') parts.push(part);
    }
    const resolved = parts.join('/');
    if (!allowed.has(resolved)) throw Error(`共享资源未列入场景包：${resolved}`);
    const name = parts.pop();
    let directory = folder.directory;
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    const source = await (await directory.getFileHandle(name)).getFile();
    if (source.size < buffer.byteLength) throw Error(`共享资源长度不足：${resolved}`);
    buffers.push(new Uint8Array(await source.arrayBuffer()));
  }
  let length = 0;
  const chunks = [];
  for (const view of gltf.bufferViews ?? []) {
    const source = buffers[view.buffer], start = view.byteOffset ?? 0;
    if (!source || !Number.isInteger(start) || start < 0 || !Number.isInteger(view.byteLength) || view.byteLength < 1 || start + view.byteLength > source.length) throw Error('共享模型数据范围无效。');
    const bytes = source.slice(start, start + view.byteLength);
    length = Math.ceil(length / 4) * 4;
    view.buffer = 0; view.byteOffset = length;
    chunks.push([length, bytes]); length += bytes.length;
  }
  gltf.buffers = [{ byteLength: length }];
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const paddedJson = Math.ceil(json.length / 4) * 4, paddedBin = Math.ceil(length / 4) * 4;
  const output = new Uint8Array(28 + paddedJson + paddedBin), view = new DataView(output.buffer);
  view.setUint32(0, glbMagic, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true);
  view.setUint32(12, paddedJson, true); view.setUint32(16, jsonChunk, true);
  output.fill(32, 20, 20 + paddedJson); output.set(json, 20);
  view.setUint32(20 + paddedJson, paddedBin, true); view.setUint32(24 + paddedJson, binaryChunk, true);
  for (const [offset, bytes] of chunks) output.set(bytes, 28 + paddedJson + offset);
  return new File([output], file.name, { type: file.type });
}

export async function saveManifest(folder, source, expected) {
  const writable = await folder.manifest.createWritable({ mode: 'exclusive' });
  try {
    const current = await (await folder.manifest.getFile()).text();
    if (current !== expected) throw Error('scene.json 已在其他地方修改，请重新选择文件夹后再编辑。');
    await writable.write(source);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

async function inspectModel(file) {
  const header = new DataView(await file.slice(0, 20).arrayBuffer());
  if (header.byteLength < 20 || header.getUint32(0, true) !== glbMagic ||
      header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== file.size) {
    throw Error('GLB 2.0 文件头无效，或声明长度与文件大小不符。');
  }
  const length = header.getUint32(12, true);
  const jsonEnd = 20 + length;
  if (!length || length % 4 || jsonEnd > file.size || header.getUint32(16, true) !== jsonChunk) {
    throw Error('缺少有效的 GLB JSON 数据块。');
  }
  let gltf;
  try {
    gltf = JSON.parse(await file.slice(20, jsonEnd).text());
  } catch (error) {
    throw Error(`GLB 内部 JSON 无效（${error.message}）。`);
  }
  if (gltf?.asset?.version !== '2.0' || !Array.isArray(gltf.scenes) || !gltf.scenes.length ||
      !Array.isArray(gltf.meshes) || !gltf.meshes.some(mesh => mesh?.primitives?.length)) {
    throw Error('缺少有效的 glTF 2.0 场景或网格。');
  }
  let binaryLength = 0;
  let offset = jsonEnd;
  while (offset < file.size) {
    const chunk = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    if (chunk.byteLength !== 8) throw Error('GLB 数据块头不完整。');
    const size = chunk.getUint32(0, true);
    const type = chunk.getUint32(4, true);
    if (size % 4 || offset + 8 + size > file.size || type === jsonChunk ||
        (type === binaryChunk && offset !== jsonEnd)) {
      throw Error('GLB 数据块顺序或长度无效。');
    }
    if (type === binaryChunk) binaryLength = size;
    offset += 8 + size;
  }
  for (const resource of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    if (resource.uri !== undefined && (typeof resource.uri !== 'string' || !resource.uri.startsWith('data:'))) {
      throw Error('引用了外部资源。请将模型数据和纹理嵌入 GLB。');
    }
  }
  for (const [index, buffer] of (gltf.buffers ?? []).entries()) {
    if (!Number.isInteger(buffer.byteLength) || buffer.byteLength < 1 ||
        (buffer.uri === undefined && (index !== 0 || buffer.byteLength > binaryLength))) {
      throw Error(`缓冲区 buffers[${index}] 的长度无效。`);
    }
  }
  for (const [index, view] of (gltf.bufferViews ?? []).entries()) {
    const buffer = gltf.buffers?.[view.buffer];
    const start = view.byteOffset ?? 0;
    if (!buffer || !Number.isInteger(start) || start < 0 || !Number.isInteger(view.byteLength) ||
        view.byteLength < 1 || start + view.byteLength > buffer.byteLength) {
      throw Error(`数据范围 bufferViews[${index}] 无效。`);
    }
  }
  for (const [index, image] of (gltf.images ?? []).entries()) {
    if (image.uri === undefined && (!gltf.bufferViews?.[image.bufferView] || typeof image.mimeType !== 'string')) {
      throw Error(`纹理 images[${index}] 缺少有效的嵌入数据。`);
    }
  }
}

function readManifest(source) {
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw Error(`scene.json 格式错误（${error.message}）。`);
  }
  for (const [index, model] of (Array.isArray(data?.models) ? data.models : []).entries()) {
    if (!model || typeof model !== 'object' || Array.isArray(model)) {
      throw Error(`models[${index}] 必须是物件配置。`);
    }
    if (model.rotation !== undefined && !Array.isArray(model.rotation)) {
      throw Error(`物件 ${model.id ?? index} 的 rotation 必须是三个数字。`);
    }
    if (model.support !== undefined && (typeof model.support !== 'string' || !model.support.trim())) {
      throw Error(`物件 ${model.id ?? index} 的 support 必须是承托物件 ID。`);
    }
  }
  validatePackage(data);
  const models = new Map(data.models.map(model => [model.id, model]));
  for (const model of data.models) {
    if (model.file.includes('\\') || model.file.split('/').some(part => !part || part === '.')) {
      throw Error(`物件 ${model.id} 的 file 必须使用包内相对路径和正斜杠。`);
    }
    if (models.get(model.support)?.support) throw Error(`物件 ${model.id} 使用了链式承托。`);
  }
  if (data.systemFeatures !== undefined) {
    if (!Array.isArray(data.systemFeatures)) throw Error('systemFeatures 必须是数组。');
    for (const [index, feature] of data.systemFeatures.entries()) {
      if (!feature || typeof feature.id !== 'string' || !feature.id.trim() ||
          typeof feature.label !== 'string' || typeof feature.description !== 'string' ||
          !Array.isArray(feature.models) || feature.models.some(id => typeof id !== 'string' || !models.has(id))) {
        throw Error(`systemFeatures[${index}] 的字段或物件引用无效。`);
      }
    }
  }
  return data;
}

export async function validateDraft(source, folder) {
  let data;
  try {
    data = readManifest(source);
  } catch (error) {
    return { errors: [error.message] };
  }
  const paths = [...sceneAssets(data)];
  const errors = [];
  const assets = Object.create(null);
  for (const path of paths) {
    try {
      if (!folder.checks.has(path)) folder.checks.set(path, inspectPath(folder, path, new Set(paths)));
      assets[path] = await folder.checks.get(path);
    } catch (error) {
      folder.checks.delete(path);
      errors.push(`${path} · ${error.message}`);
    }
  }
  return errors.length ? { errors } : { data, assets, count: new Set(data.models.map(model => model.file)).size };
}
