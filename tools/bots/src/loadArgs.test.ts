import { describe, expect, it } from 'vitest';

import { parseLoadArgs } from './loadArgs';

describe('parseLoadArgs', () => {
  it('has the Phase 14 defaults: 20 lobbies of 8 against a local server', () => {
    expect(parseLoadArgs([])).toEqual({
      url: 'http://localhost:3000',
      lobbies: 20,
      players: 8,
      durationS: 180,
      speed: 4,
      serverLog: undefined,
      serverPid: undefined,
    });
  });

  it('reads every option, with or without a leading --', () => {
    const args = [
      '--',
      '--lobbies',
      '3',
      '--players',
      '6',
      '--duration',
      '60',
      '--url',
      'https://example.test',
      '--speed',
      '2',
      '--server-log',
      'server.log',
      '--server-pid',
      '4321',
    ];
    expect(parseLoadArgs(args)).toEqual({
      url: 'https://example.test',
      lobbies: 3,
      players: 6,
      durationS: 60,
      speed: 2,
      serverLog: 'server.log',
      serverPid: 4321,
    });
  });

  it.each([
    [['--lobbies', '0'], /lobbies/],
    [['--lobbies', '51'], /lobbies/],
    [['--players', '3'], /players/],
    [['--players', '13'], /players/],
    [['--duration', '5'], /duration/],
    [['--speed', '9'], /speed/],
    [['--server-pid', 'x'], /server-pid/],
  ])('refuses %j', (argv, message) => {
    expect(() => parseLoadArgs(argv)).toThrow(message);
  });
});
