import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { gameNow, isPaused } from '../clock';
import { reduce } from '../reduce';
import {
  advanceTo,
  errCode,
  HOME,
  moveTo,
  newLobby,
  refresh,
  run,
  S,
  T0,
  toPlaying,
  toReveal,
  toSpawning,
  walkToSpawns,
} from '../testkit';
import { tick } from '../tick';
import type { Effect } from '../types';

const eventTypes = (effects: Effect[]) =>
  effects.flatMap((e) => (e.kind === 'event' ? [e.event.type] : []));

describe('state machine: lobby → spawning → reveal → playing → ended', () => {
  it('the countdown ends in spawning and emits game.spawnStarted to everyone', () => {
    const lobby = newLobby({ players: 5 });
    let s = lobby;
    for (const p of s.players) s = run(s, { type: 'setReady', playerId: p.id, ready: true }).state;
    const res = tick(refresh(s, T0 + 5 * S), T0 + 5 * S);
    expect(res.state.phase).toBe('spawning');
    expect(res.state.countdownEndsAt).toBeUndefined();
    expect(res.state.spawnEndsAt).toBe(T0 + 5 * S + DEFAULT_CONFIG.spawnTimeoutS * S);
    expect(eventTypes(res.effects)).toContain('game.spawnStarted');
  });

  it('reveal follows the last arrival and assigns roles at once', () => {
    const { state } = toReveal(newLobby({ players: 5 }));
    expect(state.phase).toBe('reveal');
    expect(state.players.every((p) => p.role && p.tag)).toBe(true);
    expect(state.game?.clock.started).toBe(false); // the match clock has not started
  });

  it('play begins after roleRevealS and starts the match clock', () => {
    const reveal = toReveal(newLobby({ players: 5 }));
    const justBefore = advanceTo(reveal.state, reveal.now + DEFAULT_CONFIG.roleRevealS * S - S);
    expect(justBefore.phase).toBe('reveal');
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    expect(state.phase).toBe('playing');
    expect(state.game?.clock.started).toBe(true);
    expect(
      gameNow(state.game?.clock ?? { gameMs: 0, started: false, reasons: [] }, now + 30 * S),
    ).toBe(30 * S);
  });

  it('a spawn-phase fix that completes the group moves to reveal without waiting for a tick', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    expect(walkToSpawns(state, now).phase).toBe('reveal');
  });

  it('game.rolesRevealed and game.playStarted are emitted once each', () => {
    const reveal = toReveal(newLobby({ players: 4 }));
    const res = tick(reveal.state, reveal.now + 10 * S);
    expect(eventTypes(res.effects).filter((t) => t === 'game.playStarted')).toHaveLength(1);
    const again = tick(res.state, reveal.now + 11 * S);
    expect(eventTypes(again.effects)).not.toContain('game.playStarted');
  });
});

describe('illegal commands per phase (WRONG_PHASE)', () => {
  it('lobby-only commands are refused in reveal, playing and ended', () => {
    const playing = toPlaying(newLobby({ players: 5 }));
    const reveal = toReveal(newLobby({ players: 5 }));
    for (const { state, now } of [reveal, playing]) {
      for (const cmd of [
        { type: 'setReady', playerId: 'p1', ready: true },
        { type: 'updateConfig', playerId: 'host', patch: { playTimeMin: 20 } },
        { type: 'kick', playerId: 'host', targetId: 'p1' },
        { type: 'regenerateRegions', playerId: 'host', input: {} },
        { type: 'setBase', playerId: 'host', base: HOME },
      ] as const) {
        expect(errCode(reduce(state, cmd, now)), `${state.phase} ${cmd.type}`).toBe('WRONG_PHASE');
      }
    }
    const ended = run(playing.state, { type: 'abort', playerId: 'host' }, playing.now).state;
    expect(
      errCode(reduce(ended, { type: 'setReady', playerId: 'p1', ready: false }, playing.now)),
    ).toBe('WRONG_PHASE');
  });

  it('forceStart only works in the spawn phase', () => {
    const lobby = newLobby({ players: 5 });
    expect(errCode(reduce(lobby, { type: 'forceStart', playerId: 'host' }, T0))).toBe(
      'WRONG_PHASE',
    );
    const reveal = toReveal(newLobby({ players: 5 }));
    expect(
      errCode(reduce(reveal.state, { type: 'forceStart', playerId: 'host' }, reveal.now)),
    ).toBe('WRONG_PHASE');
  });

  it('pause and resume only work while playing', () => {
    const lobby = newLobby({ players: 5 });
    expect(errCode(reduce(lobby, { type: 'pause', playerId: 'host' }, T0))).toBe('WRONG_PHASE');
    const reveal = toReveal(newLobby({ players: 5 }));
    expect(errCode(reduce(reveal.state, { type: 'pause', playerId: 'host' }, reveal.now))).toBe(
      'WRONG_PHASE',
    );
    expect(errCode(reduce(reveal.state, { type: 'resume', playerId: 'host' }, reveal.now))).toBe(
      'WRONG_PHASE',
    );
  });

  it('abort has nothing to abort in the lobby, and nothing after the end', () => {
    const lobby = newLobby({ players: 5 });
    expect(errCode(reduce(lobby, { type: 'abort', playerId: 'host' }, T0))).toBe('WRONG_PHASE');
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const ended = run(state, { type: 'abort', playerId: 'host' }, now).state;
    expect(errCode(reduce(ended, { type: 'abort', playerId: 'host' }, now))).toBe('WRONG_PHASE');
  });

  it('joining is closed from the spawn phase to the end', () => {
    for (const { state, now } of [
      toSpawning(newLobby({ players: 5 })),
      toReveal(newLobby({ players: 5 })),
      toPlaying(newLobby({ players: 5 })),
    ]) {
      expect(
        errCode(reduce(state, { type: 'join', playerId: 'late', username: 'Late' }, now)),
      ).toBe('GAME_IN_PROGRESS');
    }
  });
});

describe('host controls (RULES §11, 04.7)', () => {
  it('only the host can force start, pause, resume and abort (NOT_HOST)', () => {
    const spawning = toSpawning(newLobby({ players: 5 }));
    expect(
      errCode(reduce(spawning.state, { type: 'forceStart', playerId: 'p1' }, spawning.now)),
    ).toBe('NOT_HOST');
    const playing = toPlaying(newLobby({ players: 5 }));
    for (const type of ['pause', 'resume', 'abort'] as const) {
      expect(errCode(reduce(playing.state, { type, playerId: 'p1' }, playing.now)), type).toBe(
        'NOT_HOST',
      );
    }
  });

  it('force start gives roles to players who have not reached their spawn (E1)', () => {
    const { state, now } = toSpawning(newLobby({ players: 5 }));
    const res = run(state, { type: 'forceStart', playerId: 'host' }, now);
    expect(res.state.phase).toBe('reveal');
    expect(res.state.players.every((p) => p.role !== undefined)).toBe(true);
    expect(res.state.players.some((p) => p.spawn?.reached)).toBe(false);
    expect(eventTypes(res.effects)).toContain('game.rolesRevealed');
  });

  it('pause freezes game time and resume restarts it', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const clockOf = (s: typeof state) =>
      s.game?.clock ?? { gameMs: 0, started: false, reasons: [] };
    const paused = run(state, { type: 'pause', playerId: 'host' }, now + 20 * S);
    expect(eventTypes(paused.effects)).toContain('game.paused');
    expect(isPaused(clockOf(paused.state))).toBe(true);
    const later = advanceTo(paused.state, now + 80 * S);
    expect(gameNow(clockOf(later), now + 80 * S)).toBe(20 * S);
    const resumed = run(later, { type: 'resume', playerId: 'host' }, now + 80 * S);
    expect(eventTypes(resumed.effects)).toContain('game.resumed');
    expect(gameNow(clockOf(resumed.state), now + 90 * S)).toBe(30 * S);
  });

  it('while paused every action except location is rejected with PAUSED', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const paused = run(state, { type: 'pause', playerId: 'host' }, now + S).state;
    for (const cmd of [
      { type: 'setReady', playerId: 'p1', ready: true },
      { type: 'updateConfig', playerId: 'host', patch: { playTimeMin: 20 } },
      { type: 'kick', playerId: 'host', targetId: 'p1' },
      { type: 'setBase', playerId: 'host', base: HOME },
    ] as const) {
      expect(errCode(reduce(paused, cmd, now + 2 * S)), cmd.type).toBe('PAUSED');
    }
    // Location, connection, leaving and the host's own controls still work.
    for (const cmd of [
      { type: 'locUpdate', playerId: 'p1', fix: { ...HOME, accuracy: 5, ts: now + 2 * S } },
      { type: 'disconnect', playerId: 'p1' },
      { type: 'connect', playerId: 'p1' },
      { type: 'resume', playerId: 'host' },
    ] as const) {
      expect(errCode(reduce(paused, cmd, now + 2 * S)), cmd.type).toBe('OK');
    }
    expect(errCode(reduce(paused, { type: 'abort', playerId: 'host' }, now + 2 * S))).toBe('OK');
  });

  it('pausing twice and resuming when not paused are harmless', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const once = run(state, { type: 'pause', playerId: 'host' }, now + S);
    const twice = run(once.state, { type: 'pause', playerId: 'host' }, now + 2 * S);
    expect(eventTypes(twice.effects)).not.toContain('game.paused');
    const noop = run(state, { type: 'resume', playerId: 'host' }, now + S);
    expect(eventTypes(noop.effects)).not.toContain('game.resumed');
  });

  it('abort ends the game with no winner, from spawning, reveal and playing (V6)', () => {
    for (const { state, now } of [
      toSpawning(newLobby({ players: 5 })),
      toReveal(newLobby({ players: 5 })),
      toPlaying(newLobby({ players: 5 })),
    ]) {
      const res = run(state, { type: 'abort', playerId: 'host' }, now);
      expect(res.state.phase).toBe('ended');
      expect(res.state.result).toEqual({ winner: null, reason: 'abort' });
      expect(eventTypes(res.effects)).toContain('game.ended');
    }
  });

  it('an ended game stays ended: ticks do nothing more', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const ended = run(state, { type: 'abort', playerId: 'host' }, now).state;
    const res = tick(ended, now + 3600 * S);
    expect(res.state.phase).toBe('ended');
    expect(eventTypes(res.effects)).not.toContain('game.ended');
  });
});

describe('host hand-over during the game (E31)', () => {
  it('passes host controls to the earliest-joined connected player after the grace period', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    let s = run(state, { type: 'disconnect', playerId: 'host' }, now).state;
    s = advanceTo(s, now + DEFAULT_CONFIG.hostDisconnectGraceS * S - S);
    expect(s.hostId).toBe('host');
    s = advanceTo(s, now + DEFAULT_CONFIG.hostDisconnectGraceS * S);
    expect(s.hostId).toBe('p1');
    // The new host can pause; the old one no longer can.
    expect(errCode(reduce(s, { type: 'pause', playerId: 'host' }, now + 40 * S))).toBe('NOT_HOST');
    expect(errCode(reduce(s, { type: 'pause', playerId: 'p1' }, now + 40 * S))).toBe('OK');
  });

  it('passes at once when the host leaves', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const s = run(state, { type: 'leave', playerId: 'host' }, now).state;
    expect(s.hostId).toBe('p1');
  });

  it('keeps the game running (no phase change) when the host drops', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const s = run(state, { type: 'disconnect', playerId: 'host' }, now).state;
    expect(s.phase).toBe('playing');
  });
});

describe('spawn failure emits lobby.startFailed', () => {
  it('tells everyone when the area cannot fit the spawns', () => {
    const lobby = newLobby({ players: 5, config: { spawnMinSeparationM: 400 } });
    let s = lobby;
    for (const p of s.players) s = run(s, { type: 'setReady', playerId: p.id, ready: true }).state;
    const res = tick(refresh(s, T0 + 5 * S), T0 + 5 * S);
    expect(res.state.phase).toBe('lobby');
    expect(res.effects).toContainEqual({
      kind: 'event',
      to: 'all',
      event: { type: 'lobby.startFailed', reason: 'spawns' },
    });
  });
});

describe('moving through the phases', () => {
  it('a player who is far from everything still progresses (teleport + refresh)', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    const s = moveTo(state, 'p1', HOME, now);
    expect(s.phase).toBe('spawning');
  });
});
