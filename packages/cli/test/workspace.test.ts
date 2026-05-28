import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { ensureConfigFiles } from '../src/config-files.ts';
import { ensureStackRuntimeDirs, ensureWorkspaceDirs } from '../src/workspace.ts';

describe('ensureWorkspaceDirs', () => {
  it('creates apps, agent workspace, and state directories', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-workspace-'));
    const paths = {
      installRoot: workspaceRoot,
      workspaceRoot,
      configDir: join(workspaceRoot, 'config'),
      agentDir: join(workspaceRoot, '.strawberry'),
      opsBin: join(workspaceRoot, 'ops', 'bin'),
      logDir: join(workspaceRoot, 'logs')
    };
    try {
      ensureWorkspaceDirs(paths);
      expect(existsSync(join(workspaceRoot, 'apps'))).toBe(true);
      expect(existsSync(join(workspaceRoot, '.strawberry', 'skills'))).toBe(true);
      expect(existsSync(join(workspaceRoot, '.strawberry', 'state', 'host'))).toBe(true);
      expect(existsSync(join(workspaceRoot, '.strawberry', 'state', 'telegram'))).toBe(true);
      expect(existsSync(join(workspaceRoot, 'state', 'agent'))).toBe(true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('ensureStackRuntimeDirs', () => {
  it('creates container state and log directories', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-runtime-'));
    const paths = {
      installRoot: workspaceRoot,
      workspaceRoot,
      configDir: join(workspaceRoot, 'config'),
      agentDir: join(workspaceRoot, '.strawberry'),
      opsBin: join(workspaceRoot, 'ops', 'bin'),
      logDir: join(workspaceRoot, 'logs')
    };
    try {
      const layout = ensureStackRuntimeDirs(paths, {
        STRAWBERRY_CONTAINER_STATE_ROOT: join(workspaceRoot, 'state', 'container'),
        STRAWBERRY_LOG_ROOT: join(workspaceRoot, 'logs')
      });
      expect(existsSync(layout.runRoot)).toBe(true);
      expect(existsSync(layout.logRoot)).toBe(true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('ensureConfigFiles', () => {
  it('copies missing env examples into config/', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-config-'));
    const configDir = join(workspaceRoot, 'config');
    try {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'host.env.example'), 'STRAWBERRY_HOST_PORT=4510\n');
      writeFileSync(join(configDir, 'agent.env.example'), 'STRAWBERRY_AGENT_PORT=4501\n');
      ensureConfigFiles({
        installRoot: workspaceRoot,
        workspaceRoot,
        configDir,
        agentDir: join(workspaceRoot, '.strawberry'),
        opsBin: join(workspaceRoot, 'ops', 'bin'),
        logDir: join(workspaceRoot, 'logs')
      });
      expect(existsSync(join(configDir, 'host.env'))).toBe(true);
      expect(existsSync(join(configDir, 'agent.env'))).toBe(true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
