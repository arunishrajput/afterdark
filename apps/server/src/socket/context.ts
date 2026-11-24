/** Shared plumbing for socket handlers: rooms, sessions, emitters and binding. */
import type { Command, CommandReply } from '../engine/types';
import type { Logger } from '../logger';
import type { BotDriver } from '../rooms/bots';
import type { Room } from '../rooms/Room';
import type { RoomManager } from '../rooms/RoomManager';
import type { SessionRegistry } from '../rooms/sessions';
import type { ViewEmitter } from '../rooms/ViewEmitter';
import { HandlerError } from './handler';
import type { LobbyCreateGuard } from './lobbyLimits';
import type { GameIo, GameSocket } from './types';

export interface GatewayContext {
  io: GameIo;
  logger: Logger;
  rooms: RoomManager;
  sessions: SessionRegistry;
  emitters: Map<string, ViewEmitter>;
  /** In-process test bots per room (`dev:addBots`). */
  bots: Map<string, BotDriver>;
  /** Per-address and server-wide lobby creation limits (ADR-107). */
  createGuard: LobbyCreateGuard;
}

export function socketById(
  ctx: GatewayContext,
  socketId: string | undefined,
): GameSocket | undefined {
  return socketId === undefined ? undefined : ctx.io.sockets.sockets.get(socketId);
}

export function socketOfPlayer(ctx: GatewayContext, playerId: string): GameSocket | undefined {
  return socketById(ctx, ctx.sessions.socketOf(playerId));
}

/** The room and player this socket is bound to, or NOT_FOUND. */
export function requireBinding(
  ctx: GatewayContext,
  socket: GameSocket,
): { room: Room; playerId: string } {
  const { playerId, code } = socket.data;
  const room = code === undefined ? undefined : ctx.rooms.get(code);
  if (!room || playerId === undefined) {
    socket.data = {};
    throw new HandlerError('NOT_FOUND', 'You are not in a lobby');
  }
  return { room, playerId };
}

export function requireUnbound(socket: GameSocket): void {
  if (socket.data.playerId !== undefined) {
    throw new HandlerError('NOT_ALLOWED', 'Leave your current lobby first');
  }
}

/** Runs a command; a rule rejection becomes the ack's error code. */
export function run(room: Room, cmd: Command): void {
  const res = room.dispatch(cmd);
  if (!res.ok) throw new HandlerError(res.code, res.message);
}

/** Like `run`, and returns what the command answers its caller with (never sent to anyone else). */
export function runForReply(room: Room, cmd: Command & { playerId: string }): CommandReply {
  const res = room.dispatch(cmd);
  if (!res.ok) throw new HandlerError(res.code, res.message);
  for (const e of res.effects) {
    if (e.kind === 'reply' && e.playerId === cmd.playerId) return e.reply;
  }
  throw new HandlerError('INTERNAL', 'The command gave no reply');
}

/**
 * Binds the socket to the player. The newest socket wins: an older one gets
 * `kicked {reason:'replaced'}` and is disconnected (ARCHITECTURE §6).
 */
export function bindSocket(
  ctx: GatewayContext,
  socket: GameSocket,
  room: Room,
  playerId: string,
): void {
  const previous = socketById(ctx, ctx.sessions.bind(playerId, socket.id));
  if (previous) {
    previous.data = {}; // so its disconnect handler doesn't mark the player offline
    previous.emit('kicked', { reason: 'replaced' });
    previous.disconnect(true);
  }
  socket.data = { playerId, code: room.code };
}

/** Pushes the player's current view straight away (after create, join or resume). */
export function sendViewNow(ctx: GatewayContext, room: Room, playerId: string): void {
  ctx.emitters.get(room.code)?.resend(room.state, playerId);
}
