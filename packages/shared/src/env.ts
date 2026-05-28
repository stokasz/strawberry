import { readFileSync } from 'node:fs';

const SENSITIVE_ENV_KEY_PATTERN = /(API_KEY|TOKEN|PRIVATE_KEY|PASSWORD|SECRET|COOKIE|AUTH|MNEMONIC|SEED)/i;
const SENSITIVE_QUERY_KEYS = new Set(['access_token', 'api-key', 'apikey', 'auth', 'authorization', 'token', 'signature']);

export function readEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const filePath = env[`${key}_FILE`]?.trim();
  if (filePath) {
    const value = readFileSync(filePath, 'utf8').trim();
    return value || undefined;
  }

  const value = env[key]?.trim();
  return value || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectSensitiveEnvValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();

  for (const [key, rawValue] of Object.entries(env)) {
    const value = rawValue?.trim();
    if (!value) continue;

    if (!key.endsWith('_FILE') && SENSITIVE_ENV_KEY_PATTERN.test(key) && value.length >= 4) {
      values.add(value);
    }

    if (!/^https?:\/\//i.test(value)) continue;
    try {
      const url = new URL(value);
      for (const [queryKey, queryValue] of url.searchParams.entries()) {
        if (!queryValue.trim() || queryValue.length < 4) continue;
        if (SENSITIVE_QUERY_KEYS.has(queryKey.toLowerCase()) || SENSITIVE_ENV_KEY_PATTERN.test(queryKey)) {
          values.add(queryValue);
        }
      }
    } catch {
      // Ignore unrelated malformed URL env vars.
    }
  }

  return Array.from(values).sort((left, right) => right.length - left.length);
}

export function redactSensitiveText(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let redacted = text;
  for (const value of collectSensitiveEnvValues(env)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(value), 'g'), '[redacted]');
  }

  return redacted
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, 'Bearer [redacted]')
    .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi, '[redacted]');
}
