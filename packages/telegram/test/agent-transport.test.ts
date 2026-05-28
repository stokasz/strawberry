import { describe, expect, it } from 'vitest';

import { createAgentTransport } from '../src/agent-transport.ts';

describe('agent transport', () => {
  it('requires a bearer token for remote agent access', async () => {
    await expect(createAgentTransport({})).rejects.toThrow('STRAWBERRY_AGENT_API_KEY');
  });

  it('uses the progress stream endpoint when progress is requested', async () => {
    const progress: string[] = [];
    const urls: string[] = [];
    const fetchFn = async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response([
      JSON.stringify({ type: 'progress', event: { status: 'started', toolName: 'read', label: 'reading package.json' } }),
      JSON.stringify({ type: 'result', response: { reply: 'ok', latencyMs: 7 } })
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' }
      });
    };
    const transport = await createAgentTransport({
      STRAWBERRY_AGENT_API_KEY: 'secret',
      STRAWBERRY_AGENT_BASE_URL: 'http://agent.local'
    }, process.cwd(), fetchFn as unknown as typeof fetch);

    const response = await transport.prompt({
      kind: 'group',
      sessionId: 'group-chat-1',
      prompt: 'hello',
      chatId: 1,
      telegramUserId: 2
    }, {
      onProgress: (event) => {
        progress.push(event.label);
      }
    });

    expect(response).toEqual({ reply: 'ok', latencyMs: 7 });
    expect(progress).toEqual(['reading package.json']);
    expect(urls[0]).toBe('http://agent.local/api/sessions/group/prompt-events');
  });
});
