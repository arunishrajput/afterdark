# AfterDark 🌙

**Among Us played with your feet.** AfterDark is a real-world, GPS-based social-deduction game that runs in your phone's browser as an installable PWA.

- **Crew** follow directions like "North-East of Region A" to hidden task spots and solve quick minigames to reach the team target.
- **Imposters** secretly infect players by staying close to them, jam tasks, plant fake tasks, and camouflage their screens to bluff in co-op tasks.
- **Anyone** can call an emergency meeting: everyone gathers at the Base, argues face to face, and votes someone out.

No accounts and no install: share a 6-letter code and play.

> Built for the CodeNMode hackathon at SIT, written entirely with Claude Code, one phase per session.

## Status
See [PROGRESS.md](PROGRESS.md). The project is being built in phases, listed in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## Docs
| | |
|---|---|
| Product | [PRD](docs/PRD.md) · [Original concept](docs/CONCEPT.md) · [INFILTR8 notes](docs/reference/INFILTR8_NOTES.md) |
| Game design | [Rules](docs/RULES.md) · [Roles & visibility](docs/ROLES.md) · [Scoring](docs/SCORING.md) · [Config](docs/CONFIG.md) · [Map & regions](docs/MAP_AND_REGIONS.md) · [Tasks](docs/TASKS.md) · [Meetings](docs/MEETINGS.md) |
| Engineering | [Architecture](docs/ARCHITECTURE.md) · [Protocol](docs/PROTOCOL.md) · [UI/UX](docs/UI_UX.md) · [Testing](docs/TESTING.md) · [Decisions](docs/DECISIONS.md) |
| Process | [CLAUDE.md](CLAUDE.md) · [Build plan](docs/BUILD_PLAN.md) · [Manual setup](docs/MANUAL_SETUP.md) |

[![CI](https://github.com/arunishrajput/afterdark/actions/workflows/ci.yml/badge.svg)](https://github.com/arunishrajput/afterdark/actions/workflows/ci.yml)

## Quickstart
Requires Node 24+ (see `.nvmrc`) and pnpm 11 (`corepack enable` picks up the pinned version).
```bash
pnpm install
pnpm dev        # server :3000 + client :5173 → open http://127.0.0.1:5173
pnpm verify     # lint + typecheck + test + build
pnpm e2e        # Playwright (first run: pnpm exec playwright install chromium)
```
You should see **AfterDark · Connected ✓** with a ping in milliseconds.

## Development
| Command | What it does |
|---|---|
| `pnpm dev` | Game server (`tsx watch`, :3000) and Vite client (:5173) in parallel. Vite proxies `/socket.io` to the server. |
| `pnpm test` / `pnpm test:watch` | Vitest across `packages/*`, `apps/*`, `tools/*`. |
| `pnpm lint` / `pnpm format` | ESLint (type-aware) + Prettier check / autofix. |
| `pnpm typecheck` | `tsc --noEmit` in every package. |
| `pnpm build` | Bundles the server (tsup) and the client (Vite). |
| `pnpm e2e` | Playwright smoke tests; starts the dev servers if they aren't running. |
| `pnpm tunnel` | HTTPS quick tunnel to the dev client with cloudflared, for testing GPS on a real phone. |

**Testing on a phone:** phone browsers only allow GPS on HTTPS pages. Run `pnpm dev`, then `pnpm tunnel` in a second terminal, and open the `https://….trycloudflare.com` URL it prints on your phone. The URL changes each time. Full steps: [MANUAL_SETUP.md](docs/MANUAL_SETUP.md#phase-2-onward-testing-on-your-real-phone-optional-but-recommended).

**Layout:** `apps/client` (React PWA), `apps/server` (authoritative Socket.IO server), `packages/shared` (config, protocol schemas, RNG, IDs), `e2e/` (Playwright). See [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploying
AfterDark is one Node process: it serves the built client and the Socket.IO server on the same port, so there is no CORS and HTTPS/WSS comes from the host. It deploys to [Render](https://render.com) from [`render.yaml`](render.yaml) (free plan, region `singapore`, auto-deploy on every push to `main`).

**Live URL:** <https://afterdark-24gx.onrender.com>

| | |
|---|---|
| Build / start | `corepack enable && pnpm install --frozen-lockfile && pnpm build`, then `pnpm start` (`node apps/server/dist/index.js`) |
| Health / build id | `GET /health` → `{"ok":true}`; `GET /version` → `{"sha":"<git commit>"}` (from `RENDER_GIT_COMMIT`). The lobby and home screen show `build <short sha>`. |
| Env | `NODE_ENV=production`, `LOG_LEVEL=info`, `ALLOW_TEST_MODE=true` (bots and the GPS simulator for demos), `PORT` (set by Render) |
| Try it locally | `pnpm build && NODE_ENV=production ALLOW_TEST_MODE=true PORT=3100 pnpm start` |
| Smoke test | `BASE_URL=https://<service>.onrender.com pnpm exec playwright test e2e/prod-smoke.spec.ts` |

**Cold start:** the free tier sleeps after about 15 minutes idle, and the first load then takes up to a minute. Open the URL a couple of minutes before a demo or field test. A deploy restarts the process, so running lobbies end (state is in memory by design); players see "The server is restarting" first.

Steps for the human: [MANUAL_SETUP.md › Phase 6](docs/MANUAL_SETUP.md#phase-6-deployment-on-render-free).

## Credits
Map data © OpenStreetMap contributors, tiles © OpenStreetMap.
