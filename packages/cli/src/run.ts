import { spawn } from 'node:child_process';

import { preferredProcessEnv } from './resolve-node.ts';

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; inherit?: boolean } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: preferredProcessEnv(options.env),
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    if (!options.inherit) {
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on('error', (error) => {
      resolve({
        code: 127,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error)
      });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function runBashScript(
  scriptPath: string,
  args: string[],
  options: { cwd: string; sudo?: boolean; inherit?: boolean; env?: NodeJS.ProcessEnv } = { cwd: process.cwd() }
): Promise<RunResult> {
  if (options.sudo) {
    return runCommand('sudo', ['bash', scriptPath, ...args], options);
  }
  return runCommand('bash', [scriptPath, ...args], options);
}

export function runShell(
  script: string,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; inherit?: boolean } = {}
): Promise<RunResult> {
  return runCommand('bash', ['-lc', script], options);
}
