import { redactSensitiveText } from '@strawberry/shared/env';
import type { AgentProgressEvent } from '@strawberry/shared/api';
import { createAgentTransport, type AgentTransport } from './agent-transport.ts';
import { isNewSessionCommand } from './commands.ts';
import { createTelegramClient, TelegramApiError } from './client.ts';
import { readGatewayConfig } from './config.ts';
import { readRegisteredGroup, writeRegisteredGroup } from './group-registry.ts';
import { FileChatHistory, type ChatHistory } from './history.ts';
import { readStoredOffset, writeStoredOffset } from './offset-store.ts';
import { pairCommandCode } from './pairing.ts';
import { formatPrompt } from './prompt.ts';
import { routeIncomingMessageDecision } from './routing.ts';
import { isGroupMessage, messageText, senderName } from './text.ts';
import type {
  GatewayConfig,
  IncomingRoute,
  LoggerLike,
  TelegramChat,
  TelegramChatMemberUpdate,
  TelegramMessage,
  TelegramClient
} from './types.ts';

export { fetchBotProfile } from './bot-profile.ts';
export { readRegisteredGroup, registeredGroupPath, writeRegisteredGroup } from './group-registry.ts';

export { createTelegramClient } from './client.ts';
export { readGatewayConfig } from './config.ts';
export { routeIncomingMessage, routeIncomingMessageDecision } from './routing.ts';
export type {
  BotProfile,
  GatewayConfig,
  IncomingRoute,
  LoggerLike,
  RouteDecision,
  RouteDropReason,
  RouteScope,
  SenderRole,
  SessionKind,
  TelegramChat,
  TelegramChatMemberUpdate,
  TelegramClient,
  TelegramDocument,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramPhotoSize,
  TelegramUpdate,
  TelegramUser
} from './types.ts';

const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_TYPING_REFRESH_MS = 4_000;
const TELEGRAM_POLL_WARNING_THROTTLE_MS = 60_000;
const TELEGRAM_POLL_TIMEOUT_WARNING_THRESHOLD = 3;
const BOT_MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);
const BOT_LEFT_STATUSES = new Set(['left', 'kicked']);

export type GatewayDependencies = {
  telegram: TelegramClient;
  agentTransport: AgentTransport;
  logger: LoggerLike;
  sleep: (ms: number) => Promise<void>;
  history?: ChatHistory;
};

type Attachment = {
  fileId: string;
  uniqueId?: string;
  fileName?: string;
  mimeType?: string;
};

type ProgressStatus = {
  chatId: number;
  messageId?: number;
  replyToMessageId: number;
  text: string;
};

type ProgressMood = 'working' | 'done' | 'error';

function isTelegramLongPollTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  return /aborted due to timeout|operation was aborted|timed? out/i.test(error.message);
}

function progressLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function formatProgressStatus(text: string, mood: ProgressMood = 'working'): string {
  const face = mood === 'done' ? '^_^' : mood === 'error' ? 'x_x' : 'o_o';
  return `{\\__/}\n( ${face})\n/ > 🍓 ${text}`;
}

function formatAgentProgressStatus(event: AgentProgressEvent): string {
  const mood: ProgressMood = event.status === 'failed' ? 'error' : 'working';
  const suffix = event.status === 'completed' ? ' done' : event.status === 'failed' ? ' failed' : '';
  return formatProgressStatus(`${progressLabel(event.label)}${suffix}`, mood);
}

export function splitTelegramMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const splitAt = Math.max(remaining.lastIndexOf('\n', limit), remaining.lastIndexOf(' ', limit), limit);
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function selectAttachment(message: TelegramMessage): Attachment | undefined {
  if (message.photo?.length) {
    const selected = [...message.photo].sort((left, right) => (right.file_size ?? 0) - (left.file_size ?? 0))[0];
    return {
      fileId: selected.file_id,
      uniqueId: selected.file_unique_id,
      fileName: `${selected.file_unique_id || selected.file_id}.jpg`,
      mimeType: 'image/jpeg'
    };
  }
  if (!message.document) return undefined;
  return {
    fileId: message.document.file_id,
    uniqueId: message.document.file_unique_id,
    fileName: message.document.file_name,
    mimeType: message.document.mime_type
  };
}

export class StrawberryTelegramGateway {
  private offset: number | undefined;
  private stopped = false;
  private lastPollWarningAt = 0;
  private consecutivePollTimeouts = 0;
  private readonly config: GatewayConfig;
  private readonly deps: GatewayDependencies;
  private readonly history: ChatHistory;
  private routingConfig: GatewayConfig;

  constructor(config: GatewayConfig, deps: GatewayDependencies) {
    this.config = config;
    this.deps = deps;
    this.routingConfig = { ...config };
    this.history = deps.history ?? new FileChatHistory(config.stateRoot);
  }

  stop(): void {
    this.stopped = true;
    this.deps.agentTransport.dispose?.();
  }

  async prepare(): Promise<void> {
    this.offset = await readStoredOffset(this.config.stateRoot);
    const registered = await readRegisteredGroup(this.config.stateRoot);
    if (registered && this.routingConfig.groupChatId === undefined) {
      this.routingConfig = { ...this.routingConfig, groupChatId: registered.chatId };
    }

    if (!this.routingConfig.botUsername || !this.routingConfig.botId) {
      const profile = await this.deps.telegram.getMe();
      this.routingConfig = {
        ...this.routingConfig,
        botUsername: this.routingConfig.botUsername ?? profile.username,
        botId: profile.id
      };
    }

    if (this.routingConfig.groupChatId !== undefined) {
      this.deps.logger.info(`[telegram] core group ${this.routingConfig.groupChatId}`);
    } else {
      this.deps.logger.info('[telegram] add the bot to a Telegram group to pair');
    }
  }

  async run(): Promise<void> {
    await this.prepare();
    this.deps.logger.info('[telegram] gateway started');
    while (!this.stopped) {
      try {
        await this.pollOnce();
      } catch (error) {
        await this.backoffAfterPollError(error);
      }
    }
  }

  async handleMyChatMemberUpdate(update: TelegramChatMemberUpdate): Promise<void> {
    const chat = update.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const botId = this.routingConfig.botId;
    if (!botId || update.new_chat_member.user.id !== botId) return;

    if (BOT_LEFT_STATUSES.has(update.new_chat_member.status)) {
      if (this.routingConfig.groupChatId === chat.id) {
        this.deps.logger.warn(`[telegram] bot removed from paired group ${chat.id}`);
      }
      return;
    }

    if (!BOT_MEMBER_STATUSES.has(update.new_chat_member.status)) return;

    if (
      this.routingConfig.groupChatId !== undefined
      && this.routingConfig.groupChatId !== chat.id
    ) {
      this.deps.logger.warn(
        `[telegram] ignoring group ${chat.id}; already paired with ${this.routingConfig.groupChatId}`
      );
      return;
    }

    if (this.routingConfig.groupChatId === chat.id) return;

    await this.deps.telegram.sendMessage({
      chatId: chat.id,
      text: 'Almost connected. Ask the Strawberry host to pair this group with /pair and the local pairing code.'
    });
  }

  async handleMessage(message: TelegramMessage): Promise<void> {
    await this.recordGroupMessage(message);

    let decision = routeIncomingMessageDecision(message, this.routingConfig);
    if (!decision.route && decision.dropReason === 'group_disabled' && isGroupMessage(message)) {
      if (this.isValidPairCommand(message)) {
        await this.pairGroup(message.chat);
        return;
      }
    }
    if (!decision.route) {
      if (decision.dropReason === 'group_disabled' && isGroupMessage(message)) {
        await this.replyToChat(
          message.chat.id,
          'I am not paired with this group yet. Add me to the group and wait for the Connected message, then @mention me again.',
          message.message_id
        );
      }
      return;
    }
    const route = decision.route;

    if (isNewSessionCommand(message, this.routingConfig.botUsername)) {
      await this.deps.agentTransport.resetSession({
        kind: route.kind,
        sessionId: route.sessionId,
        chatId: route.chatId,
        telegramUserId: route.sender.id
      });
      await this.reply(route, 'Fresh session started.');
      return;
    }

    let typing = true;
    let progress: ProgressStatus | undefined;
    const typingLoop = this.sendTyping(route.replyChatId, () => typing);
    try {
      const attachment = selectAttachment(message);
      progress = await this.updateProgressStatus(
        progress,
        route,
        formatProgressStatus(route.kind === 'group' ? 'looking through recent chat...' : 'preparing your request...')
      );
      const prompt = await this.promptFor(route);
      let uploadId: string | undefined;
      if (attachment) {
        progress = await this.updateProgressStatus(
          progress,
          route,
          formatProgressStatus(`uploading ${progressLabel(attachment.fileName || 'attachment')}...`)
        );
        uploadId = await this.uploadAttachment(message, route, attachment);
      }
      progress = await this.updateProgressStatus(progress, route, formatProgressStatus('asking the agent...'));
      const response = await this.deps.agentTransport.prompt({
        kind: route.kind,
        sessionId: route.sessionId,
        prompt,
        chatId: route.chatId,
        telegramUserId: route.sender.id,
        telegramUsername: route.sender.username,
        uploadId
      }, {
        onProgress: async (event) => {
          progress = await this.updateProgressStatus(progress, route, formatAgentProgressStatus(event));
        }
      });
      progress = await this.updateProgressStatus(progress, route, formatProgressStatus('writing reply...'));
      await this.reply(route, response.reply);
      progress = await this.updateProgressStatus(progress, route, formatProgressStatus('done', 'done'));
      if (route.kind === 'group') {
        await this.history.markAgentTurn({ chatId: route.chatId, messageId: route.replyToMessageId });
      }
    } catch (error) {
      this.deps.logger.error(`[telegram] prompt failed: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`);
      await this.updateProgressStatus(progress, route, formatProgressStatus('agent request failed', 'error'));
      await this.reply(route, 'Agent request failed.');
    } finally {
      typing = false;
      await typingLoop;
    }
  }

  private async pairGroup(chat: TelegramChat): Promise<void> {
    await writeRegisteredGroup(this.config.stateRoot, {
      chatId: chat.id,
      title: chat.title,
      registeredAt: new Date().toISOString()
    });
    this.routingConfig = { ...this.routingConfig, groupChatId: chat.id };

    const mention = this.routingConfig.botUsername
      ? `@${this.routingConfig.botUsername.replace(/^@/, '')}`
      : 'me';
    await this.deps.telegram.sendMessage({
      chatId: chat.id,
      text: `Connected. @mention ${mention} or reply to my messages to talk. Send /new to reset the session.`
    });
    this.deps.logger.info(`[telegram] paired group ${chat.id}${chat.title ? ` (${chat.title})` : ''}`);
  }

  private isValidPairCommand(message: TelegramMessage): boolean {
    const code = pairCommandCode(message, this.routingConfig.botUsername);
    return Boolean(code && this.routingConfig.pairingCode && code === this.routingConfig.pairingCode);
  }

  private async pollOnce(): Promise<void> {
    const updates = await this.deps.telegram.getUpdates({ offset: this.offset, timeoutSeconds: this.config.pollTimeoutSeconds });
    this.consecutivePollTimeouts = 0;
    for (const update of updates) {
      if (update.my_chat_member) {
        await this.handleMyChatMemberUpdate(update.my_chat_member);
      }
      if (update.message) {
        await this.handleMessage(update.message);
      }
      this.offset = update.update_id + 1;
      await writeStoredOffset(this.config.stateRoot, this.offset);
    }
  }

  private async backoffAfterPollError(error: unknown): Promise<void> {
    const retryAfterMs = error instanceof TelegramApiError && error.retryAfterSeconds
      ? error.retryAfterSeconds * 1000
      : 1_000;
    if (isTelegramLongPollTimeout(error)) {
      this.consecutivePollTimeouts += 1;
      const now = Date.now();
      if (
        this.consecutivePollTimeouts >= TELEGRAM_POLL_TIMEOUT_WARNING_THRESHOLD
        && now - this.lastPollWarningAt > TELEGRAM_POLL_WARNING_THROTTLE_MS
      ) {
        this.lastPollWarningAt = now;
        this.deps.logger.warn(
          `[telegram] polling Telegram is timing out repeatedly (${this.consecutivePollTimeouts} consecutive timeouts); retrying quietly`
        );
      }
      await this.deps.sleep(retryAfterMs);
      return;
    }

    this.consecutivePollTimeouts = 0;
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    if (now - this.lastPollWarningAt > TELEGRAM_POLL_WARNING_THROTTLE_MS) {
      this.lastPollWarningAt = now;
      this.deps.logger.warn(`[telegram] polling Telegram returned an error: ${redactSensitiveText(message)}`);
    }
    await this.deps.sleep(retryAfterMs);
  }

  private async recordGroupMessage(message: TelegramMessage): Promise<void> {
    if (!isGroupMessage(message) || !message.from || message.from.is_bot) return;
    const text = messageText(message, this.config.maxInputChars);
    if (!text) return;
    await this.history.appendMessage({
      chatId: message.chat.id,
      message: {
        messageId: message.message_id,
        author: senderName(message.from),
        telegramUserId: message.from.id,
        text
      }
    });
  }

  private async promptFor(route: IncomingRoute): Promise<string> {
    if (route.kind !== 'group') return formatPrompt(route);
    const context = await this.history.readContext({
      chatId: route.chatId,
      beforeMessageId: route.replyToMessageId,
      maxMessages: this.config.groupContextMaxMessages,
      maxChars: this.config.groupContextMaxChars
    });
    return formatPrompt(route, context);
  }

  private async uploadAttachment(message: TelegramMessage, route: IncomingRoute, attachment: Attachment): Promise<string> {
    const downloaded = await this.deps.telegram.downloadFile({ fileId: attachment.fileId });
    return (await this.deps.agentTransport.upload({
      chatId: message.chat.id,
      telegramUserId: route.sender.id,
      telegramMessageId: message.message_id,
      sourceFileId: attachment.fileId,
      sourceUniqueId: attachment.uniqueId,
      originalFileName: attachment.fileName || downloaded.filePath.split('/').pop(),
      mimeType: attachment.mimeType || downloaded.contentType,
      caption: message.caption,
      bytesBase64: Buffer.from(downloaded.bytes).toString('base64')
    })).uploadId;
  }

  private async updateProgressStatus(
    status: ProgressStatus | undefined,
    route: IncomingRoute,
    text: string
  ): Promise<ProgressStatus | undefined> {
    if (status?.text === text) return status;
    try {
      if (status?.messageId && this.deps.telegram.editMessageText) {
        await this.deps.telegram.editMessageText({
          chatId: status.chatId,
          messageId: status.messageId,
          text
        });
        return { ...status, text };
      }
      if (status) return status;

      const sent = await this.deps.telegram.sendMessage({
        chatId: route.replyChatId,
        text,
        replyToMessageId: route.replyToMessageId,
        disableNotification: true
      });
      return {
        chatId: route.replyChatId,
        messageId: sent?.messageId,
        replyToMessageId: route.replyToMessageId,
        text
      };
    } catch (error) {
      this.deps.logger.warn(`[telegram] progress update failed: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`);
      return status;
    }
  }

  private async reply(route: IncomingRoute, text: string): Promise<void> {
    await this.replyToChat(route.replyChatId, text, route.replyToMessageId);
  }

  private async replyToChat(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    for (const chunk of splitTelegramMessage(text)) {
      await this.deps.telegram.sendMessage({
        chatId,
        text: chunk,
        replyToMessageId
      });
    }
  }

  private async sendTyping(chatId: number, isActive: () => boolean): Promise<void> {
    if (!this.deps.telegram.sendChatAction) return;
    while (isActive()) {
      await this.deps.telegram.sendChatAction({ chatId, action: 'typing' }).catch(() => undefined);
      await this.deps.sleep(TELEGRAM_TYPING_REFRESH_MS);
    }
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const config = readGatewayConfig();
  const agentTransport = await createAgentTransport();
  const gateway = new StrawberryTelegramGateway(config, {
    telegram: createTelegramClient(config),
    agentTransport,
    logger: console,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  });
  process.on('SIGINT', () => gateway.stop());
  process.on('SIGTERM', () => gateway.stop());
  await gateway.run();
}
