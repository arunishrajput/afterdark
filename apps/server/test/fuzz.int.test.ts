/**
 * Phase 14 security pass over real sockets: junk payloads to every client →
 * server event never crash the server, never succeed, never reach a handler's
 * logic as INTERNAL, and never pollute prototypes; every `dev:*` event is
 * refused without test mode.
 */
import type { ClientToServerEvents } from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HOME, openClient, startTestServer, type TestClient, type TestServer } from './helpers';

const SAFE = { acceptedSafety: true } as const;

/** Every client → server event; `satisfies` fails to compile if one is missing or misspelt. */
const EVENTS = {
  'time:ping': true,
  'lobby:create': true,
  'lobby:join': true,
  'session:resume': true,
  'lobby:leave': true,
  'lobby:setReady': true,
  'lobby:updateConfig': true,
  'lobby:kick': true,
  'lobby:setBoundary': true,
  'lobby:regenerateRegions': true,
  'lobby:renameRegion': true,
  'lobby:editTaskPoints': true,
  'lobby:setNoGoZones': true,
  'lobby:setBase': true,
  'lobby:playAgain': true,
  'loc:update': true,
  'game:forceStart': true,
  'game:pause': true,
  'game:resume': true,
  'game:abort': true,
  'task:open': true,
  'task:action': true,
  'task:submit': true,
  'task:cancel': true,
  'task:reroll': true,
  'task:reportUnsafe': true,
  'ability:infect': true,
  'ability:cancelInfect': true,
  'ability:taskStop': true,
  'ability:fakeTask': true,
  'ability:camouflage': true,
  'coop:start': true,
  'coop:join': true,
  'coop:submit': true,
  'coop:cancel': true,
  'meeting:call': true,
  'meeting:skipDiscussion': true,
  'meeting:vote': true,
  'dev:teleport': true,
  'dev:addBots': true,
  'dev:advanceClock': true,
  'dev:autoComplete': true,
  'dev:forceCoop': true,
  'dev:setMinigames': true,
} satisfies Record<keyof ClientToServerEvents, true>;
const EVENT_NAMES = Object.keys(EVENTS) as (keyof ClientToServerEvents)[];
type DevEvent = Extract<keyof ClientToServerEvents, `dev:${string}`>;
const DEV_EVENTS = EVENT_NAMES.filter((e): e is DevEvent => e.startsWith('dev:'));

const deep = (levels: number): unknown => {
  let v: unknown = 0;
  for (let i = 0; i < levels; i++) v = [v];
  return v;
};

/** Nine bodies, under the per-socket limit of 10 events a second. */
const JUNK: unknown[] = [
  undefined,
  null,
  42,
  'junk',
  [],
  JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'),
  { username: 'x'.repeat(5000), code: '<script>', token: '../../etc/passwd', lat: 1e308 },
  { taskId: 'A'.repeat(12), answer: deep(1500), action: deep(1500) },
  deep(3000),
];

/** Allowed outcomes for junk: a rule or validation error, never success and never a crash. */
const EXPECTED = new Set(['INVALID_PAYLOAD', 'NOT_FOUND', 'NOT_ALLOWED']);

type Emitter = {
  emitWithAck(ev: string, p: unknown): Promise<{ ok: boolean; error?: { code: string } }>;
};
const raw = (c: TestClient) => c.socket.timeout(2000) as unknown as Emitter;
/** Emits without an ack callback, as a hostile client may. */
const fire = (c: TestClient, ev: string, p: unknown) =>
  (c.socket as unknown as { emit(ev: string, p: unknown): void }).emit(ev, p);
const polluted = () => (Object.prototype as Record<string, unknown>).polluted;

describe('fuzzing every event with junk', () => {
  let ts: TestServer;
  const clients: TestClient[] = [];
  beforeEach(async () => {
    ts = await startTestServer();
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await ts.close();
  });

  it(`${EVENT_NAMES.length} events × ${JUNK.length} bodies: no success, no INTERNAL, no crash`, async () => {
    const seen = new Map<string, number>();
    await Promise.all(
      EVENT_NAMES.map(async (event) => {
        const c = await openClient(ts.url); // a socket per event keeps each under the rate limit
        clients.push(c);
        for (const body of JUNK) {
          if (event === 'loc:update') {
            fire(c, event, body); // no ack: extra or invalid fixes are dropped
            continue;
          }
          const res = await raw(c).emitWithAck(event, body);
          const code = res.ok ? 'OK' : (res.error?.code ?? '?');
          seen.set(code, (seen.get(code) ?? 0) + 1);
          if (!EXPECTED.has(code)) throw new Error(`${event} answered ${code}`);
        }
        // A missing ack callback must not crash the handler either.
        fire(c, event, null);
      }),
    );
    expect(seen.get('OK')).toBeUndefined();
    expect(seen.get('INTERNAL')).toBeUndefined();
    expect(polluted()).toBeUndefined();
    // The server is still up and nothing was created by junk.
    const probe = await openClient(ts.url);
    clients.push(probe);
    expect((await probe.call('time:ping', { clientTs: 1 })).ok).toBe(true);
    expect(ts.server.rooms.size).toBe(0);
  });

  it('junk from the host and guests inside a lobby changes nothing', async () => {
    const players = await Promise.all([0, 1, 2, 3].map(() => openClient(ts.url)));
    clients.push(...players);
    const [host] = players as [TestClient];
    const { code } = await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    for (const [i, guest] of players.slice(1).entries()) {
      await guest.ok('lobby:join', { code, username: `Guest ${i}`, ...SAFE });
    }
    // The room tick refreshes `regionCounts` by itself; everything else must stay as it was.
    const snapshot = () => {
      const { regionCounts: _, ...rest } = ts.server.rooms.get(code)?.state ?? {};
      return JSON.stringify(rest);
    };
    const before = snapshot();
    const lobbyEvents = EVENT_NAMES.filter((e) => e !== 'loc:update' && e !== 'lobby:leave');
    // Bound sockets reach the handlers' binding and rule checks. Each player takes a share
    // of the events and pauses after every 9 calls to stay under the rate limit.
    await Promise.all(
      players.map(async (c, p) => {
        let calls = 0;
        for (const event of lobbyEvents.filter((_, i) => i % players.length === p)) {
          for (const body of [null, JUNK[5], JUNK[6]]) {
            if (++calls % 9 === 0) await new Promise((r) => setTimeout(r, 1050));
            const res = await raw(c).emitWithAck(event, body);
            expect(res.ok, `${event} accepted junk`).toBe(false);
            expect(res.error?.code, event).not.toBe('INTERNAL');
          }
        }
      }),
    );
    expect(snapshot()).toBe(before);
    expect(polluted()).toBeUndefined();
  }, 20_000);
});

describe('dev:* events need test mode', () => {
  const valid: Record<DevEvent, unknown> = {
    'dev:teleport': HOME,
    'dev:addBots': { count: 1 },
    'dev:advanceClock': { seconds: 10 },
    'dev:autoComplete': { taskId: 'A'.repeat(12) },
    'dev:forceCoop': { ownerId: 'A'.repeat(16), partnerId: 'B'.repeat(16) },
    'dev:setMinigames': { types: ['wires'] },
  };
  let ts: TestServer | undefined;
  const clients: TestClient[] = [];
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await ts?.close();
  });

  it('lists every dev event', () => {
    expect(Object.keys(valid).sort()).toEqual([...DEV_EVENTS].sort());
  });

  for (const allowTestMode of [true, false]) {
    it(`with ALLOW_TEST_MODE ${String(allowTestMode)} and test mode off, the host gets NOT_ALLOWED for each`, async () => {
      ts = await startTestServer({ allowTestMode });
      const host = await openClient(ts.url);
      clients.push(host);
      await host.ok('lobby:create', { username: 'Ann', ...SAFE });
      for (const event of DEV_EVENTS) {
        const res = await raw(host).emitWithAck(event, valid[event]);
        expect(res.ok, event).toBe(false);
        expect(res.error?.code, event).toBe('NOT_ALLOWED');
      }
      expect(ts.server.rooms.get(host.view?.lobby.code ?? '')?.state.players).toHaveLength(1);
    });
  }
});
