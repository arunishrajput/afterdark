import { useConnection } from '../../store';

export function ConnectionPill() {
  const status = useConnection((s) => s.status);
  const rttMs = useConnection((s) => s.rttMs);
  const connected = status === 'connected';
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface px-3 py-1.5 text-sm"
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${connected ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`}
      />
      <span data-testid="connection-status">{connected ? 'Connected ✓' : 'Connecting…'}</span>
      {connected && rttMs !== undefined && (
        <span data-testid="ping" className="font-mono text-xs text-muted">
          {Math.round(rttMs)} ms
        </span>
      )}
    </div>
  );
}
