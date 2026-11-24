/**
 * Meetings (MEETINGS.md, RULES §8): any active player calls one; everyone is
 * pulled to the Base; gather → discuss → vote → result; game time is frozen
 * from the call to the end of the result. The stage timers are server time
 * (the meeting is what runs while game time is stopped) and a host pause
 * pushes them back. Voting is never attributed: only `countVotes` tallies
 * leave this module. Pure: every function takes `now`.
 */
import { distanceM, type MeetingStage } from '@afterdark/shared';

import { gameNow, pauseClock, resumeClock } from '../clock';
import type { MeetingState, PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { applyPostMeetingGrace } from './abilities';
import { endAllCamouflage } from './camouflage';
import { resetCoops } from './coopUpkeep';
import { countVotes, eject, SKIP } from './ejection';
import { cancelAllChannels } from './infection';
import { fixQuality } from './location';
import { logEvent } from './log';
import { activePlayers, findPlayer } from './players';
import { resetAllOpen } from './tasks';

const MS_PER_S = 1000;

/** Meetings the player may still call (MEETINGS §2). */
export const meetingsLeft = (state: RoomState, p: PlayerState): number =>
  Math.max(0, state.config.meetingsPerPlayer - (p.meetingsCalled ?? 0));

const stageSeconds = (state: RoomState, stage: MeetingStage): number => {
  const c = state.config;
  switch (stage) {
    case 'gather':
      return c.meetingGatherS;
    case 'discuss':
      return c.meetingDiscussS;
    case 'vote':
      return c.meetingVoteS;
    case 'result':
      return c.meetingResultS;
  }
};

function enter(state: RoomState, m: MeetingState, stage: MeetingStage, now: number): void {
  m.stage = stage;
  m.stageEndsAt = now + stageSeconds(state, stage) * MS_PER_S;
}

/** Who a stage waits for: active players who are connected (a disconnected player can't act, E24). */
const waitingFor = (state: RoomState): PlayerState[] =>
  activePlayers(state).filter((p) => p.connected);

/** `meeting:call` (MEETINGS §2): checks, then stops game time and starts Gather. */
export function callMeeting(
  state: RoomState,
  playerId: string,
  now: number,
  effects: Effect[],
): void {
  const game = state.game;
  if (state.phase !== 'playing' || !game) throw new RuleError('WRONG_PHASE', 'Not playing');
  const p = findPlayer(state, playerId);
  if (p.left || p.spectator || !p.role) {
    throw new RuleError('NOT_ALLOWED', 'Only active players can call a meeting');
  }
  if (game.meeting) throw new RuleError('MEETING_ACTIVE', 'A meeting is already running');
  if (game.clock.reasons.length > 0) throw new RuleError('PAUSED', 'The game is paused');
  if (state.config.meetingsPerPlayer === 0) {
    throw new RuleError('NOT_ALLOWED', 'Meetings are turned off');
  }
  if (meetingsLeft(state, p) === 0) {
    throw new RuleError('NOT_ALLOWED', 'You have used your meeting');
  }
  const gameMs = gameNow(game.clock, now);
  if (gameMs < state.config.meetingStartGraceS * MS_PER_S) {
    throw new RuleError('COOLDOWN', 'Too early for a meeting');
  }
  const last = game.lastMeetingEndedGameMs;
  if (last !== undefined && gameMs < last + state.config.meetingCooldownS * MS_PER_S) {
    throw new RuleError('COOLDOWN', 'A meeting just ended');
  }
  if (!p.loc || fixQuality(p.loc, now, state.config) === 'stale') {
    throw new RuleError('STALE', 'Your location is out of date');
  }

  p.meetingsCalled = (p.meetingsCalled ?? 0) + 1;
  logEvent(state, now, 'meetingCalled', [playerId], {});
  const meeting: MeetingState = {
    stage: 'gather',
    calledById: playerId,
    startedAt: now,
    stageEndsAt: now + state.config.meetingGatherS * MS_PER_S,
    gathered: [],
    skips: [],
    votes: {},
  };
  game.meeting = meeting;
  pauseClock(game.clock, 'meeting', now);
  // E22: every minigame in progress resets and every infection channel is cancelled. Incubation, cooldowns and expiry stop with the clock.
  for (const q of state.players) resetAllOpen(q, 'meeting', effects);
  resetCoops(state, 'meeting', effects);
  // The meeting is neutral for everyone, so every disguise ends with the call (ADR-084).
  endAllCamouflage(state);
  cancelAllChannels(state, 'meeting', effects);
  effects.push({
    kind: 'event',
    to: 'all',
    event: { type: 'meeting.called', by: p.username },
  });
}

function requireMeeting(state: RoomState, stage: MeetingStage): MeetingState {
  const m = state.game?.meeting;
  if (!m || state.phase !== 'playing') throw new RuleError('WRONG_PHASE', 'No meeting is running');
  if (m.stage !== stage) throw new RuleError('WRONG_PHASE', `Not the ${stage} stage`);
  return m;
}

function requireVoter(state: RoomState, playerId: string): PlayerState {
  const p = findPlayer(state, playerId);
  if (p.left || p.spectator) throw new RuleError('NOT_ALLOWED', 'Spectators cannot take part');
  return p;
}

/** `meeting:skipDiscussion`: a tap on "Skip to vote". Idempotent. */
export function skipDiscussion(state: RoomState, playerId: string): void {
  const m = requireMeeting(state, 'discuss');
  requireVoter(state, playerId);
  if (!m.skips.includes(playerId)) m.skips.push(playerId);
}

/** `meeting:vote`: once, locked when cast. Anyone active (or Skip) can be the target. */
export function castVote(state: RoomState, playerId: string, target: string): void {
  const m = requireMeeting(state, 'vote');
  requireVoter(state, playerId);
  if (m.votes[playerId] !== undefined) throw new RuleError('NOT_ALLOWED', 'Your vote is locked');
  if (target !== SKIP) {
    const t = state.players.find((p) => p.id === target);
    if (!t || t.left || t.spectator) throw new RuleError('NOT_FOUND', 'Not a player in this vote');
  }
  m.votes[playerId] = target;
}

/** Host pause during a meeting freezes the stage countdown too (MEETINGS §6). */
export function holdMeetingTimer(state: RoomState, now: number): void {
  const m = state.game?.meeting;
  if (m) m.pausedAt ??= now;
}

export function releaseMeetingTimer(state: RoomState, now: number): void {
  const m = state.game?.meeting;
  if (m?.pausedAt === undefined) return;
  m.stageEndsAt += now - m.pausedAt;
  delete m.pausedAt;
}

/** Arrivals so far: a good fix within `baseRadiusM` of the Base. Sticky, so someone who arrived and stepped aside stays counted. */
function updateGathered(state: RoomState, m: MeetingState, now: number): void {
  const base = state.setup.base;
  if (!base) return;
  for (const p of activePlayers(state)) {
    if (m.gathered.includes(p.id) || !p.loc || fixQuality(p.loc, now, state.config) !== 'good') {
      continue;
    }
    if (distanceM(p.loc, base) <= state.config.baseRadiusM) m.gathered.push(p.id);
  }
}

/** Vote over: count, eject, reveal (MEETINGS §4–§5). The win checks wait for the meeting to end, so the reveal gets its moment. */
function resolveVotes(state: RoomState, m: MeetingState, now: number, effects: Effect[]): void {
  const { tallies, ejectedId } = countVotes(state, m.votes);
  m.tallies = tallies;
  const ejected =
    ejectedId === undefined ? undefined : state.players.find((p) => p.id === ejectedId);
  if (ejected) {
    m.ejectedId = ejected.id;
    const { wasImposter } = eject(state, ejected);
    logEvent(state, now, 'meetingResult', [], { tallies, ejectedId: ejected.id, wasImposter });
    effects.push({
      kind: 'event',
      to: 'all',
      event: { type: 'meeting.result', ejected: { username: ejected.username, wasImposter } },
    });
  } else {
    logEvent(state, now, 'meetingResult', [], { tallies });
    effects.push({ kind: 'event', to: 'all', event: { type: 'meeting.result' } });
  }
}

/** The result is over: game time resumes, Infect waits out the grace, forfeit timers are credited the meeting (MEETINGS §3, §6). */
function endMeeting(state: RoomState, m: MeetingState, now: number): void {
  const game = state.game;
  if (!game) return;
  delete game.meeting;
  resumeClock(game.clock, 'meeting', now);
  const gameMs = gameNow(game.clock, now);
  game.lastMeetingEndedGameMs = gameMs;
  const graceUntil = gameMs + state.config.postMeetingGraceS * MS_PER_S;
  for (const p of state.players) {
    // Imposters can't strike at the crowded Base: Infect and every ability wait out the grace as a cooldown (ADR-073).
    if (p.infect) p.infect.readyAtGameMs = Math.max(p.infect.readyAtGameMs, graceUntil);
    applyPostMeetingGrace(p, graceUntil);
    // The forfeit timer was suspended: someone gone during the meeting counts from its end.
    if (p.disconnectedAt !== undefined)
      p.disconnectedAt = Math.min(now, p.disconnectedAt + (now - m.startedAt));
  }
  game.rolesAssignedAt = Math.min(now, game.rolesAssignedAt + (now - m.startedAt));
}

/** Moves a meeting through its stages. Runs from `advance()` on every command and tick while `playing`. */
export function updateMeeting(state: RoomState, now: number, effects: Effect[]): void {
  const game = state.game;
  const m = game?.meeting;
  if (state.phase !== 'playing' || !game || !m) return;
  // A host pause freezes the stage timers (and nothing else here moves).
  if (game.clock.reasons.includes('host')) return;
  // A stage may finish the moment the next begins (everyone already skipped, nobody connected), so loop to a stable stage.
  for (let guard = 0; guard < 4; guard++) {
    const before = m.stage;
    const timeUp = now >= m.stageEndsAt;
    const waiting = waitingFor(state);
    if (m.stage === 'gather') {
      updateGathered(state, m, now);
      if (timeUp || waiting.every((p) => m.gathered.includes(p.id)))
        enter(state, m, 'discuss', now);
    } else if (m.stage === 'discuss') {
      if (timeUp || waiting.every((p) => m.skips.includes(p.id))) enter(state, m, 'vote', now);
    } else if (m.stage === 'vote') {
      if (timeUp || waiting.every((p) => m.votes[p.id] !== undefined)) {
        resolveVotes(state, m, now, effects);
        enter(state, m, 'result', now);
      }
    } else if (timeUp) {
      endMeeting(state, m, now);
      return;
    }
    if (m.stage === before) return;
  }
}
