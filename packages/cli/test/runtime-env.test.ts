import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readEnvFile } from '../src/env-file.ts';
import { configureRuntimeEnv } from '../src/runtime-env.ts';

function tempPaths() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-runtime-env-'));
  const configDir = join(workspaceRoot, 'config');
  mkdirSync(configDir, { recursive: true });
  for (const name of ['strawberry', 'host', 'telegram', 'agent']) {
    writeFileSync(join(configDir, `${name}.env.example`), '');
    writeFileSync(join(configDir, `${name}.env`), '');
  }
  return {
    installRoot: workspaceRoot,
    workspaceRoot,
    configDir,
    agentDir: join(workspaceRoot, '.strawberry'),
    opsBin: join(workspaceRoot, 'ops', 'bin'),
    logDir: join(workspaceRoot, 'logs')
  };
}

describe('configureRuntimeEnv', () => {
  it('syncs runtime URLs and bearer keys without leaking host-only secrets into agent.env', async () => {
    const paths = tempPaths();
    try {
      writeFileSync(join(paths.configDir, 'host.env'), 'STRAWBERRY_HOST_API_KEY=host-key\nSTRAWBERRY_HOST_BIND_HOST=127.0.0.1\n');
      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_AGENT_API_KEY=agent-key\n');
      writeFileSync(join(paths.configDir, 'agent.env'), 'STRAWBERRY_RPC_URL=https://rpc.example\nSTRAWBERRY_SIGNER_COMMAND=node sign.js\n');

      await configureRuntimeEnv(paths, '192.168.64.9');

      const host = readEnvFile(join(paths.configDir, 'host.env'));
      const telegram = readEnvFile(join(paths.configDir, 'telegram.env'));
      const agent = readEnvFile(join(paths.configDir, 'agent.env'));
      expect(host.STRAWBERRY_HOST_BIND_HOST).toBe('127.0.0.1');
      expect(host.STRAWBERRY_AGENT_API_KEY).toBe('agent-key');
      expect(telegram.STRAWBERRY_AGENT_API_KEY).toBe('agent-key');
      expect(agent.STRAWBERRY_AGENT_API_KEY).toBe('agent-key');
      expect(agent.STRAWBERRY_HOST_BASE_URL).toBe('http://192.168.64.9:4510');
      expect(agent.STRAWBERRY_RPC_URL).toBeUndefined();
      expect(agent.STRAWBERRY_SIGNER_COMMAND).toBeUndefined();
    } finally {
      rmSync(paths.workspaceRoot, { recursive: true, force: true });
    }
  });

  it('fails on mismatched Telegram and agent bearer keys', async () => {
    const paths = tempPaths();
    try {
      writeFileSync(join(paths.configDir, 'telegram.env'), 'STRAWBERRY_AGENT_API_KEY=telegram-key\n');
      writeFileSync(join(paths.configDir, 'agent.env'), 'STRAWBERRY_AGENT_API_KEY=agent-key\n');

      await expect(configureRuntimeEnv(paths)).rejects.toThrow('STRAWBERRY_AGENT_API_KEY mismatch');
    } finally {
      rmSync(paths.workspaceRoot, { recursive: true, force: true });
    }
  });
});
