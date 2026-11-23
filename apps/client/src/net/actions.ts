/** Player intents. The server decides; the UI waits for the next view. */
import type {
  BoundaryInput,
  GameConfigEditablePatch,
  LatLng,
  LobbyEditTaskPointsPayload,
  LobbyRegenerateRegionsPayload,
  Position,
  SoloMinigameType,
  TaskActionBody,
  TaskAnswerBody,
} from '@afterdark/shared';

import { useGame } from '../store';
import { useLocation } from '../store/location';
import { clearSession, saveSession } from './persist';
import { request } from './socket';

export async function createLobby(username: string) {
  const res = await request('lobby:create', { username, acceptedSafety: true });
  if (res.ok) saveSession({ token: res.data.token, code: res.data.code });
  return res;
}

export async function joinLobby(code: string, username: string) {
  const res = await request('lobby:join', { code, username, acceptedSafety: true });
  if (res.ok) saveSession({ token: res.data.token, code: code.trim().toUpperCase() });
  return res;
}

export async function leaveLobby() {
  const res = await request('lobby:leave', {});
  // Whatever the server said, this device is done with the lobby.
  clearSession();
  useGame.getState().clearView();
  return res;
}

export const setReady = (ready: boolean) => request('lobby:setReady', { ready });

export const updateConfig = (patch: GameConfigEditablePatch) =>
  request('lobby:updateConfig', { patch });

export const kickPlayer = (playerId: string) => request('lobby:kick', { playerId });

export const setBoundary = (boundary: BoundaryInput) => request('lobby:setBoundary', { boundary });

/** Test mode only: place yourself exactly (the server refuses it otherwise). */
export const devTeleport = (to: LatLng) => request('dev:teleport', to);

export const regenerateRegions = (input: LobbyRegenerateRegionsPayload = {}) =>
  request('lobby:regenerateRegions', input);

export const renameRegion = (regionId: string, name: string) =>
  request('lobby:renameRegion', { regionId, name });

export const editTaskPoints = (input: LobbyEditTaskPointsPayload) =>
  request('lobby:editTaskPoints', input);

export const setNoGoZones = (zones: Position[][]) => request('lobby:setNoGoZones', { zones });

export const setBase = (base: LatLng) => request('lobby:setBase', base);

// ── Phase 4: game flow ──────────────────────────────────────────────────────

/** Host, spawn phase only: start the reveal even if someone has not reached their spawn. */
export const forceStart = () => request('game:forceStart', {});
export const pauseGame = () => request('game:pause', {});
export const resumeGame = () => request('game:resume', {});
/** Ends the game with no winner. */
export const abortGame = () => request('game:abort', {});
export const playAgain = () => request('lobby:playAgain', {});

/** Test mode, host, lobby only: add in-process bots (they walk, ready up and play like players). */
export const addBots = (count: number) => request('dev:addBots', { count });

/** Simulator jump (long-press or marker drag): moves the simulated GPS, then hops there with the test-mode event. */
export async function simTeleport(to: LatLng) {
  useLocation.getState().patchSim({ ...to, placed: true });
  // Walking sends normal fixes; a teleport is a jump the speed check would reject.
  return devTeleport(to);
}

// ── Phase 5: tasks ──────────────────────────────────────────────────────────

/** At the pin: the reply carries the minigame type, its points and the puzzle (never the solution). */
export const openTask = (taskId: string) => request('task:open', { taskId });
/** One step of a multi-step game (a lock guess). */
export const taskAction = (taskId: string, action: TaskActionBody) =>
  request('task:action', { taskId, action });
/** The server checks the answer; a wrong one locks submitting for a few seconds. */
export const submitTask = (taskId: string, answer: TaskAnswerBody) =>
  request('task:submit', { taskId, answer });
export const cancelTask = (taskId: string) => request('task:cancel', { taskId });
export const rerollTask = (taskId: string) => request('task:reroll', { taskId });
export const reportUnsafe = (taskId: string) => request('task:reportUnsafe', { taskId });
/** Test mode only: finish the open task as if it was solved. */
export const devAutoComplete = (taskId: string) => request('dev:autoComplete', { taskId });

/** Test mode, host, playing only: jump game time forward (cooldowns, incubation, the match end). */
export const devAdvanceClock = (seconds: number) => request('dev:advanceClock', { seconds });

/** Test mode, host, lobby only: limit which minigames new tasks can be (to test one game at a time). */
export const devSetMinigames = (types: SoloMinigameType[]) =>
  request('dev:setMinigames', { types });

// ── Phase 8: meetings ───────────────────────────────────────────────────────

/** Any active player: call an emergency meeting (the server checks the allowance, grace and cooldown). */
export const callMeeting = () => request('meeting:call', {});
/** Discuss stage: "Skip to vote". The stage ends early once every connected active player has. */
export const skipDiscussion = () => request('meeting:skipDiscussion', {});
/** Vote stage, once: a player id or `'skip'`. It cannot be changed after it is cast. */
export const castVote = (target: string) => request('meeting:vote', { target });

// ── Phase 7: infection (imposters) ──────────────────────────────────────────

// ── Phase 9: class abilities (imposters) ────────────────────────────────────

/** Saboteur: reset every minigame in progress and lock all tasks for a while. Public: everyone sees SYSTEMS JAMMED. */
export const taskStop = () => request('ability:taskStop', {});
/** Phantom: pin a fake task at `at`. The server checks the spot; a refusal costs no cooldown. */
export const placeFakeTask = (at: LatLng) => request('ability:fakeTask', at);

/** Starts a channel on the nearest healthy crew member within range; the server picks the target. */
export const startInfect = () => request('ability:infect', {});
/** Stops a channel. Free: no cooldown. */
export const cancelInfect = () => request('ability:cancelInfect', {});

// ── Phase 10: co-op tasks and Camouflage ────────────────────────────────────

/** Camouflage: for a short while your phone looks like a crew member's. Only you see the change. */
export const camouflage = () => request('ability:camouflage', {});
/** At the pin: open a waiting co-op session (the other player then joins). */
export const coopStart = (taskId: string) => request('coop:start', { taskId });
/** Join the waiting partner: with your own card's id, or the id a stand-in was offered. The reply holds your PIN. */
export const coopJoin = (taskId: string) => request('coop:join', { taskId });
/** Type the PIN your partner showed you. */
export const coopSubmit = (taskId: string, pin: string) =>
  request('coop:submit', { taskId, answer: { pin } });
/** Step out of the wait or the puzzle; the other side keeps waiting. */
export const coopCancel = (taskId: string) => request('coop:cancel', { taskId });

/** Test mode, host, playing: turn the owner's first card into a co-op task with a chosen partner (no waiting for the random draw). */
export const devForceCoop = (ownerId: string, partnerId: string) =>
  request('dev:forceCoop', { ownerId, partnerId });

/** Test mode, host, lobby only: change host settings without the form (e2e uses it to switch co-op on or off). */
export const devUpdateConfig = (patch: GameConfigEditablePatch) => updateConfig(patch);
