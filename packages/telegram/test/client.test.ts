import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTelegramClient, longPollTimeoutMs } from '../src/client.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('longPollTimeoutMs', () => {
  it('keeps a generous buffer above Telegram long-poll timeout', () => {
    expect(longPollTimeoutMs(30)).toBe(45_000);
    expect(longPollTimeoutMs(1)).toBe(30_000);
  });

  it('supports silent sends and editing progress messages', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const method = String(url).split('/').pop() || '';
      calls.push({
        method,
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      });
      return new Response(JSON.stringify({
        ok: true,
        result: method === 'sendMessage' ? { message_id: 42 } : true
      }), { status: 200 });
    });

    const client = createTelegramClient({ botToken: 'token' });

    await expect(client.sendMessage({
      chatId: 123,
      text: 'Looking through recent chat...',
      replyToMessageId: 10,
      disableNotification: true
    })).resolves.toEqual({ messageId: 42 });
    await client.editMessageText?.({ chatId: 123, messageId: 42, text: 'Asking the agent...' });

    expect(calls).toEqual([
      {
        method: 'sendMessage',
        body: {
          chat_id: 123,
          text: 'Looking through recent chat...',
          reply_to_message_id: 10,
          disable_web_page_preview: true,
          disable_notification: true
        }
      },
      {
        method: 'editMessageText',
        body: {
          chat_id: 123,
          message_id: 42,
          text: 'Asking the agent...',
          disable_web_page_preview: true
        }
      }
    ]);
  });
});
