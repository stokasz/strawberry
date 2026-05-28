import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function offsetPath(stateRoot: string): string {
  return join(stateRoot, 'offset.json');
}

export async function readStoredOffset(stateRoot: string): Promise<number | undefined> {
  try {
    const raw = await readFile(offsetPath(stateRoot), 'utf8');
    const parsed = JSON.parse(raw) as { offset?: unknown };
    return Number.isSafeInteger(parsed.offset) ? parsed.offset as number : undefined;
  } catch {
    return undefined;
  }
}

export async function writeStoredOffset(stateRoot: string, offset: number): Promise<void> {
  const path = offsetPath(stateRoot);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify({ offset })}\n`, { mode: 0o600 });
}
