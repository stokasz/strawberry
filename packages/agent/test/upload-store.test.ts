import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertSafeUploadId, readUpload, requireOwnedUpload, storeUpload } from '../src/upload-store.ts';

describe('upload store', () => {
  it('rejects path traversal upload ids before touching disk', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-upload-store-'));
    try {
      expect(() => assertSafeUploadId('../etc/passwd')).toThrow('Invalid upload id.');
      await expect(requireOwnedUpload(stateRoot, {
        uploadId: '../../outside',
        chatId: 1,
        telegramUserId: 2
      })).rejects.toThrow('Invalid upload id.');
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('keeps uploads scoped to the owning telegram user', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-upload-store-'));
    try {
      const stored = await storeUpload({
        runtimeRoot: stateRoot,
        chatId: 10,
        telegramUserId: 20,
        telegramMessageId: 30,
        sourceFileId: 'photo-1',
        bytes: Buffer.from('hello')
      });

      await expect(requireOwnedUpload(stateRoot, {
        uploadId: stored.uploadId,
        chatId: 10,
        telegramUserId: 999
      })).rejects.toThrow('Upload does not belong to this Telegram user.');

      const loaded = await readUpload(stateRoot, stored.uploadId);
      expect(loaded.uploadId).toBe(stored.uploadId);
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('ignores tampered absolute paths in upload metadata', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-upload-store-'));
    try {
      const stored = await storeUpload({
        runtimeRoot: stateRoot,
        chatId: 10,
        telegramUserId: 20,
        telegramMessageId: 30,
        sourceFileId: 'photo-1',
        bytes: Buffer.from('hello')
      });
      const tampered = {
        ...stored,
        absolutePath: '/etc/passwd'
      };
      await writeFile(join(stateRoot, 'uploads', stored.uploadId, 'metadata.json'), `${JSON.stringify(tampered)}\n`);
      const loaded = await readUpload(stateRoot, stored.uploadId);
      expect(loaded.absolutePath).toContain(join('uploads', stored.uploadId));
      expect(loaded.absolutePath).not.toBe('/etc/passwd');
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
