import { describe, expect, it, vi } from 'vitest';

import { formatBootstrapError, BootstrapError } from '../src/bootstrap.ts';
import { center, printRunningPanel, printStrawberryArt, stripAnsi, VISION } from '../src/tui.ts';

describe('bootstrap', () => {
  it('formats bootstrap errors', () => {
    expect(formatBootstrapError(new BootstrapError('missing brew'))).toBe('missing brew');
  });
});

describe('tui', () => {
  it('centers visible text without counting ansi codes', () => {
    const line = center('\x1b[31mhello\x1b[0m', 11);
    expect(stripAnsi(line)).toBe('   hello');
  });

  it('exposes the product vision', () => {
    expect(VISION).toContain('multiplayer AI');
  });

  it('renders the mascot with a strawberry and vision text', () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line) => {
      logs.push(String(line));
    });
    printStrawberryArt({ vision: true });
    const plain = logs.map((line) => stripAnsi(line)).join('\n');
    expect(plain).toContain('{\\__/}');
    expect(plain.match(/{\\__\/}/g)?.length).toBe(6);
    expect(plain).toContain('( o_o)              (o_o )');
    expect(plain).toContain('share?');
    expect(plain).toContain('/ > 🍓  ---->');
    expect(plain).toContain('( ^_^)              (^_^ )');
    expect(plain).toContain('/ > 🍓');
    expect(plain).toContain(VISION);
    vi.restoreAllMocks();
  });

  it('renders a compact Strawberry running panel instead of raw logs', () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line) => {
      logs.push(String(line));
    });
    printRunningPanel(['Talk in Telegram', 'Agent  http://127.0.0.1:4501']);
    const plain = logs.map((line) => stripAnsi(line)).join('\n');
    expect(plain).toContain('Strawberry is running');
    expect(plain).toContain('sharing the fruit in Telegram');
    expect(plain).toContain('logs collapsed here');
    expect(plain).toContain('strawberry logs');
    expect(plain).toContain('share?');
    vi.restoreAllMocks();
  });
});
