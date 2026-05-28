import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function nodeCandidates(): string[] {
  const homebrew = process.env.HOMEBREW_PREFIX || '/opt/homebrew';
  return [...new Set([
    join(homebrew, 'bin/node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    process.execPath,
    'node'
  ])];
}

export function nodeWorks(nodePath: string): boolean {
  if (nodePath !== 'node' && !existsSync(nodePath)) {
    return false;
  }
  const probe = spawnSync(nodePath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  return probe.status === 0;
}

export function resolveNodeExecutable(): string {
  for (const candidate of nodeCandidates()) {
    if (nodeWorks(candidate)) {
      return candidate;
    }
  }
  throw new Error('No working Node.js found. Try: brew unlink node@22 && brew reinstall node');
}

export function preferredProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const node = resolveNodeExecutable();
  const nodeDir = dirname(node);
  const segments = (process.env.PATH || '').split(':').filter(Boolean);
  if (node !== 'node' && nodeDir && !segments.includes(nodeDir)) {
    segments.unshift(nodeDir);
  }
  return { ...process.env, PATH: segments.join(':'), ...extra };
}
