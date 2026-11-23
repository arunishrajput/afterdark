import { type SoloMinigameType, type TaskOpenAck, type TaskSubmitAck } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { crewOf, newLobby, otherPointInSection, run, stayAt, taskAt, toPlaying } from '../testkit';
import type { Effect } from '../types';

const replyOf = (effects: Effect[]) => {
  const e = effects.find((x) => x.kind === 'reply');
  return e && e.kind === 'reply' ? e.reply : undefined;
};

function atPin(type: SoloMinigameType) {
  const { state: s0, now } = toPlaying(newLobby());
  const state = structuredClone(s0);
  const crew = crewOf(state)[0]!;
  const task = taskAt(state, crew.id);
  task.type = type;
  const held = stayAt(
    state,
    crew.id,
    otherPointInSection(state, task),
    now,
    state.config.sectionEntryHoldS + 1,
  );
  const arrived = stayAt(held.state, crew.id, task, held.now, 1);
  return { ...arrived, id: crew.id, taskId: task.id };
}

const SOLVABLE = ['pattern', 'signal', 'slide', 'crossword'] as const;

describe.each(SOLVABLE)('%s over the engine', (type) => {
  it('opens with the right ack, hides the solution, and is checked on the server', () => {
    const at = atPin(type);
    const opened = run(at.state, { type: 'taskOpen', playerId: at.id, taskId: at.taskId }, at.now);
    const open = replyOf(opened.effects);
    if (open?.type !== 'open') throw new Error('no open reply');
    const ack: TaskOpenAck = open.ack;
    expect(ack.type).toBe(type);
    expect(ack.points).toBe(at.state.config.points[type]);
    const stored = taskAt(opened.state, at.id).open;
    // The wire carries the puzzle only. (Pattern Memory's puzzle holds the sequence it flashes by design.)
    expect(Object.keys(ack).sort()).toEqual(['points', 'puzzle', 'type']);
    if (type === 'signal')
      expect(JSON.stringify(ack)).not.toContain(JSON.stringify(stored?.solution));
    if (type === 'crossword') expect(JSON.stringify(ack)).not.toMatch(/[A-Z]{3}/);
    // A wrong answer fails; the stored solution passes and pays.
    const wrongAnswer = type === 'signal' ? 'ZZZZ' : type === 'crossword' ? ['AAA'] : [7, 7, 7];
    const wrong = run(
      opened.state,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: wrongAnswer },
      at.now,
    );
    const wrongReply = replyOf(wrong.effects);
    expect((wrongReply as { ack: TaskSubmitAck }).ack).toEqual({ result: 'wrong', points: 0 });
    const later = stayAt(
      wrong.state,
      at.id,
      taskAt(wrong.state, at.id),
      at.now,
      wrong.state.config.taskWrongLockoutS + 1,
    );
    const done = run(
      later.state,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: stored?.solution },
      later.now,
    );
    expect((replyOf(done.effects) as { ack: TaskSubmitAck }).ack).toEqual({
      result: 'success',
      points: at.state.config.points[type],
    });
    expect(done.state.game?.teamScore).toBe(at.state.config.points[type]);
  });
});
