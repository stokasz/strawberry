import { readEnvValue } from '@strawberry/shared/env';
import { normalizeBaseUrl } from '@strawberry/shared/host-request-common';

import { asInt, asOptionalText, asText, fail } from './validate.ts';

export type HostGuestConfig = {
  agentBaseUrl: string;
  agentApiKey?: string;
};

export type GuestUploadRecord = {
  uploadId: string;
  chatId: number;
  telegramUserId: number;
  telegramMessageId: number;
  sourceFileId: string;
  sourceUniqueId?: string;
  originalFileName?: string;
  mimeType?: string;
  caption?: string;
  bytesBase64: string;
};

export function readHostGuestConfig(env: NodeJS.ProcessEnv = process.env): HostGuestConfig {
  return {
    agentBaseUrl: normalizeBaseUrl(
      env.STRAWBERRY_AGENT_BASE_URL?.trim() || 'http://127.0.0.1:4501'
    ),
    agentApiKey: readEnvValue(env, 'STRAWBERRY_AGENT_API_KEY')
  };
}

export async function fetchGuestUpload(
  config: HostGuestConfig,
  input: { uploadId: string; chatId: number; telegramUserId: number },
  fetchFn: typeof fetch = fetch
): Promise<GuestUploadRecord> {
  const headers = new Headers();
  if (config.agentApiKey) headers.set('authorization', `Bearer ${config.agentApiKey}`);

  const response = await fetchFn(
    `${config.agentBaseUrl}/api/uploads/${encodeURIComponent(input.uploadId)}?chatId=${input.chatId}&telegramUserId=${input.telegramUserId}`,
    { headers }
  );

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw fail(502, `Guest upload fetch returned invalid JSON: status=${response.status}`);
  }

  if (!response.ok) {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : `Guest upload fetch failed: status=${response.status}`;
    throw fail(response.status >= 500 ? 502 : 400, message);
  }

  return {
    uploadId: asText(payload.uploadId, 'upload.uploadId'),
    chatId: asInt(payload.chatId, 'upload.chatId'),
    telegramUserId: asInt(payload.telegramUserId, 'upload.telegramUserId'),
    telegramMessageId: asInt(payload.telegramMessageId, 'upload.telegramMessageId'),
    sourceFileId: asText(payload.sourceFileId, 'upload.sourceFileId'),
    sourceUniqueId: asOptionalText(payload.sourceUniqueId),
    originalFileName: asOptionalText(payload.originalFileName),
    mimeType: asOptionalText(payload.mimeType),
    caption: asOptionalText(payload.caption),
    bytesBase64: asText(payload.bytesBase64, 'upload.bytesBase64')
  };
}
