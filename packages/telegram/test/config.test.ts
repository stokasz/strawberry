import { describe, expect, it } from 'vitest';

import { readGatewayConfig } from '../src/config.ts';

describe('readGatewayConfig', () => {
  it('parses defaults, public flags, and pairing code', () => {
    const config = readGatewayConfig({
      STRAWBERRY_TELEGRAM_BOT_TOKEN: 'token',
      STRAWBERRY_TELEGRAM_PAIRING_CODE: 'abcd1234',
      STRAWBERRY_TELEGRAM_ALLOW_PUBLIC_GROUPS: 'yes',
      STRAWBERRY_TELEGRAM_ALLOW_PUBLIC_DMS: 'on'
    });

    expect(config.pairingCode).toBe('abcd1234');
    expect(config.allowPublicGroups).toBe(true);
    expect(config.allowPublicDms).toBe(true);
    expect(config.pollTimeoutSeconds).toBe(30);
  });

  it('rejects username-looking admin ids', () => {
    expect(() => readGatewayConfig({
      STRAWBERRY_TELEGRAM_BOT_TOKEN: 'token',
      STRAWBERRY_TELEGRAM_ADMIN_USER_ID: '@alice'
    })).toThrow('must be a numeric Telegram user ID');
  });
});
