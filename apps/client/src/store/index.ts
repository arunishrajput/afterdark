import type { GameEvent, PlayerView, RadarPayload } from '@afterdark/shared';
import { create } from 'zustand';

import type { ClockSample } from '../net/clock';

export type ConnectionStatus = 'connecting' | 'connected';

interface ConnectionState {
  status: ConnectionStatus;
  /** Browser ms when the connection dropped; undefined while connected (or before the first connect). */
  downSince: number | undefined;
  rttMs: number | undefined;
  offsetMs: number;
  setStatus: (status: ConnectionStatus) => void;
  setClock: (sample: ClockSample) => void;
}

export const useConnection = create<ConnectionState>()((set) => ({
  status: 'connecting',
  downSince: undefined,
  rttMs: undefined,
  offsetMs: 0,
  setStatus: (status) =>
    set((s) => ({
      status,
      downSince: status === 'connected' ? undefined : (s.downSince ?? Date.now()),
    })),
  setClock: ({ rttMs, offsetMs }) => set({ rttMs, offsetMs }),
}));

/** A blocking message that replaces the normal screens until dismissed. */
export type Notice = { kind: 'kicked' } | { kind: 'replaced' } | { kind: 'ended' };

export interface Toast {
  id: number;
  text: string;
}

/** A private task event the UI reacts to (a counter, so the same event twice still changes the store). */
export interface TaskSignal {
  seq: number;
  reason: 'range' | 'gps' | 'zone' | 'connection' | 'meeting' | 'sabotage';
}

/** The latest `meeting.called`: who called it and when it arrived (for the full-screen alarm). */
export interface MeetingAlarm {
  seq: number;
  by: string;
  /** Browser ms when the event arrived. */
  at: number;
}

interface GameState {
  /** Latest server snapshot for this player; undefined when not in a lobby. */
  view: PlayerView | undefined;
  /** Latest anonymous radar frame (a separate stream from the view). */
  radar: RadarPayload | undefined;
  /** True while a saved session is being resumed after (re)connecting. */
  resuming: boolean;
  notice: Notice | undefined;
  toasts: Toast[];
  /** The latest `task.reset`: an open minigame was dropped. */
  taskReset: TaskSignal | undefined;
  /** The latest `task.completed`, for the +N float. */
  taskDone: { seq: number; points: number } | undefined;
  /** The latest meeting call. */
  meetingAlarm: MeetingAlarm | undefined;
  setView: (view: PlayerView) => void;
  setRadar: (radar: RadarPayload) => void;
  clearView: () => void;
  setResuming: (resuming: boolean) => void;
  setNotice: (notice: Notice | undefined) => void;
  pushToast: (text: string) => void;
  signalTaskReset: (reason: TaskSignal['reason']) => void;
  signalTaskDone: (points: number) => void;
  signalMeetingAlarm: (by: string) => void;
  dismissToast: (id: number) => void;
}

let nextToastId = 1;

export const useGame = create<GameState>()((set) => ({
  view: undefined,
  radar: undefined,
  resuming: false,
  notice: undefined,
  toasts: [],
  taskReset: undefined,
  taskDone: undefined,
  meetingAlarm: undefined,
  setView: (view) =>
    set((s) => {
      // Ignore a stale snapshot for the same player (views carry an increasing `v`).
      if (s.view && s.view.me.id === view.me.id && view.v <= s.view.v) return s;
      return { view };
    }),
  setRadar: (radar) => set({ radar }),
  clearView: () => set({ view: undefined, radar: undefined }),
  setResuming: (resuming) => set({ resuming }),
  setNotice: (notice) => set({ notice }),
  pushToast: (text) => set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, text }] })),
  signalTaskReset: (reason) =>
    set((s) => ({ taskReset: { seq: (s.taskReset?.seq ?? 0) + 1, reason } })),
  signalTaskDone: (points) =>
    set((s) => ({ taskDone: { seq: (s.taskDone?.seq ?? 0) + 1, points } })),
  signalMeetingAlarm: (by) =>
    set((s) => ({ meetingAlarm: { seq: (s.meetingAlarm?.seq ?? 0) + 1, by, at: Date.now() } })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const TASK_RESET_COPY = {
  range: 'You moved away from the pin. The task was reset.',
  gps: 'GPS signal lost. The task was reset.',
  zone: 'You left the zone. The task was reset.',
  connection: 'Connection lost. The task was reset.',
  meeting: 'A meeting was called. The task was reset.',
  sabotage: 'Systems jammed. The task was reset.',
} as const;

const INFECT_FAILED_COPY = {
  range: 'Infect failed: you moved apart. No cooldown.',
  target: 'Infect failed: that player is no longer a target. No cooldown.',
  meeting: 'Infect cancelled by the meeting. No cooldown.',
} as const;

/** Toast copy for server events (UI_UX §4: short and imperative). */
export function toastFor(event: GameEvent): string | undefined {
  switch (event.type) {
    case 'lobby.countdownCancelled':
      return 'Countdown cancelled';
    case 'lobby.configChanged':
      return 'Settings changed. Everyone is un-readied.';
    case 'lobby.mapChanged':
      return 'Map changed. Everyone is un-readied.';
    case 'lobby.startFailed':
      return 'The area is too small to spread everyone out. The host needs to enlarge it.';
    case 'game.paused':
      return 'The host paused the game';
    case 'game.resumed':
      return 'Game on';
    case 'zone.warning':
      return 'Return to the zone';
    case 'zone.penalty':
      return `Out of bounds: −${event.points} ${event.points === 1 ? 'point' : 'points'}`;
    case 'task.reset':
      return TASK_RESET_COPY[event.reason];
    case 'task.expired':
      return 'Co-op task expired';
    case 'task.removed':
      return 'A task was swapped: its spot was reported unsafe';
    case 'task.revealed':
      return 'Pin revealed';
    case 'task.atPin':
      return 'You are at the pin';
    case 'task.completed':
      return undefined; // the +N float shows it
    case 'game.compromised':
      return 'Someone has been compromised';
    case 'infect.completed':
      return 'Exposed. Walk away to start the incubation.';
    case 'infect.failed':
      return INFECT_FAILED_COPY[event.reason];
    case 'sabotage.started':
    case 'meeting.called':
    case 'meeting.result':
    case 'lobby.countdown':
    case 'game.spawnStarted':
    case 'game.rolesRevealed':
    case 'game.playStarted':
    case 'game.ended':
      return undefined; // the screens change instead (the meeting has its own alarm and result)
  }
}
