import { describe, expect, it } from 'vitest';

import { nodeCandidates, nodeWorks, resolveNodeExecutable } from '../src/resolve-node.ts';

describe('resolve-node', () => {
  it('dedupes node candidate paths', () => {
    const candidates = nodeCandidates();
    expect(candidates.length).toBe(new Set(candidates).size);
  });

  it('finds a working node binary', () => {
    expect(nodeWorks(resolveNodeExecutable())).toBe(true);
  });
});
