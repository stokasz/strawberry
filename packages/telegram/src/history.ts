import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ChatHistoryMessage = {
  messageId: number;
  author: string;
  telegramUserId?: number;
  text: string;
};

type AgentTurn = {
  messageId: number;
};

type ChatHistoryEvent = ({ type: 'message' } & ChatHistoryMessage) | ({ type: 'agent_turn' } & AgentTurn);

export type ChatHistory = {
  appendMessage: (input: { chatId: number; message: ChatHistoryMessage }) => Promise<void>;
  readContext: (input: { chatId: number; beforeMessageId: number; maxMessages: number; maxChars: number }) => Promise<ChatHistoryMessage[]>;
  markAgentTurn: (input: { chatId: number; messageId: number }) => Promise<void>;
};

function chatFile(root: string, chatId: number): string {
  return resolve(root, 'chats', `${String(chatId).replace(/[^0-9-]/g, '_')}.jsonl`);
}

async function readEvents(root: string, chatId: number): Promise<ChatHistoryEvent[]> {
  try {
    const raw = await readFile(chatFile(root, chatId), 'utf8');
    return raw.split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChatHistoryEvent);
  } catch {
    return [];
  }
}

function trimContext(messages: ChatHistoryMessage[], maxMessages: number, maxChars: number): ChatHistoryMessage[] {
  const kept: ChatHistoryMessage[] = [];
  let chars = 0;
  for (const message of messages.slice(-maxMessages).reverse()) {
    const nextChars = chars + message.author.length + message.text.length;
    if (kept.length > 0 && nextChars > maxChars) break;
    kept.push(message);
    chars = nextChars;
  }
  return kept.reverse();
}

export class FileChatHistory implements ChatHistory {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async appendMessage(input: { chatId: number; message: ChatHistoryMessage }): Promise<void> {
    const file = chatFile(this.root, input.chatId);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ type: 'message', ...input.message })}\n`, {
      flag: 'a',
      mode: 0o600
    });
  }

  async readContext(input: { chatId: number; beforeMessageId: number; maxMessages: number; maxChars: number }): Promise<ChatHistoryMessage[]> {
    const events = await readEvents(this.root, input.chatId);
    const lastAgentTurn = events.findLastIndex((event) => event.type === 'agent_turn');
    const messages = events
      .slice(lastAgentTurn + 1)
      .filter((event): event is { type: 'message' } & ChatHistoryMessage => event.type === 'message')
      .filter((event) => event.messageId < input.beforeMessageId);
    return trimContext(messages, input.maxMessages, input.maxChars);
  }

  async markAgentTurn(input: { chatId: number; messageId: number }): Promise<void> {
    const file = chatFile(this.root, input.chatId);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ type: 'agent_turn', messageId: input.messageId })}\n`, {
      flag: 'a',
      mode: 0o600
    });
  }
}
