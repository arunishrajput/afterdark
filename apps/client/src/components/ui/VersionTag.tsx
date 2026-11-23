import { useEffect, useState } from 'react';

import { fetchVersion } from '../../net/version';

/** Small build id (short commit SHA) for matching field-test notes to a deploy. */
export function VersionTag({ className = '' }: { className?: string }) {
  const [sha, setSha] = useState<string>();
  useEffect(() => {
    let live = true;
    void fetchVersion().then((v) => live && setSha(v));
    return () => {
      live = false;
    };
  }, []);
  if (!sha) return null;
  return (
    <span data-testid="app-version" className={`font-mono text-xs text-muted ${className}`}>
      build {sha}
    </span>
  );
}
