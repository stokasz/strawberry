import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const INSTALL_MARKER = join('ops', 'container', 'Dockerfile');
const WORKSPACE_MARKERS = [
  'strawberry.toml',
  join('config', 'strawberry.env')
];

function walkUpForFile(start: string, file: string): string | undefined {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, file))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

function walkUpForAnyFile(start: string, files: string[]): string | undefined {
  for (const file of files) {
    const found = walkUpForFile(start, file);
    if (found) return found;
  }
  return undefined;
}

function defaultWorkspaceRoot(): string {
  return join(homedir(), '.strawberry', 'workspace');
}

export function resolveInstallRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.STRAWBERRY_INSTALL_ROOT?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }

  const fromCwd = walkUpForFile(cwd, INSTALL_MARKER);
  if (fromCwd) {
    return fromCwd;
  }

  const fromPackage = walkUpForFile(dirname(fileURLToPath(import.meta.url)), INSTALL_MARKER);
  if (fromPackage) {
    return fromPackage;
  }

  throw new Error('Could not find Strawberry install. Set STRAWBERRY_INSTALL_ROOT.');
}

export function resolveWorkspaceRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.STRAWBERRY_WORKSPACE_ROOT?.trim() || process.env.STRAWBERRY_WORKSPACE?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }

  const fromCwd = walkUpForAnyFile(cwd, WORKSPACE_MARKERS);
  if (fromCwd) {
    return fromCwd;
  }

  return defaultWorkspaceRoot();
}

export type StrawberryPaths = {
  installRoot: string;
  workspaceRoot: string;
  configDir: string;
  agentDir: string;
  opsBin: string;
  logDir: string;
};

export function resolveStrawberryPaths(cwd: string = process.cwd()): StrawberryPaths {
  const installRoot = resolveInstallRoot(cwd);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  return {
    installRoot,
    workspaceRoot,
    configDir: join(workspaceRoot, 'config'),
    agentDir: join(workspaceRoot, '.strawberry'),
    opsBin: join(installRoot, 'ops', 'bin'),
    logDir: join(workspaceRoot, 'logs')
  };
}

export function resolvePiBin(installRoot: string): string {
  const localBin = join(installRoot, 'node_modules', '.bin', 'pi');
  if (existsSync(localBin)) {
    return localBin;
  }
  return 'pi';
}
