import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const binSuffix = isWindows ? '.cmd' : '';
const viteCli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const devUrl = 'http://127.0.0.1:5173';

// Windows 的 .bin 里是 .cmd 包装脚本，直接 spawn 会被 Node 拒绝；优先用真实可执行文件。
function resolveElectronExecutable() {
  const dist = path.join(rootDir, 'node_modules', 'electron', 'dist');
  const candidates = isWindows
    ? [path.join(dist, 'electron.exe')]
    : [path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron'), path.join(dist, 'electron')];
  return candidates.find((candidate) => existsSync(candidate))
    ?? path.join(rootDir, 'node_modules', '.bin', `electron${binSuffix}`);
}

const electronExecutable = resolveElectronExecutable();

let electronProcess = null;
let viteProcess = null;
let shuttingDown = false;

function terminateProcesses() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill();
  }
}

process.on('SIGINT', () => {
  terminateProcesses();
  process.exit(0);
});

process.on('SIGTERM', () => {
  terminateProcesses();
  process.exit(0);
});

async function waitForDevServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(devUrl);
      if (response.ok) return;
    } catch {
      // The Vite server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`无法连接本地开发服务：${devUrl}`);
}

const viteArgs = ['--host', '127.0.0.1', '--port', '5173', '--strictPort'];
viteProcess = existsSync(viteCli)
  ? spawn(process.execPath, [viteCli, ...viteArgs], { cwd: rootDir, stdio: 'inherit', env: process.env })
  : spawn(path.join(rootDir, 'node_modules', '.bin', `vite${binSuffix}`), viteArgs, { cwd: rootDir, stdio: 'inherit', env: process.env });

viteProcess.on('exit', (code) => {
  if (!shuttingDown) {
    process.exit(code ?? 1);
  }
});

try {
  await waitForDevServer();
  // 某些终端环境（编辑器内置终端等）会设置 ELECTRON_RUN_AS_NODE，导致 Electron 退化成 Node 执行。
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...electronEnv } = process.env;
  electronProcess = spawn(electronExecutable, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...electronEnv,
      VITE_DEV_SERVER_URL: devUrl,
      NODE_ENV: 'development'
    }
  });

  electronProcess.on('exit', (code) => {
    terminateProcesses();
    process.exit(code ?? 0);
  });
} catch (error) {
  terminateProcesses();
  console.error(error.message);
  process.exit(1);
}
