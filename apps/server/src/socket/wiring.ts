/**
 * Connects a Room to its sockets: applies engine effects (events, removed
 * players) and pushes changed views. Every send is per player: no room
 * broadcasts (PROTOCOL › Conventions).
 */
import { randomId } from '@afterdark/shared';

import { BotDriver } from '../rooms/bots';
import type { Room } from '../rooms/Room';
import { ViewEmitter } from '../rooms/ViewEmitter';
import { buildRadar } from '../views/radar';
import { type GatewayContext, socketOfPlayer } from './context';

export function attachRoom(ctx: GatewayContext, room: Room, now: () => number): void {
  const emitter = new ViewEmitter({
    now,
    throttleMs: room.state.config.viewThrottleMs,
    send: (playerId, view) => socketOfPlayer(ctx, playerId)?.emit('view', view),
  });
  ctx.emitters.set(room.code, emitter);
  const bots = new BotDriver(room, randomId);
  ctx.bots.set(room.code, bots);
  room.onTick((state, at) => bots.tick(state, at));

  // Radar goes out once per `radarIntervalMs` bucket on the room's tick, to
  // every connected player: each gets their own anonymous dots (never a broadcast).
  let lastRadarBucket = -1;
  room.onTick((state, at) => {
    const bucket = Math.floor(at / state.config.radarIntervalMs);
    if (bucket === lastRadarBucket) return;
    lastRadarBucket = bucket;
    for (const p of state.players) {
      if (!p.connected) continue;
      socketOfPlayer(ctx, p.id)?.volatile.emit('radar', {
        dots: buildRadar(state, p.id, at),
        at,
      });
    }
  });

  room.subscribe((state, effects) => {
    for (const effect of effects) {
      if (effect.kind === 'event') {
        const ids =
          effect.to === 'all'
            ? state.players.filter((p) => p.connected).map((p) => p.id)
            : effect.to;
        for (const id of ids) socketOfPlayer(ctx, id)?.emit('event', effect.event);
        continue;
      }
      // A player left or was kicked: end their session and release their socket.
      const socket = socketOfPlayer(ctx, effect.playerId);
      ctx.sessions.revoke(effect.playerId, effect.reason);
      emitter.forget(effect.playerId);
      if (socket) {
        socket.data = {};
        if (effect.reason === 'kicked') {
          socket.emit('kicked', { reason: 'kicked' });
          socket.disconnect(true);
        }
      }
      ctx.logger.info(
        { code: state.code, playerId: effect.playerId, reason: effect.reason },
        'player removed',
      );
    }
    emitter.update(state);
    if (state.players.length === 0) ctx.rooms.delete(state.code);
  });
}
