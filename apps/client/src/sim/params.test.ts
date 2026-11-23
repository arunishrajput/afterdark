import { describe, expect, it } from 'vitest';

import { parseSimParams } from './params';

describe('parseSimParams', () => {
  it('is off without ?sim=1', () => {
    expect(parseSimParams('')).toEqual({ enabled: false });
    expect(parseSimParams('?lat=1&lng=2')).toEqual({ enabled: false, start: { lat: 1, lng: 2 } });
  });

  it('reads the start position', () => {
    expect(parseSimParams('?sim=1&lat=28.6&lng=77.2')).toEqual({
      enabled: true,
      start: { lat: 28.6, lng: 77.2 },
    });
  });

  it('ignores a half-given or invalid position', () => {
    expect(parseSimParams('?sim=1&lat=28.6')).toEqual({ enabled: true });
    expect(parseSimParams('?sim=1&lat=abc&lng=1')).toEqual({ enabled: true });
    expect(parseSimParams('?sim=1&lat=95&lng=1')).toEqual({ enabled: true });
  });
});
