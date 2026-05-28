import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ensureConfigFiles } from './config-files.ts';
import { readEnvFile, removeEnvFileKey, upsertEnvFile } from './env-file.ts';
import { GUEST_STRIPPED_HOST_KEYS } from './host-secrets.ts';
import type { StrawberryPaths } from './paths.ts';

export async function configureRuntimeEnv(
  paths: StrawberryPaths,
  gateway = '192.168.64.1'
): Promise<void> {
  ensureConfigFiles(paths);

  const strawberryPath = join(paths.configDir, 'strawberry.env');
  const hostPath = join(paths.configDir, 'host.env');
  const agentPath = join(paths.configDir, 'agent.env');
  const telegramPath = join(paths.configDir, 'telegram.env');

  const strawberry = readEnvFile(strawberryPath);
  const host = readEnvFile(hostPath);
  const agent = readEnvFile(agentPath);
  const telegram = readEnvFile(telegramPath);
  const agentPort = strawberry.STRAWBERRY_AGENT_PORT || agent.STRAWBERRY_AGENT_PORT || '4501';
  const hostPort = strawberry.STRAWBERRY_HOST_PORT || host.STRAWBERRY_HOST_PORT || '4510';

  let hostApiKey = host.STRAWBERRY_HOST_API_KEY?.trim();
  if (!hostApiKey) {
    hostApiKey = randomBytes(32).toString('hex');
    upsertEnvFile(hostPath, 'STRAWBERRY_HOST_API_KEY', hostApiKey);
  }

  const telegramAgentKey = telegram.STRAWBERRY_AGENT_API_KEY?.trim();
  const agentAgentKey = agent.STRAWBERRY_AGENT_API_KEY?.trim();
  if (telegramAgentKey && agentAgentKey && telegramAgentKey !== agentAgentKey) {
    throw new Error('STRAWBERRY_AGENT_API_KEY mismatch between telegram.env and agent.env.');
  }
  const agentApiKey = telegramAgentKey || agentAgentKey || randomBytes(32).toString('hex');

  const workspaceRoot = paths.workspaceRoot;
  upsertEnvFile(strawberryPath, 'STRAWBERRY_CONTAINER_IMAGE', strawberry.STRAWBERRY_CONTAINER_IMAGE || 'strawberry-agent:local');
  upsertEnvFile(strawberryPath, 'STRAWBERRY_CONTAINER_NAME', strawberry.STRAWBERRY_CONTAINER_NAME || 'strawberry-agent');
  upsertEnvFile(strawberryPath, 'STRAWBERRY_INSTALL_ROOT', strawberry.STRAWBERRY_INSTALL_ROOT || paths.installRoot);
  upsertEnvFile(strawberryPath, 'STRAWBERRY_WORKSPACE_ROOT', strawberry.STRAWBERRY_WORKSPACE_ROOT || paths.workspaceRoot);
  upsertEnvFile(
    strawberryPath,
    'STRAWBERRY_CONTAINER_STATE_ROOT',
    strawberry.STRAWBERRY_CONTAINER_STATE_ROOT || join(workspaceRoot, 'state', 'container')
  );
  upsertEnvFile(
    strawberryPath,
    'STRAWBERRY_LOG_ROOT',
    strawberry.STRAWBERRY_LOG_ROOT || join(workspaceRoot, 'logs')
  );
  upsertEnvFile(strawberryPath, 'STRAWBERRY_CONTAINER_HOST_GATEWAY', gateway);
  upsertEnvFile(hostPath, 'STRAWBERRY_HOST_BIND_HOST', host.STRAWBERRY_HOST_BIND_HOST || '0.0.0.0');
  upsertEnvFile(hostPath, 'STRAWBERRY_AGENT_BASE_URL', `http://127.0.0.1:${agentPort}`);
  upsertEnvFile(hostPath, 'STRAWBERRY_AGENT_API_KEY', agentApiKey);
  upsertEnvFile(telegramPath, 'STRAWBERRY_AGENT_API_KEY', agentApiKey);
  upsertEnvFile(agentPath, 'STRAWBERRY_AGENT_API_KEY', agentApiKey);
  upsertEnvFile(agentPath, 'STRAWBERRY_HOST_BASE_URL', `http://${gateway}:${hostPort}`);
  upsertEnvFile(agentPath, 'STRAWBERRY_HOST_API_KEY', hostApiKey);
  for (const key of GUEST_STRIPPED_HOST_KEYS) {
    removeEnvFileKey(agentPath, key);
  }

  if (existsSync(telegramPath)) {
    upsertEnvFile(telegramPath, 'STRAWBERRY_AGENT_BASE_URL', `http://127.0.0.1:${agentPort}`);
  }
}
