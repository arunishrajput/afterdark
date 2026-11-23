import type { PlayerView } from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reduce } from '../engine/reduce';
import { createRoomState, type RoomState } from '../engine/state';
import type { Command } from '../engine/types';
import { ViewEmitter } from './ViewEmitter';

const THROTTLE = 200;

function apply(s: RoomState, cmd: Command): RoomState {
  const res = reduce(s, cmd, Date.now());
  if (!res.ok) throw new Error(res.code);
  return res.state;
}

describe('ViewEmitter', () => {
  let sent: { to: string; view: PlayerView }[];
  let emitter: ViewEmitter;
  let state: RoomState;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    emitter = new ViewEmitter({
      now: () => Date.now(),
      throttleMs: THROTTLE,
      send: (to, view) => sent.push({ to, view }),
    });
    state = createRoomState({ code: 'ABC234', hostId: 'h', username: 'Host', allowTestMode: true });
  });

  afterEach(() => {
    emitter.dispose();
    vi.useRealTimers();
  });

  it('sends the first view immediately, with v = 1 and serverNow', () => {
    emitter.update(state);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('h');
    expect(sent[0]?.view).toMatchObject({ v: 1, serverNow: Date.now() });
  });

  it('does not resend an unchanged view', () => {
    emitter.update(state);
    vi.advanceTimersByTime(1000);
    emitter.update(state);
    emitter.update(structuredClone(state));
    expect(sent).toHaveLength(1);
  });

  it('throttles to one send per window and delivers the latest view', () => {
    emitter.update(state);
    state = apply(state, { type: 'join', playerId: 'p1', username: 'Bea' });
    emitter.update(state);
    state = apply(state, { type: 'join', playerId: 'p2', username: 'Cy' });
    emitter.update(state);
    const toHost = () => sent.filter((s) => s.to === 'h');
    expect(toHost()).toHaveLength(1);
    vi.advanceTimersByTime(THROTTLE);
    expect(toHost()).toHaveLength(2);
    const latest = toHost()[1]?.view;
    expect(latest?.lobby.players.map((p) => p.id)).toEqual(['h', 'p1', 'p2']);
    expect(latest?.v).toBe(3);
  });

  it('skips disconnected players and resends on demand when a socket binds', () => {
    state = apply(state, { type: 'join', playerId: 'p1', username: 'Bea' });
    state = apply(state, { type: 'disconnect', playerId: 'p1' });
    emitter.update(state);
    expect(sent.map((s) => s.to)).toEqual(['h']);
    state = apply(state, { type: 'connect', playerId: 'p1' });
    emitter.resend(state, 'p1');
    expect(sent.map((s) => s.to)).toEqual(['h', 'p1']);
  });
});
