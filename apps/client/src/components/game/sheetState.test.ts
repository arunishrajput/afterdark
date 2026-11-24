import type { TaskCard } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { priorityCardId } from './sheetState';

const base = { kind: 'solo', regionId: 'r1', regionName: 'Region A', section: 'N' } as const;
const assigned = (id: string): TaskCard => ({ ...base, id, stage: 'assigned' });
const pin = (id: string, extra: Partial<Extract<TaskCard, { stage: 'pin' }>> = {}): TaskCard => ({
  ...base,
  id,
  stage: 'pin',
  lat: 0,
  lng: 0,
  atPin: false,
  ...extra,
});

describe('priorityCardId', () => {
  it('is undefined without cards', () => {
    expect(priorityCardId([], {})).toBeUndefined();
  });

  it('picks the nearest card, or the first one when distances are unknown', () => {
    const cards = [assigned('a'), pin('b'), assigned('c')];
    expect(priorityCardId(cards, {})).toBe('a');
    const distances = new Map([
      ['a', 120],
      ['b', 80],
      ['c', 30],
    ]);
    expect(priorityCardId(cards, { distances })).toBe('c');
  });

  it('puts a card at its pin before a nearer one, and a partner waiting before plain distance', () => {
    const distances = new Map([
      ['a', 5],
      ['b', 40],
      ['c', 90],
    ]);
    expect(
      priorityCardId([assigned('a'), pin('b', { atPin: true }), pin('c')], { distances }),
    ).toBe('b');
    expect(
      priorityCardId([assigned('a'), pin('b'), pin('c', { kind: 'coop', partnerWaiting: true })], {
        distances,
      }),
    ).toBe('c');
  });

  it('always shows the co-op card the player is waiting on', () => {
    const cards = [pin('a', { atPin: true }), pin('b', { kind: 'coop', atPin: true })];
    expect(priorityCardId(cards, { waitingId: 'b' })).toBe('b');
  });
});
