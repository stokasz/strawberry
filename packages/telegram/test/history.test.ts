import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileChatHistory } from '../src/history.ts';

describe('FileChatHistory', () => {
  it('returns bounded context since the last agent turn', async () => {
    const root = mkdtempSync(join(tmpdir(), 'strawberry-history-'));
    const history = new FileChatHistory(root);
    try {
      await history.appendMessage({ chatId: -1, message: { messageId: 1, author: '@alice', telegramUserId: 1, text: 'old' } });
      await history.markAgentTurn({ chatId: -1, messageId: 2 });
      await history.appendMessage({ chatId: -1, message: { messageId: 3, author: '@bob', telegramUserId: 2, text: 'bridge to Base' } });
      await history.appendMessage({ chatId: -1, message: { messageId: 4, author: '@alice', telegramUserId: 1, text: 'use 0.05 ETH' } });

      const context = await history.readContext({ chatId: -1, beforeMessageId: 5, maxMessages: 1, maxChars: 100 });
      expect(context.map((message) => message.text)).toEqual(['use 0.05 ETH']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
