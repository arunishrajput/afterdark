# Map, Regions, Sections and Visibility

All geometry runs on the **server** (and in `packages/shared/src/geo/` for previews), using [turf.js](https://turfjs.org) modules. Coordinates are WGS84 `[lng, lat]` in GeoJSON and `{lat, lng}` in the app's types. Convert only at the edges. Numbers come from [CONFIG.md](CONFIG.md).

## 1. Host setup flow (lobby)
1. **Boundary:** the host draws a **polygon** or a **circle** with Leaflet-Geoman. A circle is turned into a 64-sided polygon on the server. It is checked to be one simple polygon (no self-intersections) with area between `minBoundaryAreaM2` (15,000 m²) and `maxBoundaryAreaM2` (3 km²).
2. **Regions** are generated automatically (§2). The host can set the count to auto or 2–6, regenerate with a new seed, and rename any region (max 20 characters; default names `Region A`, `Region B` …).
3. The **task-point pool** is generated automatically (§4). The host can delete points (unsafe or inaccessible ones), add points by tapping, and regenerate.
4. **No-go zones** (optional): the host draws polygons for roads, water, private property and the like. Pool points inside them are removed, and spawns and fakes can't be placed there. A player inside one counts as out of bounds.
5. **Base:** the host places one meeting point inside the boundary and outside no-go zones. The default is the centroid of the largest region, snapped to the nearest pool point. Meetings gather here.
6. **Validation:** setup is valid when the boundary is valid, the Base is set, and there are at least `minTaskPointsPerPlayer (4) × playerCount` **usable** pool points (enabled, in a section of at least `minSectionAreaM2`) spread over at least `minRegionsWithPoints` (2) regions. The lobby checklist lists any problems, using the same function as the server (`validateSetup`).

In the app the host works through these as a wizard (① Boundary → ⑥ Settings, each step ✓ when valid) with a "Preview sections" toggle that draws the 9 sections of a region. Everyone else sees the same map: boundary, regions with name and bucketed count, task points (for a safety review) and the Base. Task points are not sent once the lobby is over. Every setup change makes the server re-validate, and the countdown is cancelled if the setup stops being valid.

Every setup change un-readies all players (RULES §3.6). Setup data is public, since every player sees the map.

## 2. Region partitioning
Algorithm, deterministic for a given seed:
All of it runs on a flat plane in metres around the area's centre (ADR-044), then converts back to `[lng, lat]` (rounded to 1e-7°).
1. Sample `regionSampleCount` (400) uniformly random points inside the playable area (boundary minus no-go zones), using seeded rejection sampling over the bounding box.
2. Run **k-means** with k = `regionCount` (auto rule in CONFIG) for `regionKmeansIterations` (20) iterations, seeded, with k-means++ initialisation.
3. Build a **Voronoi** diagram of the k centroids with `@turf/voronoi`, over the area's bounding box plus a margin. Each cell is paired with the centroid it encloses, not trusted by order.
4. **Clip** each cell to the playable area with `@turf/intersect`. If a clipped cell is a MultiPolygon, keep its largest part; every other part joins the neighbouring region it shares the longest edge with (ADR-049). A part that borders no region stays with its own region as an island. Parts under 1 m² are dropped.
5. Drop any region smaller than `minRegionAreaRatio` (10%) of the average and re-run with k−1 (never below 2). Regions are named in reading order, `Region A`, `Region B`…, and given ids `r1`, `r2`…: west→east by centroid, then north→south.

The seed is stored in the room (`setup.seed`). "Regenerate" uses the host's seed or the next one in a hash chain, so a layout can always be reproduced. A region is one polygon, or several when a no-go zone splits it.

Regions must not overlap and must cover the boundary, minus no-go zones. Tests check both.

## 3. The 9-section local compass (the core spatial rule)
**Every region has its own compass.** "North-East of Region A" means the NE section *of Region A*, never NE of the whole map or the world.

For a region R:
- **Origin O:** the region's *pole of inaccessibility* (the interior point furthest from the edge), from the `polylabel` algorithm run on the region's flat-plane polygon (holes included); for a multi-part region the part with the largest clearance wins. Fallbacks: the centroid, and if that falls outside R, any point sampled inside R.
- **Radius ρ:** the distance from O to the furthest vertex of R.
- **Centre section:** the points of R within `sectionCentreRatio × ρ` (0.35ρ) of O.
- **Compass sections:** every other point p in R is placed by its bearing θ from O, measured from **true north** (`@turf/bearing`, normalised to [0, 360)):

| Section | Bearing range |
|---|---|
| N | [337.5, 360) ∪ [0, 22.5) |
| NE | [22.5, 67.5) |
| E | [67.5, 112.5) |
| SE | [112.5, 157.5) |
| S | [157.5, 202.5) |
| SW | [202.5, 247.5) |
| W | [247.5, 292.5) |
| NW | [292.5, 337.5) |

- **Section polygons**, used for map highlighting and area checks, are built by intersecting R with a wedge polygon from O (radius 2ρ), with the centre disc cut out (`sectionShapes()`). They are computed on the flat plane, so they differ from `sectionOf` by under about 1.5° of bearing at a wedge border (ADR-044). The server stores only each section's area; the client rebuilds the polygons for the preview with the same function.
- A section with area below `minSectionAreaM2` (400 m²), or with no usable pool points, is **unusable**: tasks are never sent there. The host preview greys it out (`usable` in the view).
- `sectionOf(point, regions, centreRatio)` returns `{regionId, section}` (section is `N`…`NW` or `C` for the centre) or `null` if the point is outside every region. A point on a border shared by two regions belongs to the earlier region in the list. Bearings exactly on a 22.5° border belong to the clockwise section (`22.5° → NE`, `337.5° → N`). It is a pure function with unit tests, including concave, L-shaped, holed, split and thin regions, and the GDD's test: a point due NE of Region A's origin is NE of A even when it is in the global SW of the boundary.

**Server entry check (Stage 2 reveal):** a player has entered their task's section after `sectionEntryHoldS` (3 s) of consecutive good fixes (accuracy ≤ 30 m, not stale) for which `sectionOf` returns the target. A fix that is outside the section but within its accuracy radius of the edge doesn't reset the hold (**hysteresis**). Entry is one-way: once the pin is revealed, it stays revealed.

## 4. Task-point pool
- For each section of at least `minSectionAreaM2`, sample candidate points (best-candidate sampling) up to `taskPointsPerSection` (3), keeping them at least `taskPointMinSpacingM` (20 m) apart (across sections too) and outside no-go zones (regions already exclude them). A point carries the section `sectionOf` assigns it, which can differ from the polygon it was sampled in only at a wedge border.
- Each point stores `{id, lat, lng, regionId, section, source: 'auto'|'host', disabled: boolean}`; ids are `p1`, `p2`….
- The host can add points (the server computes region and section and refuses points outside the playable area), delete points, and regenerate. Regenerating replaces the auto points and keeps host points. A no-go change deletes the points inside the zone but never brings deleted points back; a new layout regenerates the auto points (ADR-045).
- When a task is assigned, pick from the target section, preferring points that are:
  - not active for another player
  - not used within the last `taskPointReuseCooldownS` (300 s)
  - at least 60 m from the player's position, where possible
- Rotating points this way stops players camping one spot.
- A point reported unsafe is disabled for the rest of the game, and that is logged.
- **Choosing the target section** for a new task: weighted random over usable sections. Sections in the player's current region get ×0.5 weight, to push movement, and sections that already hold one of the player's tasks get ×0.25.

## 5. Spawn points
Best-candidate sampling over the whole boundary (outside no-go zones), with one spawn per player, maximising the minimum distance between spawns (never less than 40 m). Spawns are then assigned to players greedily by distance from their current position, to keep total walking low. Players don't see each other's spawns.

## 6. Visibility modes
Set by `playerVisibility`. **Dots never carry a username or tag in any mode.**

| Mode | What other players' positions look like |
|---|---|
| `nearby` (default) | Anonymous dots for players within `nearbyRadiusM` (40 m) of you, plus region counts |
| `regions` | No dots. Region counts only. |
| `all` | Anonymous dots for every active player, plus region counts |

- **Your own position** is always shown as a distinct marker with an accuracy circle.
- **Dot IDs** are per-viewer aliases that rotate every `dotAliasRotateS` (300 s). They keep animation smooth without letting anyone track a person across the whole game.
- **Dot flags** (the server decides what each viewer gets):
  - `oob` (out of bounds): public
  - `stale`: public
  - `ally`: imposters only, marks the other imposters
  - `infected` / `exposed`: imposters only
- **Spectators** are never shown as dots and never counted.
- **Region counts:** the number of active, non-stale players whose latest fix is in each region. They are bucketed into `0`, `1`, `2–3`, `4+`, and a snapshot is taken every `regionCountRefreshS` (30 s). Each viewer sees the snapshot with their own entry replaced by their current position, so the viewer is always counted in their own region, which avoids an off-by-one leak (ADR-046). The lobby shows the counts on the region labels for testing.
- **Phase 3 behaviour:** the modes apply in the lobby too (ADR-047). `nearby` measures from the viewer's own latest fix and shows nobody to a viewer with no fix.

## 7. Map rendering (client)
- Tiles: standard **OSM** raster tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), darkened in CSS (`.dark-tiles`), credited "© OpenStreetMap contributors". CARTO Dark Matter was the first choice but now answers with an "API KEY REQUIRED" placeholder (ADR-039). No API key is needed.
- Layers:
  - boundary outline (neon edge, dim outside)
  - region outlines and labels
  - highlight of the current task section (Stage 1)
  - task pins (Stage 2 and later)
  - Base marker
  - no-go hatching
  - dots
  - self marker with heading
- Imposters also get their fake pins.
- Out-of-bounds styling: everything outside the boundary is darkened. When the player is outside, a red edge glow and banner appear.
