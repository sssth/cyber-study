import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sceneAssets } from './src/scenes/packages/presentation.js';
import { validatePackage } from './src/scenes/packages/validatePackage.js';
import { petModels } from './src/scenes/three/modelConfig.js';

const root = fileURLToPath(new URL('.', import.meta.url));
let sceneFolder;
let scene;

try {
  const config = JSON.parse(readFileSync(resolve(root, 'scene.config.json'), 'utf8'));
  if (typeof config.sceneFolder !== 'string' || !config.sceneFolder.trim()) {
    throw new Error('sceneFolder 必须填写场景文件夹路径。');
  }
  sceneFolder = resolve(root, config.sceneFolder);
  scene = validatePackage(JSON.parse(readFileSync(resolve(sceneFolder, 'scene.json'), 'utf8')));
  for (const file of sceneAssets(scene)) {
    const modelPath = resolve(sceneFolder, file);
    if (!modelPath.startsWith(sceneFolder + sep)) throw new Error(`资源路径超出场景目录：${file}`);
    if (!/\.glb$/i.test(file)) {
      if (!existsSync(modelPath)) throw Error(`缺少场景资源：${file}`);
      continue;
    }
    const header = Buffer.alloc(12);
    const descriptor = openSync(modelPath, 'r');
    try {
      if (readSync(descriptor, header) !== 12 || header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2) {
        throw new Error(`无效 GLB：${file}`);
      }
    } finally {
      closeSync(descriptor);
    }
  }
} catch (error) {
  throw new Error(`无法加载 scene.config.json 指定的场景包：${error.message}`);
}

export default defineConfig(({ mode }) => {
  const isMacPackage = mode === 'mac-package';
  return {
    plugins: [
      react(),
      {
        name: 'scene-manifest',
        resolveId(id) {
          if (id === 'virtual:scene-manifest') return '\0virtual:scene-manifest';
        },
        load(id) {
          if (id === '\0virtual:scene-manifest') return `export default ${JSON.stringify(scene)};`;
        },
        async writeBundle({ dir }) {
          if (!isMacPackage) return;

          const files = sceneAssets(scene);
          for (const { modelUrl } of petModels) {
            if (existsSync(resolve(sceneFolder, modelUrl))) files.add(modelUrl.slice(2));
          }

          for (const file of files) {
            const target = resolve(dir, file);
            await mkdir(dirname(target), { recursive: true });
            await copyFile(resolve(sceneFolder, file), target);
          }
          console.log(`已收录场景「${scene.name}」的 ${files.size} 个资源文件。`);
        }
      }
    ],
    base: './',
    publicDir: isMacPackage ? false : sceneFolder,
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  };
});
