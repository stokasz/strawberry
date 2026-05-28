import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type {
  AgentPromptOptions,
  AgentPromptRequest,
  AgentPromptStreamEvent,
  AgentReadUploadRequest,
  AgentResetSessionRequest,
  AgentUploadRequest
} from './api.ts';
import { readEnvValue } from './env.ts';
import { assertBearerAuth, isLoopbackHost } from './http-auth.ts';
import { IsolatedAgentRuntime, readAgentRuntimeConfig } from './runtime.ts';
import {
  parseOptionalString,
  parseOptionalUploadId,
  parseRequiredInt,
  parseRequiredString
} from './validate-request.ts';

type AgentHttpRuntime = Pick<IsolatedAgentRuntime, 'health' | 'upload' | 'readUpload' | 'resetSession' | 'dispose'> & {
  prompt: (input: AgentPromptRequest, options?: AgentPromptOptions) => ReturnType<IsolatedAgentRuntime['prompt']>;
  init?: () => Promise<void>;
};

type StartAgentServerOptions = {
  signal?: AbortSignal;
  config?: ReturnType<typeof readAgentRuntimeConfig>;
  runtime?: AgentHttpRuntime;
  agentApiKey?: string;
};

type HttpError = Error & {
  statusCode?: number;
};

const MAX_PROMPT_BODY_BYTES = 128 * 1024;
const MAX_UPLOAD_BODY_BYTES = 24 * 1024 * 1024;

function clearProcessSecret(key: string): void {
  delete process.env[key];
  delete process.env[`${key}_FILE`];
}

function createHttpError(statusCode: number, message: string): HttpError {
  return Object.assign(new Error(message), { statusCode });
}

function readRequiredInt(value: string | null, key: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isSafeInteger(parsed)) throw createHttpError(400, `Missing or invalid query param ${key}`);
  return parsed;
}

function parseUploadRequest(body: Record<string, unknown>): AgentUploadRequest {
  return {
    chatId: parseRequiredInt(body.chatId, 'chatId'),
    telegramUserId: parseRequiredInt(body.telegramUserId, 'telegramUserId'),
    telegramMessageId: parseRequiredInt(body.telegramMessageId, 'telegramMessageId'),
    sourceFileId: parseRequiredString(body.sourceFileId, 'sourceFileId', 256),
    sourceUniqueId: parseOptionalString(body.sourceUniqueId, 'sourceUniqueId', 256),
    originalFileName: parseOptionalString(body.originalFileName, 'originalFileName', 256),
    mimeType: parseOptionalString(body.mimeType, 'mimeType', 128),
    caption: parseOptionalString(body.caption, 'caption', 4096),
    bytesBase64: parseRequiredString(body.bytesBase64, 'bytesBase64')
  };
}

function parsePromptRequest(body: Record<string, unknown>): Omit<AgentPromptRequest, 'kind'> {
  return {
    sessionId: parseOptionalString(body.sessionId, 'sessionId', 128) ?? '',
    prompt: parseRequiredString(body.prompt, 'prompt', 96_000),
    chatId: parseRequiredInt(body.chatId, 'chatId'),
    telegramUserId: parseRequiredInt(body.telegramUserId, 'telegramUserId'),
    telegramUsername: parseOptionalString(body.telegramUsername, 'telegramUsername', 64),
    uploadId: parseOptionalUploadId(body.uploadId)
  };
}

function parseResetSessionRequest(body: Record<string, unknown>): Omit<AgentResetSessionRequest, 'kind'> {
  return {
    sessionId: parseOptionalString(body.sessionId, 'sessionId', 128) ?? '',
    chatId: parseRequiredInt(body.chatId, 'chatId'),
    telegramUserId: parseRequiredInt(body.telegramUserId, 'telegramUserId')
  };
}

async function readJsonBody<T>(request: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) throw createHttpError(413, 'Request body too large');
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw createHttpError(400, 'Request body is required');
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw createHttpError(400, 'Request body must be valid JSON');
  }
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(payload)}\n`);
}

function writePromptStreamEvent(response: ServerResponse, event: AgentPromptStreamEvent): void {
  response.write(`${JSON.stringify(event)}\n`);
}

async function writePromptStream(
  response: ServerResponse,
  runPrompt: (onProgress: NonNullable<AgentPromptOptions['onProgress']>) => ReturnType<AgentHttpRuntime['prompt']>
): Promise<void> {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('cache-control', 'no-cache');

  try {
    const result = await runPrompt((event) => {
      writePromptStreamEvent(response, { type: 'progress', event });
    });
    writePromptStreamEvent(response, { type: 'result', response: result });
  } catch (error) {
    writePromptStreamEvent(response, { type: 'error', error: error instanceof Error ? error.message : String(error) });
  } finally {
    response.end();
  }
}

export async function startAgentServer(options: StartAgentServerOptions = {}) {
  const config = options.config ?? readAgentRuntimeConfig(process.env, process.cwd());
  const agentApiKey = options.agentApiKey ?? readEnvValue(process.env, 'STRAWBERRY_AGENT_API_KEY');
  clearProcessSecret('STRAWBERRY_AGENT_API_KEY');
  if (!isLoopbackHost(config.bindHost) && !agentApiKey) {
    throw new Error('Missing required env STRAWBERRY_AGENT_API_KEY for non-loopback agent binds.');
  }

  const runtime = options.runtime ?? new IsolatedAgentRuntime(config);
  await runtime.init?.();

  const server = createServer(async (request, response) => {
    try {
      const method = request.method || 'GET';
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (agentApiKey) assertBearerAuth(request, agentApiKey);

      if (method === 'GET' && url.pathname === '/api/health') {
        writeJson(response, 200, await runtime.health());
        return;
      }

      if (method === 'POST' && url.pathname === '/api/uploads') {
        writeJson(response, 200, await runtime.upload(parseUploadRequest(await readJsonBody<Record<string, unknown>>(request, MAX_UPLOAD_BODY_BYTES))));
        return;
      }

      const uploadMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)$/);
      if (method === 'GET' && uploadMatch) {
        writeJson(response, 200, await runtime.readUpload({
          uploadId: decodeURIComponent(uploadMatch[1]),
          chatId: readRequiredInt(url.searchParams.get('chatId'), 'chatId'),
          telegramUserId: readRequiredInt(url.searchParams.get('telegramUserId'), 'telegramUserId')
        } satisfies AgentReadUploadRequest));
        return;
      }

      const promptMatch = url.pathname.match(/^\/api\/sessions\/(group|dm|admin)\/prompt$/);
      if (method === 'POST' && promptMatch) {
        const body = parsePromptRequest(await readJsonBody<Record<string, unknown>>(request, MAX_PROMPT_BODY_BYTES));
        writeJson(response, 200, await runtime.prompt({ ...body, kind: promptMatch[1] as AgentPromptRequest['kind'] }));
        return;
      }

      const promptEventsMatch = url.pathname.match(/^\/api\/sessions\/(group|dm|admin)\/prompt-events$/);
      if (method === 'POST' && promptEventsMatch) {
        const body = parsePromptRequest(await readJsonBody<Record<string, unknown>>(request, MAX_PROMPT_BODY_BYTES));
        await writePromptStream(response, (onProgress) => runtime.prompt({
          ...body,
          kind: promptEventsMatch[1] as AgentPromptRequest['kind']
        }, { onProgress }));
        return;
      }

      const resetMatch = url.pathname.match(/^\/api\/sessions\/(group|dm|admin)\/reset$/);
      if (method === 'POST' && resetMatch) {
        const body = parseResetSessionRequest(await readJsonBody<Record<string, unknown>>(request, MAX_PROMPT_BODY_BYTES));
        writeJson(response, 200, await runtime.resetSession({ ...body, kind: resetMatch[1] as AgentResetSessionRequest['kind'] }));
        return;
      }

      writeJson(response, 404, { error: 'Not found' });
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

  const address = server.address();
  const baseUrl = typeof address === 'object' && address !== null
    ? `http://${config.bindHost}:${address.port}`
    : `http://${config.bindHost}:${config.port}`;
  console.log(`[agent] ${config.agentId} listening on ${baseUrl}`);

  const close = async () => {
    runtime.dispose();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  };

  options.signal?.addEventListener('abort', () => {
    void close();
  }, { once: true });

  return { server, runtime, close, baseUrl };
}

const abortController = new AbortController();

function stop(signalName: string): void {
  console.log(`[agent] received ${signalName}, shutting down`);
  abortController.abort();
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  startAgentServer({ signal: abortController.signal }).catch((error) => {
    console.error('[agent] fatal error:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
