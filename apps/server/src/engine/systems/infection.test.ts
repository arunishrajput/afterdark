import { DEFAULT_CONFIG, infectionThreshold, type LatLng, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../reduce';
import type { PlayerState, RoomState } from '../state';
import {
  advanceTo,
  advanceWithEffects,
  errCode,
  moveTo,
  newLobby,
  refresh,
  run,
  S,
  toPlaying,
} from '../testkit';
import { tick } from '../tick';
import type { Effect } from '../types';
import { compromisedCount } from './victory';

const CFG = DEFAULT_CONFIG;
const COOLDOWN_MS = CFG.abilityInitialCooldownS * S;
const CHANNEL_MS = CFG.infectionChannelS * S;

const byRole = (s: RoomState, role: 'crew' | 'imposter') =>
  s.players.filter((p) => p.role === role);
const get = (s: RoomState, id: string): PlayerState => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
};
const at = (s: RoomState, id: string): LatLng => {
  const loc = get(s, id).loc;
  if (!loc) throw new Error('no fix');
  return { lat: loc.lat, lng: loc.lng };
};
const near = (s: RoomState, id: string, metres: number): LatLng =>
  offsetByMeters(at(s, id), metres, 0);

/** Step one second at a time with every fix refreshed (so holds and gaps run for real). */
function walk(state: RoomState, from: number, seconds: number): { state: RoomState; now: number } {
  let s = state;
  let t = from;
  for (let i = 0; i < seconds; i++) {
    t += S;
    s = advanceTo(s, t);
  }
  return { state: s, now: t };
}

/** Like `advanceTo`, but the named players send no fix (they go stale after `staleAfterS`). */
function advanceWithout(state: RoomState, now: number, silent: string[]): RoomState {
  let s = state;
  for (const p of state.players) {
    if (p.left || !p.loc || silent.includes(p.id)) continue;
    s = run(
      s,
      {
        type: 'locUpdate',
        playerId: p.id,
        fix: { lat: p.loc.lat, lng: p.loc.lng, accuracy: 5, ts: now },
      },
      now,
    ).state;
  }
  return tick(s, now).state;
}

interface Fixture {
  state: RoomState;
  now: number;
  imp: string;
  victim: string;
}

/** A 6-player game (2 imposters), Infect ready, the first imposter standing `metres` from the first crew member. */
function ready(metres = 3, players = 6): Fixture {
  const start = toPlaying(newLobby({ players }));
  let now = start.now + COOLDOWN_MS;
  let state = advanceTo(start.state, now);
  const imp = byRole(state, 'imposter')[0]?.id ?? '';
  const victim = byRole(state, 'crew')[0]?.id ?? '';
  state = moveTo(state, imp, near(state, victim, metres), now);
  now += S;
  state = advanceTo(state, now);
  return { state, now, imp, victim };
}

const eventsOf = (effects: Effect[], type: string) =>
  effects.filter((e) => e.kind === 'event' && e.event.type === type);

describe('starting a channel (RULES §7.1.1, §7.1.2)', () => {
  it('is on cooldown when play starts and ready after abilityInitialCooldownS', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const imp = byRole(state, 'imposter')[0]?.id ?? '';
    const victim = byRole(state, 'crew')[0]?.id ?? '';
    let s = moveTo(state, imp, near(state, victim, 3), now);
    expect(errCode(reduce(s, { type: 'infectStart', playerId: imp }, now))).toBe('COOLDOWN');
    s = advanceTo(s, now + COOLDOWN_MS);
    expect(errCode(reduce(s, { type: 'infectStart', playerId: imp }, now + COOLDOWN_MS))).toBe(
      'OK',
    );
  });

  it('is for active imposters only, and only while playing', () => {
    const f = ready();
    expect(errCode(reduce(f.state, { type: 'infectStart', playerId: f.victim }, f.now))).toBe(
      'NOT_ALLOWED',
    );
    expect(errCode(reduce(newLobby(), { type: 'infectStart', playerId: 'host' }, 0))).toBe(
      'WRONG_PHASE',
    );
    const left = structuredClone(f.state);
    get(left, f.imp).left = true;
    expect(errCode(reduce(left, { type: 'infectStart', playerId: f.imp }, f.now))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('needs a healthy crew member within infectionRadiusM (8 m): 8 m works, 9 m does not', () => {
    const inside = ready(CFG.infectionRadiusM - 0.5);
    expect(
      errCode(reduce(inside.state, { type: 'infectStart', playerId: inside.imp }, inside.now)),
    ).toBe('OK');
    const outside = ready(CFG.infectionRadiusM + 1);
    expect(
      errCode(reduce(outside.state, { type: 'infectStart', playerId: outside.imp }, outside.now)),
    ).toBe('OUT_OF_RANGE');
  });

  it('picks the nearest eligible target', () => {
    const f = ready(6);
    const crew = byRole(f.state, 'crew');
    const other = crew[1]?.id ?? '';
    // A second crew member closer to the imposter than the first (3 m vs 6 m).
    let s = moveTo(f.state, other, near(f.state, f.imp, 3), f.now);
    s = advanceTo(s, f.now + S);
    const res = run(s, { type: 'infectStart', playerId: f.imp }, f.now + S);
    expect(get(res.state, f.imp).infect?.channel?.targetId).toBe(other);
  });

  it('replies with the channel end time, and nothing goes to the target', () => {
    const f = ready();
    const res = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now);
    const reply = res.effects.find((e) => e.kind === 'reply');
    expect(reply).toMatchObject({
      playerId: f.imp,
      reply: { type: 'infect', ack: { channelEndsAt: f.now + CHANNEL_MS } },
    });
    const toTarget = res.effects.filter(
      (e) => e.kind === 'event' && (e.to === 'all' || e.to.includes(f.victim)),
    );
    expect(toTarget).toEqual([]);
  });

  it('refuses a second channel while one runs', () => {
    const f = ready();
    const s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    expect(errCode(reduce(s, { type: 'infectStart', playerId: f.imp }, f.now))).toBe('NOT_ALLOWED');
  });

  it('refuses other imposters, left players and already-affected crew as targets (E7)', () => {
    const f = ready();
    const ally = byRole(f.state, 'imposter')[1]?.id ?? '';
    let s = moveTo(f.state, f.victim, { lat: 28.6, lng: 77.2 }, f.now);
    s = moveTo(s, ally, near(s, f.imp, 2), f.now);
    s = advanceTo(s, f.now + S);
    expect(errCode(reduce(s, { type: 'infectStart', playerId: f.imp }, f.now + S))).toBe(
      'OUT_OF_RANGE',
    );

    const exposed = structuredClone(f.state);
    get(exposed, f.victim).infection = 'exposed';
    expect(errCode(reduce(exposed, { type: 'infectStart', playerId: f.imp }, f.now))).toBe(
      'OUT_OF_RANGE',
    );
    const infected = structuredClone(f.state);
    get(infected, f.victim).infection = 'infected';
    expect(errCode(reduce(infected, { type: 'infectStart', playerId: f.imp }, f.now))).toBe(
      'OUT_OF_RANGE',
    );
    const gone = structuredClone(f.state);
    get(gone, f.victim).left = true;
    expect(errCode(reduce(gone, { type: 'infectStart', playerId: f.imp }, f.now))).toBe(
      'OUT_OF_RANGE',
    );
  });

  it('needs the imposter inside the boundary and with a good, fresh fix', () => {
    const f = ready();
    const out = moveTo(f.state, f.imp, offsetByMeters(at(f.state, f.imp), 400, 0), f.now);
    const outNow = advanceTo(out, f.now + S);
    expect(errCode(reduce(outNow, { type: 'infectStart', playerId: f.imp }, f.now + S))).toBe(
      'OUT_OF_BOUNDS',
    );

    const weak = structuredClone(f.state);
    const loc = get(weak, f.imp).loc;
    if (loc) loc.accuracy = CFG.maxAccuracyM + 5;
    expect(errCode(reduce(weak, { type: 'infectStart', playerId: f.imp }, f.now))).toBe('WEAK_GPS');

    const stale = f.now + (CFG.staleAfterS + 1) * S;
    expect(errCode(reduce(f.state, { type: 'infectStart', playerId: f.imp }, stale))).toBe('STALE');
  });

  it('cancelling is free: no cooldown', () => {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    s = run(s, { type: 'infectCancel', playerId: f.imp }, f.now + S).state;
    expect(get(s, f.imp).infect?.channel).toBeUndefined();
    expect(errCode(reduce(s, { type: 'infectStart', playerId: f.imp }, f.now + S))).toBe('OK');
  });

  it('is blocked while the host has paused the game', () => {
    const f = ready();
    const s = run(f.state, { type: 'pause', playerId: 'host' }, f.now).state;
    expect(errCode(reduce(s, { type: 'infectStart', playerId: f.imp }, f.now))).toBe('PAUSED');
  });
});

describe('the channel (RULES §7.1.2)', () => {
  it('completes after infectionChannelS and exposes the target; the cooldown starts', () => {
    const f = ready();
    const started = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    const before = walk(started, f.now, CFG.infectionChannelS - 1);
    expect(get(before.state, f.victim).infection).toBeUndefined();
    expect(get(before.state, f.imp).infect?.channel).toBeDefined();

    const t = before.now + S;
    const res = advanceWithEffects(before.state, t);
    expect(get(res.state, f.victim).infection).toBe('exposed');
    expect(get(res.state, f.imp).infect?.channel).toBeUndefined();
    expect(get(res.state, f.imp).infect?.completed).toBe(1);
    expect(errCode(reduce(res.state, { type: 'infectStart', playerId: f.imp }, t))).toBe(
      'COOLDOWN',
    );
    expect(
      errCode(
        reduce(res.state, { type: 'infectStart', playerId: f.imp }, t + CFG.infectionCooldownS * S),
      ),
    ).not.toBe('COOLDOWN');

    // Only the imposter hears about it, and not the target (RULES §7.1.6).
    const done = eventsOf(res.effects, 'infect.completed');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ to: [f.imp] });
    expect(compromisedCount(res.state)).toBe(0); // exposed is not compromised yet
  });

  it('survives a 2 s gap', () => {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    const home = at(s, f.imp);
    let t = f.now + 2 * S;
    s = advanceTo(moveTo(s, f.imp, offsetByMeters(home, 40, 0), f.now + S), f.now + S);
    s = advanceTo(s, t);
    expect(get(s, f.imp).infect?.channel?.inRange).toBe(false);
    s = advanceTo(moveTo(s, f.imp, home, t), (t += S));
    expect(get(s, f.imp).infect?.channel?.inRange).toBe(true);
    s = walk(s, t, CFG.infectionChannelS).state;
    expect(get(s, f.victim).infection).toBe('exposed');
  });

  it('fails on a 4 s gap, with no cooldown, and tells only the imposter', () => {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    const home = at(s, f.imp);
    s = moveTo(s, f.imp, offsetByMeters(home, 40, 0), f.now);
    let t = f.now;
    const all: Effect[] = [];
    for (let i = 0; i < CFG.infectionGapToleranceS + 1; i++) {
      t += S;
      const r = advanceWithEffects(s, t);
      s = r.state;
      all.push(...r.effects);
    }
    expect(get(s, f.imp).infect?.channel).toBeUndefined();
    expect(get(s, f.victim).infection).toBeUndefined();
    expect(
      errCode(reduce(moveTo(s, f.imp, home, t), { type: 'infectStart', playerId: f.imp }, t)),
    ).toBe('OK'); // no cooldown
    const failed = eventsOf(all, 'infect.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ to: [f.imp], event: { reason: 'range' } });
  });

  it('a gap of exactly the tolerance is still tolerated', () => {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    s = moveTo(s, f.imp, offsetByMeters(at(s, f.imp), 40, 0), f.now);
    // The teleport itself is the first evaluation away, so the gap begins at f.now.
    s = advanceTo(s, f.now + CFG.infectionGapToleranceS * S);
    expect(get(s, f.imp).infect?.channel).toBeDefined();
    s = advanceTo(s, f.now + CFG.infectionGapToleranceS * S + 1);
    expect(get(s, f.imp).infect?.channel).toBeUndefined();
  });

  it('a stale fix counts as a gap', () => {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    let t = f.now;
    for (let i = 0; i < CFG.staleAfterS + CFG.infectionGapToleranceS + 2; i++) {
      t += S;
      s = advanceWithout(s, t, [f.imp]);
    }
    expect(get(s, f.imp).infect?.channel).toBeUndefined();
  });

  it('fails when the target stops being eligible (E6: the other imposter finished first)', () => {
    const f = ready();
    const ally = byRole(f.state, 'imposter')[1]?.id ?? '';
    let s = moveTo(f.state, ally, near(f.state, f.victim, 2), f.now);
    s = advanceTo(s, f.now + S);
    const t0 = f.now + S;
    s = run(s, { type: 'infectStart', playerId: f.imp }, t0).state;
    s = run(s, { type: 'infectStart', playerId: ally }, t0 + 2 * S).state; // starts later, nearer or not, finishes later
    expect(get(s, f.imp).infect?.channel?.endsAtGameMs).toBeLessThan(
      get(s, ally).infect?.channel?.endsAtGameMs ?? 0,
    );
    const all: Effect[] = [];
    let t = t0;
    for (let i = 0; i < CFG.infectionChannelS + 3; i++) {
      t += S;
      const r = advanceWithEffects(s, t);
      s = r.state;
      all.push(...r.effects);
    }
    expect(get(s, f.victim).infection).toBe('exposed');
    expect(get(s, f.victim).exposure?.byId).toBe(f.imp); // the first to complete
    expect(get(s, ally).infect?.channel).toBeUndefined();
    expect(get(s, ally).infect?.completed).toBe(0);
    expect(errCode(reduce(s, { type: 'infectStart', playerId: ally }, t))).toBe('OUT_OF_RANGE'); // no cooldown, just no target
    const failed = eventsOf(all, 'infect.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ to: [ally], event: { reason: 'target' } });
  });

  it('is frozen while the host pauses (game time)', () => {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    s = walk(s, f.now, 4).state;
    s = run(s, { type: 'pause', playerId: 'host' }, f.now + 4 * S).state;
    s = refresh(s, f.now + 100 * S);
    s = tick(s, f.now + 100 * S).state;
    s = run(s, { type: 'resume', playerId: 'host' }, f.now + 100 * S).state;
    expect(get(s, f.imp).infect?.channel).toBeDefined(); // the long pause was not a gap or progress
    s = walk(s, f.now + 100 * S, CFG.infectionChannelS - 4).state;
    expect(get(s, f.victim).infection).toBe('exposed');
  });
});

describe('cooldown (RULES §7.1.4, §9.3)', () => {
  it('does not run down while the imposter is out of bounds', () => {
    const start = toPlaying(newLobby({ players: 6 }));
    const imp = byRole(start.state, 'imposter')[0]?.id ?? '';
    let s = moveTo(start.state, imp, offsetByMeters(at(start.state, imp), 400, 0), start.now);
    // 30 s out of bounds, then back inside.
    const back = at(start.state, imp);
    let t = start.now;
    for (let i = 0; i < 30; i++) s = advanceTo(s, (t += S));
    expect(get(s, imp).zone).toBeDefined();
    s = moveTo(s, imp, back, t);
    s = advanceTo(s, t + S);
    const readyAt = get(s, imp).infect?.readyAtGameMs ?? 0;
    expect(readyAt).toBeGreaterThanOrEqual(COOLDOWN_MS + 30 * S);
    expect(readyAt).toBeLessThanOrEqual(COOLDOWN_MS + 32 * S);
  });
});

describe('incubation (RULES §7.1.3)', () => {
  /** An exposed target with the imposter still standing next to them. */
  function exposed() {
    const f = ready();
    let s = run(f.state, { type: 'infectStart', playerId: f.imp }, f.now).state;
    const w = walk(s, f.now, CFG.infectionChannelS);
    s = w.state;
    expect(get(s, f.victim).infection).toBe('exposed');
    return { ...f, state: s, now: w.now };
  }

  it('does not start while the imposter stays near (E8), however long', () => {
    const e = exposed();
    const w = walk(e.state, e.now, 200);
    expect(get(w.state, e.victim).infection).toBe('exposed');
    expect(get(w.state, e.victim).exposure?.incubationEndsAtGameMs).toBeUndefined();
  });

  it('starts once the imposter has been away for 3 s and ends incubationS later', () => {
    const e = exposed();
    const leftAt = e.now;
    let s = moveTo(e.state, e.imp, offsetByMeters(at(e.state, e.imp), 40, 0), leftAt);
    let t = leftAt;
    // First evaluation away: awaySince = leftAt; incubation starts at leftAt + 3 s and ends 60 s after that.
    s = advanceTo(s, (t += S));
    const away = get(s, e.victim).exposure?.awaySince;
    expect(away).toBeDefined();
    s = walk(s, t, CFG.incubationDepartS + 1).state;
    const ends = get(s, e.victim).exposure?.incubationEndsAtGameMs ?? 0;
    expect(ends - (away ?? 0)).toBe((CFG.incubationDepartS + CFG.incubationS) * S);
    expect(ends).toBeGreaterThan(0);
    // Just before the deadline: still exposed. At the deadline: infected.
    const w = walk(
      s,
      t + (CFG.incubationDepartS + 1) * S,
      CFG.incubationS - CFG.incubationDepartS - 2,
    );
    expect(get(w.state, e.victim).infection).toBe('exposed');
    const done = advanceWithEffects(w.state, w.now + 3 * S);
    expect(get(done.state, e.victim).infection).toBe('infected');
    expect(get(done.state, e.victim).exposure).toBeUndefined();
    expect(compromisedCount(done.state)).toBe(1);
  });

  it('a brief step away (under 3 s) does not start it', () => {
    const e = exposed();
    const home = at(e.state, e.imp);
    let s = moveTo(e.state, e.imp, offsetByMeters(home, 40, 0), e.now);
    let t = e.now + S;
    s = advanceTo(s, t);
    s = advanceTo(moveTo(s, e.imp, home, t), (t += S));
    expect(get(s, e.victim).exposure?.awaySince).toBeUndefined();
    s = walk(s, t, 10).state;
    expect(get(s, e.victim).exposure?.incubationEndsAtGameMs).toBeUndefined();
  });

  it('a stale imposter counts as having left', () => {
    const e = exposed();
    let s = e.state;
    let t = e.now;
    for (let i = 0; i < CFG.staleAfterS + CFG.incubationDepartS + 2; i++) {
      t += S;
      s = advanceWithout(s, t, [e.imp]);
    }
    expect(get(s, e.victim).exposure?.incubationEndsAtGameMs).toBeDefined();
  });

  it('is announced to everyone as a count, never as a name; the target is told nothing', () => {
    const e = exposed();
    let s = structuredClone(e.state);
    const v = get(s, e.victim);
    if (v.exposure) v.exposure.incubationEndsAtGameMs = 1;
    const now = e.now + S;
    const res = advanceWithEffects(s, now);
    s = res.state;
    expect(get(s, e.victim).infection).toBe('infected');
    const announced = eventsOf(res.effects, 'game.compromised');
    expect(announced).toEqual([
      { kind: 'event', to: 'all', event: { type: 'game.compromised', count: 1 } },
    ]);
    const privateToVictim = res.effects.filter(
      (x) => x.kind === 'event' && x.to !== 'all' && x.to.includes(e.victim),
    );
    expect(privateToVictim.map((x) => (x.kind === 'event' ? x.event.type : ''))).not.toContain(
      'infect.completed',
    );
  });

  it('does not count if the game ends while incubating (E9)', () => {
    const e = exposed();
    const end = tick(e.state, e.now + CFG.playTimeMin * 60 * S);
    expect(end.state.phase).toBe('ended');
    expect(compromisedCount(end.state)).toBe(0);
    expect(end.state.result?.winner).not.toBe('imposters');
  });

  it('incubation never pauses for a returning imposter once started', () => {
    const e = exposed();
    const home = at(e.state, e.imp);
    let s = moveTo(e.state, e.imp, offsetByMeters(home, 40, 0), e.now);
    let t = e.now;
    s = walk(s, t, 5).state;
    t += 5 * S;
    const ends = get(s, e.victim).exposure?.incubationEndsAtGameMs;
    s = walk(moveTo(s, e.imp, home, t), t, 3).state;
    expect(get(s, e.victim).exposure?.incubationEndsAtGameMs).toBe(ends);
  });
});

describe('V3: imposters win by infection (RULES §12)', () => {
  const infectUntil = (state: RoomState, count: number): RoomState => {
    const s = structuredClone(state);
    for (const p of byRole(s, 'crew').slice(0, count)) p.infection = 'infected';
    return s;
  };

  it.each([4, 5, 6, 8, 10, 12])('ends exactly at the threshold with %i players', (players) => {
    const { state, now } = toPlaying(newLobby({ players }));
    const threshold = state.game?.threshold ?? 0;
    expect(threshold).toBe(infectionThreshold(CFG, state.game?.originalCrewCount ?? 0));
    const below = tick(infectUntil(state, threshold - 1), now + S);
    expect(below.state.phase).toBe('playing');
    const at = tick(infectUntil(state, threshold), now + S);
    expect(at.state.phase).toBe('ended');
    expect(at.state.result).toEqual({ winner: 'imposters', reason: 'infection' });
  });

  it('team score reached first wins for crew (V1 before V3, E29)', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = infectUntil(state, state.game?.threshold ?? 0);
    if (s.game) s.game.teamScore = CFG.targetScore;
    expect(tick(s, now + S).state.result).toEqual({ winner: 'crew', reason: 'score' });
  });

  it('exposed players do not count', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(state);
    for (const p of byRole(s, 'crew')) p.infection = 'exposed';
    expect(tick(s, now + S).state.phase).toBe('playing');
  });
});

describe('dev:advanceClock (test mode only, ADR-070)', () => {
  it('moves every game-time deadline: the cooldown ends and the match end gets closer', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const imp = byRole(state, 'imposter')[0]?.id ?? '';
    const jumped = run(
      state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: 60 },
      now,
    ).state;
    expect(
      (get(jumped, imp).infect?.readyAtGameMs ?? 0) <= (jumped.game?.clock.gameMs ?? 0) + 60 * S,
    ).toBe(true);
    const victim = byRole(jumped, 'crew')[0]?.id ?? '';
    const beside = moveTo(jumped, imp, near(jumped, victim, 3), now);
    expect(errCode(reduce(beside, { type: 'infectStart', playerId: imp }, now))).toBe('OK');
    // The match ends 60 s sooner.
    const end = now + (CFG.playTimeMin * 60 - 60) * S;
    expect(tick(jumped, end).state.phase).toBe('ended');
  });

  it('is refused outside test mode, for non-hosts, while paused and outside play', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const advance = (s: RoomState, playerId: string) =>
      errCode(reduce(s, { type: 'devAdvanceClock', playerId, seconds: 5 }, now));
    expect(advance(state, 'p1')).toBe('NOT_HOST');
    const off = structuredClone(state);
    off.config.testMode = false;
    expect(advance(off, 'host')).toBe('NOT_ALLOWED');
    expect(advance(newLobby(), 'host')).toBe('WRONG_PHASE');
    const paused = run(state, { type: 'pause', playerId: 'host' }, now).state;
    expect(advance(paused, 'host')).toBe('PAUSED'); // the pause check in reduce comes first
  });
});
