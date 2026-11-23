import { Button } from '../components/ui/Button';
import { reclaimSession } from '../net/socket';
import { type Notice, useGame } from '../store';

const COPY: Record<Notice['kind'], { title: string; body: string }> = {
  kicked: { title: 'You were removed', body: 'The host removed you from that lobby.' },
  replaced: {
    title: 'Open in another tab',
    body: 'AfterDark is running in another tab or window. Only one can play at a time.',
  },
  ended: { title: 'That lobby has ended', body: 'It closed while you were away.' },
};

export function NoticeScreen({ notice }: { notice: Notice }) {
  const setNotice = useGame((s) => s.setNotice);
  const { title, body } = COPY[notice.kind];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 data-testid="notice" className="font-display text-3xl font-bold">
        {title}
      </h1>
      <p className="text-muted">{body}</p>
      {notice.kind === 'replaced' ? (
        <Button onClick={reclaimSession}>Use here instead</Button>
      ) : (
        <Button onClick={() => setNotice(undefined)}>Back to home</Button>
      )}
    </main>
  );
}
