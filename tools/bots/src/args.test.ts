import { describe, expect, it } from 'vitest';

import { parseBotArgs } from './args';

describe('parseBotArgs', () => {
  it('needs a code and applies defaults', () => {
    expect(parseBotArgs(['--code', 'abc234'])).toEqual({
      url: 'http://localhost:3000',
      code: 'ABC234',
      count: 7,
      speed: 1,
      seed: 1,
      imposterBehaviour: 'wander',
      meetings: 'off',
    });
    expect(() => parseBotArgs([])).toThrow('--code is required');
  });

  it('accepts the literal -- that pnpm leaves in front of the options', () => {
    expect(parseBotArgs(['--', '--code', 'ABC234', '--count', '3']).count).toBe(3);
  });

  it('validates the count and the speed', () => {
    expect(() => parseBotArgs(['--code', 'A', '--count', '0'])).toThrow('--count');
    expect(() => parseBotArgs(['--code', 'A', '--count', '12'])).toThrow('--count');
    expect(() => parseBotArgs(['--code', 'A', '--speed', '0'])).toThrow('--speed');
    expect(() => parseBotArgs(['--code', 'A', '--speed', '99'])).toThrow('--speed');
  });

  it('takes an imposter behaviour', () => {
    expect(parseBotArgs(['--code', 'A', '--imposter-behaviour', 'chase']).imposterBehaviour).toBe(
      'chase',
    );
    expect(() => parseBotArgs(['--code', 'A', '--imposter-behaviour', 'kill'])).toThrow(
      '--imposter-behaviour',
    );
  });

  it('rejects unknown options', () => {
    expect(() => parseBotArgs(['--code', 'A', '--bogus', '1'])).toThrow();
  });

  it('accepts --meetings random and rejects other values', () => {
    expect(parseBotArgs(['--code', 'A', '--meetings', 'random']).meetings).toBe('random');
    expect(() => parseBotArgs(['--code', 'A', '--meetings', 'always'])).toThrow('--meetings');
  });
});
