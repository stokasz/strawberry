import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { StrawberryPaths } from './paths.ts';

export const CONFIG_FILES = ['strawberry', 'host', 'telegram', 'agent'] as const;

function copyExampleIfMissing(paths: StrawberryPaths, name: typeof CONFIG_FILES[number]): void {
  const example = join(paths.installRoot, 'config', `${name}.env.example`);
  const target = join(paths.configDir, `${name}.env`);
  if (!existsSync(target) && existsSync(example)) {
    copyFileSync(example, target);
    chmodSync(target, 0o600);
  }
}

export function ensureConfigFiles(paths: StrawberryPaths): void {
  mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  for (const name of CONFIG_FILES) {
    copyExampleIfMissing(paths, name);
  }
}

export function requireConfigFile(paths: StrawberryPaths, name: typeof CONFIG_FILES[number]): string {
  ensureConfigFiles(paths);
  const target = join(paths.configDir, `${name}.env`);
  if (!existsSync(target)) {
    throw new Error(`missing config/${name}.env — run strawberry`);
  }
  return target;
}
