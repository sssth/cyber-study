import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const scenarios = ['navigation-return', 'navigation-transitions', 'search-visibility', 'content-ui', 'map-projection', 'usage-tips'];
const server = await createServer();
let renderer;
let stopping = false;

function stop(code) {
  stopping = true;
  process.exitCode = code;
  renderer?.kill();
  void server.close();
}

process.once('SIGINT', () => stop(130));
process.once('SIGTERM', () => stop(143));

try {
  await server.listen();
  for (const scenario of scenarios) {
    if (stopping) break;
    renderer = spawn(electron, [`scripts/verify-${scenario}.cjs`], { stdio: 'inherit', env });
    const code = await new Promise((resolve, reject) => {
      renderer.once('error', reject);
      renderer.once('exit', resolve);
    });
    renderer = null;
    if (code !== 0) process.exitCode ||= 1;
  }
} finally {
  await server.close();
}
