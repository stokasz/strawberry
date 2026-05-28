import { describe, expect, it } from 'vitest';

import { canonicalSessionId } from '../src/api.ts';

describe('canonicalSessionId', () => {
  it('maps telegram scopes to stable session ids', () => {
    expect(canonicalSessionId({ kind: 'group', chatId: -100123, telegramUserId: 501 })).toBe('group-chat--100123');
    expect(canonicalSessionId({ kind: 'dm', chatId: 777, telegramUserId: 777 })).toBe('dm-user-777');
    expect(canonicalSessionId({ kind: 'admin', chatId: 9001, telegramUserId: 9001 })).toBe('admin-user-9001');
  });
});
