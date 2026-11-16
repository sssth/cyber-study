import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const binSuffix = isWindows ? '.cmd' : '';
const viteBin = path.join(rootDir, 'node_modules', '.bin', `vite${binSuffix}`);
const electronBin = path.join(rootDir, 'node_modules', '.bin', `electron${binSuffix}`);
const devUrl = 'http://127.0.0.1:5173';

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

viteProcess = spawn(viteBin, ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env
});

viteProcess.on('exit', (code) => {
  if (!shuttingDown) {
    process.exit(code ?? 1);
  }
});

try {
  await waitForDevServer();
  electronProcess = spawn(electronBin, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
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
