/** Env keys that must stay on the host and never hold chain or Telegram secrets in the sandbox. */
export const GUEST_STRIPPED_HOST_KEYS = [
  'STRAWBERRY_RPC_URL',
  'STRAWBERRY_SIGNER_COMMAND',
  'STRAWBERRY_TELEGRAM_BOT_TOKEN'
] as const;

export type GuestStrippedHostKey = typeof GUEST_STRIPPED_HOST_KEYS[number];

export function guestHostSecretKeys(env: Record<string, string | undefined>): GuestStrippedHostKey[] {
  return GUEST_STRIPPED_HOST_KEYS.filter((key) => Boolean(env[key]?.trim()));
}

export function assertGuestEnvHasNoHostSecrets(env: Record<string, string | undefined>): void {
  const leaked = guestHostSecretKeys(env);
  if (leaked.length > 0) {
    throw new Error(`agent.env contains host-only secret keys: ${leaked.join(', ')}`);
  }
}

export const HOST_SECRETS_HELP =
  'Host-only secrets live in config/ on macOS. '
  + 'The agent container receives only STRAWBERRY_HOST_API_KEY to call the host API.';
