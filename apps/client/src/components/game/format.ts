const MS_PER_S = 1000;
const S_PER_MIN = 60;
const PAD = 2;

/** `mm:ss` of a duration in ms, never negative (rounds up so 0:01 means "about to end"). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / MS_PER_S));
  const m = Math.floor(total / S_PER_MIN);
  const s = total % S_PER_MIN;
  return `${String(m).padStart(PAD, '0')}:${String(s).padStart(PAD, '0')}`;
}

/** Metres as "37 m" or "1.2 km". */
export function formatDistance(m: number): string {
  const KM = 1000;
  if (m < KM) return `${Math.round(m)} m`;
  return `${(m / KM).toFixed(1)} km`;
}
