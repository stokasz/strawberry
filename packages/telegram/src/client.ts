import type { GatewayConfig, TelegramClient, TelegramUpdate } from './types.ts';
import { fetchBotProfile } from './bot-profile.ts';

const MAX_TELEGRAM_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_TELEGRAM_HTTP_TIMEOUT_MS = 30_000;

export function longPollTimeoutMs(pollTimeoutSeconds: number, baseTimeoutMs = DEFAULT_TELEGRAM_HTTP_TIMEOUT_MS): number {
  return Math.max(baseTimeoutMs, (pollTimeoutSeconds + 15) * 1000);
}

export class TelegramApiError extends Error {
  readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'TelegramApiError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function callTelegram<T>(botToken: string, method: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json() as { ok: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
  if (!response.ok || !payload.ok) {
    throw new TelegramApiError(payload.description || `Telegram API error: ${response.status}`, payload.parameters?.retry_after);
  }
  return payload.result as T;
}

export function createTelegramClient(config: Pick<GatewayConfig, 'botToken'>, timeoutMs = DEFAULT_TELEGRAM_HTTP_TIMEOUT_MS): TelegramClient {
  return {
    getUpdates: (input) => callTelegram<TelegramUpdate[]>(config.botToken, 'getUpdates', {
      offset: input.offset,
      timeout: input.timeoutSeconds,
      allowed_updates: ['message', 'my_chat_member']
    }, longPollTimeoutMs(input.timeoutSeconds, timeoutMs)),
    getMe: () => fetchBotProfile(config.botToken, timeoutMs),
    sendMessage: async (input) => {
      const message = await callTelegram<TelegramUpdate['message']>(config.botToken, 'sendMessage', {
        chat_id: input.chatId,
        text: input.text,
        reply_to_message_id: input.replyToMessageId,
        disable_web_page_preview: true,
        disable_notification: input.disableNotification
      }, timeoutMs);
      if (!message) return undefined;
      return { messageId: message.message_id };
    },
    editMessageText: async (input) => {
      await callTelegram<unknown>(config.botToken, 'editMessageText', {
        chat_id: input.chatId,
        message_id: input.messageId,
        text: input.text,
        disable_web_page_preview: true
      }, timeoutMs);
    },
    sendChatAction: async (input) => {
      await callTelegram(config.botToken, 'sendChatAction', { chat_id: input.chatId, action: input.action }, timeoutMs);
    },
    downloadFile: async (input) => {
      const file = await callTelegram<{ file_path: string; file_size?: number }>(config.botToken, 'getFile', { file_id: input.fileId }, timeoutMs);
      if (file.file_size && file.file_size > MAX_TELEGRAM_ATTACHMENT_BYTES) throw new Error('Telegram attachment exceeds size limit.');
      const response = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_TELEGRAM_ATTACHMENT_BYTES) throw new Error('Telegram attachment exceeds size limit.');
      return { bytes, filePath: file.file_path, contentType: response.headers.get('content-type') || undefined };
    }
  };
}
