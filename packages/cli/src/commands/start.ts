import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ensureLaunchPrerequisites, formatBootstrapError } from '../bootstrap.ts';
import { ensureWorkspaceDirs } from '../workspace.ts';
import { readEnvFile } from '../env-file.ts';
import { resolveStrawberryPaths } from '../paths.ts';
import { assessReadiness } from '../readiness.ts';
import { runProduction } from '../production.ts';
import { printError, printInfo, printLaunchBanner, printRunningPanel } from '../tui.ts';
import { runOnboard } from './onboard.ts';

export function isConfigured(paths: ReturnType<typeof resolveStrawberryPaths>): boolean {
  return assessReadiness(paths).ok;
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

  const start = await runProduction('start', paths);
  if (start !== 0) {
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

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.log('');
    printInfo('Stopping Strawberry…');
    await runProduction('stop', paths);
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });

  const keepAlive = setInterval(() => undefined, 60_000);
  await new Promise<void>((resolve) => {
    process.once('beforeExit', resolve);
  });
  clearInterval(keepAlive);
  return 0;
}
