import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/env';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({})).toEqual({
      PORT: 3000,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      ALLOW_TEST_MODE: true,
    });
  });

  it('test mode is off by default in production but can be enabled', () => {
    expect(parseEnv({ NODE_ENV: 'production' }).ALLOW_TEST_MODE).toBe(false);
    expect(parseEnv({ NODE_ENV: 'production', ALLOW_TEST_MODE: 'true' }).ALLOW_TEST_MODE).toBe(
      true,
    );
  });

  it('coerces PORT and rejects garbage', () => {
    expect(parseEnv({ PORT: '8080' }).PORT).toBe(8080);
    expect(() => parseEnv({ PORT: 'abc' })).toThrow();
    expect(() => parseEnv({ LOG_LEVEL: 'loud' })).toThrow();
  });
});
