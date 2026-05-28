export type AgentSessionKind = 'group' | 'dm' | 'admin';

export function canonicalSessionId(input: {
  kind: AgentSessionKind;
  chatId: number;
  telegramUserId: number;
}): string {
  if (input.kind === 'admin') return `admin-user-${input.telegramUserId}`;
  if (input.kind === 'dm') return `dm-user-${input.telegramUserId}`;
  return `group-chat-${input.chatId}`;
}

export type AgentUploadRequest = {
  chatId: number;
  telegramUserId: number;
  telegramMessageId: number;
  sourceFileId: string;
  sourceUniqueId?: string;
  originalFileName?: string;
  mimeType?: string;
  caption?: string;
  bytesBase64: string;
};

export type AgentUploadResponse = {
  uploadId: string;
};

export type AgentReadUploadRequest = {
  uploadId: string;
  chatId: number;
  telegramUserId: number;
};

export type AgentReadUploadResponse = AgentUploadResponse & {
  chatId: number;
  telegramUserId: number;
  telegramMessageId: number;
  sourceFileId: string;
  sourceUniqueId?: string;
  originalFileName: string;
  mimeType: string;
  caption?: string;
  bytesBase64: string;
};

export type AgentPromptRequest = {
  kind: AgentSessionKind;
  sessionId: string;
  prompt: string;
  chatId: number;
  telegramUserId: number;
  telegramUsername?: string;
  uploadId?: string;
};

export type AgentPromptResponse = {
  reply: string;
  latencyMs: number;
};

export type AgentProgressStatus = 'started' | 'completed' | 'failed';

export type AgentProgressEvent = {
  status: AgentProgressStatus;
  label: string;
  toolName?: string;
};

export type AgentPromptStreamEvent =
  | { type: 'progress'; event: AgentProgressEvent }
  | { type: 'result'; response: AgentPromptResponse }
  | { type: 'error'; error: string };

export type AgentPromptProgressCallback = (event: AgentProgressEvent) => void | Promise<void>;

export type AgentPromptOptions = {
  onProgress?: AgentPromptProgressCallback;
};

export type AgentResetSessionRequest = {
  kind: AgentSessionKind;
  sessionId: string;
  chatId: number;
  telegramUserId: number;
};

export type AgentResetSessionResponse = {
  reset: true;
  sessionId: string;
};

export type AgentHealthResponse = {
  ready: boolean;
  error?: string;
  agentId: string;
  startedAt: string;
  uptimeMs: number;
  queueDepth: number;
  rssBytes: number;
  lastPromptAt?: string;
  lastPromptLatencyMs?: number;
};
