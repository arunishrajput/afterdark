import { playSound, useMuted } from '../../net/cues';

/** Sound on/off, remembered on this device. Vibration is not affected. */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setMuted] = useMuted();
  return (
    <button
      type="button"
      data-testid="sound-toggle"
      aria-pressed={!muted}
      aria-label="Sound"
      onClick={() => {
        setMuted(!muted);
        if (muted) playSound('revealed'); // a sample, so "on" is audible right away
      }}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-surface px-3 text-sm font-semibold ${className}`}
    >
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      <span>Sound {muted ? 'off' : 'on'}</span>
    </button>
  );
}
