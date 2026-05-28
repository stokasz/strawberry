import { describe, expect, it } from 'vitest';

import { assertBearerAuth } from '../src/http-auth.ts';

describe('assertBearerAuth', () => {
  it('rejects empty bearer tokens', () => {
    expect(() => assertBearerAuth(
      { headers: { authorization: 'Bearer    ' } } as never,
      'secret-token'
    )).toThrow('Invalid bearer token');
  });
});
