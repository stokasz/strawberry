export function required(value: string | undefined, label: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`Missing required ${label}`);
  return text;
}

export function toInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid integer for ${label}`);
  return parsed;
}

export function parsePositiveInt(value: string | undefined, fallback: number, key: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid positive integer env ${key}`);
  return parsed;
}

export function parseOptionalInt(value: string | undefined, key: string): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid integer env ${key}`);
  return parsed;
}

export function parseOptionalTelegramUserId(value: string | undefined, key: string): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^[a-zA-Z_@]/.test(trimmed)) {
    throw new Error(
      `Invalid ${key}: must be a numeric Telegram user ID, not a username. Message @userinfobot on Telegram to get your ID, or leave it blank.`
    );
  }
  return parseOptionalInt(trimmed, key);
}

export function parseCliPairs(argv: string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (let index = 0; index < argv.length;) {
    const key = argv[index];
    if (key === '--') {
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || value === '--') {
      throw new Error('Args must be provided as --key value pairs');
    }
    pairs.set(key.slice(2), value);
    index += 2;
  }
  return pairs;
}
