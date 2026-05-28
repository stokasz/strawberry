import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readStoredOffset, writeStoredOffset } from '../src/offset-store.ts';

describe('offset store', () => {
  it('persists the next Telegram update offset', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'strawberry-offset-'));
    try {
      await writeStoredOffset(stateRoot, 42);
      expect(await readStoredOffset(stateRoot)).toBe(42);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
