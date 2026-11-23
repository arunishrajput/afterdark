import { DEFAULT_CONFIG, usernameSchema } from '@afterdark/shared';
import { type FormEvent, useId, useState } from 'react';

import { Button } from '../components/ui/Button';
import { createLobby, joinLobby } from '../net/actions';
import { messageFor } from '../net/errors';
import type { Entry } from './Home';

/** RULES §3.2 / PRD §8: the notice every player must accept to join. */
export const SAFETY_NOTICE =
  'I will play in safe public places, watch for traffic, stop before using my phone, and never trespass.';

export function EntryForm({ entry, onBack }: { entry: Entry; onBack: () => void }) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const nameId = useId();
  const hintId = useId();

  const parsed = usernameSchema.safeParse(name);
  const nameError = touched && !parsed.success ? parsed.error.issues[0]?.message : undefined;
  const canSubmit = parsed.success && accepted && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.success || !accepted) return;
    setBusy(true);
    setError(undefined);
    const res =
      entry.mode === 'create'
        ? await createLobby(parsed.data)
        : await joinLobby(entry.code, parsed.data);
    setBusy(false);
    if (!res.ok) setError(messageFor(res.code)); // on success the lobby view takes over
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Button variant="ghost" className="-ml-2 self-start" onClick={onBack}>
        ← Back
      </Button>
      <h1 className="mt-6 font-display text-3xl font-bold">
        {entry.mode === 'create' ? 'Create a game' : 'Join game'}
      </h1>
      {entry.mode === 'join' && (
        <p className="mt-1 text-muted">
          Lobby <span className="font-mono tracking-widest text-text">{entry.code}</span>
        </p>
      )}

      <form onSubmit={(e) => void submit(e)} className="mt-8 flex flex-1 flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="font-medium">
            Your name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={DEFAULT_CONFIG.usernameMaxLen + 8}
            autoComplete="nickname"
            enterKeyHint="go"
            aria-invalid={nameError !== undefined}
            aria-describedby={hintId}
            className="min-h-12 rounded-xl border border-white/15 bg-surface px-4 text-lg focus:border-accent focus:outline-none aria-invalid:border-danger"
          />
          <p id={hintId} className={`text-sm ${nameError ? 'text-danger' : 'text-muted'}`}>
            {nameError ??
              `${DEFAULT_CONFIG.usernameMinLen}–${DEFAULT_CONFIG.usernameMaxLen} letters, digits, spaces, _ . -`}
          </p>
        </div>

        <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-surface p-4">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-medium">Safety first</span>
            <span className="text-sm text-muted">{SAFETY_NOTICE}</span>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={!canSubmit} className="mt-auto w-full text-lg">
          {busy ? 'Connecting…' : entry.mode === 'create' ? 'Create lobby' : 'Join lobby'}
        </Button>
      </form>
    </main>
  );
}
