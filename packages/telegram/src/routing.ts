import { canonicalSessionId } from '@strawberry/shared/api';
import { isBotCommand } from './commands.ts';
import { entityText, isConfiguredBot, isGroupMessage, mentionsBotUsername, messageText, normalizeUsername } from './text.ts';
import type { GatewayConfig, IncomingRoute, RouteDecision, RouteScope, SenderRole, SessionKind, TelegramMessage } from './types.ts';

function isReplyToBot(message: TelegramMessage, botUsername?: string): boolean {
  return isConfiguredBot(message.reply_to_message?.from, botUsername);
}

function isAddressedToBot(message: TelegramMessage, botUsername?: string): boolean {
  const bot = normalizeUsername(botUsername);
  const text = message.text ?? message.caption ?? '';
  const entities = message.entities ?? message.caption_entities ?? [];

  for (const entity of entities) {
    if (entity.type === 'text_mention' && isConfiguredBot(entity.user, botUsername)) return true;
    const raw = entityText(text, entity);
    if (entity.type === 'mention' && (!bot || normalizeUsername(raw) === bot)) return true;
  }
  if (isBotCommand(message, botUsername)) return true;
  return mentionsBotUsername(text, botUsername);
}

function groupScope(chatId: number, config: GatewayConfig): RouteScope | undefined {
  if (config.groupChatId !== undefined && chatId === config.groupChatId) return 'core_group';
  return config.allowPublicGroups ? 'public_group' : undefined;
}

function route(input: Omit<IncomingRoute, 'sessionId'>): IncomingRoute {
  return {
    ...input,
    sessionId: canonicalSessionId({
      kind: input.kind,
      chatId: input.chatId,
      telegramUserId: input.sender.id
    })
  };
}

export function routeIncomingMessageDecision(message: TelegramMessage, config: GatewayConfig): RouteDecision {
  const sender = message.from;
  if (!sender || sender.is_bot) return { dropReason: 'no_sender' };

  const body = messageText(message, config.maxInputChars);
  if (!body) return { dropReason: 'empty_body' };

  if (isGroupMessage(message)) {
    if (!isReplyToBot(message, config.botUsername) && !isAddressedToBot(message, config.botUsername)) {
      return { dropReason: 'unaddressed_group' };
    }
    const scope = groupScope(message.chat.id, config);
    if (!scope) return { dropReason: config.groupChatId === undefined ? 'group_disabled' : 'unrelated_group' };
    return {
      route: route({
        kind: 'group',
        scope,
        replyChatId: message.chat.id,
        replyToMessageId: message.message_id,
        sender,
        senderRole: 'user',
        chatId: message.chat.id,
        body
      })
    };
  }

  if (message.chat.type !== 'private') return { dropReason: 'unsupported_chat_type' };

  const isAdmin = config.adminUserId !== undefined && sender.id === config.adminUserId;
  if (!isAdmin && !config.allowPublicDms) return { dropReason: 'dm_disabled' };

  const kind: SessionKind = isAdmin ? 'admin' : 'dm';
  const scope: RouteScope = isAdmin ? 'admin_dm' : 'public_dm';
  const senderRole: SenderRole = isAdmin ? 'admin' : 'user';
  return {
    route: route({
      kind,
      scope,
      replyChatId: message.chat.id,
      replyToMessageId: message.message_id,
      sender,
      senderRole,
      chatId: message.chat.id,
      body
    })
  };
}

export function routeIncomingMessage(message: TelegramMessage, config: GatewayConfig): IncomingRoute | undefined {
  return routeIncomingMessageDecision(message, config).route;
}
