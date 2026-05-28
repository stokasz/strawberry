import type {
  AgentHealthResponse,
  AgentPromptOptions,
  AgentPromptRequest,
  AgentPromptResponse,
  AgentPromptStreamEvent,
  AgentReadUploadRequest,
  AgentReadUploadResponse,
  AgentResetSessionRequest,
  AgentResetSessionResponse,
  AgentUploadRequest,
  AgentUploadResponse
} from '@strawberry/shared/api';
import { readEnvValue } from '@strawberry/shared/env';
import { parsePositiveInt } from '@strawberry/shared/args';
import { normalizeBaseUrl } from '@strawberry/shared/host-request-common';

export type AgentTransport = {
  prompt: (input: AgentPromptRequest, options?: AgentPromptOptions) => Promise<AgentPromptResponse>;
  resetSession: (input: AgentResetSessionRequest) => Promise<AgentResetSessionResponse>;
  upload: (input: AgentUploadRequest) => Promise<AgentUploadResponse>;
  readUpload: (input: AgentReadUploadRequest) => Promise<AgentReadUploadResponse>;
  health: () => Promise<AgentHealthResponse>;
  dispose?: () => void;
};

export type AgentTransportConfig = {
  baseUrl: string;
  apiKey: string;
};

export const DEFAULT_AGENT_HTTP_TIMEOUT_MS = 120_000;

export function readAgentTransportConfig(env: NodeJS.ProcessEnv = process.env): AgentTransportConfig {
  const bindHost = env.STRAWBERRY_AGENT_BIND_HOST?.trim() || '127.0.0.1';
  const port = env.STRAWBERRY_AGENT_PORT?.trim() || '4501';
  const apiKey = readEnvValue(env, 'STRAWBERRY_AGENT_API_KEY');
  if (!apiKey) {
    throw new Error('Missing required env STRAWBERRY_AGENT_API_KEY');
  }
  return {
    baseUrl: normalizeBaseUrl(env.STRAWBERRY_AGENT_BASE_URL?.trim() || `http://${bindHost}:${port}`),
    apiKey
  };
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`agent transport returned invalid json: status=${response.status}`);
  }
}

class RemoteAgentTransport implements AgentTransport {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    baseUrl: string,
    apiKey: string,
    timeoutMs: number,
    fetchFn: typeof fetch = fetch
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${this.apiKey}`);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      const data = await readJsonOrThrow(response);
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'error' in data
          ? String((data as Record<string, unknown>).error)
          : `agent transport error: status=${response.status}`;
        throw new Error(message);
      }
      return data as T;
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error(`agent transport timeout after ${this.timeoutMs}ms: ${path}`);
      }
      throw error;
    }
  }

  health(): Promise<AgentHealthResponse> {
    return this.call<AgentHealthResponse>('/api/health');
  }

  upload(input: AgentUploadRequest): Promise<AgentUploadResponse> {
    return this.call<AgentUploadResponse>('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
  }

  readUpload(input: AgentReadUploadRequest): Promise<AgentReadUploadResponse> {
    const uploadId = encodeURIComponent(input.uploadId);
    const chatId = encodeURIComponent(String(input.chatId));
    const telegramUserId = encodeURIComponent(String(input.telegramUserId));
    return this.call<AgentReadUploadResponse>(`/api/uploads/${uploadId}?chatId=${chatId}&telegramUserId=${telegramUserId}`);
  }

  async prompt(input: AgentPromptRequest, options: AgentPromptOptions = {}): Promise<AgentPromptResponse> {
    if (options.onProgress) {
      return this.promptWithProgress(input, options);
    }
    return this.call<AgentPromptResponse>(`/api/sessions/${input.kind}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.sessionId,
        prompt: input.prompt,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        telegramUsername: input.telegramUsername,
        uploadId: input.uploadId
      })
    });
  }

  private promptBody(input: AgentPromptRequest): string {
    return JSON.stringify({
      sessionId: input.sessionId,
      prompt: input.prompt,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      telegramUsername: input.telegramUsername,
      uploadId: input.uploadId
    });
  }

  private async promptWithProgress(input: AgentPromptRequest, options: AgentPromptOptions): Promise<AgentPromptResponse> {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.set('authorization', `Bearer ${this.apiKey}`);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/sessions/${input.kind}/prompt-events`, {
        method: 'POST',
        headers,
        body: this.promptBody(input),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error(`agent transport timeout after ${this.timeoutMs}ms: /api/sessions/${input.kind}/prompt-events`);
      }
      throw error;
    }

    if (!response.ok) {
      const data = await readJsonOrThrow(response);
      const message = typeof data === 'object' && data !== null && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `agent transport error: status=${response.status}`;
      throw new Error(message);
    }
    if (!response.body) throw new Error('agent transport returned empty progress stream');

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';
    let result: AgentPromptResponse | undefined;
    let streamError: string | undefined;

    const handleLine = async (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as AgentPromptStreamEvent;
      if (event.type === 'progress') await options.onProgress?.(event.event);
      if (event.type === 'result') result = event.response;
      if (event.type === 'error') streamError = event.error;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        await handleLine(line);
      }
    }
    buffer += decoder.decode();
    await handleLine(buffer);

    if (streamError) throw new Error(streamError);
    if (!result) throw new Error('agent transport progress stream ended without a result');
    return result;
  }

  resetSession(input: AgentResetSessionRequest): Promise<AgentResetSessionResponse> {
    return this.call<AgentResetSessionResponse>(`/api/sessions/${input.kind}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.sessionId,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId
      })
    });
  }
}

export async function createAgentTransport(
  env: NodeJS.ProcessEnv = process.env,
  _cwd: string = process.cwd(),
  fetchFn: typeof fetch = fetch
): Promise<AgentTransport> {
  const config = readAgentTransportConfig(env);
  const timeoutMs = parsePositiveInt(
    env.STRAWBERRY_AGENT_HTTP_TIMEOUT_MS,
    DEFAULT_AGENT_HTTP_TIMEOUT_MS,
    'STRAWBERRY_AGENT_HTTP_TIMEOUT_MS'
  );
  return new RemoteAgentTransport(config.baseUrl, config.apiKey, timeoutMs, fetchFn);
}
