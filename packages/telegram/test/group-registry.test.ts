import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRegisteredGroup, writeRegisteredGroup } from '../src/group-registry.ts';

describe('group registry', () => {
  it('persists and reloads the paired group', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'strawberry-group-'));
    try {
      await writeRegisteredGroup(dir, {
        chatId: -100123456,
        title: 'Strawberry HQ',
        registeredAt: '2026-05-27T00:00:00.000Z'
      });
      const raw = await readFile(join(dir, 'registered-group.json'), 'utf8');
      expect(JSON.parse(raw).chatId).toBe(-100123456);
      expect(await readRegisteredGroup(dir)).toMatchObject({
        chatId: -100123456,
        title: 'Strawberry HQ'
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
