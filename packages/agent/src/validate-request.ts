import { assertSafeUploadId } from './upload-store.ts';

type HttpError = Error & { statusCode?: number };

function invalid(key: string, message = `Missing or invalid field ${key}`): HttpError {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function parseRequiredInt(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalid(key);
  return value;
}

export function parseRequiredString(value: unknown, key: string, maxLength?: number): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(key);
  const trimmed = value.trim();
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw Object.assign(new Error(`Field ${key} is too long`), { statusCode: 400 });
  }
  return trimmed;
}

export function parseOptionalString(value: unknown, key: string, maxLength?: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return parseRequiredString(value, key, maxLength);
}

export function parseOptionalUploadId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const uploadId = parseRequiredString(value, 'uploadId', 128);
  assertSafeUploadId(uploadId);
  return uploadId;
}
