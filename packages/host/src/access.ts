import type { IncomingMessage } from 'node:http';

import { assertBearerAuth, isLoopbackHost } from '@strawberry/shared/http-auth';

type HttpError = Error & { statusCode?: number };

function deny(message = 'Forbidden'): HttpError {
  return Object.assign(new Error(message), { statusCode: 403 });
}

export function normalizePeerAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

export function isLoopbackPeer(address: string | undefined): boolean {
  const peer = normalizePeerAddress(address);
  if (!peer) return false;
  return peer === '::1' || peer.startsWith('127.');
}

export function assertHostAccess(
  request: IncomingMessage,
  options: { apiKey?: string; bindHost?: string }
): void {
  if (options.apiKey) {
    assertBearerAuth(request, options.apiKey);
    return;
  }

  const peer = normalizePeerAddress(request.socket.remoteAddress);
  if (isLoopbackPeer(peer) && (!options.bindHost || isLoopbackHost(options.bindHost))) {
    return;
  }

  throw deny();
}
