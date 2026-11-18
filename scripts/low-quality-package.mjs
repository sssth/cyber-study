import { readFileSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { sceneAssets } from '../src/scenes/packages/presentation.js';

// Keep only the selected models and their actual external buffers/images.
export function lowQualityPackage(source, folder) {
  const scene = structuredClone(source);
  scene.models = scene.models.map(model => {
    const selected = { ...model, file: model.qualityFiles?.low ?? model.file };
    delete selected.qualityFiles;
    // Close-up views must also use the packaged model.
    if (selected.previewFile) selected.previewFile = selected.file;
    return selected;
  });
  scene.assetDependencies = [];
  const files = sceneAssets(scene);
  const root = resolve(folder);
  for (const file of files) {
    if (!file.endsWith('.glb')) continue;
    const buffer = readFileSync(resolve(root, file));
    const data = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
    for (const item of [...(data.buffers ?? []), ...(data.images ?? [])]) {
      if (!item.uri || item.uri.startsWith('data:')) continue;
      const target = resolve(root, dirname(file), decodeURIComponent(item.uri));
      if (!target.startsWith(root + sep)) throw Error(`资源路径超出场景目录：${item.uri}`);
      files.add(relative(root, target).split(sep).join('/'));
    }
  }
  scene.assetDependencies = [...files].filter(file => file.endsWith('.bin'));
  return { scene, files };
}
