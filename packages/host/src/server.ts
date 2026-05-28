import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { readEnvValue, redactSensitiveText } from '@strawberry/shared/env';
import { parsePositiveInt } from '@strawberry/shared/args';
import { isLoopbackHost } from '@strawberry/shared/http-auth';

import { assertHostAccess } from './access.ts';
import { readBlock } from './chain.ts';
import { asInt, asJsonObject, asText, fail } from './validate.ts';

const MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_BIND_HOST = '127.0.0.1';
const DEFAULT_PORT = 4510;

type Json = Record<string, unknown>;

type HostConfig = {
  bindHost: string;
  port: number;
  apiKey?: string;
  stateRoot: string;
  signerCommand?: string;
  rpcUrl?: string;
};

const HOST_SECRET_KEYS = [
  'STRAWBERRY_HOST_API_KEY',
  'STRAWBERRY_RPC_URL',
  'STRAWBERRY_AGENT_API_KEY'
];
const PUBLIC_SIGNER_RESULT_KEYS = new Set([
  'txHash',
  'transactionHash',
  'hash',
  'status',
  'chainId',
  'blockNumber',
  'explorerUrl'
]);

type TransactionRequest = {
  chatId: number;
  telegramUserId: number;
  chain: string;
  app: string;
  action: string;
  payload: Json;
  idempotencyKey?: string;
};

type ActionContext = {
  chatId: number;
  telegramUserId: number;
};

type TransactionState = {
  executedByDigest: Map<string, Json>;
  inFlightByDigest: Map<string, Promise<Json>>;
};

function clearProcessSecret(key: string): void {
  delete process.env[key];
  delete process.env[`${key}_FILE`];
}

function parseConfig(env: NodeJS.ProcessEnv = process.env): HostConfig {
  const bindHost = env.STRAWBERRY_HOST_BIND_HOST?.trim() || DEFAULT_BIND_HOST;
  const apiKey = readEnvValue(env, 'STRAWBERRY_HOST_API_KEY');
  if (!isLoopbackHost(bindHost) && !apiKey) {
    throw new Error('Missing STRAWBERRY_HOST_API_KEY for non-loopback host binds.');
  }

  return {
    bindHost,
    port: parsePositiveInt(env.STRAWBERRY_HOST_PORT, DEFAULT_PORT, 'STRAWBERRY_HOST_PORT'),
    apiKey,
    stateRoot: env.STRAWBERRY_HOST_STATE_ROOT?.trim() || resolve(process.cwd(), '.strawberry', 'state', 'host'),
    signerCommand: env.STRAWBERRY_SIGNER_COMMAND?.trim() || undefined,
    rpcUrl: readEnvValue(env, 'STRAWBERRY_RPC_URL')
  };
}

function scrubHostProcessEnv(env: NodeJS.ProcessEnv): void {
  if (env !== process.env) return;
  for (const key of HOST_SECRET_KEYS) {
    clearProcessSecret(key);
  }
}

function hostAccess(config: HostConfig) {
  return {
    apiKey: config.apiKey,
    bindHost: config.bindHost
  };
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_BODY_BYTES) throw fail(413, 'Request body too large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw fail(400, 'Request body is required');
  try {
    return JSON.parse(raw) as Json;
  } catch {
    throw fail(400, 'Request body must be valid JSON');
  }
}

function parseTransactionRequest(body: Json): TransactionRequest {
  return {
    chatId: asInt(body.chatId, 'chatId'),
    telegramUserId: asInt(body.telegramUserId, 'telegramUserId'),
    chain: asText(body.chain, 'chain', 64),
    app: asText(body.app, 'app', 128),
    action: asText(body.action, 'action', 128),
    payload: asJsonObject(body.payload, 'payload'),
    idempotencyKey: typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? asText(body.idempotencyKey, 'idempotencyKey', 128)
      : undefined
  };
}

function parseActionContext(body: Json): ActionContext {
  return {
    chatId: asInt(body.chatId, 'chatId'),
    telegramUserId: asInt(body.telegramUserId, 'telegramUserId')
  };
}

function digestRequest(input: TransactionRequest): string {
  return createHash('sha256').update(JSON.stringify({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    chain: input.chain,
    app: input.app,
    action: input.action,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey
  })).digest('hex');
}

async function appendLedger(config: HostConfig, event: Json): Promise<void> {
  await mkdir(config.stateRoot, { recursive: true });
  const path = resolve(config.stateRoot, 'transactions.jsonl');
  await writeFile(path, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`, { flag: 'a', mode: 0o600 });
}

export function parseSignerCommand(command: string): { file: string; args: string[] } {
  const parts = command.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g)?.map((part) => {
    if ((part.startsWith("'") && part.endsWith("'")) || (part.startsWith('"') && part.endsWith('"'))) {
      return part.slice(1, -1);
    }
    return part;
  }) ?? [];
  const file = parts[0];
  if (!file) throw new Error('Signer command is empty.');
  return { file, args: parts.slice(1) };
}

function minimalSignerEnv(): NodeJS.ProcessEnv {
  return {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER
  };
}

function publicSignerResult(result: Json): Json {
  return Object.fromEntries(
    Object.entries(result).filter(([key, value]) => PUBLIC_SIGNER_RESULT_KEYS.has(key) && value !== undefined)
  );
}

function runSigner(command: string, input: Json): Promise<Json> {
  return new Promise((resolveRun, rejectRun) => {
    const parsed = parseSignerCommand(command);
    const child = spawn(parsed.file, parsed.args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: minimalSignerEnv()
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectRun(new Error(`signer command failed: ${redactSensitiveText(Buffer.concat(stderr).toString('utf8').trim())}`));
        return;
      }
      try {
        resolveRun(JSON.parse(Buffer.concat(stdout).toString('utf8')) as Json);
      } catch {
        rejectRun(new Error('signer command returned invalid JSON'));
      }
    });
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

async function prepareTransaction(config: HostConfig, request: TransactionRequest) {
  const digest = digestRequest(request);
  const prepared = {
    requestId: request.idempotencyKey || digest.slice(0, 24),
    digest,
    chain: request.chain,
    app: request.app,
    action: request.action,
    requiresSigner: true
  };
  await appendLedger(config, { type: 'prepared', ...prepared, chatId: request.chatId, telegramUserId: request.telegramUserId });
  return prepared;
}

async function executeTransaction(config: HostConfig, state: TransactionState, request: TransactionRequest) {
  if (!config.signerCommand) {
    throw fail(503, 'No STRAWBERRY_SIGNER_COMMAND configured. Host refuses to execute transactions without an explicit signer.');
  }
  const signerCommand = config.signerCommand;
  const prepared = await prepareTransaction(config, request);
  const cached = state.executedByDigest.get(prepared.digest);
  if (cached) return cached;
  const existing = state.inFlightByDigest.get(prepared.digest);
  if (existing) return existing;

  const execute = (async () => {
    const signerResult = publicSignerResult(await runSigner(signerCommand, {
      ...prepared,
      chatId: request.chatId,
      telegramUserId: request.telegramUserId,
      payload: request.payload
    }));
    const result = { ...prepared, signerResult };
    state.executedByDigest.set(prepared.digest, result);
    await appendLedger(config, { type: 'executed', requestId: prepared.requestId, digest: prepared.digest, signerResult });
    return result;
  })();
  state.inFlightByDigest.set(prepared.digest, execute);
  try {
    return await execute;
  } finally {
    state.inFlightByDigest.delete(prepared.digest);
  }
}

export async function startHostServer(env: NodeJS.ProcessEnv = process.env) {
  const config = parseConfig(env);
  scrubHostProcessEnv(env);
  const transactions: TransactionState = {
    executedByDigest: new Map(),
    inFlightByDigest: new Map()
  };
  const server = createServer(async (request, response) => {
    try {
      const method = request.method || 'GET';
      const path = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
      if (method === 'GET' && path === '/api/health') {
        return writeJson(response, 200, { ready: true, rpcConfigured: Boolean(config.rpcUrl) });
      }
      if (method !== 'POST') return writeJson(response, 404, { error: 'Not found' });
      assertHostAccess(request, hostAccess(config));

      if (path === '/api/chain/block') {
        if (!config.rpcUrl) throw fail(503, 'Missing STRAWBERRY_RPC_URL.');
        const body = await readJsonBody(request);
        const context = parseActionContext(body);
        const block = asText(body.block, 'block', 128);
        const result = await readBlock(config.rpcUrl, block);
        await appendLedger(config, { type: 'chain_read', chatId: context.chatId, telegramUserId: context.telegramUserId, block });
        return writeJson(response, 200, result);
      }

      if (path === '/api/transactions/prepare') {
        return writeJson(response, 200, await prepareTransaction(config, parseTransactionRequest(await readJsonBody(request))));
      }
      if (path === '/api/transactions/execute') {
        return writeJson(response, 200, await executeTransaction(config, transactions, parseTransactionRequest(await readJsonBody(request))));
      }
      return writeJson(response, 404, { error: 'Not found' });
    } catch (error) {
      const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
      writeJson(response, statusCode, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(config.port, config.bindHost, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  console.log(`[host] listening on http://${config.bindHost}:${config.port}`);
  return server;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  startHostServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
