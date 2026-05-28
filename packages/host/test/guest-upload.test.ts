import { describe, expect, it } from 'vitest';

import { fetchGuestUpload } from '../src/guest-upload.ts';

describe('fetchGuestUpload', () => {
  it('reads upload bytes from the guest agent', async () => {
    const fetchFn = (async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('/api/uploads/upload-1');
      expect(init?.headers).toBeInstanceOf(Headers);
      return new Response(JSON.stringify({
        uploadId: 'upload-1',
        chatId: 10,
        telegramUserId: 20,
        telegramMessageId: 30,
        sourceFileId: 'file-1',
        bytesBase64: 'YWJj'
      }), { status: 200 });
    }) as typeof fetch;

    const upload = await fetchGuestUpload(
      { agentBaseUrl: 'http://127.0.0.1:4501', agentApiKey: 'token' },
      { uploadId: 'upload-1', chatId: 10, telegramUserId: 20 },
      fetchFn
    );

    expect(upload.bytesBase64).toBe('YWJj');
  });
});
