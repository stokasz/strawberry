type Json = Record<string, unknown>;
type HttpError = Error & { statusCode?: number };

export const fail = (statusCode: number, message: string): HttpError => Object.assign(new Error(message), { statusCode });

export function asInt(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw fail(400, `Invalid integer field ${key}`);
  return value;
}

export function asText(value: unknown, key: string, maxLength = 256): string {
  if (typeof value !== 'string' || !value.trim()) throw fail(400, `Missing required field ${key}`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw fail(400, `Field ${key} is too long`);
  return trimmed;
}

export function asOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function asJsonObject(value: unknown, key: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw fail(400, `Invalid object field ${key}`);
  return value as Json;
}
