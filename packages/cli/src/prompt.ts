import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { paintMuted } from './tui.ts';

export async function askLine(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const suffix = defaultValue ? paintMuted(` [${defaultValue}]`) : '';
    const answer = (await rl.question(`${paintMuted('›')} ${question}${suffix}: `)).trim();
    return answer || defaultValue || '';
  } finally {
    rl.close();
  }
}

export async function askSecret(question: string): Promise<string> {
  return askLine(question);
}

export async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await askLine(`${question} (${hint})`)).toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}
