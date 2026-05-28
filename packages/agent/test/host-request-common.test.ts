import { describe, expect, it } from 'vitest';

import { parseHostRequestContext, postHostJson } from '../src/host-request-common.ts';

describe('host request common', () => {
  it('uses the tap host url by default', () => {
    const context = parseHostRequestContext(new Map([
      ['chat-id', '10'],
      ['telegram-user-id', '20']
    ]));
    expect(context.serverUrl).toBe('http://192.168.64.1:4510');
  });

  it('posts json to the host api', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const result = await postHostJson<{ ok: boolean }>(
      { serverUrl: 'http://192.168.64.1:4510' },
      '/api/chain/block',
      { block: 'latest' },
      'Host chain block API',
      fetchFn
    );

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('http://192.168.64.1:4510/api/chain/block');
  });
});
