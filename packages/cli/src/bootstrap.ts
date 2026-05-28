import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { StrawberryPaths } from './paths.ts';
import { runCommand, runShell } from './run.ts';
import { printInfo } from './tui.ts';
import { ensureWorkspaceDirs } from './workspace.ts';

export class BootstrapError extends Error {}

export function isOnboarded(paths: StrawberryPaths): boolean {
  const telegram = join(paths.configDir, 'telegram.env');
  const host = join(paths.configDir, 'host.env');
  if (!existsSync(telegram) || !existsSync(host)) {
    return false;
  }
  return true;
}

async function commandExists(command: string): Promise<boolean> {
  const result = await runShell(`command -v ${command}`);
  return result.code === 0;
}

async function brewPrefix(): Promise<string | undefined> {
  if (existsSync('/opt/homebrew/bin/brew')) {
    return '/opt/homebrew';
  }
  if (existsSync('/usr/local/bin/brew')) {
    return '/usr/local';
  }
  const found = await runShell('command -v brew');
  if (found.code !== 0) {
    return undefined;
  }
  const brewPath = found.stdout.trim();
  if (brewPath.endsWith('/bin/brew')) {
    return brewPath.slice(0, -'/bin/brew'.length);
  }
  return undefined;
}

async function withBrew<T>(action: () => Promise<T>): Promise<T> {
  const prefix = await brewPrefix();
  if (!prefix) {
    return action();
  }
  const previousPath = process.env.PATH || '';
  const brewBin = `${prefix}/bin`;
  if (!previousPath.split(':').includes(brewBin)) {
    process.env.PATH = `${brewBin}:${previousPath}`;
  }
  return action();
}

async function ensureMacPlatform(): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new BootstrapError('Strawberry runs on macOS with Apple Container.');
  }
  if (process.arch !== 'arm64') {
    throw new BootstrapError('Strawberry requires Apple Silicon.');
  }

  const version = await runCommand('sw_vers', ['-productVersion']);
  if (version.code !== 0) {
    return;
  }
  const [major] = version.stdout.trim().split('.').map(Number);
  if (major && major < 26) {
    throw new BootstrapError('Strawberry requires macOS 26 (Tahoe) or later for Apple Container.');
  }
}

async function ensureHomebrew(): Promise<void> {
  if (await commandExists('brew')) {
    return;
  }

  printInfo('Installing Homebrew (you may be asked for your password)…');
  const install = await runShell(
    'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    { inherit: true }
  );
  if (install.code !== 0) {
    throw new BootstrapError('Homebrew install failed. Install it from https://brew.sh and try again.');
  }

  if (!(await commandExists('brew'))) {
    throw new BootstrapError('Homebrew installed but is not on PATH. Open a new terminal or run brew shellenv.');
  }
}

async function ensureBrewFormula(formula: string, label: string): Promise<void> {
  await withBrew(async () => {
    const listed = await runShell(`brew list --formula ${formula}`);
    if (listed.code === 0) {
      return;
    }
    printInfo(`Installing ${label}…`);
    const install = await runCommand('brew', ['install', formula], { inherit: true });
    if (install.code !== 0) {
      throw new BootstrapError(`Could not install ${label}. Try: brew install ${formula}`);
    }
  });
}

async function ensurePnpm(paths: StrawberryPaths): Promise<void> {
  if (await commandExists('pnpm')) {
    return;
  }

  if (await commandExists('corepack')) {
    printInfo('Enabling pnpm via Corepack…');
    await runCommand('corepack', ['enable'], { inherit: true });
    const prepare = await runCommand('corepack', ['prepare', 'pnpm@11.4.0', '--activate'], { inherit: true });
    if (prepare.code === 0 && await commandExists('pnpm')) {
      return;
    }
  }

  printInfo('Installing pnpm…');
  await ensureBrewFormula('pnpm', 'pnpm');
}

async function ensureNodeModules(paths: StrawberryPaths): Promise<void> {
  if (existsSync(join(paths.installRoot, 'node_modules'))) {
    return;
  }
  printInfo('Installing project dependencies…');
  const install = await runCommand('pnpm', ['install', '--frozen-lockfile'], {
    cwd: paths.installRoot,
    inherit: true
  });
  if (install.code !== 0) {
    throw new BootstrapError('pnpm install failed.');
  }
}

export async function ensureContainerCli(): Promise<void> {
  if (!(await commandExists('container'))) {
    throw new BootstrapError('Apple Container CLI is missing after install.');
  }
}

let containerSystemReady = false;

async function isContainerSystemRunning(): Promise<boolean> {
  const status = await runCommand('container', ['system', 'status']);
  return status.code === 0 && /\bstatus\b\s+running\b/i.test(status.stdout);
}

export async function ensureContainerSystem(): Promise<void> {
  await ensureContainerCli();
  if (containerSystemReady || await isContainerSystemRunning()) {
    containerSystemReady = true;
    return;
  }

  printInfo('Starting Apple Container services…');
  const start = await runCommand(
    'container',
    ['system', 'start', '--enable-kernel-install'],
    { inherit: true }
  );
  if (start.code !== 0) {
    throw new BootstrapError(
      'Could not start Apple Container. Grant Local Network to container-runtime-linux in System Settings.'
    );
  }
  containerSystemReady = true;
}

export async function ensureLaunchPrerequisites(paths: StrawberryPaths): Promise<void> {
  await ensureMacPlatform();
  await ensureHomebrew();
  await withBrew(async () => {
    await ensureBrewFormula('container', 'Apple Container');
    await ensurePnpm(paths);
    await ensureNodeModules(paths);
    ensureWorkspaceDirs(paths);
    await ensureContainerSystem();
  });
}

export function formatBootstrapError(error: unknown): string {
  if (error instanceof BootstrapError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
