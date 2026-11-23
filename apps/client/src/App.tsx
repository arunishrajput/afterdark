import { useConnection } from './store';

export function App() {
  const status = useConnection((s) => s.status);
  const rttMs = useConnection((s) => s.rttMs);
  const connected = status === 'connected';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-5xl font-bold tracking-tight text-text drop-shadow-[0_0_18px_var(--accent-glow)]">
        AfterDark
      </h1>
      <p className="text-muted">Among Us, played on your feet.</p>

      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-full border border-white/10 bg-surface px-5 py-3"
      >
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`}
        />
        <span data-testid="connection-status">{connected ? 'Connected ✓' : 'Connecting…'}</span>
        {connected && rttMs !== undefined && (
          <span data-testid="ping" className="font-mono text-sm text-muted">
            {Math.round(rttMs)} ms
          </span>
        )}
      </div>
    </main>
  );
}
