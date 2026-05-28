import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IsolatedAgentRuntime, type PiSession } from '../src/runtime.ts';
import { startAgentServer } from '../src/server.ts';

function freePort(): number {
  return 20_000 + Math.floor(Math.random() * 20_000);
}

class FakeSession implements PiSession {
  messages: unknown[] = [];

  async prompt(): Promise<void> {}

  dispose(): void {}
}

describe('agent server', () => {
  it('requires bearer auth on non-loopback binds', async () => {
    const port = freePort();
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-server-'));
    const { server, close } = await startAgentServer({
      agentApiKey: 'secret-token',
      config: {
        agentId: 'strawberry',
        cwd: '/tmp/strawberry',
        agentDir: '/tmp/strawberry/.strawberry',
        stateRoot,
        bindHost: '0.0.0.0',
        port,
        maxUploadBytes: 1024
      },
      runtime: {
        health: async () => ({
          ready: true,
          agentId: 'strawberry',
          startedAt: new Date().toISOString(),
          uptimeMs: 0,
          queueDepth: 0,
          rssBytes: 0
        }),
        upload: async () => ({ uploadId: '00000000-0000-4000-8000-000000000001' }),
        readUpload: async () => {
          throw new Error('not reached');
        },
        prompt: async () => ({ reply: 'ok', latencyMs: 1 }),
        resetSession: async () => ({ reset: true, sessionId: 'group-chat-1' }),
        dispose: () => {}
      }
    });

    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(denied.status).toBe(401);

      const allowed = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { authorization: 'Bearer secret-token' }
      });
      expect(allowed.status).toBe(200);
    } finally {
      await close();
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects upload reads with traversal ids', async () => {
    const port = freePort();
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-server-'));
    const runtime = new IsolatedAgentRuntime({
      agentId: 'strawberry',
      cwd: '/tmp/strawberry',
      agentDir: '/tmp/strawberry/.strawberry',
      stateRoot,
      bindHost: '127.0.0.1',
      port,
      maxUploadBytes: 1024
    }, {
      createSession: async () => ({
        messages: [],
        async prompt() {},
        dispose() {}
      } satisfies PiSession)
    });
    await runtime.init();
    const { close } = await startAgentServer({
      config: {
        agentId: 'strawberry',
        cwd: '/tmp/strawberry',
        agentDir: '/tmp/strawberry/.strawberry',
        stateRoot,
        bindHost: '127.0.0.1',
        port,
        maxUploadBytes: 1024
      },
      runtime
    });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/uploads/${encodeURIComponent('../../outside')}?chatId=1&telegramUserId=2`);
      const body = await response.json() as { error: string };
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(body.error).toContain('Invalid upload id.');
    } finally {
      await close();
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('returns 403 when reading another Telegram user upload', async () => {
    const port = freePort();
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-server-'));
    const runtime = new IsolatedAgentRuntime({
      agentId: 'strawberry',
      cwd: '/tmp/strawberry',
      agentDir: '/tmp/strawberry/.strawberry',
      stateRoot,
      bindHost: '127.0.0.1',
      port,
      maxUploadBytes: 1024
    }, {
      createSession: async () => new FakeSession()
    });
    await runtime.init();
    const upload = await runtime.upload({
      chatId: 1,
      telegramUserId: 2,
      telegramMessageId: 3,
      sourceFileId: 'file',
      bytesBase64: Buffer.from('hello').toString('base64')
    });
    const { close } = await startAgentServer({
      config: {
        agentId: 'strawberry',
        cwd: '/tmp/strawberry',
        agentDir: '/tmp/strawberry/.strawberry',
        stateRoot,
        bindHost: '127.0.0.1',
        port,
        maxUploadBytes: 1024
      },
      runtime
    });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/uploads/${upload.uploadId}?chatId=1&telegramUserId=999`);
      expect(response.status).toBe(403);
    } finally {
      await close();
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('rejects prompt bodies with non-integer telegram ids', async () => {
    const port = freePort();
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-server-'));
    const { server, close } = await startAgentServer({
      config: {
        agentId: 'strawberry',
        cwd: '/tmp/strawberry',
        agentDir: '/tmp/strawberry/.strawberry',
        stateRoot,
        bindHost: '127.0.0.1',
        port,
        maxUploadBytes: 1024
      },
      runtime: {
        health: async () => ({
          ready: true,
          agentId: 'strawberry',
          startedAt: new Date().toISOString(),
          uptimeMs: 0,
          queueDepth: 0,
          rssBytes: 0
        }),
        upload: async () => ({ uploadId: '00000000-0000-4000-8000-000000000001' }),
        readUpload: async () => {
          throw new Error('not reached');
        },
        prompt: async () => ({ reply: 'ok', latencyMs: 1 }),
        resetSession: async () => ({ reset: true, sessionId: 'group-chat-1' }),
        dispose: () => {}
      }
    });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sessions/group/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'group-chat-1',
          prompt: 'hello',
          chatId: 1,
          telegramUserId: '2'
        })
      });
      const body = await response.json() as { error: string };
      expect(response.status).toBe(400);
      expect(body.error).toContain('telegramUserId');
    } finally {
      await close();
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('streams prompt progress events before the final result', async () => {
    const port = freePort();
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-server-'));
    const { close } = await startAgentServer({
      config: {
        agentId: 'strawberry',
        cwd: '/tmp/strawberry',
        agentDir: '/tmp/strawberry/.strawberry',
        stateRoot,
        bindHost: '127.0.0.1',
        port,
        maxUploadBytes: 1024
      },
      runtime: {
        health: async () => ({
          ready: true,
          agentId: 'strawberry',
          startedAt: new Date().toISOString(),
          uptimeMs: 0,
          queueDepth: 0,
          rssBytes: 0
        }),
        upload: async () => ({ uploadId: '00000000-0000-4000-8000-000000000001' }),
        readUpload: async () => {
          throw new Error('not reached');
        },
        prompt: async (_input, options) => {
          await options?.onProgress?.({ status: 'started', toolName: 'grep', label: 'searching "wallet" in packages' });
          return { reply: 'ok', latencyMs: 5 };
        },
        resetSession: async () => ({ reset: true, sessionId: 'group-chat-1' }),
        dispose: () => {}
      }
    });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sessions/group/prompt-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'group-chat-1',
          prompt: 'hello',
          chatId: 1,
          telegramUserId: 2
        })
      });
      const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
      expect(response.headers.get('content-type')).toContain('application/x-ndjson');
      expect(events).toEqual([
        { type: 'progress', event: { status: 'started', toolName: 'grep', label: 'searching "wallet" in packages' } },
        { type: 'result', response: { reply: 'ok', latencyMs: 5 } }
      ]);
    } finally {
      await close();
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
