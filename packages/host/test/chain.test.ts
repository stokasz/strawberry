import { describe, expect, it } from 'vitest';

import { readBlock } from '../src/chain.ts';

describe('readBlock', () => {
  it('reads a block by number from rpc', async () => {
    const fetchFn = async () => new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        number: '0x10',
        hash: '0xabc',
        parentHash: '0xdef',
        timestamp: '0x5',
        miner: '0xminer',
        gasUsed: '0x1',
        gasLimit: '0x2',
        transactions: [{}, {}]
      }
    }));

    const block = await readBlock('http://rpc.test', '16', fetchFn);
    expect(block.number).toBe('0x10');
    expect(block.hash).toBe('0xabc');
    expect(block.transactionCount).toBe(2);
  });

  it('reads latest blocks', async () => {
    const fetchFn = async () => new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        number: '0x1',
        hash: '0xlatest',
        parentHash: '0x0',
        timestamp: '0x1',
        miner: '0xminer',
        gasUsed: '0x0',
        gasLimit: '0x0',
        transactions: []
      }
    }));

    const block = await readBlock('http://rpc.test', 'latest', fetchFn);
    expect(block.hash).toBe('0xlatest');
  });

  it('rejects oversized block parameters', async () => {
    await expect(readBlock('http://rpc.test', '0x' + 'a'.repeat(200))).rejects.toMatchObject({ statusCode: 400 });
  });
});
