import { createRng } from '@afterdark/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { rngCodeSource } from './lobbyCode';
import { RoomManager } from './RoomManager';

const T0 = 1_700_000_000_000;
const SLOW_MS = 1000;

/** A real pino logger that writes its JSON lines into an array. */
function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'debug' },
    { write: (chunk: string) => void lines.push(JSON.parse(chunk) as Record<string, unknown>) },
  );
  return { logger, lines };
}

function setup(perfNow?: () => number) {
  const { logger, lines } = captureLogger();
  const mgr = new RoomManager({
    now: () => T0,
    allowTestMode: true,
    codeSource: rngCodeSource(createRng(7)),
    logger,
    ...(perfNow ? { perfNow } : {}),
  });
  const room = mgr.create({ playerId: 'host-player-1', username: 'Hosty' });
  room.stop(); // drive ticks by hand
  return { room, lines };
}

describe('Room error boundary (Phase 6)', () => {
  it('contains an exception thrown while a tick runs, logs it with the room code, and keeps ticking', () => {
    const { room, lines } = setup();
    let calls = 0;
    room.subscribe(() => {
      calls++;
      if (calls === 1) throw new Error('boom');
    });

    expect(() => room.tick()).not.toThrow();
    const failure = lines.find((l) => l.msg === 'room tick failed');
    expect(failure).toMatchObject({ code: room.code, level: 50 });

    // The next tick runs normally: the failure did not stop the room.
    expect(() => room.tick()).not.toThrow();
    expect(calls).toBe(2);
    expect(lines.filter((l) => l.msg === 'room tick failed')).toHaveLength(1);
  });

  it('logs the room code, kind, event and duration of commands, and never positions or the roster', () => {
    const { room, lines } = setup();
    room.dispatch({ type: 'setReady', playerId: 'host-player-1', ready: true });
    const entry = lines.find((l) => l.kind === 'command');
    expect(entry).toMatchObject({ code: room.code, event: 'setReady' });
    expect(typeof entry?.ms).toBe('number');
    const text = JSON.stringify(lines);
    expect(text).not.toMatch(/"(lat|lng|token|role)"/);
  });
});

describe('Room slow-operation warning', () => {
  it('warns when an operation takes longer than slowCommandMs', () => {
    let t = 0;
    // Each perfNow() call advances the fake wall clock by 1 s, so every operation looks slow.
    const { room, lines } = setup(() => (t += SLOW_MS));
    room.tick();
    expect(lines.some((l) => l.msg === 'slow room operation' && l.kind === 'tick')).toBe(true);
  });
});
