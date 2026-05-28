import { readEnvValue } from '@strawberry/shared/env';
import { parseOptionalInt, parseOptionalTelegramUserId, parsePositiveInt } from '@strawberry/shared/args';
import type { GatewayConfig } from './types.ts';

export { parseOptionalTelegramUserId };

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function truthy(value: string | undefined): boolean {
  return TRUTHY_VALUES.has((value || '').trim().toLowerCase());
}

export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const botToken = readEnvValue(env, 'STRAWBERRY_TELEGRAM_BOT_TOKEN');
  if (!botToken) throw new Error('Missing required env STRAWBERRY_TELEGRAM_BOT_TOKEN');

  return {
    botToken,
    botUsername: env.STRAWBERRY_TELEGRAM_BOT_USERNAME?.trim() || undefined,
    groupChatId: parseOptionalInt(env.STRAWBERRY_TELEGRAM_GROUP_CHAT_ID, 'STRAWBERRY_TELEGRAM_GROUP_CHAT_ID'),
    pairingCode: env.STRAWBERRY_TELEGRAM_PAIRING_CODE?.trim() || undefined,
    allowPublicGroups: truthy(env.STRAWBERRY_TELEGRAM_ALLOW_PUBLIC_GROUPS),
    allowPublicDms: truthy(env.STRAWBERRY_TELEGRAM_ALLOW_PUBLIC_DMS),
    adminUserId: parseOptionalTelegramUserId(env.STRAWBERRY_TELEGRAM_ADMIN_USER_ID, 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID'),
    pollTimeoutSeconds: parsePositiveInt(env.STRAWBERRY_TELEGRAM_POLL_TIMEOUT_SECONDS, 30, 'STRAWBERRY_TELEGRAM_POLL_TIMEOUT_SECONDS'),
    maxInFlightUpdates: parsePositiveInt(env.STRAWBERRY_TELEGRAM_MAX_IN_FLIGHT_UPDATES, 4, 'STRAWBERRY_TELEGRAM_MAX_IN_FLIGHT_UPDATES'),
    maxInputChars: parsePositiveInt(env.STRAWBERRY_TELEGRAM_MAX_INPUT_CHARS, 8_000, 'STRAWBERRY_TELEGRAM_MAX_INPUT_CHARS'),
    stateRoot: env.STRAWBERRY_TELEGRAM_STATE_ROOT?.trim() || '.strawberry/state/telegram',
    groupContextMaxMessages: parsePositiveInt(env.STRAWBERRY_TELEGRAM_GROUP_CONTEXT_MAX_MESSAGES, 40, 'STRAWBERRY_TELEGRAM_GROUP_CONTEXT_MAX_MESSAGES'),
    groupContextMaxChars: parsePositiveInt(env.STRAWBERRY_TELEGRAM_GROUP_CONTEXT_MAX_CHARS, 6_000, 'STRAWBERRY_TELEGRAM_GROUP_CONTEXT_MAX_CHARS')
  };
}
