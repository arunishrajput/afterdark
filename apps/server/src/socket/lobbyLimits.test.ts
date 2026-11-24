import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import {
  clientAddress,
  DEFAULT_LOBBY_LIMITS,
  isLoopback,
  isPrivatePeer,
  LobbyCreateGuard,
} from './lobbyLimits';

const MINUTE_MS = 60_000;

function guard(limits: Partial<typeof DEFAULT_LOBBY_LIMITS> = {}) {
  const clock = { now: 0 };
  const g = new LobbyCreateGuard({ ...DEFAULT_LOBBY_LIMITS, ...limits }, () => clock.now);
  return { g, clock };
}

describe('LobbyCreateGuard', () => {
  it('uses the CONFIG limits by default and exempts loopback', () => {
    expect(DEFAULT_LOBBY_LIMITS).toEqual({
      perIpPerMin: DEFAULT_CONFIG.lobbyCreatePerIpPerMin,
      maxLobbies: DEFAULT_CONFIG.maxLobbies,
      exemptLoopback: true,
    });
  });

  it(`allows ${DEFAULT_CONFIG.lobbyCreatePerIpPerMin} creates per address per rolling minute`, () => {
    const { g, clock } = guard();
    for (let i = 0; i < DEFAULT_CONFIG.lobbyCreatePerIpPerMin; i++) {
      clock.now += 1000;
      expect(g.admit('203.0.113.7', 0)).toBe('ok');
    }
    expect(g.admit('203.0.113.7', 0)).toBe('rate');
    // Another address is unaffected.
    expect(g.admit('198.51.100.2', 0)).toBe('ok');
    // The first create leaves the window a minute after it happened.
    clock.now = 1000 + MINUTE_MS;
    expect(g.admit('203.0.113.7', 0)).toBe('ok');
    expect(g.admit('203.0.113.7', 0)).toBe('rate');
  });

  it('a refused create does not count against the address', () => {
    const { g, clock } = guard({ perIpPerMin: 1 });
    expect(g.admit('203.0.113.7', 0)).toBe('ok');
    for (let i = 0; i < 10; i++) expect(g.admit('203.0.113.7', 0)).toBe('rate');
    clock.now += MINUTE_MS;
    expect(g.admit('203.0.113.7', 0)).toBe('ok');
  });

  it('refuses everyone once the server holds maxLobbies, loopback included', () => {
    const { g } = guard({ maxLobbies: 3 });
    expect(g.admit('203.0.113.7', 2)).toBe('ok');
    expect(g.admit('203.0.113.7', 3)).toBe('full');
    expect(g.admit('127.0.0.1', 3)).toBe('full');
  });

  it('a full server does not use up the address allowance', () => {
    const { g } = guard({ perIpPerMin: 1, maxLobbies: 1 });
    expect(g.admit('203.0.113.7', 1)).toBe('full');
    expect(g.admit('203.0.113.7', 0)).toBe('ok');
  });

  it('exempts loopback only when asked to', () => {
    const exempt = guard({ perIpPerMin: 1 }).g;
    for (let i = 0; i < 5; i++) expect(exempt.admit('::1', 0)).toBe('ok');
    const strict = guard({ perIpPerMin: 1, exemptLoopback: false }).g;
    expect(strict.admit('::1', 0)).toBe('ok');
    expect(strict.admit('::1', 0)).toBe('rate');
  });

  it('forgets addresses whose creates are over a minute old', () => {
    const { g, clock } = guard();
    for (let i = 0; i < 50; i++) g.admit(`203.0.113.${i}`, 0);
    expect(g.trackedAddresses).toBe(50);
    clock.now += MINUTE_MS;
    g.admit('198.51.100.2', 0);
    expect(g.trackedAddresses).toBe(1);
  });
});

describe('clientAddress', () => {
  it('uses the socket address without a proxy header', () => {
    expect(clientAddress({ address: '203.0.113.7', headers: {} })).toBe('203.0.113.7');
  });

  it('behind a private-network proxy, uses the last X-Forwarded-For entry: the one it added', () => {
    const headers = { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' };
    expect(clientAddress({ address: '10.0.0.1', headers })).toBe('203.0.113.7');
    expect(clientAddress({ address: '::ffff:10.20.30.40', headers })).toBe('203.0.113.7');
    expect(
      clientAddress({ address: '127.0.0.1', headers: { 'x-forwarded-for': ' 1.1.1.1 ,' } }),
    ).toBe('1.1.1.1');
  });

  it('ignores X-Forwarded-For from a public peer: a client cannot pick its own address', () => {
    const headers = { 'x-forwarded-for': '198.51.100.9' };
    expect(clientAddress({ address: '203.0.113.7', headers })).toBe('203.0.113.7');
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(clientAddress({ address: '::ffff:127.0.0.1', headers: {} })).toBe('127.0.0.1');
  });
});

describe('isPrivatePeer', () => {
  it.each([
    ['10.0.0.1', true],
    ['172.16.5.4', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['100.64.0.1', true],
    ['100.128.0.1', false],
    ['127.0.0.1', true],
    ['::1', true],
    ['fd12:3456::1', true],
    ['fe80::1', true],
    ['2001:db8::1', false],
    ['203.0.113.7', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivatePeer(ip)).toBe(expected);
  });
});

describe('isLoopback', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.8.9.10', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    ['10.0.0.1', false],
    ['203.0.113.7', false],
    ['', false],
  ])('%s → %s', (ip, expected) => {
    expect(isLoopback(ip)).toBe(expected);
  });
});
