import { describe, expect, it } from 'vitest';

import { isNewSessionCommand } from '../src/commands.ts';
import { routeIncomingMessage } from '../src/routing.ts';
import type { GatewayConfig, TelegramMessage } from '../src/types.ts';

function config(): GatewayConfig {
  return {
    botToken: 'token',
    botUsername: 'strawberry',
    groupChatId: -100123,
    allowPublicGroups: false,
    allowPublicDms: false,
    adminUserId: 9001,
    pollTimeoutSeconds: 1,
    maxInFlightUpdates: 4,
    maxInputChars: 80,
    stateRoot: '/tmp/strawberry-telegram-test',
    groupContextMaxMessages: 40,
    groupContextMaxChars: 6_000
  };
}

function commandMessage(text: string, chatType: 'private' | 'supergroup' = 'supergroup'): TelegramMessage {
  return {
    message_id: 11,
    chat: { id: chatType === 'private' ? 9001 : -100123, type: chatType },
    from: { id: 501, username: 'alice', is_bot: false },
    text,
    entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }]
  };
}

describe('commands', () => {
  it('detects /new for this bot', () => {
    expect(isNewSessionCommand(commandMessage('/new@strawberry'), 'strawberry')).toBe(true);
    expect(isNewSessionCommand(commandMessage('/new', 'private'), 'strawberry')).toBe(true);
    expect(isNewSessionCommand(commandMessage('/new'), 'strawberry')).toBe(false);
    expect(isNewSessionCommand(commandMessage('/new@other'), 'strawberry')).toBe(false);
  });

  it('routes /new in a group without an mention', () => {
    const route = routeIncomingMessage(commandMessage('/new@strawberry'), config());
    expect(route?.kind).toBe('group');
    expect(route?.sessionId).toBe('group-chat--100123');
  });
});
