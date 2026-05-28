import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolvePiEntrypoint } from './paths.ts';
import { resolveNodeExecutable } from './resolve-node.ts';
import { runCommand } from './run.ts';
import { printHint } from './tui.ts';

export function readPiAuthProviders(agentDir: string): string[] {
  const authPath = join(agentDir, 'auth.json');
  if (!existsSync(authPath)) {
    return [];
  }

  try {
    const data = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, { type?: string }>;
    return Object.entries(data)
      .filter(([, value]) => value?.type === 'oauth' || value?.type === 'api_key')
      .map(([provider]) => provider);
  } catch {
    return [];
  }
}

export function hasPiAuth(agentDir: string): boolean {
  return readPiAuthProviders(agentDir).length > 0;
}

export async function runPiLogin(installRoot: string, workspaceRoot: string, agentDir: string): Promise<number> {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const node = resolveNodeExecutable();
  const piEntry = resolvePiEntrypoint(installRoot);

  console.log('');
  printHint('In Pi: type /login, pick a provider, finish OAuth, then exit with Ctrl+C or /exit.');
  console.log('');

  const result = await runCommand(node, [piEntry], {
    cwd: workspaceRoot,
    inherit: true,
    env: {
      PI_CODING_AGENT_DIR: agentDir
    }
  });
  return result.code;
}
