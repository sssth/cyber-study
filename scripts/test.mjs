import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const tests = ['scripts/tests/book-storage.cjs'];
for (const directory of ['src', 'electron', 'shared', 'tests', 'scripts']) {
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && /\.test\.(?:js|mjs|cjs)$/.test(entry.name)) {
      tests.push(resolve(entry.parentPath ?? entry.path, entry.name));
    }
  }
}

const result = spawnSync(process.execPath, ['--test', ...tests.sort()], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
