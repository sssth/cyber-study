import { selectScene, writeIndependentScene } from './scripts/independent-scene.mjs';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { resolve, sep } from 'node:path';
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
  const tier = process.env.SCENE_PACKAGE_TIER === 'full' ? 'full' : 'low';
  const bundledScene = isMacPackage ? selectScene(scene, tier) : scene;
  return {
    plugins: [
      react(),
      {
        name: 'scene-manifest',
        // The virtual module is built from files read while loading this config.
        configResolved(config) {
          config.configFileDependencies.push(resolve(root, 'scene.config.json'), resolve(sceneFolder, 'scene.json'));
        },
        resolveId(id) {
          if (id === 'virtual:scene-manifest') return '\0virtual:scene-manifest';
        },
        load(id) {
          if (id === '\0virtual:scene-manifest') return `export default ${JSON.stringify(bundledScene)};`;
        },
        async writeBundle({ dir }) {
          if (!isMacPackage) return;

          const extras = petModels.map(({ modelUrl }) => modelUrl.slice(2)).filter(file => existsSync(resolve(sceneFolder, file)));
          await writeIndependentScene(bundledScene, sceneFolder, dir, extras);
          console.log(`已生成独立资源场景：${tier === 'full' ? '完整画质版' : '低画质版'}`);
        }
      }
    ],
    base: './',
    publicDir: isMacPackage ? false : sceneFolder,
    server: {
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ai-settings.json*'] },
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
