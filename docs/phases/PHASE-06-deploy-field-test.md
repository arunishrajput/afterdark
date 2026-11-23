# Phase 06: Deploy and First Field Test

**Goal:** AfterDark runs at a public HTTPS URL on Render, with auto-deploy from `main`, health and version endpoints, and a passing Playwright smoke test against production. The human runs the first real-phone field test, and its findings go into PROGRESS.md.

**Depends on:** Phase 5.

**Read first:**
- [ARCHITECTURE.md §9–10](../ARCHITECTURE.md#9-deployment-phase-6)
- [MANUAL_SETUP.md › Phase 6](../MANUAL_SETUP.md#phase-6-deployment-on-render-free)
- [TESTING.md §6](../TESTING.md#6-field-test-checklist-the-human-runs-this-from-phase-6)
- [DECISIONS.md](../DECISIONS.md) ADR-025

**Skills to use:** `shipping-and-launch`, `ci-cd-and-automation`, `source-driven-development` (check Render Blueprint syntax and the Node version support in current docs), `observability-and-instrumentation`.

## Scope
- **In:** production build and serving, `render.yaml`, env config, security headers, a production smoke test, a short "Deploying" section in the README, field-test support.
- **Out:** custom domains, scaling out.

## Tasks
- [ ] **06.1 Production server:**
  - serve `apps/client/dist` with immutable caching for hashed assets and `no-cache` for `index.html` and the service worker
  - SPA fallback to `index.html`
  - `trust proxy`
  - helmet with a CSP that allows the CARTO/OSM tile hosts and Google Fonts
  - compression
  - Socket.IO restricted to the same origin
  - graceful shutdown on SIGTERM (notify clients with an event, then close)
- [ ] **06.2 Build pipeline:** `pnpm build` produces `apps/server/dist` and `apps/client/dist`. Root `start` runs `node apps/server/dist/index.js`. `/version` returns `RENDER_GIT_COMMIT` when it is set.
- [ ] **06.3 `render.yaml` blueprint:**
  - web service, free plan, region nearest the users (choose `singapore` for India and note it)
  - build: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
  - start: `pnpm start`
  - health check: `/health`
  - env: `NODE_ENV=production`, `LOG_LEVEL=info`, `ALLOW_TEST_MODE=true` (needed for demos)
  - auto-deploy on
- [ ] **06.4 Observability, minimal:** pino JSON logs including room code, event type and duration (never coordinates or tokens); request logging for HTTP; an error boundary per room so an exception in one room's tick is logged and contained without crashing the process. Add a test.
- [ ] **06.5 Hand-off to the human:** commit and push, then **stop and ask** the human to do the MANUAL_SETUP Phase 6 steps 1–4 and paste back the service URL. Use AskUserQuestion, or write the steps to PROGRESS.md and wait.
- [ ] **06.6 Production smoke test:** create `e2e/prod-smoke.spec.ts`, parameterised by `BASE_URL`. It checks:
  - `/health` and `/version`
  - the page loads and shows "Connected ✓"
  - creating a lobby in testMode, then `dev:addBots` (3 bots), reaches the playing HUD

  Run it against the Render URL and record the result.
- [ ] **06.7 README:** deployment section, the live URL, and the cold-start note.
- [ ] **06.8 Field test kit:** make sure the Lobby shows the app version (short SHA) so field notes can be matched to a build. Pre-fill a PROGRESS.md "Field-test notes" template from TESTING §6.
- [ ] **06.9 Wrap up.** PROGRESS (URL, smoke result, field-test request). Commit, tag, push. Remind the human to run the field test before the next session if they can; it is not blocking.

## Acceptance criteria
- A public HTTPS URL serves the app. WebSockets connect over WSS.
- A push to `main` triggers a redeploy, and `/version` matches the latest commit.
- The prod smoke test passes against the live URL.
- Logs contain no coordinates or tokens.

## Verification
```
BASE_URL=https://<service>.onrender.com pnpm exec playwright test e2e/prod-smoke.spec.ts
curl -s https://<service>.onrender.com/version
```

## Manual steps for the human
1. MANUAL_SETUP › Phase 6: create a Render account and apply the Blueprint, then paste the URL to Claude.
2. Run the field test ([TESTING §6](../TESTING.md#6-field-test-checklist-the-human-runs-this-from-phase-6)) with 2+ phones when convenient, and paste the notes into PROGRESS.md.

## Docs to update
README.md, PROGRESS.md (live URL), ARCHITECTURE.md §9 (if anything differs), DECISIONS.md (region choice).
