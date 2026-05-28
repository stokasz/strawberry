import { existsSync, readFileSync } from 'node:fs';

import { redactSensitiveText } from '@strawberry/shared/env';

export function tailLines(text: string, lines: number): string {
  return text.trim().split('\n').slice(-lines).join('\n');
}

export function redactedTailLines(text: string, lines: number): string {
  return redactSensitiveText(tailLines(text, lines));
}

export function readLogTail(logPath: string, lines = 12): string {
  if (!existsSync(logPath)) {
    return '';
  }
  return redactedTailLines(readFileSync(logPath, 'utf8'), lines);
}
