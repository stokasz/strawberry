import { describe, expect, it } from 'vitest';

import { assertGuestEnvHasNoHostSecrets, GUEST_STRIPPED_HOST_KEYS, guestHostSecretKeys } from '../src/host-secrets.ts';

describe('GUEST_STRIPPED_HOST_KEYS', () => {
  it('lists host-only keys stripped from guest agent.env', () => {
    expect(GUEST_STRIPPED_HOST_KEYS).toContain('STRAWBERRY_RPC_URL');
    expect(GUEST_STRIPPED_HOST_KEYS).toContain('STRAWBERRY_SIGNER_COMMAND');
    expect(GUEST_STRIPPED_HOST_KEYS).toContain('STRAWBERRY_TELEGRAM_BOT_TOKEN');
  });

  it('detects host-only keys in guest agent.env', () => {
    expect(guestHostSecretKeys({
      STRAWBERRY_RPC_URL: 'https://rpc.example',
      STRAWBERRY_HOST_API_KEY: 'allowed-host-bearer',
      STRAWBERRY_AGENT_API_KEY: 'allowed-agent-bearer'
    })).toEqual(['STRAWBERRY_RPC_URL']);
  });

  it('fails closed when agent.env contains host-only secrets', () => {
    expect(() => assertGuestEnvHasNoHostSecrets({
      STRAWBERRY_SIGNER_COMMAND: 'node apps/sign.js'
    })).toThrow('agent.env contains host-only secret keys: STRAWBERRY_SIGNER_COMMAND');
  });
});
