# World Explorer 3D production-blocker repair handoff

Date: 2026-08-18  
Status: active local 4.3.0 repair; not committed, not deployed, not release-approved

## Start here

Use this exact worktree, not the similarly named deployed/rollback directory:

```text
/Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70
```

Current branch and baseline:

```text
branch: steven/urban-sandbox-foundation
HEAD:   82599a7 feat: unify sandbox world interactions
```

There are intentional uncommitted changes on top of `82599a7`. Do not reset,
checkout, discard, or replace them. Production is still serving the verified
4.2.1 rollback. Do not deploy or push this 4.3.0 work before the remaining
checks and the user's hands-on/device acceptance.

At the start of the next thread:

1. Read this file completely.
2. Read `progress.md`, `KNOWN_ISSUES.md`, `docs/REGRESSION_LEDGER.md`, and
   `docs/TEST_AND_RELEASE_MAP.md`.
3. Run `git status --short`, `git diff --check`, and `git diff --stat` in the
   exact worktree above.
4. Continue the remaining checks below; do not redesign or restart this pass.

## User's current goal

Finish the existing release blockers so the user can test a production-shaped
candidate. In particular:

- restore credible building heights and skyline density worldwide, with
  Baltimore no longer showing only two tall buildings;
- preserve the facade/entrance, bridge, ramp, transition, and tunnel work
  already completed and prevent those systems from regressing;
- close the dense-city outage surface failures, distant-horizon failure,
  Tahoe/Panama water-arrival failure, late vegetation publication mutation, and
  companion camera/facade occlusion;
- validate behavior and rendered output, not only syntax;
- update known issues and the regression ledger truthfully;
- stop at a local candidate for user testing. Do not deploy until the user has
  tested and explicitly authorizes promotion.

Keep the fixes global and owned by existing shared systems. Do not add
city-name visual patches, duplicate terrain/building renderers, another
permanent HUD, or weakened release assertions.

## What is implemented in the uncommitted change set

### 1. Curated building metadata and skyline restoration

`app/js/world/building-metadata.js` now allows a narrowly scoped spatial
identity bridge only for the versioned bundled OSM building packs. A generalized
Shortbread footprint must have a unique pack center within seven meters, with a
minimum separation from the next candidate, and a metadata point can enrich
only its nearest footprint. Live/untrusted proximity-only metadata remains
rejected.

`app/js/world/building-provenance-model.js` accepts that mapping only when the
provider is explicitly `bundled-osm:<pack>` and the source identity is an OSM
way. Both geometry and metadata identities remain published in provenance.

The matrix now requires any loaded bundled city pack to produce mapped
dimensions. Baltimore must retain a mapped skyline above 60 m and at least
eight mapped 60 m high-rises; New York must remain above 100 m and retain at
least 25 mapped 60 m high-rises. The high-rise counter/assertions were added
after the last skyline run and therefore still need one rerun.

### 2. Dense-city outage surface ownership

`app/js/world/settlement-density-policy.js` now treats at least 80 mapped
driveable roads as independent dense-settlement evidence. This prevents Miami
and similar coastal cities from skipping detailed buildings solely because a
coarse fallback biome says `sand`. Sparse desert roads remain below the gate.

Tokyo required no threshold weakening: once its bundled building metadata was
joined, its existing exact mapped density rules produced a passing urban/grass
balance.

### 3. Water-first selected-location arrivals

`app/js/world/spawn-location-arrival.js` now tests exact mapped navigable water
before a nearby street when `preferBoatIfWater` is true. An elevated bridge deck
still wins first. Waterfront land falls through to the existing safe road/land
policy when the exact coordinate is not within a navigable water body.

### 4. Degraded distant-horizon fallback

`app/js/terrain/far-field.js` and `far-field-geometry.js` no longer delete the
fixed regional horizon when both primary and parent elevation tiles are
unavailable. The existing one-mesh regional terrain owner continues in an
explicit `accepted-ground-flat-datum` fallback, retains mapped land/water
semantics, and publishes truthful degraded provenance. It does not invent
relief or create a second background renderer.

`WORLD_MATRIX_BLOCK_ELEVATION=1` was added to the matrix harness to make this
outage deterministic, but that new path has not yet been run.

### 5. Stable publication boundary

WorldCover terrain classification can debounce a vegetation rebuild.
`app/js/world/furniture.js` now exposes a bounded flush, and
`app/js/world/load-roads.js` drains it after terrain-material readiness but
before the immutable world publication snapshot. This is intended to close the
Baltimore 410-to-411 vegetation mutation. The full runtime invariant still must
be rerun.

### 6. Exterior third-person camera collision

`app/js/walking/camera-collision.js` is a new small camera-arm solver.
`app/js/walking/runtime.js` uses the existing building collision index to
shorten an exterior third-person arm before it crosses a facade. Interior
footprint camera behavior remains unchanged, and bridge guardrails do not
collapse the camera. The pure behavior test passes, but the installed-Chrome
companion journey and screenshots still must be rerun and inspected.

### 7. Regression/test support

New focused tests:

- `scripts/test-spawn-location-arrival.mjs`
- `scripts/test-walking-camera-collision.mjs`

Extended checks cover the bundled metadata trust boundary, coastal settlement
policy, flat-datum horizon policy, skyline height/counts, and deterministic
elevation outage routing. The city-surface source assertion was updated from
the retired float `colors.setXYZ` call to the current equivalent normalized
attribute writer; the production rule itself was not weakened.

## Completed evidence from this pass

All commands below completed successfully unless explicitly noted.

Focused executable checks:

```text
npm run test:phase4-provenance
npm run test:initial-play-policy
npm run test:spawn-location-arrival
npm run test:fixed-location-terrain-material
npm run test:walking-camera-collision
npm run test:city-surface-semantics
npm run audit:assets
```

Strict asset result: 94 tracked hosting assets, 27 dynamic PBR assets, zero
unreachable assets.

Rendered matrix diagnostics:

- `output/playwright/world-matrix/skyline-diagnostic/report.json`
  - Baltimore: zero location failures; 23,370 rendered buildings; 316/319 pack
    records joined before selection; 289 enriched rendered buildings; 77
    mapped dimensions; tallest rendered building 161 m (`Transamerica`);
    visible buildings retain facade-atlas/exterior ownership.
  - New York: zero location failures; 10,799 rendered buildings; 446/455 pack
    records joined before selection; 429 enriched rendered buildings; 385
    mapped dimensions; tallest rendered building 366 m (`Bank of America
    Tower`); visible buildings retain facade-atlas/exterior ownership.
- `output/playwright/world-matrix/tokyo-diagnostic/report.json`
  - zero location failures under forced WorldCover outage;
  - 2,606/2,609 curated records joined;
  - urban semantic samples 85,981 versus grass 121,868 (passing).
- `output/playwright/world-matrix/fallback-diagnostic/report.json`
  - zero location failures for Miami, Everglades, Lake Tahoe, and Panama Canal
    under forced WorldCover outage;
  - Miami urban 56,216 versus grass 151,758.99 (passing);
  - Everglades fixed horizon ready in the normal elevation-provider path;
  - Tahoe and Panama both start in a boat on mapped water.

Each targeted report has `pass: false` only because a release visual-review
manifest is deliberately required and was not supplied for a partial diagnostic
run. All have an empty `locationFailures` array. Their PNGs are beside each
report and should be inspected in the next thread.

The generic in-app-browser source preview was also loaded at
`http://127.0.0.1:4193/app/` and showed the current Baltimore globe/title state.
That temporary server should be restarted in the next thread rather than
assumed alive.

## Remaining work, in order

### A. Finish the focused blocker verification

1. Rerun Baltimore/New York after the new high-rise counter was added:

```bash
WORLD_MATRIX_IDS=baltimore,newyork \
WORLD_MATRIX_BLOCK_WORLDCOVER=1 \
WORLD_MATRIX_EXERCISE_MODES=0 \
WORLD_MATRIX_OUTPUT_LABEL=skyline-highrise-final \
npm run test:world-matrix
```

Confirm `locationFailures` is empty and inspect
`buildingDimensions.mappedHighRiseCount` for both cities.

2. Exercise the deterministic no-elevation Everglades path:

```bash
WORLD_MATRIX_IDS=everglades_custom \
WORLD_MATRIX_BLOCK_WORLDCOVER=1 \
WORLD_MATRIX_BLOCK_ELEVATION=1 \
WORLD_MATRIX_EXERCISE_MODES=0 \
WORLD_MATRIX_OUTPUT_LABEL=everglades-no-elevation \
npm run test:world-matrix
```

Expected: the location assertion passes; `farTerrainClipmap.status` is `ready`;
`elevationFallbackMode` is `accepted-ground-flat-datum`; the screenshot has a
continuous bounded horizon rather than missing terrain.

3. Rerun publication stability:

```bash
npm run test:runtime
```

Expected: `worldPublicationStable` is true and no vegetation collection count
changes after publication.

4. Rerun and visually inspect the companion journey using installed Chrome:

```bash
WE3D_BROWSER_CHANNEL=chrome npm run test:world-discovery-browser
```

Inspect at least:

```text
output/playwright/world-discovery-browser/companion-desktop.png
output/playwright/world-discovery-browser/companion-bird-desktop.png
output/playwright/world-discovery-browser/field-animal-world-desktop.png
```

The companion and player must be visible and the camera must not be inside or
pressed against a facade.

### B. Protect the existing building/structure work

Run the existing facade and engineered-structure journeys; do not replace them
with source-only checks:

```bash
WE3D_BROWSER_CHANNEL=chrome npm run test:building-facades-browser
WE3D_BROWSER_CHANNEL=chrome npm run test:engineered-transport-landmarks-browser
WE3D_BROWSER_CHANNEL=chrome npm run test:monaco-tunnels-browser
```

Visually confirm Baltimore entrances remain shader-integrated, the JFX/Fort
McHenry structures are visible, the San Francisco–Oakland Bay Bridge and Yerba
Buena tunnel remain visible, and Monaco tunnel floors/portals remain coherent.

### C. Run the bounded production checks

After A and B are green:

```bash
npm run test:module-versions
npm run audit:reachability
npm run audit:assets
npm run test:production-readiness
npm run test:production-gate
git diff --check
```

Then run the full world matrix once, not repeatedly, and complete its visual
review manifest. The partial diagnostics above are functional evidence but are
not a release artifact.

### D. Reconcile documentation and commit

Only after the checks are complete:

- update `KNOWN_ISSUES.md` to close the seven repaired runtime blockers that
  actually passed;
- add a dated durable entry to `docs/REGRESSION_LEDGER.md` covering generalized
  building metadata/skyline identity, dense-city outage ownership, degraded
  horizon, water-first arrival, vegetation publication, and third-person camera
  collision;
- update asset counts from 93 to 94 where the current strict report is cited;
- update `docs/TEST_AND_RELEASE_MAP.md` with exact evidence and keep real-device
  acceptance open;
- update `progress.md` with final results;
- inspect the diff, then create one scoped commit. Do not push or deploy.

## Current modified files

```text
app/js/terrain/far-field-geometry.js
app/js/terrain/far-field.js
app/js/walking/camera-collision.js                 (new)
app/js/walking/runtime.js
app/js/world/building-metadata.js
app/js/world/building-provenance-model.js
app/js/world/furniture.js
app/js/world/load-roads.js
app/js/world/settlement-density-policy.js
app/js/world/spawn-location-arrival.js
package.json
scripts/test-city-surface-semantics.mjs
scripts/test-fixed-location-terrain-material.mjs
scripts/test-initial-play-workload-policy.mjs
scripts/test-phase4-provenance-ownership.mjs
scripts/test-spawn-location-arrival.mjs             (new)
scripts/test-walking-camera-collision.mjs           (new)
scripts/test-world-matrix.mjs
scripts/world-matrix-assertions.mjs
scripts/world-matrix-building-diagnostics.mjs
scripts/world-test-locations.mjs
```

`progress.md` also contains the in-progress narrative but may not appear in the
tracked diff depending on repository ignore/assume-unchanged configuration.

## Known open release limits that should remain open

Even if all local checks pass, do not claim these are complete without their
actual evidence:

- hands-on user acceptance of the local candidate;
- physical phone/tablet and integrated-GPU acceptance;
- production-preview-only privileged endpoint behavior;
- the known headless SwiftShader landscape saturation limitation;
- the larger product-scope items already listed in `KNOWN_ISSUES.md` and
  `docs/URBAN_SANDBOX_PLAN.md` (trusted account inventory, home ownership,
  moderation/tone, richer missions/economy, etc.).

The immediate task is release-blocker repair and candidate verification, not
adding more GTA-like features.
