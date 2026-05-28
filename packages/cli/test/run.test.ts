import { describe, expect, it } from 'vitest';

import { runCommand } from '../src/run.ts';

describe('runCommand', () => {
  it('returns exit 127 when the binary is missing', async () => {
    const result = await runCommand('definitely-not-a-real-binary-xyz', []);
    expect(result.code).toBe(127);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
