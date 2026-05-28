import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IsolatedAgentRuntime, type PiSession } from '../src/runtime.ts';

type AgentMessage = Record<string, unknown>;

function assistant(text: string): AgentMessage {
  return {
    role: 'assistant',
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: 'stop',
    content: [{ type: 'text', text }],
    timestamp: Date.now()
  };
}

class FakeSession implements PiSession {
  messages: AgentMessage[] = [];
  prompts: string[] = [];

  constructor(private readonly responseText: string) {}

  async prompt(text: string): Promise<void> {
    this.prompts.push(text);
    this.messages.push(assistant(this.responseText));
  }

  dispose(): void {}
}

class ConcurrentSensitiveSession implements PiSession {
  messages: AgentMessage[] = [];
  prompts: string[] = [];
  private inFlight = false;

  async prompt(text: string): Promise<void> {
    if (this.inFlight) throw new Error('Agent is already processing.');
    this.inFlight = true;
    this.prompts.push(text);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.messages.push(assistant(`reply-${this.prompts.length}`));
    this.inFlight = false;
  }
}

class EventfulSession implements PiSession {
  messages: AgentMessage[] = [];
  private listeners = new Set<(event: unknown) => void>();

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async prompt(): Promise<void> {
    for (const listener of this.listeners) {
      listener({
        type: 'tool_call',
        toolCallId: 'tool-1',
        toolName: 'read',
        input: { path: 'packages/agent/src/runtime.ts' }
      });
      listener({
        type: 'tool_result',
        toolCallId: 'tool-1',
        toolName: 'read',
        input: { path: 'packages/agent/src/runtime.ts' },
        isError: false
      });
      listener({
        type: 'tool_call',
        toolCallId: 'tool-2',
        toolName: 'bash',
        input: { command: 'pnpm test 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }
      });
    }
    this.messages.push(assistant('done'));
  }
}

function config(stateRoot: string) {
  return {
    agentId: 'strawberry',
    cwd: '/tmp/strawberry',
    agentDir: '/tmp/strawberry/.strawberry',
    stateRoot,
    bindHost: '127.0.0.1',
    port: 4501,
    maxUploadBytes: 1024 * 1024
  };
}

describe('IsolatedAgentRuntime', () => {
  it('keeps separate sessions for group, dm, and admin scopes', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const sessions = new Map<string, FakeSession>();
    const runtime = new IsolatedAgentRuntime(config(stateRoot), {
      createSession: async ({ kind, sessionId }) => {
        const key = `${kind}:${sessionId}`;
        const existing = sessions.get(key);
        if (existing) return existing;
        const created = new FakeSession(`reply-${key}`);
        sessions.set(key, created);
        return created;
      }
    });

    await runtime.init();
    await runtime.prompt({ kind: 'group', sessionId: 'group-chat-1', prompt: 'hello', chatId: 1, telegramUserId: 2 });
    await runtime.prompt({ kind: 'dm', sessionId: 'dm-user-2', prompt: 'hello', chatId: 2, telegramUserId: 2 });
    await runtime.prompt({ kind: 'admin', sessionId: 'admin-user-4', prompt: 'hello', chatId: 4, telegramUserId: 4 });

    expect(sessions.get('group:group-chat-1')?.prompts).toHaveLength(1);
    expect(sessions.get('dm:dm-user-2')?.prompts).toHaveLength(1);
    expect(sessions.get('admin:admin-user-4')?.prompts).toHaveLength(1);

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('rejects prompts with explicit session ids that do not match canonical routing', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const runtime = new IsolatedAgentRuntime(config(stateRoot), {
      createSession: async () => new FakeSession('ok')
    });

    await runtime.init();
    await expect(runtime.prompt({
      kind: 'group',
      sessionId: 'dm-user-20',
      prompt: 'hello',
      chatId: 10,
      telegramUserId: 20
    })).rejects.toThrow('Invalid session id for kind=group. Expected group-chat-10.');

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('appends upload metadata owned by the same telegram user', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const session = new FakeSession('uploaded');
    const runtime = new IsolatedAgentRuntime(config(stateRoot), { createSession: async () => session });

    await runtime.init();
    const upload = await runtime.upload({
      chatId: 10,
      telegramUserId: 20,
      telegramMessageId: 30,
      sourceFileId: 'photo-1',
      originalFileName: 'thing.png',
      mimeType: 'image/png',
      bytesBase64: Buffer.from([1, 2, 3]).toString('base64')
    });
    await runtime.prompt({ kind: 'group', sessionId: 'group-chat-10', prompt: 'inspect', chatId: 10, telegramUserId: 20, uploadId: upload.uploadId });

    expect(session.prompts[0]).toContain('upload_id:');
    expect(session.prompts[0]).toContain(upload.uploadId);
    expect(session.prompts[0]).not.toContain('absolute_path:');
    expect(session.prompts[0]).not.toContain('sha256:');

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('does not implicitly attach the most recent upload without an upload id', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const session = new FakeSession('ok');
    const runtime = new IsolatedAgentRuntime(config(stateRoot), { createSession: async () => session });

    await runtime.init();
    await runtime.upload({
      chatId: 10,
      telegramUserId: 20,
      telegramMessageId: 30,
      sourceFileId: 'photo-1',
      originalFileName: 'thing.png',
      mimeType: 'image/png',
      bytesBase64: Buffer.from([1, 2, 3]).toString('base64')
    });
    await runtime.prompt({ kind: 'group', sessionId: 'group-chat-10', prompt: 'plain prompt', chatId: 10, telegramUserId: 20 });

    expect(session.prompts[0]).toBe('plain prompt');

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('rejects uploads over the configured byte limit with a typed error', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const runtime = new IsolatedAgentRuntime({ ...config(stateRoot), maxUploadBytes: 2 }, { createSession: async () => new FakeSession('ok') });

    await runtime.init();
    await expect(runtime.upload({
      chatId: 10,
      telegramUserId: 20,
      telegramMessageId: 30,
      sourceFileId: 'photo-1',
      bytesBase64: Buffer.from([1, 2, 3]).toString('base64')
    })).rejects.toMatchObject({ statusCode: 413 });

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('serializes prompts per session', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const session = new ConcurrentSensitiveSession();
    const runtime = new IsolatedAgentRuntime(config(stateRoot), { createSession: async () => session });

    await runtime.init();
    const [first, second] = await Promise.all([
      runtime.prompt({ kind: 'group', sessionId: 'group-chat-1', prompt: 'first', chatId: 1, telegramUserId: 2 }),
      runtime.prompt({ kind: 'group', sessionId: 'group-chat-1', prompt: 'second', chatId: 1, telegramUserId: 2 })
    ]);

    expect(first.reply).toBe('reply-1');
    expect(second.reply).toBe('reply-2');
    expect(session.prompts).toHaveLength(2);

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('emits redacted tool progress from Pi session events', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    const runtime = new IsolatedAgentRuntime(config(stateRoot), {
      createSession: async () => new EventfulSession()
    });
    const progress: string[] = [];

    await runtime.init();
    const response = await runtime.prompt({
      kind: 'group',
      sessionId: 'group-chat-1',
      prompt: 'inspect',
      chatId: 1,
      telegramUserId: 2
    }, {
      onProgress: (event) => {
        progress.push(`${event.status}:${event.label}`);
      }
    });

    expect(response.reply).toBe('done');
    expect(progress).toEqual([
      'started:reading packages/agent/src/runtime.ts',
      'completed:reading packages/agent/src/runtime.ts',
      'started:running pnpm test [redacted]'
    ]);

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });

  it('clears a session on reset', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'strawberry-agent-runtime-'));
    let created = 0;
    const runtime = new IsolatedAgentRuntime(config(stateRoot), {
      createSession: async () => {
        created += 1;
        return new FakeSession(`reply-${created}`);
      }
    });

    await runtime.init();
    await runtime.prompt({ kind: 'group', sessionId: 'group-chat-1', prompt: 'hello', chatId: 1, telegramUserId: 2 });
    await runtime.resetSession({ kind: 'group', sessionId: 'group-chat-1', chatId: 1, telegramUserId: 2 });
    const second = await runtime.prompt({ kind: 'group', sessionId: 'group-chat-1', prompt: 'again', chatId: 1, telegramUserId: 2 });

    expect(second.reply).toBe('reply-3');
    expect(created).toBe(3);

    runtime.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  });
});
