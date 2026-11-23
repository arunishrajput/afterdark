/** All live rooms by code: create, find, delete, and idle cleanup (RULES §3.9). */
import { DEFAULT_CONFIG } from '@afterdark/shared';

import { createRoomState } from '../engine/state';
import { type CodeSource, cryptoCodeSource, generateLobbyCode } from './lobbyCode';
import { Room } from './Room';

const MS_PER_S = 1000;
const MS_PER_MIN = 60 * MS_PER_S;

export interface RoomManagerDeps {
  now: () => number;
  allowTestMode: boolean;
  codeSource?: CodeSource;
  /** Called for every new room before its first command (wire views/effects here). */
  onCreate?: (room: Room) => void;
  /** Called after a room is removed (purge sessions here). */
  onDelete?: (code: string) => void;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  get size(): number {
    return this.rooms.size;
  }

  create(host: { playerId: string; username: string }): Room {
    const code = generateLobbyCode(this.deps.codeSource ?? cryptoCodeSource, (c) =>
      this.rooms.has(c),
    );
    const room = new Room(
      createRoomState({
        code,
        hostId: host.playerId,
        username: host.username,
        allowTestMode: this.deps.allowTestMode,
      }),
      { now: this.deps.now },
    );
    this.rooms.set(code, room);
    this.deps.onCreate?.(room);
    room.start(room.state.config.tickIntervalMs);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  delete(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.stop();
    this.rooms.delete(code);
    this.deps.onDelete?.(code);
  }

  /** Deletes rooms with nobody connected for `lobbyIdleTimeoutMin`. Returns the deleted codes. */
  sweep(): string[] {
    const now = this.deps.now();
    const deleted: string[] = [];
    for (const [code, room] of this.rooms) {
      const { emptySince, config } = room.state;
      if (emptySince !== undefined && now - emptySince >= config.lobbyIdleTimeoutMin * MS_PER_MIN) {
        this.delete(code);
        deleted.push(code);
      }
    }
    return deleted;
  }

  /** Starts the periodic idle sweep; returns a stop function. */
  startSweeper(intervalS: number = DEFAULT_CONFIG.lobbyIdleSweepS): () => void {
    const timer = setInterval(() => this.sweep(), intervalS * MS_PER_S);
    timer.unref();
    return () => clearInterval(timer);
  }

  closeAll(): void {
    for (const code of [...this.rooms.keys()]) this.delete(code);
  }
}
