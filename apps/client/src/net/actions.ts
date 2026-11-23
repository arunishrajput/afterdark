/** Player intents. The server decides; the UI waits for the next view. */
import type {
  BoundaryInput,
  GameConfigEditablePatch,
  LatLng,
  LobbyEditTaskPointsPayload,
  LobbyRegenerateRegionsPayload,
  Position,
} from '@afterdark/shared';

import { useGame } from '../store';
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
