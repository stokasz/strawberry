import type { TelegramMessage, TelegramMessageEntity, TelegramUser } from './types.ts';

export function normalizeUsername(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^@/, '').toLowerCase();
  return normalized || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isConfiguredBot(user: TelegramUser | undefined, botUsername?: string): boolean {
  if (!user?.is_bot) return false;
  const bot = normalizeUsername(botUsername);
  if (!bot) return true;
  return normalizeUsername(user.username) === bot;
}

export function mentionsBotUsername(text: string, botUsername?: string): boolean {
  const bot = normalizeUsername(botUsername);
  if (!bot) return false;
  return new RegExp(`@${escapeRegExp(bot)}(?![a-z0-9_])`, 'i').test(text);
}

export function senderName(sender: TelegramUser): string {
  return sender.username ? `@${sender.username}` : sender.first_name || `id:${sender.id}`;
}

export function messageText(message: TelegramMessage, maxChars: number): string | undefined {
  const text = message.text ?? message.caption;
  const trimmed = text?.replace(/\0/g, '').trim();
  return trimmed ? trimmed.slice(0, maxChars) : undefined;
}

export function isGroupMessage(message: TelegramMessage): boolean {
  return message.chat.type === 'group' || message.chat.type === 'supergroup';
}

export function entityText(text: string, entity: TelegramMessageEntity): string {
  return Array.from(text).slice(entity.offset, entity.offset + entity.length).join('');
}
