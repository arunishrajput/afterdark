import { describe, expect, it } from 'vitest';

import { percentile, statsOf, summarizeRoomLog } from './loadStats';

describe('percentile and statsOf', () => {
  it('uses the nearest rank on sorted samples', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 100)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
  });

  it('summarises unsorted samples; an empty set is all zeros', () => {
    expect(statsOf([3, 1, 2])).toEqual({ count: 3, p50: 2, p95: 3, p99: 3, max: 3 });
    expect(statsOf([])).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });
});

describe('summarizeRoomLog', () => {
  const line = (o: Record<string, unknown>) => JSON.stringify({ level: 20, time: 1, ...o });

  it('splits room ticks from commands, counts slow ones and rooms, and skips other lines', () => {
    const text = [
      line({ msg: 'room operation', code: 'AAA', kind: 'tick', event: 'tick', ms: 0.4 }),
      line({ msg: 'room operation', code: 'AAA', kind: 'tick', event: 'tick', ms: 1.2 }),
      line({ msg: 'room operation', code: 'BBB', kind: 'tick', event: 'tick', ms: 0.8 }),
      line({ msg: 'room operation', code: 'BBB', kind: 'command', event: 'locUpdate', ms: 0.1 }),
      JSON.stringify({ level: 40, msg: 'slow room operation', code: 'BBB', kind: 'tick', ms: 60 }),
      line({ msg: 'http request', path: '/health', ms: 3 }),
      'not json at all',
      '',
    ].join('\n');
    const s = summarizeRoomLog(text);
    expect(s.rooms).toBe(2);
    expect(s.tick).toEqual({ count: 4, p50: 0.8, p95: 60, p99: 60, max: 60 });
    expect(s.command.count).toBe(1);
    expect(s.slow).toBe(1);
  });
});
