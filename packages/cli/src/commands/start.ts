import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { ensureLaunchPrerequisites, formatBootstrapError } from '../bootstrap.ts';
import { ensureWorkspaceDirs } from '../workspace.ts';
import { initConfig } from '../init-config.ts';
import { readEnvFile } from '../env-file.ts';
import { resolveStrawberryPaths } from '../paths.ts';
import { assessReadiness } from '../readiness.ts';
import { runProduction } from '../production.ts';
import { printError, printInfo, printLaunchBanner, printRunningPanel } from '../tui.ts';
import { runOnboard } from './onboard.ts';

export function isConfigured(paths: ReturnType<typeof resolveStrawberryPaths>): boolean {
  return assessReadiness(paths).ok;
}

async function runDetachedStop(paths: ReturnType<typeof resolveStrawberryPaths>): Promise<number> {
  return await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [
      '--experimental-strip-types',
      join(paths.installRoot, 'packages', 'cli', 'src', 'cli.ts'),
      'stop'
    ], {
      cwd: paths.installRoot,
      detached: true,
      env: {
        ...process.env,
        STRAWBERRY_INSTALL_ROOT: paths.installRoot,
        STRAWBERRY_WORKSPACE_ROOT: paths.workspaceRoot
      },
      stdio: 'ignore'
    });

    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function runStart(): Promise<number> {
  const paths = resolveStrawberryPaths();
  mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  mkdirSync(paths.agentDir, { recursive: true, mode: 0o700 });
  ensureWorkspaceDirs(paths);

  printLaunchBanner();

  try {
    printInfo('Checking Homebrew, Apple Container, and dependencies…');
    await ensureLaunchPrerequisites(paths);
    await initConfig(paths);
  } catch (error) {
    printError(formatBootstrapError(error));
    return 1;
  }

  if (!isConfigured(paths)) {
    printInfo('First launch — quick setup.');
    console.log('');
    const onboard = await runOnboard({ skipBanner: true });
    if (onboard !== 0) {
      return onboard;
    }
    console.log('');
  }

  printInfo('Starting host, agent container, and Telegram gateway…');
  printInfo('First container build can take a few minutes.');
  console.log('');

  let startSettled = false;
  let stopping = false;
  let stopRequested = false;
  let shutdownResolve: (code: number) => void = () => undefined;
  const shutdown = new Promise<number>((resolve) => {
    shutdownResolve = resolve;
  });
  let keepAlive: NodeJS.Timeout | undefined;
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  const disposeSignals = () => {
    for (const signal of signals) {
      process.removeListener(signal, requestStop);
    }
  };
  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    if (keepAlive) {
      clearInterval(keepAlive);
    }
    console.log('');
    printInfo('Stopping Strawberry…');
    const stopCode = await runDetachedStop(paths);
    if (stopCode !== 0) {
      await runProduction('stop', paths);
    }
    disposeSignals();
    shutdownResolve(0);
  };
  function requestStop(): void {
    if (stopRequested) {
      return;
    }
    stopRequested = true;
    if (!startSettled) {
      printInfo('Stop requested; Strawberry will clean up after the current startup step.');
      return;
    }
    void stop();
  }

  for (const signal of signals) {
    process.on(signal, requestStop);
  }

  const start = await runProduction('start', paths);
  startSettled = true;
  if (stopRequested) {
    await stop();
    return await shutdown;
  }
  if (start !== 0) {
    disposeSignals();
    await runProduction('stop', paths);
    return start;
  }

  const strawberryEnv = readEnvFile(join(paths.configDir, 'strawberry.env'));
  const hostEnv = readEnvFile(join(paths.configDir, 'host.env'));
  const hostPort = hostEnv.STRAWBERRY_HOST_PORT || strawberryEnv.STRAWBERRY_HOST_PORT || '4510';
  const agentPort = strawberryEnv.STRAWBERRY_AGENT_PORT || '4501';

  printRunningPanel([
    'Talk in Telegram — @mention the bot or reply to her',
    `Agent  http://127.0.0.1:${agentPort}`,
    `Host   http://127.0.0.1:${hostPort}`
  ]);

  keepAlive = setInterval(() => undefined, 60_000);
  return await shutdown;
}
