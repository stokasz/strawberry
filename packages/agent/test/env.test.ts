import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readEnvValue, redactSensitiveText } from '../src/env.ts';

describe('readEnvValue', () => {
  it('reads direct values and file-backed values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'strawberry-env-'));
    try {
      const file = join(dir, 'secret');
      writeFileSync(file, 'from-file\n');
      expect(readEnvValue({ TOKEN: ' direct ' }, 'TOKEN')).toBe('direct');
      expect(readEnvValue({ TOKEN_FILE: file }, 'TOKEN')).toBe('from-file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('redactSensitiveText', () => {
  it('redacts env secrets, bearer tokens, telegram tokens, and secret URL query params', () => {
    const text = [
      'token=secret-value',
      'Bearer abcdefghijklmnop',
      '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'https://rpc.example/?api-key=query-secret'
    ].join('\n');

    const redacted = redactSensitiveText(text, {
      STRAWBERRY_RPC_URL: 'https://rpc.example/?api-key=query-secret',
      STRAWBERRY_HOST_API_KEY: 'secret-value'
    });

    expect(redacted).not.toContain('secret-value');
    expect(redacted).not.toContain('abcdefghijklmnop');
    expect(redacted).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(redacted).not.toContain('query-secret');
  });
});
