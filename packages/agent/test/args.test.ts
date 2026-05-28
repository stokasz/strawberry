import { describe, expect, it } from 'vitest';

import { parseCliPairs, parseOptionalTelegramUserId } from '../src/args.ts';

describe('parseOptionalTelegramUserId', () => {
  it('accepts numeric ids', () => {
    expect(parseOptionalTelegramUserId('9001', 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID')).toBe(9001);
  });

  it('rejects usernames with a helpful message', () => {
    expect(() => parseOptionalTelegramUserId('stokarz', 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID')).toThrow(
      /numeric Telegram user ID/
    );
  });
});

describe('parseCliPairs', () => {
  it('parses paired flags', () => {
    const pairs = parseCliPairs(['--chat-id', '1', '--telegram-user-id', '2', '--block', 'latest']);
    expect(pairs.get('chat-id')).toBe('1');
    expect(pairs.get('telegram-user-id')).toBe('2');
    expect(pairs.get('block')).toBe('latest');
  });
});
