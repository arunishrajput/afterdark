/**
 * Sends each player's view only when it changed, at most once per
 * `viewThrottleMs` (ARCHITECTURE §4). The latest view always wins: a change
 * inside the throttle window is sent when the window ends.
 */
import type { PlayerView } from '@afterdark/shared';

import type { RoomState } from '../engine/state';
import { type PlayerViewBody, projectView } from '../views/projectView';

interface Track {
  /** JSON of the last body we decided to send; equal JSON → unchanged view. */
  fingerprint?: string;
  body?: PlayerViewBody;
  v: number;
  lastSentAt?: number;
  timer?: ReturnType<typeof setTimeout>;
}

export interface ViewEmitterDeps {
  now: () => number;
  throttleMs: number;
  send: (playerId: string, view: PlayerView) => void;
}

export class ViewEmitter {
  private readonly tracks = new Map<string, Track>();

  constructor(private readonly deps: ViewEmitterDeps) {}

  /** Recompute every connected player's view and send the ones that changed. */
  update(state: RoomState): void {
    for (const p of state.players) {
      if (!p.connected) continue;
      const body = projectView(state, p.id, this.deps.now());
      const fingerprint = JSON.stringify(body);
      const t = this.track(p.id);
      if (t.fingerprint === fingerprint) continue;
      t.fingerprint = fingerprint;
      t.body = body;
      t.v += 1;
      this.schedule(p.id, t);
    }
  }

  /** Send this player's current view now, ignoring the throttle (a socket just bound). */
  resend(state: RoomState, playerId: string): void {
    const t = this.track(playerId);
    const body = projectView(state, playerId, this.deps.now());
    t.fingerprint = JSON.stringify(body);
    t.body = body;
    t.v += 1;
    this.flush(playerId, t);
  }

  forget(playerId: string): void {
    clearTimeout(this.tracks.get(playerId)?.timer);
    this.tracks.delete(playerId);
  }

  dispose(): void {
    for (const id of [...this.tracks.keys()]) this.forget(id);
  }

  private track(playerId: string): Track {
    let t = this.tracks.get(playerId);
    if (!t) {
      t = { v: 0 };
      this.tracks.set(playerId, t);
    }
    return t;
  }

  private schedule(playerId: string, t: Track): void {
    if (t.timer) return; // already queued; it will send the latest body
    const elapsed = t.lastSentAt === undefined ? Infinity : this.deps.now() - t.lastSentAt;
    if (elapsed >= this.deps.throttleMs) {
      this.flush(playerId, t);
      return;
    }
    t.timer = setTimeout(() => this.flush(playerId, t), this.deps.throttleMs - elapsed);
  }

  private flush(playerId: string, t: Track): void {
    clearTimeout(t.timer);
    delete t.timer;
    if (!t.body) return;
    const serverNow = this.deps.now();
    t.lastSentAt = serverNow;
    // Envelope + our own allow-listed body (not a server object).
    this.deps.send(playerId, { v: t.v, serverNow, ...t.body });
  }
}
