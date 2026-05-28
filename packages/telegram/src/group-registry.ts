import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type RegisteredGroup = {
  chatId: number;
  title?: string;
  registeredAt: string;
};

export function registeredGroupPath(stateRoot: string): string {
  return join(stateRoot, 'registered-group.json');
}

export async function readRegisteredGroup(stateRoot: string): Promise<RegisteredGroup | undefined> {
  try {
    const raw = await readFile(registeredGroupPath(stateRoot), 'utf8');
    const parsed = JSON.parse(raw) as RegisteredGroup;
    if (!Number.isSafeInteger(parsed.chatId)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeRegisteredGroup(stateRoot: string, group: RegisteredGroup): Promise<void> {
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await writeFile(registeredGroupPath(stateRoot), `${JSON.stringify(group, null, 2)}\n`, { mode: 0o600 });
}
