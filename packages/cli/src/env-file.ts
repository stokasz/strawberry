import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return raw;
}

function validateEnvKey(key: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key: ${key}`);
  }
}

function formatEnvValue(value: string): string {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('Env values must be single-line.');
  }
  if (!value) return '';
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    values[trimmed.slice(0, separator)] = parseEnvValue(trimmed.slice(separator + 1));
  }
  return values;
}

export function upsertEnvValue(content: string, key: string, value: string): string {
  validateEnvKey(key);
  const prefix = `${key}=`;
  const formatted = formatEnvValue(value);
  const lines = content.length ? content.split('\n') : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${key}=${formatted}`;
    }
    return line;
  });
  if (!found) {
    if (next.length > 0 && next[next.length - 1] !== '') {
      next.push('');
    }
    next.push(`${key}=${formatted}`);
  }
  return next.join('\n');
}

export function removeEnvValue(content: string, key: string): string {
  validateEnvKey(key);
  const prefix = `${key}=`;
  return (content.length ? content.split('\n') : [])
    .filter((line) => !line.startsWith(prefix))
    .join('\n');
}

export function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

export function upsertEnvFile(path: string, key: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let content = '';
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    // new file
  }
  writeFileSync(path, upsertEnvValue(content, key, value), { mode: 0o600 });
}

export function removeEnvFileKey(path: string, key: string): void {
  let content = '';
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  writeFileSync(path, removeEnvValue(content, key), { mode: 0o600 });
}
