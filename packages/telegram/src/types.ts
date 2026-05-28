export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
};

export type TelegramMessageEntity = {
  type: 'mention' | 'text_mention' | 'bot_command' | string;
  offset: number;
  length: number;
  user?: TelegramUser;
};

export type TelegramChat = {
  id: number;
  type: TelegramChatType;
  title?: string;
  username?: string;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  reply_to_message?: { from?: TelegramUser };
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdate;
};

export type TelegramSentMessage = {
  messageId: number;
};

export type TelegramChatMember = {
  user: TelegramUser;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked' | string;
};

export type TelegramChatMemberUpdate = {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
};

export type BotProfile = {
  id: number;
  username?: string;
  firstName?: string;
};

export type TelegramClient = {
  getUpdates: (input: { offset?: number; timeoutSeconds: number }) => Promise<TelegramUpdate[]>;
  getMe: () => Promise<BotProfile>;
  sendMessage: (input: {
    chatId: number;
    text: string;
    replyToMessageId?: number;
    disableNotification?: boolean;
  }) => Promise<TelegramSentMessage | void>;
  editMessageText?: (input: { chatId: number; messageId: number; text: string }) => Promise<void>;
  downloadFile: (input: { fileId: string }) => Promise<{ bytes: Uint8Array; filePath: string; contentType?: string }>;
  sendChatAction?: (input: { chatId: number; action: 'typing' }) => Promise<void>;
};

export type SessionKind = 'group' | 'dm' | 'admin';
export type RouteScope = 'core_group' | 'public_group' | 'public_dm' | 'admin_dm';
export type SenderRole = 'admin' | 'user';

export type GatewayConfig = {
  botToken: string;
  botId?: number;
  botUsername?: string;
  groupChatId?: number;
  pairingCode?: string;
  allowPublicGroups: boolean;
  allowPublicDms: boolean;
  adminUserId?: number;
  pollTimeoutSeconds: number;
  maxInFlightUpdates: number;
  maxInputChars: number;
  stateRoot: string;
  groupContextMaxMessages: number;
  groupContextMaxChars: number;
};

export type IncomingRoute = {
  kind: SessionKind;
  scope: RouteScope;
  sessionId: string;
  replyChatId: number;
  replyToMessageId: number;
  sender: TelegramUser;
  senderRole: SenderRole;
  chatId: number;
  body: string;
};

export type RouteDropReason =
  | 'no_sender'
  | 'empty_body'
  | 'unaddressed_group'
  | 'unrelated_group'
  | 'group_disabled'
  | 'dm_disabled'
  | 'unsupported_chat_type';

export type RouteDecision = { route: IncomingRoute; dropReason?: undefined } | { route?: undefined; dropReason: RouteDropReason };

export type LoggerLike = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};
