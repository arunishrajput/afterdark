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

## Quickstart (available after Phase 0)
```bash
pnpm install
pnpm dev        # server :3000, client :5173
pnpm verify     # lint + typecheck + test + build
```

## Credits
Map data © OpenStreetMap contributors, tiles © CARTO.
