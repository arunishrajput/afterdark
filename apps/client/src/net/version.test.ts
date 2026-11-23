import { describe, expect, it } from 'vitest';

import { shortSha } from './version';

describe('shortSha', () => {
  it('shortens a full git SHA to 7 characters', () => {
    expect(shortSha('318a007b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f')).toBe('318a007');
  });

  it('leaves non-SHA values alone', () => {
    expect(shortSha('unknown')).toBe('unknown');
  });
});
