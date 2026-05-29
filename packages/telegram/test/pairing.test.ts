import { describe, expect, it } from 'vitest';

import { pairCommandCode } from '../src/pairing.ts';

describe('pairCommandCode', () => {
  it('extracts bare and addressed pair codes for this bot when a username is configured', () => {
    expect(pairCommandCode({
      message_id: 1,
      chat: { id: -1, type: 'supergroup' },
      from: { id: 1, is_bot: false },
      text: '/pair abcd'
    }, 'strawberry')).toBe('abcd');

    expect(pairCommandCode({
      message_id: 1,
      chat: { id: -1, type: 'supergroup' },
      from: { id: 1, is_bot: false },
      text: '/pair@strawberry abcd'
    }, 'strawberry')).toBe('abcd');

    expect(pairCommandCode({
      message_id: 1,
      chat: { id: -1, type: 'supergroup' },
      from: { id: 1, is_bot: false },
      text: '/pair@other abcd'
    }, 'strawberry')).toBeUndefined();
  });
});
