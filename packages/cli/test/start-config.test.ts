import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { isConfigured } from '../src/commands/start.ts';

function tempPaths() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-start-config-'));
  mkdirSync(join(workspaceRoot, 'config'), { recursive: true });
  return {
    installRoot: workspaceRoot,
    workspaceRoot,
    configDir: join(workspaceRoot, 'config'),
    agentDir: join(workspaceRoot, '.strawberry'),
    opsBin: join(workspaceRoot, 'ops', 'bin'),
    logDir: join(workspaceRoot, 'logs')
  };
}

describe('start config gate', () => {
  it('allows group-only startup without an RPC URL', () => {
    const paths = tempPaths();
    try {
      writeFileSync(join(paths.configDir, 'host.env'), 'STRAWBERRY_RPC_URL=\n');
      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_TELEGRAM_BOT_TOKEN=token\nSTRAWBERRY_AGENT_API_KEY=agent-key\nSTRAWBERRY_TELEGRAM_PAIRING_CODE=pair-code\n');
      writeFileSync(join(paths.configDir, 'agent.env'), 'STRAWBERRY_AGENT_API_KEY=agent-key\n');
      mkdirSync(paths.agentDir, { recursive: true });
      writeFileSync(join(paths.agentDir, 'auth.json'), '{"openai":{"type":"api_key"}}\n');

      expect(isConfigured(paths)).toBe(true);
    } finally {
      rmSync(paths.workspaceRoot, { recursive: true, force: true });
    }
  });

  it('requires either a configured group, registered group, or pairing code', () => {
    const paths = tempPaths();
    try {
      writeFileSync(join(paths.configDir, 'host.env'), 'STRAWBERRY_RPC_URL=\n');
      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_TELEGRAM_BOT_TOKEN=token\nSTRAWBERRY_AGENT_API_KEY=agent-key\n');
      writeFileSync(join(paths.configDir, 'agent.env'), 'STRAWBERRY_AGENT_API_KEY=agent-key\n');
      mkdirSync(paths.agentDir, { recursive: true });
      writeFileSync(join(paths.agentDir, 'auth.json'), '{"openai":{"type":"api_key"}}\n');

      expect(isConfigured(paths)).toBe(false);

      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_TELEGRAM_BOT_TOKEN=token\nSTRAWBERRY_AGENT_API_KEY=agent-key\nSTRAWBERRY_TELEGRAM_GROUP_CHAT_ID=-100123\n');
      expect(isConfigured(paths)).toBe(true);

      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_TELEGRAM_BOT_TOKEN=token\nSTRAWBERRY_AGENT_API_KEY=agent-key\n');
      mkdirSync(join(paths.agentDir, 'state', 'telegram'), { recursive: true });
      writeFileSync(join(paths.agentDir, 'state', 'telegram', 'registered-group.json'), '{"chatId":-100123,"registeredAt":"2026-05-28T00:00:00.000Z"}\n');
      expect(isConfigured(paths)).toBe(true);
    } finally {
      rmSync(paths.workspaceRoot, { recursive: true, force: true });
    }
  });

  it('still requires a Telegram bot token and agent API key', () => {
    const paths = tempPaths();
    try {
      writeFileSync(join(paths.configDir, 'host.env'), 'STRAWBERRY_RPC_URL=\n');
      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_TELEGRAM_BOT_TOKEN=\n');
      writeFileSync(join(paths.configDir, 'agent.env'), 'STRAWBERRY_AGENT_API_KEY=\n');

      expect(isConfigured(paths)).toBe(false);
    } finally {
      rmSync(paths.workspaceRoot, { recursive: true, force: true });
    }
  });
});
