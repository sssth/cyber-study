import { cp, mkdir, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export async function copyMusicDependencies(sourceRoot, appRoot) {
  const copied = new Map();

  async function copyPackage(name, sourceParent, targetParent, ancestors, optional = false) {
    const resolveFrom = createRequire(join(sourceParent, 'package.json'));
    let source;
    for (const directory of resolveFrom.resolve.paths('music-runtime-dependency') ?? []) {
      try {
        source = await realpath(join(directory, name));
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!source) {
      if (optional) return;
      throw new Error(`缺少桌面音乐依赖：${name}`);
    }
    if (ancestors.get(name) === source) return;

    const target = join(targetParent, 'node_modules', name);
    if (copied.has(target)) return;
    copied.set(target, source);

    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, filter: entry => entry !== join(source, 'node_modules') });
    const next = new Map(ancestors).set(name, source);
    const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const dep of Object.keys(dependencies)) {
      await copyPackage(dep, source, target, next, Object.hasOwn(manifest.optionalDependencies ?? {}, dep));
    }
  }

  for (const name of ['NeteaseCloudMusicApi', 'qrc-decoder']) {
    await copyPackage(name, sourceRoot, appRoot, new Map());
  }
}
