import { describe, expect, it } from 'vitest';

import { routeIncomingMessageDecision } from '../src/routing.ts';
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

function groupMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 10,
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 501, username: 'alice', is_bot: false },
    text: 'hello @strawberry',
    ...overrides
  };
}

describe('routing security', () => {
  it('does not treat @strawberry_evil as addressing @strawberry', () => {
    const decision = routeIncomingMessageDecision(groupMessage({
      text: 'ping @strawberry_evil please'
    }), config());
    expect(decision.dropReason).toBe('unaddressed_group');
  });

  it('does not treat replies to other bots as addressed to this bot', () => {
    const decision = routeIncomingMessageDecision(groupMessage({
      text: 'thanks',
      reply_to_message: {
        from: { id: 99, username: 'otherbot', is_bot: true }
      }
    }), config());
    expect(decision.dropReason).toBe('unaddressed_group');
  });

  it('does not treat bare bot commands in groups as addressed to this bot', () => {
    const decision = routeIncomingMessageDecision(groupMessage({
      text: '/new',
      entities: [{ type: 'bot_command', offset: 0, length: 4 }]
    }), config());
    expect(decision.dropReason).toBe('unaddressed_group');
  });

  it('does not treat text mentions of other bots as addressed to this bot', () => {
    const decision = routeIncomingMessageDecision(groupMessage({
      text: 'ask the other bot',
      entities: [{
        type: 'text_mention',
        offset: 0,
        length: 3,
        user: { id: 99, username: 'otherbot', is_bot: true }
      }]
    }), config());
    expect(decision.dropReason).toBe('unaddressed_group');
  });
});
