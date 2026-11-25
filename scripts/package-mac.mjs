#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { copyMusicDependencies } from './copy-music-dependencies.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));

const isPreview = process.argv.includes('--preview');
const previewRoot = path.join(projectRoot, '场景包预览工具');
const appName = isPreview ? '场景包预览工具' : packageJson.productName || packageJson.name || 'App';
const appVersion = packageJson.version || '0.0.0';
const bundleId = process.env.MAC_BUNDLE_ID || 'com.cyberstudy.local';
const tier = process.argv.includes('--full') ? 'full' : 'low';
const edition = tier === 'full' ? '完整画质版' : '低画质版';
if (!isPreview) process.env.SCENE_PACKAGE_TIER = tier;
const outputRoot = path.join(projectRoot, 'release', 'mac', ...(isPreview ? [] : [edition]));

// 使用本机时区生成打包日期，例如 2026-11-10。
const packageDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.PACKAGE_TIMEZONE || 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const datedAppName = `${appName}-${packageDate}${isPreview ? '' : '-' + edition}`;
const stagingRoot = path.join(outputRoot, `${datedAppName}.app`);
const zipPath = path.join(outputRoot, `${datedAppName}.zip`);
const legacyAppPath = path.join(outputRoot, `${appName}.app`);
const legacyZipPath = path.join(outputRoot, `${appName}.zip`);

function run(command, args, { label } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    throw new Error(`${label || command} 启动失败：${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label || command} 执行失败，退出码 ${result.status}。`);
  }
}

async function copyTo(source, target) {
  await fs.cp(source, target, {
    recursive: true,
    force: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE
  });
}

async function getDiskSizeInMb(targetPath) {
  const stats = await fs.stat(targetPath);

  if (!stats.isDirectory()) {
    return (stats.size / 1024 / 1024).toFixed(1);
  }

  const result = spawnSync('/usr/bin/du', ['-sk', targetPath], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (result.error || result.status !== 0) {
    throw new Error(`无法读取大小：${targetPath}`);
  }

  const sizeKb = Number.parseInt(result.stdout, 10);
  if (!Number.isFinite(sizeKb)) {
    throw new Error(`无法解析大小：${targetPath}`);
  }

  return (sizeKb / 1024).toFixed(1);
}

async function setPlistValue(plistPath, key, type, value) {
  run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath], {
    label: `写入 ${key}`
  });

  if (type) {
    run('/usr/bin/plutil', ['-replace', key, '-string', value, plistPath], {
      label: `写入 ${key} 类型`
    });
  }
}

async function packagePreview() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scene-preview-'));
  const previewFolder = path.join(tempRoot, appName);
  const tempZip = path.join(tempRoot, path.basename(zipPath));

  try {
    await fs.mkdir(previewFolder);
    for (const file of ['打开场景包预览.command', 'serve.mjs', 'README.md', '场景制作格式.md']) {
      await fs.copyFile(path.join(previewRoot, file), path.join(previewFolder, file));
    }
    await fs.chmod(path.join(previewFolder, '打开场景包预览.command'), 0o755);
    await fs.access(path.join(previewRoot, 'web', 'index.html'));
    await copyTo(path.join(previewRoot, 'web'), path.join(previewFolder, 'web'));

    run('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', previewFolder, tempZip], {
      label: '生成预览工具 ZIP'
    });
    await fs.mkdir(outputRoot, { recursive: true });
    await fs.copyFile(tempZip, zipPath);
    console.log(`预览工具 ZIP：${zipPath}（约 ${await getDiskSizeInMb(zipPath)} MB）`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('当前打包脚本只支持 macOS。');
  }

  if (isPreview) {
    await packagePreview();
    return;
  }

  const electronDistApp = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app');
  const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

  for (const requiredPath of [electronDistApp, viteCli]) {
    try {
      await fs.access(requiredPath);
    } catch {
      throw new Error(`缺少必要文件：${requiredPath}。请先在项目根目录执行 pnpm install。`);
    }
  }

  console.log(`\n[1/7] 构建 ${appName} 前端资源...`);
  await fs.rm(path.join(projectRoot, 'dist'), { recursive: true, force: true });
  run(process.execPath, [viteCli, 'build', '--mode', 'mac-package'], { label: '前端构建' });

  console.log('\n[2/7] 准备 macOS 应用目录...');
  // 只清理本次日期对应的旧包，保留以前日期生成的产物。
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.rm(zipPath, { force: true });
  await fs.rm(legacyAppPath, { recursive: true, force: true });
  await fs.rm(legacyZipPath, { force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await copyTo(electronDistApp, stagingRoot);

  const contentsDir = path.join(stagingRoot, 'Contents');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const appPayloadDir = path.join(resourcesDir, 'app');
  const infoPlistPath = path.join(contentsDir, 'Info.plist');

  await fs.mkdir(appPayloadDir, { recursive: true });

  console.log('\n[3/7] 复制应用运行代码...');
  await fs.copyFile(path.join(projectRoot, 'package.json'), path.join(appPayloadDir, 'package.json'));
  await fs.copyFile(path.join(projectRoot, '使用建议.md'), path.join(appPayloadDir, '使用建议.md'));
  await copyTo(path.join(projectRoot, 'dist'), path.join(appPayloadDir, 'dist'));
  await copyTo(path.join(projectRoot, 'electron'), path.join(appPayloadDir, 'electron'));
  const regionDir = 'assets/geography/runtime/regions';
  if (await fs.stat(path.join(projectRoot, regionDir)).catch(() => null)) {
    await copyTo(path.join(projectRoot, regionDir), path.join(appPayloadDir, regionDir));
  }
  const geographyMath = 'src/features/globe/geographyMath.js';
  await copyTo(path.join(projectRoot, geographyMath), path.join(appPayloadDir, geographyMath));
  await copyMusicDependencies(projectRoot, appPayloadDir);
  await copyTo(path.join(projectRoot, 'assets', 'default-samples'), path.join(appPayloadDir, 'assets', 'default-samples'));

  // Electron 自带的示例应用在正式包中不需要。
  await fs.rm(path.join(resourcesDir, 'default_app.asar'), { force: true });

  console.log('\n[4/7] 写入应用信息...');
  const executableSource = path.join(contentsDir, 'MacOS', 'Electron');
  const executableTarget = path.join(contentsDir, 'MacOS', appName);
  await fs.rename(executableSource, executableTarget);

  for (const [key, value] of [
    ['CFBundleName', appName],
    ['CFBundleDisplayName', appName],
    ['CFBundleExecutable', appName],
    ['CFBundleIdentifier', bundleId],
    ['CFBundleShortVersionString', appVersion],
    ['CFBundleVersion', appVersion],
    ['LSApplicationCategoryType', 'public.app-category.books']
  ]) {
    await setPlistValue(infoPlistPath, key, 'string', value);
  }

  const iconCandidates = [
    path.join(projectRoot, 'assets', 'icons', 'app.icns'),
    path.join(projectRoot, 'assets', 'icon.icns')
  ];
  let iconPath = null;
  for (const candidate of iconCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        iconPath = candidate;
        break;
      }
    } catch {
      // 这个候选图标不存在时继续检查下一个位置。
    }
  }

  if (iconPath) {
    await fs.copyFile(iconPath, path.join(resourcesDir, 'app.icns'));
    await setPlistValue(infoPlistPath, 'CFBundleIconFile', 'string', 'app');
  }

  console.log('\n[5/7] 本地签名...');
  const identity = process.env.MAC_CODESIGN_IDENTITY || '-';
  if (String(process.env.MAC_CODESIGN_SKIP || '').toLowerCase() === '1') {
    console.log('已按设置跳过签名。');
  } else {
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', identity, stagingRoot], {
      label: '签名'
    });
  }

  console.log('\n[6/7] 校验应用包...');
  if (String(process.env.MAC_CODESIGN_SKIP || '').toLowerCase() !== '1') {
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagingRoot], {
      label: '签名校验'
    });
  }

  console.log('\n[7/7] 生成可传输 ZIP...');
  await fs.rm(zipPath, { force: true });
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', stagingRoot, zipPath], {
    label: '生成 ZIP'
  });

  const appSizeMb = await getDiskSizeInMb(stagingRoot);
  const zipSizeMb = await getDiskSizeInMb(zipPath);

  console.log('\n打包完成。');
  console.log(`应用位置：${stagingRoot}`);
  console.log(`应用大小：约 ${appSizeMb} MB`);
  console.log(`ZIP 位置：${zipPath}`);
  console.log(`ZIP 大小：约 ${zipSizeMb} MB`);
  console.log(`应用版本：${appVersion}`);
  console.log(`Bundle ID：${bundleId}`);
  console.log(`双击路径：release/mac/${edition}/${datedAppName}.app`);
  console.log(`可传输路径：release/mac/${edition}/${datedAppName}.zip`);
  console.log('\n发给其他 Mac 时，建议直接发送 ZIP；对方解压后再打开 App。');
}

main().catch((error) => {
  console.error(`\n打包失败：${error.message}`);
  process.exitCode = 1;
});
