import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readEnvFile } from '../src/env-file.ts';
import { initConfig } from '../src/init-config.ts';

function tempPaths() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-init-config-'));
  const configDir = join(workspaceRoot, 'config');
  mkdirSync(configDir, { recursive: true });
  for (const name of ['strawberry', 'host', 'telegram', 'agent']) {
    writeFileSync(join(configDir, `${name}.env.example`), '');
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

describe('initConfig', () => {
  it('generates synced agent keys, a pairing code, and workspace paths', async () => {
    const paths = tempPaths();
    try {
      await initConfig(paths);

      const telegram = readEnvFile(join(paths.configDir, 'telegram.env'));
      const agent = readEnvFile(join(paths.configDir, 'agent.env'));
      const host = readEnvFile(join(paths.configDir, 'host.env'));
      expect(telegram.STRAWBERRY_AGENT_API_KEY).toBeTruthy();
      expect(agent.STRAWBERRY_AGENT_API_KEY).toBe(telegram.STRAWBERRY_AGENT_API_KEY);
      expect(host.STRAWBERRY_AGENT_API_KEY).toBe(telegram.STRAWBERRY_AGENT_API_KEY);
      expect(telegram.STRAWBERRY_TELEGRAM_PAIRING_CODE).toMatch(/^[a-f0-9]{8}$/);
      expect(existsSync(join(paths.workspaceRoot, 'apps'))).toBe(true);
      expect(host.STRAWBERRY_HOST_STATE_ROOT).toBe(join(paths.agentDir, 'state', 'host'));
    } finally {
      rmSync(paths.workspaceRoot, { recursive: true, force: true });
    }
  });
});
