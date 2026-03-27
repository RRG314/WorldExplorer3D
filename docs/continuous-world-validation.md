# Continuous-World Validation

This branch adds guardrails for future continuous-world work before broad runtime changes begin.

Supporting branch docs:

- `docs/continuous-world-architecture.md`
- `docs/rdt-continuous-world-evaluation.md`

## What Existed Already

The repo already had browser/runtime checks for:

- runtime boot invariants
- terrain seam regression
- drive-surface stability
- elevated driving surfaces
- boat travel smoke
- world location matrix
- city reload cycle

Those checks are useful, but they are mostly short-path probes. They do not form one continuous-world validation system.

## Main Gaps Before This Pass

- No single snapshot for terrain streaming health, coordinate continuity, road contact, water state, and runtime spikes
- No repeatable long-route harness that samples many streaming transitions in one run
- No shared pass/fail thresholds for long travel, elevated structures, tunnels, water travel, and minimap drift
- No single suite command that collects the core continuity checks needed before continuous-world work

## New Runtime Diagnostics

`app/js/continuous-world-diagnostics.js`

Adds `appCtx.getContinuousWorldValidationSnapshot()` with:

- current actor state by mode (`drive`, `walk`, `drone`, `boat`, `ocean`)
- world/lat-lon round-trip error
- minimap center drift from the active actor
- terrain streaming snapshot
- road/surface attachment snapshot
- water/boat/ocean state
- perf snapshot summary

`app/js/terrain.js`

`getTerrainStreamingSnapshot()` now includes:

- active tile counts
- tile cache counts (`total`, `loaded`, `failed`, `pending`)
- focus/prefetch tile counts
- focus descriptor counts/kinds for travel-ahead streaming intent
- terrain tile load event counts (`total`, `active`, `focus`, `prefetch`)
- last surface-sync source and surface-sync request count
- duplicate terrain mesh detection
- stale terrain mesh detection
- missing active terrain mesh detection
- rebuild-in-flight state
- last road rebuild age

## New Scenario Harness

`scripts/test-continuous-world-scenarios.mjs`

Runs repeatable browser-driven scenarios across multiple cities:

- long drive corridors
- urban entry corridors
- elevated structure routes
- tunnel routes
- boat continuity routes

The harness picks real roads/water from loaded runtime data, samples many points along each route, and records:

- terrain continuity
- active tile health
- road contact retention
- surface deltas
- coordinate round-trip error
- minimap drift
- frame spikes

The harness now writes partial progress back to `report.json` after each case, so long browser runs can be inspected even if a later scenario fails.

Artifacts are written to:

- `output/playwright/continuous-world-scenarios/report.json`
- per-case screenshots in `output/playwright/continuous-world-scenarios/`

## Targeted Terrain/Road Continuity Check

`scripts/test-continuous-world-terrain-road.mjs`

Runs a narrower Phase 5 browser probe against sampled at-grade major roads across multiple cities.
It is meant to answer a simpler question than the full scenario harness:

- terrain stays loaded around the active corridor
- no missing/duplicate active terrain meshes
- road contact stays usable on sampled at-grade travel
- terrain-driven rebuild/surface-sync activity is visible during travel

Current artifact:

- `output/playwright/continuous-world-terrain-road/report.json`

## Phase 6 Feature Ownership Check

`scripts/test-continuous-world-feature-ownership.mjs`

Runs a browser-backed Phase 6 continuity probe focused on dense city content, grade-separated structures, and water ownership snapshots.

It validates branch-only passive region ownership for:

- loaded buildings
- loaded elevated structures / connectors
- loaded water features

Current artifacts:

- `output/playwright/continuous-world-feature-ownership/report.json`
- per-case screenshots in `output/playwright/continuous-world-feature-ownership/`

The runtime snapshot now also includes:

- `featureOwnership.buildings`
- `featureOwnership.structures`
- `featureOwnership.water`

Those summaries report:

- total loaded features
- cross-region feature counts
- unique region coverage
- near/mid/far/outside tracked-band counts
- nearby actor counts for each feature family

The ownership snapshot is runtime-aware for the actor's current surface:

- if the actor is actively on a grade-separated road/deck and near-band structures are loaded, structure continuity is treated as locally present even when sampled support geometry is sparse
- if the actor is actively on water and near-band water regions are loaded, water continuity is treated as locally present even when shoreline geometry is not close to the actor

## Phase 6 Feature Region Ownership Check

`scripts/test-continuous-world-feature-regions.mjs`

Runs a browser-backed branch-only ownership probe for the new feature-region manager.

It validates:

- continuous-world feature regions rebuild against the active session epoch and region key
- dense city travel lands inside active building-owned regions
- grade-separated travel lands inside active structure-owned regions
- boat travel lands inside active water-owned regions
- active-region ownership matches the runtime surface family being exercised

Current artifacts:

- `output/playwright/continuous-world-feature-regions/report.json`
- per-case screenshots in `output/playwright/continuous-world-feature-regions/`

The runtime snapshot now also includes:

- `featureRegions`

That summary reports:

- total region buckets with owned content
- per-band region counts for buildings, structures, and water
- active-region ownership counts per family
- region-family totals across the currently loaded branch-only world state

## Phase 6 Feature Activation Check

`scripts/test-continuous-world-feature-activation.mjs`

Runs a browser-backed activation probe against the first branch-only region-gated content pass.

It validates that:

- dense city building meshes carry continuous-world region keys
- grade-separated structure visual meshes are split by region signature instead of one city-wide batch
- visible keyed meshes stay inside the active tracked region set
- off-region keyed meshes can deactivate cleanly under a narrowed validation window

Current artifacts:

- `output/playwright/continuous-world-feature-activation/report.json`
- per-case screenshots in `output/playwright/continuous-world-feature-activation/`

This probe intentionally narrows the active region window during validation only:

- dense city activation uses a single active region cell
- structure/water activation uses a 1-cell mid ring around the active cell

That keeps the branch runtime defaults unchanged while still proving that the activation gate is real and not just metadata.

## Phase 6 Road Activation Check

`scripts/test-continuous-world-road-activation.mjs`

Runs a browser-backed activation probe against the first branch-only region-gated road and urban-surface pass.

It validates that:

- road meshes are split into continuous-world region-keyed batches instead of one city-wide mesh
- road-adjacent urban surfaces carry the same regional ownership
- visible road and sidewalk/surface batches stay inside the active tracked region set
- off-region road and urban-surface batches deactivate cleanly under a narrowed validation window
- the active driving road remains visible while the region window is narrowed to a single tracked cell

Current artifacts:

- `output/playwright/continuous-world-road-activation/report.json`
- per-case screenshots in `output/playwright/continuous-world-road-activation/`

This probe currently checks:

- Baltimore dense urban roads
- New York dense urban roads
- Seattle elevated roads

## Phase 7 Map Compatibility Check

`scripts/test-continuous-world-map-compatibility.mjs`

Runs a browser-backed compatibility probe for coordinate consumers that still matter before deeper continuous-world rollout.

It validates that:

- HUD coordinate text matches the runtime continuous-world coordinate snapshot
- minimap center world position stays aligned with the active actor
- large-map center world position stays aligned with the active actor
- the large map keeps the active actor centered on screen
- the shared map reference follows the active traversal mode (`drive`, `walk`, `boat`)
- navigation screen projection remains finite after the compatibility changes

Current artifacts:

- `output/playwright/continuous-world-map-compatibility/report.json`
- per-case screenshots in `output/playwright/continuous-world-map-compatibility/`

This probe currently checks:

- Baltimore drive mode
- New York walk mode
- Monaco boat mode

## First Visible Continuous-World Expansion

`scripts/test-continuous-world-visible-expansion.mjs`

Runs a browser-backed proof that the branch runtime is no longer limited to the old tight city envelope.

It validates that:

- far roads remain present several kilometers away from the original city center
- buildings remain visible in far dense areas instead of dropping back to an empty shell
- the runtime load profile keeps a materially larger retained world around the actor

Current artifacts:

- `output/playwright/continuous-world-visible-expansion/report.json`
- `output/playwright/continuous-world-visible-expansion/initial.png`
- `output/playwright/continuous-world-visible-expansion/far.png`
- `output/playwright/continuous-world-visible-expansion/far-dense.png`

Latest validated branch result:

- roads retained to about `4.90 km`
- buildings retained to about `4.95 km`

## First Interactive Continuous-World Streaming Check

`scripts/test-continuous-world-interactive-streaming.mjs`

Runs the first browser-backed proof that movement away from the original load center can add real new world content instead of only reusing what was already loaded.

It validates that:

- a direct far-position continuous-world chunk load succeeds
- off-center roads and buildings merge into the active runtime
- the streamed target area has nearby drivable roads and visible buildings
- coordinate and continuous-world diagnostics remain sane after the additive merge

Current artifacts:

- `output/playwright/continuous-world-interactive-streaming/report.json`
- `output/playwright/continuous-world-interactive-streaming/initial.png`
- `output/playwright/continuous-world-interactive-streaming/streamed.png`

Latest validated branch result:

- initial roads: `6708`
- streamed roads: `7509`
- initial buildings: `24200`
- streamed buildings: `25504`
- nearby streamed target content: `41` roads, `26` buildings
- streamed environment expansion: `17` landuse meshes, `4` water areas, `21` waterways

## Continuous-World Suite

`scripts/test-continuous-world-suite.mjs`

Runs the new scenario harness plus the existing critical continuity checks:

- `test-continuous-world-foundation`
- `test-continuous-world-region-manager`
- `test-continuous-world-terrain-road`
- `test-continuous-world-feature-ownership`
- `test-continuous-world-feature-regions`
- `test-continuous-world-feature-activation`
- `test-continuous-world-road-activation`
- `test-continuous-world-map-compatibility`
- `test-continuous-world-scenarios`
- `test-terrain-seam-regression`
- `test-drive-surface-stability`
- `test-elevated-driving-surfaces-global`
- `test-boat-smoke`
- `test-city-reload-cycle`
- `test-world-matrix`

Artifact:

- `output/playwright/continuous-world-suite/report.json`

The suite now separates branch-blocking continuity gates from advisory diagnostics:

- Blocking:
  - continuous-world foundation / region manager
  - terrain + road continuity
  - feature ownership / activation
  - map/editor/activity compatibility
  - long-route scenario harness
  - terrain seam regression
  - drive-surface stability
  - city reload cycle
  - world matrix
- Advisory:
  - `test-elevated-driving-surfaces-global`
  - `test-boat-smoke`

Those advisory probes still run on every suite pass and remain visible in the suite report under `advisoryFailures`, but they do not block the branch by themselves. The reason is scope: they are still valuable compatibility/geometry audits, but they are broader than the core continuous-world go/no-go gate.

The browser-backed validation scripts used by the suite now terminate explicitly after writing their reports. This avoids a false branch stall where a Playwright run had completed its validation but Node stayed alive because of lingering handles.

## Commands

Scenario harness only:

```bash
npm run test:continuous-world-scenarios
```

Full continuity suite:

```bash
npm run test:continuous-world
```

Foundation runtime check:

```bash
npm run test:continuous-world-foundation
```

Region lifecycle check:

```bash
npm run test:continuous-world-region-manager
```

Targeted terrain/road continuity check:

```bash
npm run test:continuous-world-terrain-road
```

Phase 6 feature ownership / dense-city continuity check:

```bash
npm run test:continuous-world-feature-ownership
```

Phase 6 feature-region ownership check:

```bash
npm run test:continuous-world-feature-regions
```

Phase 6 feature activation check:

```bash
npm run test:continuous-world-feature-activation
```

Phase 6 road activation check:

```bash
npm run test:continuous-world-road-activation
```

Phase 7 map/minimap/navigation compatibility check:

```bash
npm run test:continuous-world-map-compatibility
```

Phase 7 editor/overlay compatibility check:

```bash
npm run test:continuous-world-editor-overlay-compatibility
```

## Pass/Fail Intent

The new scenario harness fails when it detects issues such as:

- road contact loss on drive routes
- center terrain tile not loaded during travel
- duplicate or missing active terrain meshes
- excessive surface delta or terrain drop on scenarios that are expected to stay at grade
- excessive minimap drift
- excessive coordinate round-trip drift

The harness records, but does not currently hard-fail on, advisory metrics such as:

- stale terrain mesh accumulation
- frame hitch spikes

Those still show up in the case `warnings` arrays and summary metrics so future phases can tighten them once the current baseline is healthier.

Thresholds live with each scenario definition in:

- `scripts/continuous-world-scenarios.mjs`

## How Future Phases Should Use This

Before and after major continuous-world changes:

1. Run `npm run test:continuous-world`
2. Compare `continuous-world-scenarios/report.json`
3. Check for regressions in:
   - missing/duplicate terrain meshes
   - road contact loss
   - elevated/tunnel continuity
   - water continuity
   - minimap drift
   - overlay/editor coordinate drift
   - frame spike growth

Then review `output/playwright/continuous-world-suite/report.json`:

- `ok` must stay `true`
- `blockingFailures` must stay empty
- `advisoryFailures` should be reviewed before merge, even when the branch gate is green

## Current Branch State

Current blocking continuity/compatibility probes are green on this branch:

- `test-continuous-world-foundation`
- `test-continuous-world-region-manager`
- `test-continuous-world-terrain-road`
- `test-continuous-world-feature-ownership`
- `test-continuous-world-feature-regions`
- `test-continuous-world-feature-activation`
- `test-continuous-world-road-activation`
- `test-continuous-world-map-compatibility`
- `test-continuous-world-editor-overlay-compatibility`
- `test-continuous-world-activity-multiplayer-compatibility`
- `test-continuous-world-scenarios`
- `test-terrain-seam-regression`
- `test-drive-surface-stability`
- `test-city-reload-cycle`
- `test-world-matrix`

Current advisory follow-up items remain:

- `test-elevated-driving-surfaces-global`
- `test-boat-smoke`

This is intentionally a guardrail phase, not a continuous-world architecture replacement.

## Visible Continuous-World Expansion Follow-Up

The branch now has a second visible interactive streaming step beyond the first off-center chunk load:

- `scripts/test-continuous-world-interactive-streaming.mjs` now verifies that moving to Upper Manhattan causes region-prefetch loads around the moved actor, not just one additive chunk.
- The streamed case now records region-prefetch coverage for `2040:-3698` and `2040:-3697`.
- Measured branch result from the current report:
  - roads `6708 -> 8135`
  - buildings `24200 -> 26762`
  - nearby streamed target content: `41` roads, `29` buildings, `28` landuse meshes

Artifacts:

- `output/playwright/continuous-world-interactive-streaming/report.json`
- `output/playwright/continuous-world-interactive-streaming/upper_manhattan.png`

## Heading-Aware Prefetch Follow-Up

The branch runtime now biases interactive region-prefetch toward the actor heading when moving, instead of only selecting the nearest uncovered region cell.

Current measured Upper Manhattan branch result:

- roads `6708 -> 9037`
- buildings `24200 -> 29291`
- nearby streamed target content: `41` roads, `34` buildings, `32` landuse meshes
- covered streamed region keys now include `2040:-3698`, `2040:-3697`, `2040:-3699`, and `2041:-3698`
