import { DEFAULT_CONFIG, EDITABLE_CONFIG_KEYS } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../engine/reduce';
import { createRoomState, type RoomState } from '../engine/state';
import { projectView } from './projectView';

const T0 = 1_700_000_000_000;

function lobby(): RoomState {
  let s = createRoomState({
    code: 'ABC234',
    hostId: 'h',
    username: 'Host',
    allowTestMode: true,
    radarSalt: 'salt',
  });
  const res = reduce(s, { type: 'join', playerId: 'p1', username: 'Bea' }, T0);
  if (!res.ok) throw new Error(res.code);
  s = res.state;
  return s;
}

describe('projectView (lobby)', () => {
  it('shows the public roster with host and connection flags, in join order', () => {
    const view = projectView(lobby(), 'p1', T0);
    expect(view.lobby.players).toEqual([
      { id: 'h', username: 'Host', isHost: true, ready: false, connected: true, status: 'active' },
      { id: 'p1', username: 'Bea', isHost: false, ready: false, connected: true, status: 'active' },
    ]);
    expect(view.me).toEqual({
      id: 'p1',
      username: 'Bea',
      isHost: false,
      ready: false,
      status: 'active',
    });
    expect(view.lobby).toMatchObject({ code: 'ABC234', phase: 'lobby', hostId: 'h' });
  });

  it('exposes exactly the host-editable config keys', () => {
    const view = projectView(lobby(), 'h', T0);
    expect(Object.keys(view.lobby.config).sort()).toEqual([...EDITABLE_CONFIG_KEYS].sort());
    expect(view.lobby.config.playTimeMin).toBe(DEFAULT_CONFIG.playTimeMin);
    expect(view.lobby.testMode).toBe(DEFAULT_CONFIG.testMode);
  });

  it('includes countdownEndsAt only while a countdown runs', () => {
    const s = lobby();
    expect('countdownEndsAt' in projectView(s, 'h', T0).lobby).toBe(false);
    expect(projectView({ ...s, countdownEndsAt: T0 + 5000 }, 'h', T0).lobby.countdownEndsAt).toBe(
      T0 + 5000,
    );
  });

  it('throws for a player who is not in the room', () => {
    expect(() => projectView(lobby(), 'ghost', T0)).toThrow();
  });
});
