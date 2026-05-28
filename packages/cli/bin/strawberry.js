#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const binDir = dirname(fileURLToPath(import.meta.url));
const cliPath = join(binDir, '..', 'src', 'cli.ts');
const result = spawnSync(process.execPath, [
  '--experimental-strip-types',
  cliPath,
  ...process.argv.slice(2)
], {
  stdio: 'inherit',
  env: process.env
});

if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
