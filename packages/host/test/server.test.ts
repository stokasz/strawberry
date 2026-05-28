import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseSignerCommand, startHostServer } from '../src/server.ts';

function freePort(): number {
  return 20_000 + Math.floor(Math.random() * 20_000);
}

describe('host server', () => {
  it('parses signer commands with arguments', () => {
    expect(parseSignerCommand("node 'apps/sign and send.js' --flag")).toEqual({
      file: 'node',
      args: ['apps/sign and send.js', '--flag']
    });
  });

  it('prepares transaction digests without signer access', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/transactions/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chatId: -100,
          telegramUserId: 501,
          chain: 'base',
          app: 'dex',
          action: 'swap',
          payload: { amount: '0.01' }
        })
      });
      const body = await response.json() as { digest: string; requiresSigner: boolean };
      expect(response.status).toBe(200);
      expect(body.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(body.requiresSigner).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('reports rpc status on health', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await response.json() as { ready: boolean; rpcConfigured: boolean };
      expect(response.status).toBe(200);
      expect(body.ready).toBe(true);
      expect(body.rpcConfigured).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('refuses chain reads without rpc url', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chain/block`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block: 'latest' })
      });
      const body = await response.json() as { error: string };
      expect(response.status).toBe(503);
      expect(body.error).toContain('STRAWBERRY_RPC_URL');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('requires Telegram context for chain reads when RPC is configured', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`,
      STRAWBERRY_RPC_URL: 'http://127.0.0.1:1'
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chain/block`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block: 'latest' })
      });
      const body = await response.json() as { error: string };
      expect(response.status).toBe(400);
      expect(body.error).toContain('chatId');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('rejects unauthenticated requests when host api key is required', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '0.0.0.0',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_API_KEY: 'sandbox-key',
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/transactions/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chatId: -100,
          telegramUserId: 501,
          chain: 'base',
          app: 'dex',
          action: 'swap',
          payload: { amount: '0.01' }
        })
      });
      const body = await response.json() as { error: string };
      expect(response.status).toBe(401);
      expect(body.error).toBe('Missing bearer token');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('allows authenticated sandbox requests on a published host bind', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '0.0.0.0',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_API_KEY: 'sandbox-key',
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/transactions/prepare`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer sandbox-key'
        },
        body: JSON.stringify({
          chatId: -100,
          telegramUserId: 501,
          chain: 'base',
          app: 'dex',
          action: 'swap',
          payload: { amount: '0.01' }
        })
      });
      expect(response.status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('refuses execution when no explicit signer is configured', async () => {
    const port = freePort();
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/transactions/execute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer sandbox-key'
        },
        body: JSON.stringify({
          chatId: -100,
          telegramUserId: 501,
          chain: 'base',
          app: 'dex',
          action: 'swap',
          payload: { amount: '0.01' }
        })
      });
      const body = await response.json() as { error: string };
      expect(response.status).toBe(503);
      expect(body.error).toContain('STRAWBERRY_SIGNER_COMMAND');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('runs signer with a minimal env and exposes only public signer result fields', async () => {
    const port = freePort();
    const dir = mkdtempSync(join(tmpdir(), 'strawberry-signer-'));
    const signer = join(dir, 'signer.js');
    writeFileSync(signer, `
if (process.env.STRAWBERRY_HOST_API_KEY) {
  console.error('host api key leaked');
  process.exit(2);
}
process.stdout.write(JSON.stringify({
  txHash: '0xabc',
  status: 'submitted',
  privateKey: 'should-not-leak'
}));
`);
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_API_KEY: 'sandbox-key',
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`,
      STRAWBERRY_SIGNER_COMMAND: `${process.execPath} ${signer}`
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/transactions/execute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer sandbox-key'
        },
        body: JSON.stringify({
          chatId: -100,
          telegramUserId: 501,
          chain: 'base',
          app: 'dex',
          action: 'swap',
          payload: { amount: '0.01' },
          idempotencyKey: 'abc'
        })
      });
      const body = await response.json() as { signerResult: Record<string, unknown> };
      expect(response.status).toBe(200);
      expect(body.signerResult).toEqual({ txHash: '0xabc', status: 'submitted' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deduplicates repeated transaction executes by digest', async () => {
    const port = freePort();
    const dir = mkdtempSync(join(tmpdir(), 'strawberry-signer-'));
    const signer = join(dir, 'signer.js');
    const counter = join(dir, 'count');
    writeFileSync(signer, `
const fs = require('node:fs');
const countPath = process.argv[2];
const count = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
fs.writeFileSync(countPath, String(count + 1));
process.stdout.write(JSON.stringify({ txHash: '0xabc', status: 'submitted' }));
`);
    const server = await startHostServer({
      STRAWBERRY_HOST_BIND_HOST: '127.0.0.1',
      STRAWBERRY_HOST_PORT: String(port),
      STRAWBERRY_HOST_STATE_ROOT: `/tmp/strawberry-host-${port}`,
      STRAWBERRY_SIGNER_COMMAND: `${process.execPath} ${signer} ${counter}`
    });
    const payload = {
      chatId: -100,
      telegramUserId: 501,
      chain: 'base',
      app: 'dex',
      action: 'swap',
      payload: { amount: '0.01' },
      idempotencyKey: 'same'
    };
    try {
      const [first, second] = await Promise.all([1, 2].map(() => fetch(`http://127.0.0.1:${port}/api/transactions/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })));
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await first.json()).toEqual(await second.json());
      expect(readFileSync(counter, 'utf8')).toBe('1');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
