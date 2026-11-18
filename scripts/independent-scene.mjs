import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sceneAssets } from '../src/scenes/packages/presentation.js';

export function selectScene(source, tier) {
  const scene = structuredClone(source);
  scene.assetDependencies = [];
  if (tier === 'low') scene.models = scene.models.map(model => {
    const result = { ...model, file: model.qualityFiles?.low ?? model.file };
    delete result.qualityFiles;
    if (result.previewFile) result.previewFile = result.file;
    return result;
  });
  return scene;
}

// Repack byte-identical views; no geometry, image or material conversion.
export async function writeIndependentScene(scene, source, output, extras = []) {
  const files = sceneAssets(scene);
  extras.forEach(file => files.add(file));
  const dependencies = new Set();
  const root = path.resolve(source);
  const readLocal = async (file, uri) => {
    const target = path.resolve(root, path.dirname(file), decodeURIComponent(uri));
    if (!target.startsWith(root + path.sep)) throw Error(`资源路径超出场景目录: ${uri}`);
    return fs.readFile(target);
  };
  for (const file of files) {
    const target = path.join(output, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (!file.endsWith('.glb')) { await fs.copyFile(path.join(root, file), target); continue; }
    const original = await fs.readFile(path.join(root, file));
    const length = original.readUInt32LE(12);
    const data = JSON.parse(original.subarray(20, 20 + length).toString());
    const buffers = await Promise.all((data.buffers ?? []).map(buffer => buffer.uri
      ? buffer.uri.startsWith('data:') ? Buffer.from(buffer.uri.split(',')[1], 'base64') : readLocal(file, buffer.uri)
      : original.subarray(28 + length)));
    const rewritten = [];
    for (const view of data.bufferViews ?? []) {
      if (view.extensions?.EXT_meshopt_compression) throw Error(`暂不支持压缩 bufferView: ${file}`);
      const buffer = buffers[view.buffer ?? 0];
      const start = view.byteOffset ?? 0;
      if (!buffer || start + view.byteLength > buffer.length) throw Error(`模型数据越界: ${file}`);
      const bytes = buffer.subarray(start, start + view.byteLength);
      const name = `models/shared/${createHash('sha256').update(bytes).digest('hex')}.bin`;
      if (!dependencies.has(name)) {
        await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
        await fs.writeFile(path.join(output, name), bytes);
        dependencies.add(name);
      }
      view.buffer = rewritten.length;
      view.byteOffset = 0;
      rewritten.push({ uri: path.relative(path.dirname(file), name).split(path.sep).join('/'), byteLength: bytes.length });
    }
    // Existing external image URIs, if present, must remain available.
    for (const image of data.images ?? []) if (image.uri && !image.uri.startsWith('data:')) {
      const bytes = await readLocal(file, image.uri);
      const name = `models/shared/${createHash('sha256').update(bytes).digest('hex')}${path.extname(image.uri)}`;
      await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
      await fs.writeFile(path.join(output, name), bytes);
      image.uri = path.relative(path.dirname(file), name).split(path.sep).join('/');
    }
    data.buffers = rewritten;
    const json = Buffer.from(JSON.stringify(data));
    const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
    const header = Buffer.alloc(20);
    header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length, 8);
    header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    await fs.writeFile(target, Buffer.concat([header, padded]));
  }
  scene.assetDependencies = [...dependencies];
  await fs.writeFile(path.join(output, 'scene.json'), JSON.stringify(scene, null, 2));
  return dependencies.size;
}
