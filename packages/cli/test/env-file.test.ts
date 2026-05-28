import { describe, expect, it } from 'vitest';

import { parseEnvFile, removeEnvValue, upsertEnvValue } from '../src/env-file.ts';

describe('parseEnvFile', () => {
  it('parses keys and skips comments', () => {
    expect(parseEnvFile('# comment\nFOO=bar\nBAZ=qux\n')).toEqual({
      FOO: 'bar',
      BAZ: 'qux'
    });
  });

  it('parses shell-quoted values written by the CLI', () => {
    expect(parseEnvFile("SIGNER='node apps/sign-and-send.js'\nNAME='alice'\\''s bot'\n")).toEqual({
      SIGNER: 'node apps/sign-and-send.js',
      NAME: "alice's bot"
    });
  });
});

describe('upsertEnvValue', () => {
  it('replaces an existing key', () => {
    const next = upsertEnvValue('FOO=old\nBAR=1\n', 'FOO', 'new');
    expect(next).toBe('FOO=new\nBAR=1\n');
  });

  it('appends a missing key', () => {
    const next = upsertEnvValue('FOO=1\n', 'BAR', '2');
    expect(next).toBe('FOO=1\n\nBAR=2');
  });

  it('quotes values that bash source would otherwise split or execute', () => {
    const next = upsertEnvValue('', 'SIGNER', "node apps/sign-and-send.js --name 'alice'");
    expect(next).toBe("SIGNER='node apps/sign-and-send.js --name '\\''alice'\\'''");
    expect(parseEnvFile(`${next}\n`).SIGNER).toBe("node apps/sign-and-send.js --name 'alice'");
  });
});

describe('removeEnvValue', () => {
  it('removes an existing key without disturbing others', () => {
    expect(removeEnvValue('FOO=1\nBAR=2\n', 'FOO')).toBe('BAR=2\n');
  });
});
