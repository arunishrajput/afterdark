/**
 * Lobby creation limits (ADR-107): at most `perIpPerMin` new lobbies per client
 * address in any rolling minute, and at most `maxLobbies` lobbies on the server.
 * Joining is never limited. Addresses live only in this map, for at most a
 * minute, and are never logged (Invariant 8, PRD §8).
 */
import type { IncomingHttpHeaders } from 'node:http';

import { DEFAULT_CONFIG } from '@afterdark/shared';

const WINDOW_MS = 60_000;
const IPV4_MAPPED_PREFIX = '::ffff:';

export interface LobbyLimits {
  perIpPerMin: number;
  maxLobbies: number;
  /** Local dev, the e2e suite and local load tests create many lobbies from one machine. */
  exemptLoopback: boolean;
}

export const DEFAULT_LOBBY_LIMITS: LobbyLimits = {
  perIpPerMin: DEFAULT_CONFIG.lobbyCreatePerIpPerMin,
  maxLobbies: DEFAULT_CONFIG.maxLobbies,
  exemptLoopback: true,
};

export type CreateVerdict = 'ok' | 'rate' | 'full';

const unwrap = (ip: string) =>
  ip.startsWith(IPV4_MAPPED_PREFIX) ? ip.slice(IPV4_MAPPED_PREFIX.length) : ip;

export function isLoopback(ip: string): boolean {
  const bare = unwrap(ip);
  return bare === '::1' || bare.startsWith('127.');
}

const octets = (ip: string) => ip.split('.').map(Number);

/** Loopback, RFC 1918, carrier-grade NAT, and IPv6 unique-local or link-local: where a proxy of ours would sit. */
export function isPrivatePeer(ip: string): boolean {
  const bare = unwrap(ip).toLowerCase();
  if (isLoopback(bare)) return true;
  if (bare.includes(':')) return /^f[cd]/.test(bare) || bare.startsWith('fe80:');
  const [a = -1, b = -1] = octets(bare);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * The client's address. Behind Render's proxy the socket peer is the proxy (on a
 * private network), which appends the address it saw to `X-Forwarded-For`, so the
 * last entry is the one a client cannot forge (the hop Express trusts with
 * `trust proxy 1`). A public peer is the client itself: its header is ignored.
 */
export function clientAddress(handshake: {
  address: string;
  headers: IncomingHttpHeaders;
}): string {
  const peer = unwrap(handshake.address);
  if (!isPrivatePeer(peer)) return peer;
  const header = handshake.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .at(-1);
  return forwarded === undefined ? peer : unwrap(forwarded);
}

export class LobbyCreateGuard {
  /** Address → times of its creates in the last minute (oldest first). */
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly limits: LobbyLimits,
    private readonly now: () => number,
  ) {}

  get trackedAddresses(): number {
    return this.recent.size;
  }

  /** Decides a create from `ip` while the server holds `lobbies`; an allowed create is counted. */
  admit(ip: string, lobbies: number): CreateVerdict {
    if (lobbies >= this.limits.maxLobbies) return 'full';
    if (this.limits.exemptLoopback && isLoopback(ip)) return 'ok';
    const t = this.now();
    this.forgetBefore(t - WINDOW_MS);
    const stamps = this.recent.get(ip) ?? [];
    if (stamps.length >= this.limits.perIpPerMin) return 'rate';
    stamps.push(t);
    this.recent.set(ip, stamps);
    return 'ok';
  }

  private forgetBefore(cutoff: number): void {
    for (const [ip, stamps] of this.recent) {
      while (stamps.length > 0 && (stamps[0] ?? 0) <= cutoff) stamps.shift();
      if (stamps.length === 0) this.recent.delete(ip);
    }
  }
}
