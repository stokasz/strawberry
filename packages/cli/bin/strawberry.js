#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const binDir = dirname(fileURLToPath(import.meta.url));
const cliPath = join(binDir, '..', 'src', 'cli.ts');

function nodeWorks(nodePath) {
  if (!existsSync(nodePath)) {
    return false;
  }
  const probe = spawnSync(nodePath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  return probe.status === 0;
}

function resolveNode() {
  const homebrewPrefix = process.env.HOMEBREW_PREFIX || '/opt/homebrew';
  const candidates = [
    join(homebrewPrefix, 'bin', 'node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    process.execPath
  ];
  for (const candidate of candidates) {
    if (nodeWorks(candidate)) {
      return candidate;
    }
  }
  return 'node';
}

const node = resolveNode();
const result = spawnSync(node, [
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
