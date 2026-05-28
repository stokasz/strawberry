import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { StrawberryPaths } from './paths.ts';

type RuntimeLayout = {
  runRoot: string;
  logRoot: string;
};

export function resolveStackRuntimeLayout(
  paths: StrawberryPaths,
  config: Record<string, string> = {}
): RuntimeLayout {
  return {
    runRoot: config.STRAWBERRY_CONTAINER_STATE_ROOT || join(paths.workspaceRoot, 'state', 'container'),
    logRoot: config.STRAWBERRY_LOG_ROOT || join(paths.workspaceRoot, 'logs')
  };
}

/** Directories required for container image build and runtime volume mounts. */
export function ensureWorkspaceDirs(paths: StrawberryPaths): void {
  mkdirSync(paths.agentDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(paths.workspaceRoot, 'apps'), { recursive: true });
  mkdirSync(join(paths.agentDir, 'skills'), { recursive: true });
  mkdirSync(join(paths.agentDir, 'memory'), { recursive: true });
  mkdirSync(join(paths.agentDir, 'state', 'host'), { recursive: true });
  mkdirSync(join(paths.agentDir, 'state', 'telegram'), { recursive: true });
  mkdirSync(join(paths.workspaceRoot, 'state', 'agent'), { recursive: true });
}

/** PID files, logs, config, and mount sources used during stack start/stop. */
export function ensureStackRuntimeDirs(
  paths: StrawberryPaths,
  config: Record<string, string> = {}
): RuntimeLayout {
  ensureWorkspaceDirs(paths);
  const layout = resolveStackRuntimeLayout(paths, config);
  mkdirSync(layout.runRoot, { recursive: true });
  mkdirSync(layout.logRoot, { recursive: true });
  return layout;
}
