import { tokenSchema } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { SessionRegistry } from './sessions';

describe('SessionRegistry', () => {
  it('issues a unique, schema-valid token per player and resolves it', () => {
    const reg = new SessionRegistry();
    const a = reg.issue('ABC234', 'p1');
    const b = reg.issue('ABC234', 'p2');
    expect(a).not.toBe(b);
    expect(tokenSchema.safeParse(a).success).toBe(true);
    expect(reg.resolve(a)).toEqual({ status: 'ok', code: 'ABC234', playerId: 'p1' });
    expect(reg.resolve('unknown-token-123456')).toEqual({ status: 'unknown' });
  });

  it('binds one socket per player and reports the socket it replaced', () => {
    const reg = new SessionRegistry();
    reg.issue('ABC234', 'p1');
    expect(reg.bind('p1', 's1')).toBeUndefined();
    expect(reg.socketOf('p1')).toBe('s1');
    expect(reg.bind('p1', 's2')).toBe('s1');
    expect(reg.socketOf('p1')).toBe('s2');
  });

  it('only unbinds the socket that is currently bound (a replaced socket is ignored)', () => {
    const reg = new SessionRegistry();
    reg.issue('ABC234', 'p1');
    reg.bind('p1', 's1');
    reg.bind('p1', 's2');
    expect(reg.unbind('p1', 's1')).toBe(false);
    expect(reg.socketOf('p1')).toBe('s2');
    expect(reg.unbind('p1', 's2')).toBe(true);
    expect(reg.socketOf('p1')).toBeUndefined();
  });

  it('revoking ends the session; a kick also bans the token', () => {
    const reg = new SessionRegistry();
    const left = reg.issue('ABC234', 'p1');
    const kicked = reg.issue('ABC234', 'p2');
    reg.revoke('p1', 'left');
    reg.revoke('p2', 'kicked');
    expect(reg.resolve(left)).toEqual({ status: 'unknown' });
    expect(reg.resolve(kicked)).toEqual({ status: 'kicked' });
  });

  it('purging a lobby forgets its sessions and bans', () => {
    const reg = new SessionRegistry();
    const t1 = reg.issue('ABC234', 'p1');
    const t2 = reg.issue('ABC234', 'p2');
    const other = reg.issue('XYZ789', 'p3');
    reg.revoke('p2', 'kicked');
    reg.purgeLobby('ABC234');
    expect(reg.resolve(t1)).toEqual({ status: 'unknown' });
    expect(reg.resolve(t2)).toEqual({ status: 'unknown' });
    expect(reg.resolve(other).status).toBe('ok');
  });
});
