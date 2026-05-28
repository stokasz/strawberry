import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

type HttpError = Error & {
  statusCode?: number;
};

function createHttpError(statusCode: number, message: string): HttpError {
  return Object.assign(new Error(message), { statusCode });
}

export function assertBearerAuth(request: IncomingMessage, expectedToken: string): void {
  const auth = request.headers.authorization;
  const match = auth?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw createHttpError(401, 'Missing bearer token');

  const actualToken = match[1].trim();
  if (!actualToken) throw createHttpError(401, 'Invalid bearer token');
  const expectedBuffer = Buffer.from(expectedToken, 'utf8');
  const actualBuffer = Buffer.from(actualToken, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw createHttpError(401, 'Invalid bearer token');
  }
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1'
    || normalized.startsWith('127.');
}
