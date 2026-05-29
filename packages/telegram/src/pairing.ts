import { messageText } from './text.ts';
import type { TelegramMessage } from './types.ts';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pairCommandCode(message: TelegramMessage, botUsername?: string): string | undefined {
  const text = messageText(message, 128);
  if (!text) return undefined;
  const bot = botUsername?.replace(/^@/, '');
  const command = bot
    ? new RegExp(`^/pair(?:@${escapeRegExp(bot)})?\\s+(\\S+)`, 'i')
    : /^\/pair(?:@\w+)?\s+(\S+)/i;
  return text.match(command)?.[1];
}
