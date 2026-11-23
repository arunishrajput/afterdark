/** The running server build, so field-test notes can be matched to a commit. */
const SHORT_SHA_LENGTH = 7;

/** `1a2b3c4…` for a git SHA; anything else (`unknown`, a tag) is shown as is. */
export function shortSha(sha: string): string {
  return /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, SHORT_SHA_LENGTH) : sha;
}

/** Reads `/version` once per page load; undefined if the server is unreachable. */
let cached: Promise<string | undefined> | undefined;
export function fetchVersion(): Promise<string | undefined> {
  cached ??= fetch('/version')
    .then((r) => (r.ok ? (r.json() as Promise<{ sha?: unknown }>) : undefined))
    .then((body) => (typeof body?.sha === 'string' ? shortSha(body.sha) : undefined))
    .catch(() => undefined);
  return cached;
}
