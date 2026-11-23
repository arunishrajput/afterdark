import { execFileSync } from 'node:child_process';

/** Commit SHA: Render sets RENDER_GIT_COMMIT; locally fall back to git. */
export function resolveSha(env: Record<string, string | undefined>): string {
  const fromEnv = env.GIT_SHA ?? env.RENDER_GIT_COMMIT;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}
