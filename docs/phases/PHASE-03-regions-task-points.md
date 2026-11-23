# Phase 03: Regions, Sections, Task Points, Base and Visibility

**Goal:** the server splits the boundary into named regions, each with its own 9-section compass. It generates a task-point pool. The host reviews and edits the setup (rename regions, edit points, no-go zones, Base), and the lobby validates it. Visibility modes and bucketed region counts work.

**Depends on:** Phase 2.

**Read first:**
- [MAP_AND_REGIONS.md](../MAP_AND_REGIONS.md) (all of it, **the core spatial rule**)
- [CONFIG.md › Map](../CONFIG.md#map-regions-and-visibility)
- [ROLES.md › Visibility matrix](../ROLES.md#visibility-matrix) (positions rows)
- [PROTOCOL.md](../PROTOCOL.md) (Phase 3 events)
- [DECISIONS.md](../DECISIONS.md) ADR-007, ADR-008
- [reference/INFILTR8_NOTES.md](../reference/INFILTR8_NOTES.md)

**Skills to use:** `test-driven-development` (geometry is easy to get subtly wrong), `source-driven-development` (turf modules, polylabel), `doubt-driven-development` (test `sectionOf` against odd shapes), `frontend-ui-engineering`.

## Scope
- **In:** partition, section frame, section polygons, `sectionOf`, the pool, no-go zones, the Base, setup validation, region counts, the 3 visibility modes in the lobby radar, host setup wizard steps ②–⑤.
- **Out:** using these for tasks (Phase 5) or meetings (Phase 8).

## Tasks
- [x] **03.1 Sampling utilities** (`geo/sampling.ts`): seeded uniform points in a polygon minus holes (rejection sampling), and best-candidate sampling with minimum spacing. Test: every point is inside, spacing is respected, results are deterministic per seed.
- [x] **03.2 Region partition** (`geo/regions.ts`): k-means++ → `@turf/voronoi` → `@turf/intersect` clip → sliver merge → small-region retry, with auto k by area (CONFIG) and reading-order naming. Tests:
  - no overlaps (pairwise intersection area ≈ 0)
  - union area ≈ boundary area minus no-go area (within 1%)
  - deterministic for the same seed
  - works for a circle, a rectangle, an L-shape and a concave "C" shape
- [x] **03.3 Section frame** (`geo/sections.ts`):
  - origin = pole of inaccessibility (the `polylabel` package), with the fallbacks
  - ρ = distance from the origin to the furthest vertex
  - `sectionOf(point, regions)` → `{regionId, section} | null`
  - section polygons (wedge ∩ region, minus the centre disc)
  - section areas, and usable flags (`minSectionAreaM2`)

  Tests:
  - a point due NE of Region A's origin is `NE` of A **even when that point is in the global SW of the boundary**, which is the GDD's critical test
  - bearings exactly on the 22.5° borders are handled
  - the Centre radius is 0.35ρ
  - concave regions behave
- [x] **03.4 Task-point pool:** generated per usable section (`taskPointsPerSection`, `taskPointMinSpacingM`) and stored with `{id, lat, lng, regionId, section, source, disabled}`. Host edits: add (the server computes the section and rejects points outside the boundary or in a no-go zone), remove, regenerate.
- [x] **03.5 No-go zones and Base.** `lobby:setNoGoZones` validates the polygons, removes pool points inside them and recomputes the regions. `lobby:setBase` must be inside the boundary and outside no-go zones; its default is the centroid of the largest region snapped to the nearest pool point.
- [x] **03.6 Setup validation.** `validateSetup(lobby)` returns a list of missing or invalid items: boundary, Base, usable points ≥ 4 × players over ≥ 2 regions. The countdown requires it to be valid (RULES E39). Every setup change un-readies everyone.
- [x] **03.7 Region counts and visibility.**
  - Region counts are computed every 30 s, bucketed, include the viewer, and exclude spectators and stale players. They go into `view.game.regionCounts`, and are also shown in the lobby for testing.
  - The radar respects `playerVisibility`: `nearby` (40 m), `regions` (no dots) or `all`.
  - Extend the leak tests: in `regions` mode the radar is empty; dot flags stay public only.
- [x] **03.8 Host setup wizard.** Steps ① Boundary (from Phase 2) → ② Regions (count selector, regenerate, rename with inline edit) → ③ Task points (tap to add, tap a point to delete, regenerate; points coloured by region) → ④ No-go zones (polygon draw) → ⑤ Base (tap to place) → ⑥ Settings. Each step shows ✓ when valid. A "Preview sections" toggle draws the 9 sections of the selected region with labels.
- [x] **03.9 Player lobby map:** boundary, regions with labels, Base and region counts. Task points are visible in the lobby so everyone can review them for safety, and are hidden during play.
- [x] **03.10 E2E:** the host draws a boundary, sees N regions, renames one, deletes a point, places the Base, and the checklist turns green. The guest sees the same map.
- [x] **03.11 Wrap up.** Update the docs (MAP_AND_REGIONS if any algorithm detail changed, PROTOCOL, PROGRESS). Commit, tag, push.

## Acceptance criteria
- The GDD test passes: "A task assigned to North-East of Region A is not computed relative to the whole map", proved by the `sectionOf` tests.
- Regions never overlap, and they cover the area. The pool respects spacing and no-go zones.
- Setup validation blocks the start until everything is valid, and the lobby says exactly what is missing.
- The 3 visibility modes behave as specified. Region counts are bucketed and refresh every 30 s.

## Verification
```
pnpm verify && pnpm e2e
```
Use the Playwright MCP to screenshot the section preview for an irregular boundary, and check visually that the labels make sense.

## Manual steps for the human
None. (Optional: draw an area around your real campus on your phone and check that the regions look sensible.)

## Docs to update
MAP_AND_REGIONS.md, PROTOCOL.md, PROGRESS.md, DECISIONS.md.
