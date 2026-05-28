import { entityText, isGroupMessage, normalizeUsername } from './text.ts';
import type { TelegramMessage } from './types.ts';

function botCommandText(message: TelegramMessage): string | undefined {
  const text = message.text ?? message.caption;
  if (!text) return undefined;
  const entities = message.entities ?? message.caption_entities ?? [];
  for (const entity of entities) {
    if (entity.type === 'bot_command') return entityText(text, entity);
  }
  return undefined;
}

export function isBotCommand(message: TelegramMessage, botUsername?: string): boolean {
  const raw = botCommandText(message);
  if (!raw) return false;
  const at = raw.indexOf('@');
  const bot = normalizeUsername(botUsername);
  if (at === -1) {
    // Bare /command in groups is ambiguous when multiple bots are present.
    return !bot || !isGroupMessage(message);
  }
  return !bot || normalizeUsername(raw.slice(at + 1)) === bot;
}

export function isNewSessionCommand(message: TelegramMessage, botUsername?: string): boolean {
  const raw = botCommandText(message);
  if (!raw) return false;
  const [command, target] = raw.split('@');
  if (command !== '/new') return false;
  const bot = normalizeUsername(botUsername);
  if (bot && isGroupMessage(message)) {
    return Boolean(target) && normalizeUsername(target) === bot;
  }
  return !target || !bot || normalizeUsername(target) === bot;
}
