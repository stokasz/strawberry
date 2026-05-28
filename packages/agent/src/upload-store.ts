import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';

export type StoredUpload = {
  uploadId: string;
  chatId: number;
  telegramUserId: number;
  telegramMessageId: number;
  sourceFileId: string;
  sourceUniqueId?: string;
  originalFileName: string;
  mimeType: string;
  caption?: string;
  sizeBytes: number;
  sha256: string;
  storedAt: string;
  absolutePath: string;
};

type StoreUploadInput = {
  runtimeRoot: string;
  chatId: number;
  telegramUserId: number;
  telegramMessageId: number;
  sourceFileId: string;
  sourceUniqueId?: string;
  originalFileName?: string;
  mimeType?: string;
  caption?: string;
  bytes: Buffer;
};

type RequireUploadInput = {
  uploadId: string;
  chatId: number;
  telegramUserId: number;
};

function fail(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function uploadRoot(runtimeRoot: string): string {
  return resolve(runtimeRoot, 'uploads');
}

function safeFileName(value: string | undefined, fallback: string): string {
  const base = basename(value || fallback).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || fallback;
}

const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertSafeUploadId(uploadId: string): void {
  if (!UPLOAD_ID_PATTERN.test(uploadId.trim())) {
    throw fail(400, 'Invalid upload id.');
  }
}

function uploadDir(runtimeRoot: string, uploadId: string): string {
  assertSafeUploadId(uploadId);
  const dir = join(uploadRoot(runtimeRoot), uploadId);
  if (resolve(dir) === resolve(uploadRoot(runtimeRoot)) || !resolve(dir).startsWith(`${resolve(uploadRoot(runtimeRoot))}${sep}`)) {
    throw fail(400, 'Invalid upload id.');
  }
  return dir;
}

function resolveStoredBytesPath(dir: string, originalFileName: string): string {
  const path = join(dir, safeFileName(originalFileName, 'upload.bin'));
  const resolved = resolve(path);
  if (!resolved.startsWith(`${resolve(dir)}${sep}`)) {
    throw fail(400, 'Invalid upload path.');
  }
  return resolved;
}

export async function storeUpload(input: StoreUploadInput): Promise<StoredUpload> {
  const uploadId = randomUUID();
  const dir = uploadDir(input.runtimeRoot, uploadId);
  await mkdir(dir, { recursive: true });

  const originalFileName = safeFileName(input.originalFileName, `${uploadId}.bin`);
  const absolutePath = resolveStoredBytesPath(dir, originalFileName);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const stored: StoredUpload = {
    uploadId,
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    telegramMessageId: input.telegramMessageId,
    sourceFileId: input.sourceFileId,
    sourceUniqueId: input.sourceUniqueId,
    originalFileName,
    mimeType: input.mimeType || 'application/octet-stream',
    caption: input.caption,
    sizeBytes: input.bytes.byteLength,
    sha256,
    storedAt: new Date().toISOString(),
    absolutePath
  };

  await writeFile(absolutePath, input.bytes, { mode: 0o600 });
  await writeFile(join(dir, 'metadata.json'), `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  return stored;
}

export async function readUpload(runtimeRoot: string, uploadId: string): Promise<StoredUpload> {
  const dir = uploadDir(runtimeRoot, uploadId);
  const raw = await readFile(join(dir, 'metadata.json'), 'utf8');
  const upload = JSON.parse(raw) as StoredUpload;
  const absolutePath = resolveStoredBytesPath(dir, upload.originalFileName);
  if (upload.uploadId !== uploadId) {
    throw fail(400, 'Upload metadata does not match requested id.');
  }
  return { ...upload, absolutePath };
}

export async function requireOwnedUpload(runtimeRoot: string, input: RequireUploadInput): Promise<StoredUpload> {
  const upload = await readUpload(runtimeRoot, input.uploadId);
  if (upload.chatId !== input.chatId || upload.telegramUserId !== input.telegramUserId) {
    throw fail(403, 'Upload does not belong to this Telegram user.');
  }
  return upload;
}

export async function listRecentUploadsForUser(
  runtimeRoot: string,
  input: { chatId: number; telegramUserId: number; limit?: number }
): Promise<StoredUpload[]> {
  let entries: string[];
  try {
    entries = await readdir(uploadRoot(runtimeRoot));
  } catch {
    return [];
  }

  const uploads = await Promise.all(entries.map(async (entry) => {
    try {
      return await readUpload(runtimeRoot, entry);
    } catch {
      return undefined;
    }
  }));

  return uploads
    .filter((upload): upload is StoredUpload => Boolean(upload))
    .filter((upload) => upload.chatId === input.chatId && upload.telegramUserId === input.telegramUserId)
    .sort((left, right) => Date.parse(right.storedAt) - Date.parse(left.storedAt))
    .slice(0, input.limit ?? 10);
}
