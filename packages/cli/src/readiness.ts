import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { readEnvFile } from './env-file.ts';
import { hasPiAuth } from './pi-auth.ts';
import type { StrawberryPaths } from './paths.ts';

export type ReadinessIssue = {
  code: string;
  message: string;
  blocking: boolean;
};

export type ReadinessReport = {
  ok: boolean;
  issues: ReadinessIssue[];
};

function issue(code: string, message: string, blocking = true): ReadinessIssue {
  return { code, message, blocking };
}

export function assessReadiness(paths: StrawberryPaths): ReadinessReport {
  const issues: ReadinessIssue[] = [];
  const hostPath = join(paths.configDir, 'host.env');
  const telegramPath = join(paths.configDir, 'telegram.env');
  const agentPath = join(paths.configDir, 'agent.env');

  if (!existsSync(hostPath)) issues.push(issue('missing-host-env', 'missing config/host.env'));
  if (!existsSync(telegramPath)) issues.push(issue('missing-telegram-env', 'missing config/telegram.env'));
  if (!existsSync(agentPath)) issues.push(issue('missing-agent-env', 'missing config/agent.env'));

  const telegram = readEnvFile(telegramPath);
  const agent = readEnvFile(agentPath);

  if (!telegram.STRAWBERRY_TELEGRAM_BOT_TOKEN) {
    issues.push(issue('missing-telegram-token', 'missing STRAWBERRY_TELEGRAM_BOT_TOKEN'));
  }
  if (!agent.STRAWBERRY_AGENT_API_KEY) {
    issues.push(issue('missing-agent-api-key', 'missing STRAWBERRY_AGENT_API_KEY'));
  }
  if (
    telegram.STRAWBERRY_AGENT_API_KEY
    && agent.STRAWBERRY_AGENT_API_KEY
    && telegram.STRAWBERRY_AGENT_API_KEY !== agent.STRAWBERRY_AGENT_API_KEY
  ) {
    issues.push(issue('agent-api-key-mismatch', 'STRAWBERRY_AGENT_API_KEY differs between telegram.env and agent.env'));
  }
  if (!hasPiAuth(paths.agentDir)) {
    issues.push(issue('missing-pi-auth', 'missing Pi auth; run strawberry to finish setup'));
  }

  return {
    ok: issues.every((current) => !current.blocking),
    issues
  };
}
