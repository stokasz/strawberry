import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { readEnvFile } from './env-file.ts';
import { configureRuntimeEnv } from './runtime-env.ts';
import { requireConfigFile } from './config-files.ts';
import { isUrlHealthy, waitForUrl } from './health.ts';
import { assertGuestEnvHasNoHostSecrets } from './host-secrets.ts';
import { readLogTail, redactedTailLines } from './log-utils.ts';
import type { StrawberryPaths } from './paths.ts';
import { assessReadiness } from './readiness.ts';
import { runCommand } from './run.ts';
import { ensureContainerSystem } from './bootstrap.ts';
import { ensureStackRuntimeDirs, ensureWorkspaceDirs, resolveStackRuntimeLayout } from './workspace.ts';

type StackConfig = Record<string, string>;

class StackError extends Error {}

function loadConfig(paths: StrawberryPaths): StackConfig {
  return {
    ...readEnvFile(join(paths.configDir, 'strawberry.env')),
    ...readEnvFile(join(paths.configDir, 'host.env')),
    ...readEnvFile(join(paths.configDir, 'telegram.env')),
    ...readEnvFile(join(paths.configDir, 'agent.env'))
  };
}

function requireOnboarded(paths: StrawberryPaths): StackConfig {
  const readiness = assessReadiness(paths);
  const blocker = readiness.issues.find((current) => current.blocking);
  if (blocker) throw new StackError(`${blocker.message} — run strawberry`);
  const config = loadConfig(paths);
  return config;
}

function runRoot(config: StackConfig, paths: StrawberryPaths): string {
  return resolveStackRuntimeLayout(paths, config).runRoot;
}

function logRoot(config: StackConfig, paths: StrawberryPaths): string {
  return resolveStackRuntimeLayout(paths, config).logRoot;
}

function containerImage(config: StackConfig): string {
  return config.STRAWBERRY_CONTAINER_IMAGE || 'strawberry-agent:local';
}

function containerName(config: StackConfig): string {
  return config.STRAWBERRY_CONTAINER_NAME || 'strawberry-agent';
}

function minimalServiceEnv(paths: StrawberryPaths): NodeJS.ProcessEnv {
  return {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    SHELL: process.env.SHELL,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    STRAWBERRY_INSTALL_ROOT: paths.installRoot,
    STRAWBERRY_WORKSPACE_ROOT: paths.workspaceRoot
  };
}

async function requireContainer(): Promise<void> {
  await ensureContainerSystem();
}

async function discoverHostGateway(image: string, fallback: string): Promise<string> {
  const probe = await runCommand('container', [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    image,
    '-c',
    "ip route | awk '/default/ {print $3}'"
  ]);
  const gateway = probe.stdout.trim();
  return gateway || fallback;
}

async function ensureRepoDeps(paths: StrawberryPaths): Promise<void> {
  if (existsSync(join(paths.installRoot, 'node_modules'))) {
    return;
  }
  console.log('installing node dependencies on the host...');
  const install = await runCommand('pnpm', ['install', '--frozen-lockfile'], {
    cwd: paths.installRoot,
    inherit: true
  });
  if (install.code !== 0) {
    throw new StackError('pnpm install failed');
  }
}

async function buildImage(paths: StrawberryPaths, config: StackConfig): Promise<void> {
  ensureWorkspaceDirs(paths);
  const image = containerImage(config);
  const dockerfile = join(paths.installRoot, 'ops', 'container', 'Dockerfile');
  console.log('  building agent container image (first build can take several minutes)...');
  const build = await runCommand(
    'container',
    ['build', '--tag', image, '--file', dockerfile, paths.installRoot],
    { cwd: paths.installRoot, inherit: true }
  );
  if (build.code !== 0) {
    throw new StackError('container build failed');
  }
}

async function ensureImage(paths: StrawberryPaths, config: StackConfig): Promise<void> {
  const image = containerImage(config);
  const inspect = await runCommand('container', ['image', 'inspect', image]);
  if (inspect.code !== 0) {
    await buildImage(paths, config);
  }
}

export async function prepareStack(paths: StrawberryPaths): Promise<void> {
  const config = requireOnboarded(paths);
  ensureConfigBeforeStack(paths, config);
  await ensureRepoDeps(paths);
  await requireContainer();
  await ensureImage(paths, config);
  const gateway = await discoverHostGateway(
    containerImage(config),
    config.STRAWBERRY_CONTAINER_HOST_GATEWAY || '192.168.64.1'
  );
  await configureRuntimeEnv(paths, gateway);
}

function ensureConfigBeforeStack(paths: StrawberryPaths, config: StackConfig): void {
  requireConfigFile(paths, 'host');
  requireConfigFile(paths, 'telegram');
  requireConfigFile(paths, 'agent');
  requireConfigFile(paths, 'strawberry');
  ensureStackRuntimeDirs(paths, config);
}

function pidPath(runRootDir: string, name: string): string {
  return join(runRootDir, `${name}.pid`);
}

async function isPidRunning(file: string): Promise<boolean> {
  if (!existsSync(file)) {
    return false;
  }
  const pid = Number.parseInt(readFileSync(file, 'utf8').trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findListeningPid(port: number): Promise<number | undefined> {
  const result = await runCommand('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  if (result.code !== 0 || !result.stdout.trim()) {
    return undefined;
  }
  const pid = Number.parseInt(result.stdout.trim().split('\n')[0] ?? '', 10);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

function writeServiceLog(logs: string, name: 'host' | 'telegram', message: string): void {
  mkdirSync(logs, { recursive: true });
  writeFileSync(join(logs, `${name}.log`), `${message}\n`, { mode: 0o600 });
}

async function adoptHealthyServicePid(state: string, name: string, port: number, healthUrl: string): Promise<number | undefined> {
  if (!(await isUrlHealthy(healthUrl))) {
    return undefined;
  }
  const pid = await findListeningPid(port);
  if (!pid) {
    return undefined;
  }
  mkdirSync(state, { recursive: true });
  writeFileSync(pidPath(state, name), String(pid));
  return pid;
}

async function startBackgroundService(
  paths: StrawberryPaths,
  name: 'host' | 'telegram',
  scriptName: string,
  logs: string,
  state: string,
  options: { healthUrl?: string; healthBearer?: string; listenPort?: number } = {}
): Promise<void> {
  const file = pidPath(state, name);
  if (await isPidRunning(file)) {
    return;
  }
  if (options.healthUrl && options.listenPort) {
    const adoptedPid = await adoptHealthyServicePid(state, name, options.listenPort, options.healthUrl);
    if (adoptedPid) {
      writeServiceLog(logs, name, `[stack] reusing healthy ${name} service on port ${options.listenPort} (pid ${adoptedPid})`);
      return;
    }
  }
  if (options.healthUrl && (await isUrlHealthy(options.healthUrl, options.healthBearer))) {
    writeServiceLog(logs, name, `[stack] reusing healthy ${name} service`);
    return;
  }
  if (options.listenPort) {
    const occupant = await findListeningPid(options.listenPort);
    if (occupant) {
      throw new StackError(
        `port ${options.listenPort} is already in use (pid ${occupant}) but ${name} is not healthy — run strawberry stop`
      );
    }
  }
  if (existsSync(file)) {
    unlinkSync(file);
  }
  mkdirSync(state, { recursive: true });
  mkdirSync(logs, { recursive: true });

  const scriptPath = join(paths.opsBin, scriptName);
  if (!existsSync(scriptPath)) {
    throw new StackError(`missing ops script: ${scriptName}`);
  }

  const logPath = join(logs, `${name}.log`);
  const logFd = openSync(logPath, 'w');
  const child = spawn('bash', [scriptPath], {
    cwd: paths.installRoot,
    env: minimalServiceEnv(paths),
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  closeSync(logFd);
  child.on('error', (error) => {
    console.error(`failed to start ${name}: ${error.message}`);
  });
  if (!child.pid) {
    throw new StackError(`failed to start ${name}`);
  }
  child.unref();
  writeFileSync(file, String(child.pid));
}

async function stopBackgroundService(state: string, name: string): Promise<void> {
  const file = pidPath(state, name);
  if (existsSync(file)) {
    const pid = Number.parseInt(readFileSync(file, 'utf8').trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid);
      } catch {
        // already stopped
      }
    }
    unlinkSync(file);
  }
}

async function startAgentContainer(paths: StrawberryPaths, config: StackConfig): Promise<void> {
  const agentEnvPath = requireConfigFile(paths, 'agent');
  assertGuestEnvHasNoHostSecrets(readEnvFile(agentEnvPath));
  const image = containerImage(config);
  const name = containerName(config);
  const agentPort = config.STRAWBERRY_AGENT_PORT || '4501';
  const latest = loadConfig(paths);
  const gateway = latest.STRAWBERRY_CONTAINER_HOST_GATEWAY || config.STRAWBERRY_CONTAINER_HOST_GATEWAY || '192.168.64.1';
  await configureRuntimeEnv(paths, gateway);
  const { runRoot: stateRoot } = ensureStackRuntimeDirs(paths, latest);

  await runCommand('container', ['stop', name]);
  await runCommand('container', ['rm', name]);

  const run = await runCommand('container', [
    'run',
    '-d',
    '--name',
    name,
    '--cpus',
    config.STRAWBERRY_CONTAINER_CPUS || '2',
    '--memory',
    config.STRAWBERRY_CONTAINER_MEMORY || '2g',
    '-p',
    `127.0.0.1:${agentPort}:${agentPort}/tcp`,
    '--env-file',
    agentEnvPath,
    '--volume',
    `${paths.agentDir}:/opt/strawberry/.strawberry`,
    '--volume',
    `${paths.workspaceRoot}/apps:/opt/strawberry/apps`,
    '--volume',
    `${paths.workspaceRoot}/state/agent:/opt/strawberry/state/agent`,
    '--volume',
    `${agentEnvPath}:/opt/strawberry/config/agent.env:ro`,
    image
  ]);
  if (run.code !== 0) {
    throw new StackError(run.stderr || 'container run failed');
  }

  writeFileSync(join(stateRoot, 'container.name'), name);
}

async function stopAgentContainer(paths: StrawberryPaths, config: StackConfig): Promise<void> {
  const name = containerName(config);
  const inspect = await runCommand('container', ['inspect', name]);
  if (inspect.code !== 0) {
    return;
  }
  await runCommand('container', ['stop', name]);
  await runCommand('container', ['rm', name]);
  const marker = join(runRoot(config, paths), 'container.name');
  if (existsSync(marker)) {
    unlinkSync(marker);
  }
}

export async function startStack(paths: StrawberryPaths): Promise<void> {
  await prepareStack(paths);
  const config = loadConfig(paths);
  const { runRoot: state, logRoot: logs } = ensureStackRuntimeDirs(paths, config);
  const hostPort = config.STRAWBERRY_HOST_PORT || '4510';
  const agentPort = config.STRAWBERRY_AGENT_PORT || '4501';

  await startBackgroundService(paths, 'host', 'start-host-api.sh', logs, state, {
    healthUrl: `http://127.0.0.1:${hostPort}/api/health`,
    listenPort: Number.parseInt(hostPort, 10)
  });
  console.log('  waiting for host api…');
  await waitForUrl(`http://127.0.0.1:${hostPort}/api/health`);

  console.log('  starting agent container…');
  await startAgentContainer(paths, config);
  console.log('  waiting for agent…');
  try {
    await waitForUrl(
      `http://127.0.0.1:${agentPort}/api/health`,
      config.STRAWBERRY_AGENT_API_KEY
    );
  } catch {
    const logs = await runCommand('container', ['logs', containerName(config)]);
    const tail = redactedTailLines(logs.stdout, 12);
    throw new StackError(
      tail
        ? `agent did not become healthy. Recent container logs:\n${tail}`
        : 'agent did not become healthy — run `strawberry logs agent`'
    );
  }

  console.log('  starting telegram gateway…');
  await startBackgroundService(paths, 'telegram', 'start-telegram-gateway.sh', logs, state);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  if (!(await isPidRunning(pidPath(state, 'telegram')))) {
    const tail = readLogTail(join(logs, 'telegram.log'));
    throw new StackError(
      tail ? `telegram failed to start. Recent logs:\n${tail}` : 'telegram failed to start — check logs/telegram.log'
    );
  }
}

export async function stopStack(paths: StrawberryPaths): Promise<void> {
  const config = loadConfig(paths);
  const state = runRoot(config, paths);
  await stopBackgroundService(state, 'telegram');
  await stopBackgroundService(state, 'host');
  await stopAgentContainer(paths, config);
}

export async function statusStack(paths: StrawberryPaths): Promise<void> {
  const config = loadConfig(paths);
  const state = runRoot(config, paths);
  const name = containerName(config);
  const inspect = await runCommand('container', ['inspect', name]);
  console.log(`  agent container   ${inspect.code === 0 ? `running (${name})` : 'stopped'}`);

  for (const service of ['host', 'telegram'] as const) {
    const running = await isPidRunning(pidPath(state, service));
    if (running) {
      const pid = readFileSync(pidPath(state, service), 'utf8').trim();
      console.log(`  ${service.padEnd(16)} running (pid ${pid})`);
    } else {
      console.log(`  ${service.padEnd(16)} stopped`);
    }
  }
  console.log('');
}

export async function buildStackImage(paths: StrawberryPaths): Promise<void> {
  const config = requireOnboarded(paths);
  ensureConfigBeforeStack(paths, config);
  await requireContainer();
  await buildImage(paths, config);
}

export async function tailStackLogs(paths: StrawberryPaths): Promise<number> {
  const config = loadConfig(paths);
  const logs = logRoot(config, paths);
  const name = containerName(config);
  mkdirSync(logs, { recursive: true });

  const files = ['host.log', 'telegram.log']
    .map((file) => join(logs, file))
    .filter((file) => existsSync(file));

  if (files.length === 0) {
    throw new StackError(`no log files yet under ${logs}`);
  }

  const containerRunning = (await runCommand('container', ['inspect', name])).code === 0;

  await new Promise<void>((resolve, reject) => {
    let pending = containerRunning ? 2 : 1;
    const done = () => {
      pending -= 1;
      if (pending === 0) {
        resolve();
      }
    };

    const tail = spawn('tail', ['-F', ...files], { cwd: paths.workspaceRoot, stdio: 'inherit' });
    tail.on('close', done);
    tail.on('error', reject);

    if (containerRunning) {
      const containerLogs = spawn('container', ['logs', '-f', name], { cwd: paths.installRoot, stdio: 'inherit' });
      containerLogs.on('close', done);
      containerLogs.on('error', reject);
    }
  });

  return 0;
}

export type StackLogTarget = 'all' | 'host' | 'telegram' | 'agent';

function printSection(title: string, body: string): void {
  console.log(`==> ${title}`);
  console.log(body.trim() || '(no logs yet)');
  console.log('');
}

export async function printStackLogs(paths: StrawberryPaths, target: StackLogTarget = 'all', lines = 80): Promise<void> {
  const config = loadConfig(paths);
  const logs = logRoot(config, paths);
  const targets = target === 'all' ? ['host', 'telegram', 'agent'] as const : [target];

  for (const current of targets) {
    if (current === 'agent') {
      const result = await runCommand('container', ['logs', containerName(config)], { cwd: paths.installRoot });
      if (result.code !== 0) {
        printSection('agent', result.stderr || `container ${containerName(config)} is not available`);
        continue;
      }
      printSection('agent', redactedTailLines(result.stdout, lines));
      continue;
    }

    const logPath = join(logs, `${current}.log`);
    printSection(current, readLogTail(logPath, lines));
  }
}

export function formatStackError(error: unknown): string {
  if (error instanceof StackError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
