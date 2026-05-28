import { readEnvValue } from './env.ts';
import { required, toInt } from './args.ts';

export const DEFAULT_HOST_BASE_URL = 'http://192.168.64.1:4510';

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export type HostRequestContext = {
  serverUrl: string;
  apiKey?: string;
  chatId: number;
  telegramUserId: number;
};

export function parseHostRequestContext(
  pairs: Map<string, string>,
  env: NodeJS.ProcessEnv = process.env
): HostRequestContext {
  return {
    serverUrl: normalizeBaseUrl(env.STRAWBERRY_HOST_BASE_URL?.trim() || DEFAULT_HOST_BASE_URL),
    apiKey: readEnvValue(env, 'STRAWBERRY_HOST_API_KEY'),
    chatId: toInt(required(pairs.get('chat-id'), 'arg --chat-id'), '--chat-id'),
    telegramUserId: toInt(required(pairs.get('telegram-user-id'), 'arg --telegram-user-id'), '--telegram-user-id')
  };
}

export async function postHostJson<T extends Record<string, unknown>>(
  context: Pick<HostRequestContext, 'serverUrl' | 'apiKey'>,
  path: string,
  body: Record<string, unknown>,
  label: string,
  fetchFn: typeof fetch = fetch
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (context.apiKey) headers.authorization = `Bearer ${context.apiKey}`;

  const response = await fetchFn(`${context.serverUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error(`${label} returned invalid JSON: status=${response.status}`);
  }

  if (!response.ok) {
    const error = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : `${label} error: status=${response.status}`;
    throw new Error(error);
  }

  return payload as T;
}
