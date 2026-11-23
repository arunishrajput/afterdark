# Phase 00: Project Setup and Scaffolding

**Goal:** turn the docs-only folder into a git repo on GitHub with a working pnpm monorepo (client, server, shared). Strict TypeScript, linting, tests, Playwright and CI must all be green, and the client must show "Connected ✓" over Socket.IO.

**Depends on:** nothing. The docs in this repo already exist and are not yet committed.

**Read first:** [CLAUDE.md](../../CLAUDE.md), [ARCHITECTURE.md §2](../ARCHITECTURE.md#2-monorepo-layout-created-in-phase-0-grows-by-phase), [TESTING.md §1](../TESTING.md#1-commands-set-up-in-phase-0), [MANUAL_SETUP.md › Phase 0](../MANUAL_SETUP.md#phase-0-project-setup), [DECISIONS.md](../DECISIONS.md) (ADR-001, 025, 026).

**Skills to use:** `source-driven-development` (check current library setup against official docs; do not rely on memory for config formats), `git-workflow-and-versioning`, `ci-cd-and-automation`.

## Scope
- **In:** git init, GitHub remote, workspace scaffold, tooling, CI, hello-socket, tunnel script, Claude Code permissions allowlist.
- **Out:** any game feature.

## Tasks
- [ ] **00.1 Toolchain check.** Run `node -v`, `pnpm -v`, `git --version`, `gh auth status`, `which cloudflared`. Record the versions in PROGRESS.md › Environment. Choose the Node major for `.nvmrc` and `engines`: the active LTS installed (expected 24 or 26). It must be one Render supports; check Render's docs.
  - *Accept:* the versions are recorded.
- [ ] **00.2 Git init.** `git init -b main`. Add:
  - `.gitignore` (node_modules, dist, coverage, .env*, playwright-report, test-results, .DS_Store)
  - `.editorconfig`
  - `.nvmrc`
  - `.gitattributes` (`* text=auto eol=lf`)

  *Accept:* `git status` shows the docs as untracked.
- [ ] **00.3 First commit.** Commit every existing doc: `docs: add AfterDark specs, build plan and session protocol`.
- [ ] **00.4 GitHub repo.** Use **AskUserQuestion** to get the repo name (suggested `afterdark`) and visibility. Then run `gh repo create <name> --<visibility> --source=. --remote=origin --push`.
  - *Accept:* the remote exists and `main` is pushed.
- [ ] **00.5 Workspace root.** Create:
  - `package.json`, with `"private": true`, `packageManager` set to the installed pnpm version, `engines.node`, and the scripts `dev`, `build`, `test`, `test:watch`, `lint`, `format`, `typecheck`, `verify`, `e2e`, `tunnel`
  - `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `tools/*`)
  - `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022, bundler module resolution)
- [ ] **00.6 Lint and format.** ESLint flat config (typescript-eslint, react-hooks, react-refresh, import sorting) and Prettier (`printWidth` 100, single quotes). `pnpm lint` fails on errors.
- [ ] **00.7 `packages/shared`.** A TypeScript library (source consumed directly through workspace `exports`, with no build step unless one is needed), Vitest, and these placeholder modules:
  - `src/index.ts`
  - `src/config/defaults.ts` (copy the **full** default table from [CONFIG.md](../CONFIG.md) as a typed const)
  - `src/config/schema.ts` (zod schema with the ranges)
  - `src/rng.ts` (mulberry32 with a unit test)
  - `src/ids.ts` (random URL-safe IDs)

  Add zod as a dependency.
  - *Accept:* `pnpm --filter shared test` passes, including a test that the defaults parse against the schema.
- [ ] **00.8 `apps/server`.** Node + TypeScript using `tsx watch` in dev and `tsc` (or tsup) for the build. Set up:
  - Express with `GET /health` → `{ok:true}` and `GET /version` → `{sha}` (from env or `git rev-parse`)
  - Socket.IO on the same HTTP server
  - pino logger
  - `env.ts` with zod-validated env (`PORT=3000`, `NODE_ENV`, `LOG_LEVEL`, `ALLOW_TEST_MODE`)
  - `time:ping` handler (PROTOCOL)
  - an integration test that uses `socket.io-client` against an in-process server to check `time:ping` replies
  - *Accept:* the test passes.
- [ ] **00.9 `apps/client`.** Vite + React + TypeScript. Set up:
  - Tailwind (current major; follow the official Vite install guide)
  - Zustand
  - `socket.io-client`
  - Vite `server.proxy` for `/socket.io` → `http://localhost:3000` with `ws: true`
  - `server.host: true` and `server.allowedHosts` to allow `.trycloudflare.com`
  - `src/net/socket.ts`: a singleton socket
  - `App.tsx`: shows **"AfterDark"** plus "Connected ✓" or "Connecting…" from the socket state, and the measured ping
  - theme CSS variables from [UI_UX.md §1](../UI_UX.md#1-visual-identity-afterdark) in `styles/tokens.css`, with the `data-theme` switch
- [ ] **00.10 Dev orchestration.** Root `pnpm dev` runs the server and client in parallel (`pnpm -r --parallel dev` or `concurrently`). `pnpm build` builds shared (if needed), then the server and the client. `pnpm verify` = `lint && typecheck && test && build`.
- [ ] **00.11 Playwright.** Install it at the root with the `e2e/` folder, and install Chromium (`pnpm exec playwright install chromium`). Write the spec `e2e/smoke.spec.ts`: open the client and expect "Connected ✓". Use `webServer` to start `pnpm dev`, or start the server and the client preview.
- [ ] **00.12 CI.** Create `.github/workflows/ci.yml`. On push and PR to main:
  - checkout
  - pnpm/action-setup
  - setup-node using `.nvmrc`, with the pnpm cache
  - `pnpm install --frozen-lockfile`
  - `pnpm verify`
  - Playwright install
  - `pnpm e2e`
  - upload the report if it fails
- [ ] **00.13 Tunnel script.** Add `"tunnel": "cloudflared tunnel --url http://localhost:5173"`. Document it in the README dev section.
- [ ] **00.14 Claude Code permissions.** Create `.claude/settings.json` with an allowlist of safe, frequent commands:
  - `pnpm *`
  - `git status`, `git diff *`, `git log *`, `git add *`, `git commit *`, `git push*`, `git tag *`, `git pull*`
  - `gh run *`, `gh repo view*`
  - `node *`

  Keep anything destructive out of the allowlist. Tell the human what was added.
- [ ] **00.15 README.** A short pitch, a quickstart (`pnpm i`, `pnpm dev`), and links to the docs.
- [ ] **00.16 Wrap up.** Update PROGRESS.md (Phase 0 ✅, NEXT = Phase 1, environment, session log). Commit, tag `phase-00-done`, `git push --follow-tags`. Wait for CI with `gh run watch`, and fix anything red.

## Acceptance criteria
- A fresh clone running `pnpm install && pnpm verify` passes.
- `pnpm dev` → open http://localhost:5173 → "Connected ✓" with a ping value.
- `pnpm e2e` passes locally, and CI is green on GitHub.
- The repo is on GitHub with the `phase-00-done` tag.

## Verification
```
pnpm install && pnpm verify
pnpm e2e
gh run watch   # or: gh run list --limit 1
```
Optionally use the Playwright MCP to screenshot the connected page.

## Manual steps for the human
- Answer the repo name and visibility question.
- Approve permission prompts.
- Only if `gh` reports logged out: `! gh auth login`.

## Docs to update
PROGRESS.md (environment + status), README.md. Update ARCHITECTURE.md §2 only if the layout differed from the plan.
