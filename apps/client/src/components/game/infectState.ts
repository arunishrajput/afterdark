/** What the Infect button can say from the client's own data (the server still decides). */
import { distanceM, type PlayerView } from '@afterdark/shared';

export type InfectState = 'channel' | 'ready' | 'no-target' | 'cooldown' | 'oob' | 'gps';

/** Is a crew-looking dot within reach on the last radar frame? `undefined` when the radar cannot say. */
export function targetOnRadar(
  view: PlayerView,
  dots: readonly { lat: number; lng: number; flags: readonly string[] }[],
): boolean | undefined {
  const { playerVisibility, nearbyRadiusM, infectionRadiusM } = view.lobby.config;
  const here = view.me.location;
  const canSee =
    playerVisibility === 'all' ||
    (playerVisibility === 'nearby' && nearbyRadiusM >= infectionRadiusM);
  if (!canSee || !here) return undefined;
  return dots.some(
    (d) =>
      !d.flags.some((f) => f === 'ally' || f === 'exposed' || f === 'infected' || f === 'stale') &&
      distanceM(here, d) <= infectionRadiusM,
  );
}

export function infectStateOf(
  view: PlayerView,
  now: number,
  hasTarget: boolean | undefined,
): InfectState {
  const infect = view.me.imposter?.infect;
  if (infect?.channel) return 'channel';
  const quality = view.me.location?.quality;
  if (quality === undefined || quality !== 'good') return 'gps';
  if (view.me.zone?.oob) return 'oob';
  if (infect && infect.readyAt > now) return 'cooldown';
  if (hasTarget === false) return 'no-target';
  return 'ready';
}
