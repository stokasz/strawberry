import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession
} from '@earendil-works/pi-coding-agent';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parsePositiveInt } from './args.ts';
import type {
  AgentHealthResponse,
  AgentProgressEvent,
  AgentPromptOptions,
  AgentPromptRequest,
  AgentPromptResponse,
  AgentReadUploadRequest,
  AgentReadUploadResponse,
  AgentResetSessionRequest,
  AgentResetSessionResponse,
  AgentSessionKind,
  AgentUploadRequest,
  AgentUploadResponse
} from './api.ts';
import { canonicalSessionId } from './api.ts';
import { redactSensitiveText } from './env.ts';
import {
  requireOwnedUpload,
  storeUpload,
  type StoredUpload
} from './upload-store.ts';

export type PiSession = {
  prompt: (text: string) => Promise<void>;
  messages: AgentMessageLike[];
  subscribe?: (listener: (event: unknown) => void) => () => void;
  dispose?: () => void;
  model?: unknown;
};

type AgentMessageLike = unknown;

type AssistantMessageLike = {
  role: 'assistant';
  content: Array<{ type: string; text?: string }>;
  stopReason?: string;
  errorMessage?: string;
};

export type AgentRuntimeConfig = {
  agentId: string;
  cwd: string;
  agentDir: string;
  stateRoot: string;
  bindHost: string;
  port: number;
  maxUploadBytes: number;
};

type AgentSessionDescriptor = {
  kind: AgentSessionKind;
  sessionId: string;
};

type RuntimeDependencies = {
  createSession?: (input: AgentSessionDescriptor) => Promise<PiSession>;
};

const PROBE_TELEGRAM_USER_ID = 0;
const PROGRESS_LABEL_LIMIT = 96;

function fail(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export function readAgentRuntimeConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): AgentRuntimeConfig {
  return {
    agentId: env.STRAWBERRY_AGENT_ID?.trim() || 'strawberry',
    cwd,
    agentDir: env.STRAWBERRY_AGENT_DIR?.trim() || resolve(cwd, '.strawberry'),
    stateRoot: env.STRAWBERRY_AGENT_STATE_ROOT?.trim() || resolve(cwd, '.strawberry', 'state', 'agent'),
    bindHost: env.STRAWBERRY_AGENT_BIND_HOST?.trim() || '127.0.0.1',
    port: parsePositiveInt(env.STRAWBERRY_AGENT_PORT, 4501, 'STRAWBERRY_AGENT_PORT'),
    maxUploadBytes: parsePositiveInt(env.STRAWBERRY_AGENT_MAX_UPLOAD_BYTES, 12 * 1024 * 1024, 'STRAWBERRY_AGENT_MAX_UPLOAD_BYTES')
  };
}

function isAssistantMessage(message: AgentMessageLike): message is AssistantMessageLike {
  return typeof message === 'object'
    && message !== null
    && 'role' in message
    && message.role === 'assistant'
    && 'content' in message
    && Array.isArray((message as { content: unknown }).content);
}

function extractReplyFromAssistant(message: AssistantMessageLike): string | undefined {
  const text = message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text?.trim() || '')
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) return text;
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    return message.errorMessage?.trim() || 'Model failed to produce a response.';
  }
  return undefined;
}

function extractLatestAssistantReply(messages: AgentMessageLike[], previousLength: number): string | undefined {
  for (let index = messages.length - 1; index >= previousLength; index -= 1) {
    const message = messages[index];
    if (!isAssistantMessage(message)) continue;
    const text = extractReplyFromAssistant(message);
    if (text) return text;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function shortLabel(value: string | undefined, fallback: string): string {
  const redacted = redactSensitiveText(value || fallback).replace(/\s+/g, ' ').trim();
  return redacted.length > PROGRESS_LABEL_LIMIT
    ? `${redacted.slice(0, PROGRESS_LABEL_LIMIT - 1)}…`
    : redacted;
}

function toolProgressLabel(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'read':
      return `reading ${shortLabel(stringField(input, 'path'), 'file')}`;
    case 'grep': {
      const pattern = shortLabel(stringField(input, 'pattern'), 'pattern');
      const path = stringField(input, 'path') ? ` in ${shortLabel(stringField(input, 'path'), 'path')}` : '';
      return `searching "${pattern}"${path}`;
    }
    case 'find':
      return `finding ${shortLabel(stringField(input, 'pattern') || stringField(input, 'path'), 'files')}`;
    case 'ls':
      return `listing ${shortLabel(stringField(input, 'path'), 'files')}`;
    case 'bash':
      return `running ${shortLabel(stringField(input, 'command'), 'command')}`;
    case 'edit':
      return `editing ${shortLabel(stringField(input, 'path'), 'file')}`;
    case 'write':
      return `writing ${shortLabel(stringField(input, 'path'), 'file')}`;
    default:
      return `using ${shortLabel(toolName, 'tool')}`;
  }
}

function progressFromSessionEvent(event: unknown): AgentProgressEvent | undefined {
  const record = asRecord(event);
  const type = stringField(record, 'type');
  if (type !== 'tool_call' && type !== 'tool_result' && type !== 'tool_execution_start' && type !== 'tool_execution_end') {
    return undefined;
  }

  const toolName = stringField(record, 'toolName');
  if (!toolName) return undefined;
  const input = asRecord(record.input ?? record.args);
  const isError = record.isError === true;
  const status: AgentProgressEvent['status'] = type === 'tool_result' || type === 'tool_execution_end'
    ? isError ? 'failed' : 'completed'
    : 'started';
  return {
    status,
    toolName,
    label: toolProgressLabel(toolName, input)
  };
}

function formatUploadPrompt(upload: StoredUpload, prefix: string): string {
  return [
    prefix,
    `- upload_id: ${upload.uploadId}`,
    `- mime_type: ${upload.mimeType}`,
    `- size_bytes: ${upload.sizeBytes}`,
    `- caption: ${upload.caption ?? '(none)'}`,
    `- telegram_user_id: ${upload.telegramUserId}`
  ].join('\n');
}

function sanitizeSessionId(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 128) || 'session';
}

function getCanonicalSessionId(input: Pick<AgentPromptRequest, 'kind' | 'chatId' | 'telegramUserId'>): string {
  return canonicalSessionId(input);
}

function getSessionDescriptor(input: Pick<AgentPromptRequest, 'kind' | 'chatId' | 'telegramUserId' | 'sessionId'>): AgentSessionDescriptor {
  const canonicalSessionId = getCanonicalSessionId(input);
  const explicit = input.sessionId?.trim();
  if (explicit && sanitizeSessionId(explicit) !== canonicalSessionId) {
    throw new Error(`Invalid session id for kind=${input.kind}. Expected ${canonicalSessionId}.`);
  }
  return { kind: input.kind, sessionId: canonicalSessionId };
}

function getSessionKey(input: AgentSessionDescriptor): string {
  return `${input.kind}:${input.sessionId}`;
}

function createPiSessionFactory(config: AgentRuntimeConfig) {
  const authStorage = AuthStorage.create(resolve(config.agentDir, 'auth.json'));
  const modelRegistry = ModelRegistry.create(authStorage, resolve(config.agentDir, 'models.json'));
  const settingsManager = SettingsManager.create(config.cwd, config.agentDir);
  const agentsPath = resolve(config.agentDir, 'AGENTS.md');

  return async (input: AgentSessionDescriptor): Promise<PiSession> => {
    const sessionDir = resolve(config.stateRoot, 'sessions', input.kind, input.sessionId);
    await mkdir(sessionDir, { recursive: true });
    await mkdir(resolve(config.agentDir, 'memory'), { recursive: true });

    const resourceLoader = new DefaultResourceLoader({
      cwd: config.cwd,
      agentDir: config.agentDir,
      settingsManager,
      additionalSkillPaths: [resolve(config.agentDir, 'skills')],
      agentsFilesOverride: ({ agentsFiles }) => {
        const target = agentsFiles.find((file) => resolve(file.path) === agentsPath);
        return { agentsFiles: target ? [target] : [] };
      }
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: config.cwd,
      agentDir: config.agentDir,
      authStorage,
      modelRegistry,
      sessionManager: SessionManager.continueRecent(config.cwd, sessionDir),
      settingsManager,
      resourceLoader
    });

    if (!session.model) {
      throw new Error('No Pi model available. Run the Pi login/model setup inside the selected agent runtime.');
    }
    return session;
  };
}

export class IsolatedAgentRuntime {
  private readonly config: AgentRuntimeConfig;
  private readonly createSession: (input: AgentSessionDescriptor) => Promise<PiSession>;
  private readonly sessions = new Map<string, PiSession>();
  private readonly promptQueueBySession = new Map<string, Promise<void>>();
  private readonly startedAt = new Date();
  private ready = false;
  private readyError?: string;
  private lastPromptAt?: string;
  private lastPromptLatencyMs?: number;

  constructor(config: AgentRuntimeConfig, deps: RuntimeDependencies = {}) {
    this.config = config;
    this.createSession = deps.createSession ?? createPiSessionFactory(config);
  }

  async init(): Promise<void> {
    try {
      await this.getSession({
        kind: 'admin',
        sessionId: canonicalSessionId({
          kind: 'admin',
          chatId: PROBE_TELEGRAM_USER_ID,
          telegramUserId: PROBE_TELEGRAM_USER_ID
        })
      });
      this.ready = true;
      this.readyError = undefined;
    } catch (error) {
      this.ready = false;
      this.readyError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async getSession(input: AgentSessionDescriptor): Promise<PiSession> {
    const sessionKey = getSessionKey(input);
    const existing = this.sessions.get(sessionKey);
    if (existing) return existing;
    const created = await this.createSession(input);
    this.sessions.set(sessionKey, created);
    return created;
  }

  private enqueuePrompt<T>(session: AgentSessionDescriptor, work: () => Promise<T>): Promise<T> {
    const sessionKey = getSessionKey(session);
    const previous = this.promptQueueBySession.get(sessionKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(work);
    this.promptQueueBySession.set(sessionKey, run.then(() => undefined, () => undefined));
    return run;
  }

  async upload(input: AgentUploadRequest): Promise<AgentUploadResponse> {
    const bytes = Buffer.from(input.bytesBase64, 'base64');
    if (bytes.byteLength < 1) throw fail(400, 'Upload body is empty.');
    if (bytes.byteLength > this.config.maxUploadBytes) {
      throw fail(413, `Upload exceeds ${this.config.maxUploadBytes} byte limit.`);
    }

    const stored = await storeUpload({
      runtimeRoot: this.config.stateRoot,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      telegramMessageId: input.telegramMessageId,
      sourceFileId: input.sourceFileId,
      sourceUniqueId: input.sourceUniqueId,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      caption: input.caption,
      bytes
    });
    return { uploadId: stored.uploadId };
  }

  async readUpload(input: AgentReadUploadRequest): Promise<AgentReadUploadResponse> {
    const upload = await requireOwnedUpload(this.config.stateRoot, input);
    return {
      uploadId: upload.uploadId,
      chatId: upload.chatId,
      telegramUserId: upload.telegramUserId,
      telegramMessageId: upload.telegramMessageId,
      sourceFileId: upload.sourceFileId,
      sourceUniqueId: upload.sourceUniqueId,
      originalFileName: upload.originalFileName,
      mimeType: upload.mimeType,
      caption: upload.caption,
      bytesBase64: (await readFile(upload.absolutePath)).toString('base64')
    };
  }

  private async buildPrompt(input: AgentPromptRequest): Promise<string> {
    const sections = [input.prompt];
    if (input.uploadId) {
      const upload = await requireOwnedUpload(this.config.stateRoot, {
        uploadId: input.uploadId,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId
      });
      sections.push(formatUploadPrompt(upload, 'Stored upload for this Telegram user:'));
    }
    return sections.join('\n\n');
  }

  async prompt(input: AgentPromptRequest, options: AgentPromptOptions = {}): Promise<AgentPromptResponse> {
    const sessionDescriptor = getSessionDescriptor(input);
    return this.enqueuePrompt(sessionDescriptor, async () => {
      const startedAt = Date.now();
      const session = await this.getSession(sessionDescriptor);
      const previousLength = session.messages.length;
      const unsubscribe = options.onProgress && session.subscribe
        ? session.subscribe((event) => {
          const progress = progressFromSessionEvent(event);
          if (progress) void options.onProgress?.(progress);
        })
        : undefined;
      try {
        await session.prompt(await this.buildPrompt(input));
      } finally {
        unsubscribe?.();
      }
      const rawReply = extractLatestAssistantReply(session.messages, previousLength);
      if (!rawReply) throw new Error('Agent produced no reply.');
      const reply = redactSensitiveText(rawReply);
      this.lastPromptAt = new Date().toISOString();
      this.lastPromptLatencyMs = Date.now() - startedAt;
      return { reply, latencyMs: this.lastPromptLatencyMs };
    });
  }

  async resetSession(input: AgentResetSessionRequest): Promise<AgentResetSessionResponse> {
    const sessionDescriptor = getSessionDescriptor(input);
    return this.enqueuePrompt(sessionDescriptor, async () => {
      const sessionKey = getSessionKey(sessionDescriptor);
      const existing = this.sessions.get(sessionKey);
      existing?.dispose?.();
      this.sessions.delete(sessionKey);
      await rm(resolve(this.config.stateRoot, 'sessions', sessionDescriptor.kind, sessionDescriptor.sessionId), {
        recursive: true,
        force: true
      });
      return { reset: true, sessionId: sessionDescriptor.sessionId };
    });
  }

  async health(): Promise<AgentHealthResponse> {
    return {
      ready: this.ready,
      error: this.ready ? undefined : this.readyError,
      agentId: this.config.agentId,
      startedAt: this.startedAt.toISOString(),
      uptimeMs: Date.now() - this.startedAt.getTime(),
      queueDepth: this.promptQueueBySession.size,
      rssBytes: process.memoryUsage().rss,
      lastPromptAt: this.lastPromptAt,
      lastPromptLatencyMs: this.lastPromptLatencyMs
    };
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose?.();
    }
    this.sessions.clear();
  }
}
