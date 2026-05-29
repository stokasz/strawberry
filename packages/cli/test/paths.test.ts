import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { resolveInstallRoot, resolveStrawberryPaths, resolveWorkspaceRoot } from '../src/paths.ts';

describe('resolveInstallRoot', () => {
  it('finds the install from a nested directory', () => {
    const install = mkdtempSync(join(tmpdir(), 'strawberry-install-'));
    try {
      mkdirSync(join(install, 'ops', 'container'), { recursive: true });
      writeFileSync(join(install, 'ops', 'container', 'Dockerfile'), 'FROM node:24\n');

      const nested = join(install, 'packages', 'cli');
      mkdirSync(nested, { recursive: true });

      expect(resolveInstallRoot(nested)).toBe(install);
    } finally {
      rmSync(install, { recursive: true, force: true });
    }
  });
});

describe('resolveWorkspaceRoot', () => {
  it('finds a workspace from config markers in a parent directory', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'strawberry-workspace-'));
    try {
      mkdirSync(join(workspace, 'config'), { recursive: true });
      writeFileSync(join(workspace, 'config', 'strawberry.env'), 'STRAWBERRY_WORKSPACE_ROOT=\n');

      const nested = join(workspace, 'apps', 'demo');
      mkdirSync(nested, { recursive: true });

      expect(resolveWorkspaceRoot(nested)).toBe(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('uses the default global workspace when an install root is pinned', () => {
    const installRoot = mkdtempSync(join(tmpdir(), 'strawberry-install-'));
    const workspace = mkdtempSync(join(tmpdir(), 'strawberry-workspace-'));
    const previousInstall = process.env.STRAWBERRY_INSTALL_ROOT;
    const previousWorkspace = process.env.STRAWBERRY_WORKSPACE_ROOT;
    try {
      mkdirSync(join(workspace, 'config'), { recursive: true });
      writeFileSync(join(workspace, 'config', 'strawberry.env'), 'STRAWBERRY_WORKSPACE_ROOT=\n');
      process.env.STRAWBERRY_INSTALL_ROOT = installRoot;
      delete process.env.STRAWBERRY_WORKSPACE_ROOT;

      expect(resolveWorkspaceRoot(join(workspace, 'apps'))).not.toBe(workspace);
      expect(resolveWorkspaceRoot(join(workspace, 'apps'))).toContain(join('.strawberry', 'workspace'));
    } finally {
      if (previousInstall === undefined) {
        delete process.env.STRAWBERRY_INSTALL_ROOT;
      } else {
        process.env.STRAWBERRY_INSTALL_ROOT = previousInstall;
      }
      if (previousWorkspace === undefined) {
        delete process.env.STRAWBERRY_WORKSPACE_ROOT;
      } else {
        process.env.STRAWBERRY_WORKSPACE_ROOT = previousWorkspace;
      }
      rmSync(installRoot, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('resolveStrawberryPaths', () => {
  it('separates a global install root from a user workspace root', () => {
    const installRoot = mkdtempSync(join(tmpdir(), 'strawberry-install-'));
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'strawberry-user-workspace-'));
    const previousInstall = process.env.STRAWBERRY_INSTALL_ROOT;
    const previousWorkspace = process.env.STRAWBERRY_WORKSPACE_ROOT;
    const previousLegacyWorkspace = process.env.STRAWBERRY_WORKSPACE;
    try {
      mkdirSync(join(installRoot, 'ops', 'container'), { recursive: true });
      writeFileSync(join(installRoot, 'ops', 'container', 'Dockerfile'), 'FROM node:24\n');
      process.env.STRAWBERRY_INSTALL_ROOT = installRoot;
      process.env.STRAWBERRY_WORKSPACE_ROOT = workspaceRoot;
      process.env.STRAWBERRY_WORKSPACE = join(tmpdir(), 'legacy-strawberry-workspace');

      const paths = resolveStrawberryPaths('/tmp');
      expect(paths.installRoot).toBe(installRoot);
      expect(paths.workspaceRoot).toBe(workspaceRoot);
      expect(paths.configDir).toBe(join(workspaceRoot, 'config'));
      expect(paths.opsBin).toBe(join(installRoot, 'ops', 'bin'));
    } finally {
      if (previousInstall === undefined) {
        delete process.env.STRAWBERRY_INSTALL_ROOT;
      } else {
        process.env.STRAWBERRY_INSTALL_ROOT = previousInstall;
      }
      if (previousWorkspace === undefined) {
        delete process.env.STRAWBERRY_WORKSPACE_ROOT;
      } else {
        process.env.STRAWBERRY_WORKSPACE_ROOT = previousWorkspace;
      }
      if (previousLegacyWorkspace === undefined) {
        delete process.env.STRAWBERRY_WORKSPACE;
      } else {
        process.env.STRAWBERRY_WORKSPACE = previousLegacyWorkspace;
      }
      rmSync(installRoot, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('ignores the removed STRAWBERRY_WORKSPACE alias', () => {
    const installRoot = mkdtempSync(join(tmpdir(), 'strawberry-install-'));
    const legacyWorkspace = mkdtempSync(join(tmpdir(), 'strawberry-legacy-workspace-'));
    const previousInstall = process.env.STRAWBERRY_INSTALL_ROOT;
    const previousWorkspace = process.env.STRAWBERRY_WORKSPACE_ROOT;
    const previousLegacyWorkspace = process.env.STRAWBERRY_WORKSPACE;
    try {
      mkdirSync(join(installRoot, 'ops', 'container'), { recursive: true });
      writeFileSync(join(installRoot, 'ops', 'container', 'Dockerfile'), 'FROM node:24\n');
      process.env.STRAWBERRY_INSTALL_ROOT = installRoot;
      delete process.env.STRAWBERRY_WORKSPACE_ROOT;
      process.env.STRAWBERRY_WORKSPACE = legacyWorkspace;

      const paths = resolveStrawberryPaths('/tmp');
      expect(paths.installRoot).toBe(installRoot);
      expect(paths.workspaceRoot).not.toBe(legacyWorkspace);
    } finally {
      if (previousInstall === undefined) {
        delete process.env.STRAWBERRY_INSTALL_ROOT;
      } else {
        process.env.STRAWBERRY_INSTALL_ROOT = previousInstall;
      }
      if (previousWorkspace === undefined) {
        delete process.env.STRAWBERRY_WORKSPACE_ROOT;
      } else {
        process.env.STRAWBERRY_WORKSPACE_ROOT = previousWorkspace;
      }
      if (previousLegacyWorkspace === undefined) {
        delete process.env.STRAWBERRY_WORKSPACE;
      } else {
        process.env.STRAWBERRY_WORKSPACE = previousLegacyWorkspace;
      }
      rmSync(installRoot, { recursive: true, force: true });
      rmSync(legacyWorkspace, { recursive: true, force: true });
    }
  });
});
