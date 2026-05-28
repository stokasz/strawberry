export type BotProfile = {
  id: number;
  username?: string;
  firstName?: string;
};

export async function fetchBotProfile(
  botToken: string,
  timeoutMs = 15_000,
  fetchFn: typeof fetch = fetch
): Promise<BotProfile> {
  const response = await fetchFn(`https://api.telegram.org/bot${botToken}/getMe`, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json() as {
    ok: boolean;
    result?: { id: number; username?: string; first_name?: string };
    description?: string;
  };
  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description || `Telegram getMe failed: ${response.status}`);
  }
  return {
    id: payload.result.id,
    username: payload.result.username,
    firstName: payload.result.first_name
  };
}
