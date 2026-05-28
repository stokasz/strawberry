export async function isUrlHealthy(url: string, bearer?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (bearer) {
      headers.authorization = `Bearer ${bearer}`;
    }
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(3_000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForUrl(url: string, bearer?: string, attempts = 90): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isUrlHealthy(url, bearer)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`timed out waiting for ${url}`);
}
