import { lazy, Suspense, useState } from 'react';

import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

const QrCode = lazy(() => import('./QrCode'));
const COPIED_MS = 1800;

function shareUrl(code: string): string {
  return `${location.origin}/?code=${code}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(code);

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    }
  };

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'AfterDark', text: `Join my AfterDark game: ${code}`, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // user closed it
      }
    }
    await copy();
  };

  return (
    <section aria-label="Lobby code" className="rounded-2xl border border-white/10 bg-surface p-4">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Lobby code</p>
      <p
        data-testid="lobby-code"
        className="mt-1 font-mono text-5xl font-semibold tracking-[0.15em] select-all"
      >
        {code}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => void copy()} aria-live="polite">
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
        <Button variant="secondary" onClick={() => void share()}>
          Share
        </Button>
        <Button variant="secondary" onClick={() => setQr(true)}>
          QR
        </Button>
      </div>
      <Sheet open={qr} title="Scan to join" onClose={() => setQr(false)}>
        <div className="mx-auto max-w-64">
          <Suspense fallback={<div className="aspect-square w-full rounded-xl bg-white/10" />}>
            {qr && <QrCode value={url} label={`QR code to join lobby ${code}`} />}
          </Suspense>
        </div>
        <p className="mt-3 text-center font-mono tracking-widest text-muted">{code}</p>
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setQr(false)}>
          Close
        </Button>
      </Sheet>
    </section>
  );
}
