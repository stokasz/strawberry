import { afterEach, describe, expect, it, vi } from 'vitest';

import { telegramGatewayOwnerAction, terminateBackgroundProcess, type TelegramGatewayOwner } from '../src/stack.ts';

describe('stack process cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('terminates the detached process group for managed services', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    terminateBackgroundProcess(123);

    expect(kill).toHaveBeenCalledWith(-123, 'SIGTERM');
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('falls back to the direct pid for adopted services', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === -123) throw Object.assign(new Error('missing process group'), { code: 'ESRCH' });
      return true;
    });

    terminateBackgroundProcess(123);

    expect(kill).toHaveBeenNthCalledWith(1, -123, 'SIGTERM');
    expect(kill).toHaveBeenNthCalledWith(2, 123, 'SIGTERM');
  });
});

describe('telegram gateway singleton', () => {
  const owner: TelegramGatewayOwner = {
    pid: 123,
    installRoot: '/install-a',
    workspaceRoot: '/workspace-a',
    stateRoot: '/workspace-a/state/container',
    startedAt: '2026-05-29T00:00:00.000Z'
  };

  it('reuses a running gateway from the same workspace', () => {
    expect(telegramGatewayOwnerAction(owner, '/workspace-a', true)).toBe('reuse');
  });

  it('replaces a running gateway from a different workspace', () => {
    expect(telegramGatewayOwnerAction(owner, '/workspace-b', true)).toBe('replace');
  });

  it('clears stale gateway owners', () => {
    expect(telegramGatewayOwnerAction(owner, '/workspace-a', false)).toBe('clear');
    expect(telegramGatewayOwnerAction(undefined, '/workspace-a', false)).toBe('clear');
  });
});
