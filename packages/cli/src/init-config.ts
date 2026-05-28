import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { ensureConfigFiles } from './config-files.ts';
import { readEnvFile, upsertEnvFile } from './env-file.ts';
import type { StrawberryPaths } from './paths.ts';
import { configureRuntimeEnv } from './runtime-env.ts';
import { ensureStackRuntimeDirs, ensureWorkspaceDirs } from './workspace.ts';

export async function initConfig(paths: StrawberryPaths): Promise<void> {
  ensureConfigFiles(paths);
  ensureWorkspaceDirs(paths);
  ensureStackRuntimeDirs(paths);

  upsertEnvFile(join(paths.configDir, 'strawberry.env'), 'STRAWBERRY_INSTALL_ROOT', paths.installRoot);
  upsertEnvFile(join(paths.configDir, 'strawberry.env'), 'STRAWBERRY_WORKSPACE_ROOT', paths.workspaceRoot);
  upsertEnvFile(
    join(paths.configDir, 'strawberry.env'),
    'STRAWBERRY_CONTAINER_STATE_ROOT',
    join(paths.workspaceRoot, 'state', 'container')
  );
  upsertEnvFile(join(paths.configDir, 'strawberry.env'), 'STRAWBERRY_LOG_ROOT', join(paths.workspaceRoot, 'logs'));
  upsertEnvFile(
    join(paths.configDir, 'host.env'),
    'STRAWBERRY_HOST_STATE_ROOT',
    join(paths.agentDir, 'state', 'host')
  );
  upsertEnvFile(
    join(paths.configDir, 'telegram.env'),
    'STRAWBERRY_TELEGRAM_STATE_ROOT',
    join(paths.agentDir, 'state', 'telegram')
  );

  const telegram = readEnvFile(join(paths.configDir, 'telegram.env'));
  if (!telegram.STRAWBERRY_AGENT_API_KEY?.trim()) {
    const agentKey = randomBytes(32).toString('hex');
    upsertEnvFile(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_AGENT_API_KEY', agentKey);
    upsertEnvFile(join(paths.configDir, 'agent.env'), 'STRAWBERRY_AGENT_API_KEY', agentKey);
  }
  if (!telegram.STRAWBERRY_TELEGRAM_PAIRING_CODE?.trim()) {
    upsertEnvFile(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_TELEGRAM_PAIRING_CODE', randomBytes(4).toString('hex'));
  }

  await configureRuntimeEnv(paths);
}
