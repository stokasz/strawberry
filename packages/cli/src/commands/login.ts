import { mkdirSync } from 'node:fs';

import { resolveStrawberryPaths } from '../paths.ts';
import { runPiLogin } from '../pi-auth.ts';
import { printCommandHeader } from '../tui.ts';

export async function runLogin(): Promise<number> {
  const paths = resolveStrawberryPaths();
  mkdirSync(paths.agentDir, { recursive: true, mode: 0o700 });
  printCommandHeader('Model login', 'Open Pi to /login or switch providers');
  return runPiLogin(paths.installRoot, paths.workspaceRoot, paths.agentDir);
}
