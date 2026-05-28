import { describe, expect, it } from 'vitest';

import { assertHostAccess, normalizePeerAddress } from '../src/access.ts';

describe('host access', () => {
  it('allows bearer-authenticated sandbox requests', () => {
    expect(() => assertHostAccess(
      { headers: { authorization: 'Bearer sandbox-key' } } as never,
      { apiKey: 'sandbox-key', bindHost: '0.0.0.0' }
    )).not.toThrow();
  });

  it('rejects missing bearer tokens when an api key is required', () => {
    expect(() => assertHostAccess(
      { headers: {}, socket: { remoteAddress: '192.168.64.2' } } as never,
      { apiKey: 'sandbox-key', bindHost: '0.0.0.0' }
    )).toThrow('Missing bearer token');
  });

  it('allows loopback access in local-only host mode', () => {
    expect(() => assertHostAccess(
      { socket: { remoteAddress: '127.0.0.1' } } as never,
      { bindHost: '127.0.0.1' }
    )).not.toThrow();
  });

  it('rejects remote peers in local-only host mode', () => {
    expect(() => assertHostAccess(
      { socket: { remoteAddress: '192.168.64.2' } } as never,
      { bindHost: '127.0.0.1' }
    )).toThrow('Forbidden');
  });

  it('normalizes ipv4-mapped peer addresses', () => {
    expect(normalizePeerAddress('::ffff:192.168.64.2')).toBe('192.168.64.2');
  });
});
