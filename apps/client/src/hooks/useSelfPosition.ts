import type { PlayerView } from '@afterdark/shared';

import type { SelfPosition } from '../components/map/MapView';
import { useLocation } from '../store/location';

/** The device's own fix is smoother than the server's echo of it; fall back to the echo after a reload. */
export function useSelfPosition(view: PlayerView): SelfPosition | undefined {
  const fix = useLocation((s) => s.fix);
  const pos = fix ?? view.me.location;
  if (!pos) return undefined;
  return {
    lat: pos.lat,
    lng: pos.lng,
    accuracy: pos.accuracy,
    ...(fix?.heading === undefined ? {} : { heading: fix.heading }),
    oob: view.me.location?.oob ?? false,
  };
}
