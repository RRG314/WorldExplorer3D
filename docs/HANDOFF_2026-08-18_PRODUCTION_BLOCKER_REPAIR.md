# World Explorer 3D production-blocker repair handoff

## Controlling recovery checkpoint — 2026-08-20

This section supersedes every older baseline, status statement, and test command
later in this document. The older material is retained only as investigation
history. Do not begin another repair from an older checkout, a similarly named
repository, or a historical screenshot harness.

### Exact recovery workspace

```text
worktree: /Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70
branch:   steven/urban-sandbox-foundation
parent:   96bc2c7 Keep boat wave troughs above submerged terrain
checkpoint commit: run `git log -1 --oneline`; expect the recovery-checkpoint subject described below
```

The local checkpoint created with this handoff is a **recovery baseline**, not
an approved release. It intentionally preserves the complete accumulated source
so the next thread has a safe way back. It also preserves known regressions and
therefore must not be promoted to production as-is.

The last assembled staging artifact inspected before the checkpoint was:

```text
artifact: 4.3.0+96bc2c7c8888.0534cd5d28605e0a.staging
local URL: http://127.0.0.1:4208/app/?candidate=4.3.0%2B96bc2c7c8888.0534cd5d28605e0a.staging&loc=custom&lat=39.309728&lon=-76.621428&lname=Jones%20Falls%20Expressway&launch=earth&gm=free&mode=driving&rx=-9.772&ry=36.630&rz=-6.575
```

That artifact was built from dirty source and is useful only to reproduce the
current state. The next thread must rebuild from the checkpoint commit before
claiming commit-bound evidence. A local server may no longer be running.

### Why this checkpoint exists

The work after `96bc2c7` was documented in `progress.md` and output reports but
was not saved as incremental Git commits. That was a process failure. It left a
large mixed change set with no reliable code-level bisect points and allowed a
transport repair to coexist with a newly visible skyline regression. Do not
pretend the missing intermediate history exists, and do not infer which edit
caused the skyline regression solely from timestamps.

From this checkpoint forward:

1. Reproduce one observable failure in the final assembled game.
2. Record the failing artifact/hash, location, player mode, coordinates, final
   frame, runtime diagnostics, and the authoritative data identity involved.
3. Change only the existing owner or an explicitly documented dependency.
4. Rebuild and verify the same final assembled path plus the representative
   location matrix.
5. Visually inspect the complete frames.
6. Make a labeled local Git commit immediately after that bounded result.
7. Never combine an unrelated visual, gameplay, account, or release repair in
   that commit. Revert the bounded commit if its final render regresses.

### Honest current result

The following were proven against the final assembled `dist` artifact above:

- `npm run verify:source` passed.
- `WE3D_VERIFY_ROOT=dist WE3D_CAPTURE_RELEASE_EVIDENCE=1 npm run
  verify:assembled-locations` passed for Baltimore/JFX, Golden Gate, London,
  Monaco, Manhattan, and rural Iowa with zero reported transport grade,
  continuity, traffic-direction, lane-side, or motorway-pedestrian violations.
- `WE3D_VERIFY_ROOT=dist WE3D_CAPTURE_RELEASE_EVIDENCE=1 npm run
  verify:jfx-player-surface` passed on live OSM way `12115981`; the vehicle was
  on the compiler-owned bridge surface, the connected endpoint had no abutment
  wall, the deck was 9.35 m above rendered terrain, and exact continuity/grade
  checks passed.
- `WE3D_VERIFY_ROOT=dist WE3D_CAPTURE_RELEASE_EVIDENCE=1 npm run
  verify:actors-vehicles` passed in Baltimore, London, and Tokyo for canonical
  articulated NPCs, retained actors/traffic, catalog vehicle dimensions,
  curbside parking, jurisdiction driving side, direction, and motorway
  pedestrian exclusion.

Authoritative reports and final-frame evidence:

```text
output/verification/assembled-locations/report.json
output/verification/transport/jfx-player-surface.json
output/verification/actors-vehicles/report.json
output/release-evidence/current/jfx-player-surface.png
output/release-evidence/current/
```

These passes do **not** prove production readiness. The final JFX frame was
visually inspected and confirms a blocking regression: Baltimore is dominated
by repeated mid-rise buildings and the expected tall downtown skyline is not
present. A large building count is not a skyline-quality or height-provenance
pass. The assembled-location verifier currently checks that buildings exist;
it does not prove that mapped high-rise identities, heights, selection, and
final extrusion survive into the visible skyline. That coverage gap must be
closed before any further transport repair is accepted.

### Audit question for the fresh thread

Determine why a change that improves bridges, ramps, elevated roads, tunnels,
traffic, or actors can regress buildings or the final city composition. Do not
assume the bridge compiler itself is the cause. Audit the complete dependency
and publication graph and identify the first owner that changes the final
result.

The required authority chain is:

```text
location identity / country code
  -> immutable WorldLoadRequest and provider bounds/budgets
  -> accepted-ground terrain and hydrology
  -> normalized transport source and topology graph
  -> compiled transport surface/profile
  -> compiled transport structure assembly
  -> renderer + traversal + collision + Living World consumers
  -> immutable WorldSnapshot publication

building geometry + bundled/live mapped metadata identities
  -> compiled_building_provenance
  -> detailed/far building selection and batching
  -> mapped/inferred height and roof geometry
  -> building meshes, collision, entrances and landmark replacement
  -> the same immutable WorldSnapshot and final Earth scene
```

Transport and buildings are separate layer authorities, but they share load
identity, provider coverage, terrain, selection budgets, road/building conflict
guards, publication timing, scene roots, LOD/culling, and render budgets. Those
shared dependencies are the primary audit boundary. No subsystem may silently
rewrite another layer after snapshot publication.

### Existing owners that must remain singular

- Transport tag/provenance normalization:
  `app/js/world/compiler/transport-source-normalizer.js`
- Transport topology and graph-node identity:
  `app/js/world/compiler/transport-network-model.js` and
  `transport-junction-profile.js`
- Road/bridge/ramp/elevated/tunnel height and cross-section:
  `app/js/world/compiler/transport-surface-model.js` and
  `transport-surface-profile.js`
- Visible structural body/support/abutment description:
  `app/js/world/compiler/transport-structure-assembly.js`
- Tunnel corridor semantics only:
  `app/js/world/compiler/tunnel-system-model.js`; it must not overwrite the
  compiled roadway profile.
- Structure publication and cross-road safety:
  `app/js/world/structure-aware.js` and `bridge-safety.js`
- Landmark bridges: decorative towers/cables/girders only through
  `app/js/world/bridge-landmark.js`; they must not own a second drive surface.
- Building metadata identity and provenance:
  `app/js/world/building-metadata.js`,
  `building-provenance-model.js`, and `preset-building-metadata.js`
- Detailed building selection/geometry/batching:
  `app/js/world/load-building-detail.js`, `load-building-pass.js`,
  `load-geometry.js`, and `building-batching.js`
- Far skyline selection/massing:
  `app/js/terrain/far-field-mapped-context.js`,
  `far-building-massing.js`, and `far-field.js`
- Curated tall landmarks:
  `app/js/world/landmark-source.js`, `landmark-catalog.js`, and
  `landmark-models.js`
- Atomic layer publication:
  `app/js/world/compiler/world-layer-products.js`,
  `app/js/world/world-snapshot-adapter.js`, and the world-load session files.

If two of these write the same physical surface, building identity, height, or
scene object, stop and remove or subordinate the duplicate rather than adding a
third reconciliation path.

### Tall-building regression: required investigation

Start from the final JFX frame, not a count-only diagnostic. Compare the same
coordinates and camera/player path between this checkpoint and the last
user-approved/live build that visibly contained Baltimore high-rises. Capture
both from their real assembled artifacts with all normal scene layers enabled.

Trace at least these hypotheses with data, not guesses:

1. The selected custom/JFX location identity or provider bounds no longer loads
   the Baltimore bundled building-metadata pack or downtown core.
2. Exact versus generalized footprint deduplication replaces the footprint that
   owns mapped height metadata with a lower-information identity.
3. A load or publication budget retains many footprints but drops high-rise
   metadata or tall geometry before final batching.
4. The detailed/far boundary, LOD distance, culling bounds, or batch cell
   geometry removes tall meshes from the final camera while counts remain high.
5. `far-building-massing.js` receives no mapped height and clamps/infer all
   regional buildings into repeated mid-rise masses.
6. Curated landmark loading or generic-visual suppression hides a correct
   generic tower without successfully publishing its measured replacement.
7. Transport approaches, road conflict guards, terrain masks, or structure
   support clearance suppress building geometry beyond their intended corridor.
8. The immutable snapshot diagnostics count provider/building records rather
   than attached, visible, correctly extruded final meshes.

For each stage record: requested source count, stable identity, provenance,
mapped height, selected/dropped reason, batch/mesh identity, attached scene
root, final visibility, bounding box, and distance from the camera. The first
stage where an approved high-rise identity or height disappears owns the bug.

Do not solve this with a Baltimore-name exception, arbitrary tower heights,
fake skyline meshes, copied marketing art, a second building renderer, or a
test-only camera. Real mapped heights may be used only with preserved source
identity/provenance. When measurements are absent, the existing disclosed
inference policy may operate; it must not be described as measured.

### Transport audit: required investigation before another fix

Do not change transport merely because the latest JFX image looks imperfect.
First prove whether the failure is topology, vertical profile, assembly,
publication, traversal, camera, or a shared scene dependency. For every failing
bridge/ramp/overpass/elevated/tunnel location record:

- exact OSM/provider way identity and full relevant tags;
- lossless/generalized provenance and deduplication winner;
- connected graph endpoints and layer/vertical-order compatibility;
- profile samples, exact node constraints, design-grade source, and any modeled
  (not surveyed) lower bounds;
- structure assembly body, support and abutment decisions;
- collision/traversal surface identity used by the controlled actor;
- visible final mesh identity and attachment to the published world root;
- crossing-road clearance conflicts and whether a road/building was suppressed;
- final direction, jurisdiction driving side, access and pedestrian policy.

The worldwide representative set must include dense, sparse, left-driving,
right-driving, tunnel-heavy, bridge-over-water, and rural contexts. The current
minimum is Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural Iowa,
plus Tokyo for actor/vehicle behavior. Add a location only for a distinct
physical/data contract, never as a city-specific patch target.

### Current transport changes preserved in the checkpoint

- Motorway one-way and pedestrian defaults are normalized globally, with
  explicit mapped exceptions retained.
- Traffic driving side comes from country code rather than a city-name guess.
- Connected structure endpoints suppress an abutment wall; supports/abutments
  are rejected when they obstruct another driveable road's clearance envelope.
- Transport profile sample distances use `Float64Array`; graph endpoints within
  0.05 m are canonicalized and exact graph constraints are reconciled inside
  the shared solver rather than written again afterward.
- A late integrated-approach writer that could reopen solved graph constraints
  was removed. Geometry, navigation and diagnostics now consume the same
  numeric profile representation.
- JFX verification uses the visible controlled vehicle and compiled final
  surface; it does not place a walker on a motorway or call a source-only test
  hook.

These are preserved facts about the checkpoint, not guarantees that every
location or the complete product is correct.

### Current verification policy

Read `docs/VERIFICATION_STRATEGY_2026-08-19.md` completely. Do not restore the
quarantined legacy suite. Admit a focused check only after reproducing a current
failure and identifying its observable contract and owner.

Current commands are:

```bash
npm run verify:source
npm run verify:world
npm run verify:jfx-player-surface
npm run verify:assembled-locations
npm run verify:actors-vehicles
npm run verify:live-gps
npm run verify:environments
npm run verify:firestore-rules
npm run verify:multiplayer
npm run build:hosting
npm run verify:hosting
npm run release:verify
```

Passing automation is necessary but not sufficient. The acceptance frame must
be the complete final game: normal terrain, hydrology, buildings, transport,
population, atmosphere, water, HUD, collision and player control together. A
focused mesh image, hidden layer, diagnostic scene, marketing asset, raw count,
or synthetic camera is not production evidence.

### Production and data-safety status

- Do not push, preview-deploy, production-deploy, promote, or mutate user data
  from this handoff.
- The latest artifact is dirty-source staging, not a release artifact.
- Rebuild after the checkpoint so manifest identity is commit-bound.
- Re-run Firestore rules, multiplayer authorization, dependency/security, exact
  artifact reachability, environment matrix, and account/data migration checks
  before production.
- Preserve backward-compatible user/account/inventory documents. Never run a
  destructive migration or account cleanup as part of a visual/transport fix.
- Hands-on user acceptance and intended-device checks remain mandatory.

### Fresh-thread prompt

Copy the following prompt into the new thread:

```text
Work only in /Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70 on the
current steven/urban-sandbox-foundation recovery checkpoint. Read
docs/HANDOFF_2026-08-18_PRODUCTION_BLOCKER_REPAIR.md completely, especially the
2026-08-20 controlling recovery checkpoint, then read progress.md,
docs/SYSTEM_INVENTORY.md, docs/ARCHITECTURE_MAP.md,
docs/REGRESSION_LEDGER.md, docs/VERIFICATION_STRATEGY_2026-08-19.md,
KNOWN_ISSUES.md, and docs/TEST_AND_RELEASE_MAP.md. Run git status, git log -3,
and the current source verification before editing.

Audit why changes to bridges/ramps/overpasses/elevated roads/tunnels or their
shared dependencies can regress unrelated final-world systems. The current
assembled JFX artifact has improved visible transport, but its final frame is
missing Baltimore's expected tall skyline even though building counts are
large. Treat that as a confirmed blocker and a test-coverage failure. Determine
the first authority/dependency stage where approved high-rise identity, mapped
height, selected geometry, final mesh attachment, or visibility is lost. Also
audit transport end-to-end from source identity through topology, shared
vertical solver, assembly, publication, traversal/collision and final render.
Do not assume the bridge compiler is the root cause; inspect shared provider
bounds, budgets, terrain, conflict guards, immutable publication, LOD/culling,
scene roots, and render budgets.

Do not add city-name patches, fake measurements, visual ramps, duplicate road
or building renderers, test-only cameras, or restore quarantined legacy tests.
Use the real fully assembled game and compare the same final player/camera path
against the last user-approved/live build. Make no code change until the failure
and owner are evidenced. Then change one bounded owner, verify the same final
frame plus the representative worldwide matrix, visually inspect every final
image, update the handoff/progress/regression ledger, and create a labeled local
Git checkpoint immediately. One issue and one authority change per commit. Do
not push or deploy without explicit user approval.
```

---

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
   `docs/VERIFICATION_STRATEGY_2026-08-19.md`.
3. Run `git status --short`, `git diff --check`, and `git diff --stat` in the
   exact worktree above.
4. Treat every pre-2026-08-19 test command later in this historical handoff as
   untrusted. The legacy suite has been quarantined; use only the current
   verification strategy and newly admitted checks.

## Latest checkpoint — 2026-08-19

- Current source health and Live GPS walk/drive/camera journeys pass.
- The staging-shaped immutable artifact
  `4.3.0+96bc2c7c8888.8be777b58e9ccc68.staging` builds, hash-verifies and passes
  the complete public landing-to-live-world journey.
- The larger Baltimore response contains 13,459 roads and 817 authoritative
  exact structure connections with zero discontinuities above the 0.25 m
  contract; maximum measured delta is 0.241 m.
- The artifact includes the account social module as a hashed bundle, current
  landing gallery, active account/admin surfaces, far NPC/traffic detail,
  pitched roofs, facade-integrated entrances, Backpack condition/ammunition,
  continuous actor collision and mapped police/hospital recovery policy.
- It remains `sourceDirty: true`, local-only and not deployed. Hands-on review,
  a clean commit-bound artifact and explicit user authorization are still
  required before production promotion.

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

The former facade/landmark/tunnel browser programs were quarantined on
2026-08-19 and must not be reused. Derive a new focused check only after the
current structure failure is reproduced and its authoritative compiler owner is
identified. The current complete-world boundary is:

```bash
npm run verify:source
npm run verify:world
```

`verify:world` must report zero exact transport-node discontinuities before any
full-frame release evidence can be captured.

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

## 2026-08-20 audit checkpoint 1 — mapped building metadata coverage

### Completed bounded authority repair

- Recovery base: `2b31c93620fdf9872240011eeb16d7906d57b3bc`.
- First authoritative skyline loss: metadata provider selection, before
  footprint selection, batching, LOD, attachment, or rendering. JFX lies about
  2.28 km from the Baltimore pack center. The 0.022-degree detailed building
  publication included downtown footprints, but the 0.006-degree pack-origin
  selector and roughly 0.004-degree live metadata query did not include their
  mapped dimensions. Successful Overture geometry also bypassed the compatible
  bundled metadata join.
- Resolution: metadata pack eligibility follows intersection with the existing
  building publication coverage. Compatible bundled semantics are evaluated
  independently of the geometry provider; Overture/Shortbread geometry identity
  is preserved and the OSM semantic identity is accepted only through the
  existing unique seven-metre join. No radius was widened for Baltimore and no
  city-specific branch was added.
- Persistent guard: `verify:source` checks JFX without publication coverage does
  not select Baltimore, JFX with 0.022-degree publication coverage does select
  it by recorded coverage intersection, and rural Iowa selects no city pack.
  The JFX complete-world verifier now records metadata/dimension state and saves
  final evidence before failing another invariant.

### Verified result

- Local staged artifact:
  `4.3.0+2b31c93620fd.445425dd75fb5412.staging` (`sourceDirty: true`, never
  deployed).
- Complete JFX gameplay: Baltimore pack selected by publication-coverage
  intersection; 303/319 records matched; 72 matched records carry mapped
  dimensions; 12 mapped tall buildings were published; 1,430 building meshes
  were visible. Exact way 12115981, compiled bridge body, graph connections,
  drive contact, terrain clearance, exact continuity, grade limits, runtime,
  browser, and local resources all passed.
- Downtown Baltimore gameplay visibly contains the tall tower cluster. The
  default JFX chase frame faces NE 33 degrees while downtown is at bearing about
  160 degrees, and an ordinary keyboard-look turn is occluded by a nearby
  building. That original frame is not a valid pixel-level skyline guard even
  though its data/provenance failure was real.
- The required complete-world matrix was rerun and visually inspected for
  Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo.

### Still-open production blockers; do not call the world repaired

1. `verify:assembled-locations` reports `noPedestriansOnMotorways`, but that
   check covers the NPC graph only. Its Golden Gate and JFX final frames place
   the controlled walker in motorway lanes.
2. London, Monaco, Manhattan, Baltimore, and Tokyo show building foundations or
   terrain elevations visibly disagreeing. London also shows severe road/terrain
   grades and a boat-like vehicle published as road traffic.
3. Tokyo shows buildings occupying or clipping the road corridor. Current
   counts and collision summaries do not reject the final visual conflict.
4. The far-field building path still infers generic heights directly from
   Shortbread when explicit height is absent; its semantics remain separate
   from the repaired detailed-building metadata authority and require a later
   bounded audit.
5. Provider-response variability remains a required transport audit target. An
   earlier JFX run reported 27 exact discontinuities while the current lossless
   response reports three connections and zero discontinuities. Do not weaken
   the thresholds or accept one provider shape as worldwide proof.

Next bounded task: trace controlled-player arrival and traversal eligibility
from mapped access tags through provider/dedup/topology/publication to the final
surface choice at Golden Gate and JFX. Keep foundation/terrain conflicts and
far-field height semantics separate. Update all three audit records and create a
new checkpoint only after the worldwide final frames improve. Do not push or
deploy.

## 2026-08-20 audit checkpoint 2 — NPC pedestrian transport exclusion

### User correction and first authoritative loss

- The user clarified that controlled-player arrival is not the defect to repair.
  The requirement is that pedestrian NPCs never occupy street carriageways,
  ramps, bridges, tunnels, or other vehicle-transport surfaces. The earlier
  next-task paragraph is therefore superseded; no player-spawn change was made.
- The complete-world reports proved the previous motorway check was a false
  green. Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, and rural Iowa
  each reported `mappedPaths: 0` while publishing 456-602 inferred sidewalk
  edges, 58-76 inferred crossings, and up to 24 pedestrian agents. The separate
  Baltimore/London/Tokyo actor run likewise published 24 people in every city.
- The first authoritative loss was `compilePedestrianGraph`: it accepted vehicle
  traversal segments and invented two offset sidewalks plus periodic crossings
  from each road centerline. Excluding only motorway classes did not prevent
  NPCs from being derived from ordinary streets, ramps, bridges, or tunnels.

### Completed bounded authority repair

- Pedestrian population may now consume only an explicitly mapped, at-grade
  `footway`. Vehicle roads, cycleways, inferred sidewalks/crossings, ramps,
  elevated paths, bridges, and tunnels fail closed. Building entrances can join
  only an eligible mapped graph; they cannot bootstrap a synthetic network.
- No pedestrian geometry provider was enabled and no new renderer, inferred
  measurement, city exception, or visual offset was added. Because the current
  world publication deliberately publishes no mapped footway layer, current
  locations honestly publish zero pedestrian agents instead of placing them on
  unsupported surfaces. Vehicle traffic and the Living World/urban owners remain
  active.
- Diagnostics now expose vehicle-transport and engineered-transport pedestrian
  edges. The assembled and actor verifiers require both to be zero and also
  require inferred sidewalk/crossing counts to be zero. Fixture guards retain a
  real mapped at-grade footway using the runtime's actual
  `structureKind: at_grade` label and reject an unassociated footway bridge.

### Verified result

- Local staged artifact:
  `4.3.0+2382d5c48d49.20ae3a1745990bf7.staging` (`sourceDirty: true`, never
  deployed).
- `verify:source`, artifact build/hash verification, and
  `verify:actors-vehicles` passed. Baltimore, London, and Tokyo each reported
  zero pedestrian agents and zero transport-derived pedestrian edges while
  keeping 13-14 visible traffic vehicles and detailed vehicle presentation.
- The initial artifact
  `4.3.0+1ddf6fd0c723.6485dc545babc8dc.staging` passed
  `verify:assembled-locations` for Baltimore/JFX, Golden Gate, London, Monaco,
  Manhattan, and rural Iowa with active terrain, roads, traffic, Living World,
  urban sandbox, HUD, controls, and collision diagnostics. Every complete final
  frame was manually inspected. Tokyo was inspected in the actor matrix.
- A second complete assembled run after correcting the ordinary at-grade
  structure label kept the NPC check green at all six locations but failed the
  overall matrix at Golden Gate. That provider response started the player in a
  boat with no bridge at the selected coordinate and reported one 6.051 m exact
  at-grade discontinuity between `osm:way:12180960` and
  `osm:way:415852093`. The same artifact's immediately preceding Golden Gate
  run showed the bridge and zero discontinuities. This is fresh evidence for
  the already-open provider/transport authority blocker, not an NPC regression;
  do not report the latest overall matrix as green.
- The generic web-game client also reached a settled Iowa Earth runtime and its
  text state independently confirmed zero pedestrian edges/agents and active
  traffic. Its SwiftShader canvas was black and external provider/CORS console
  noise was present, so that image is not visual acceptance evidence; installed
  Chrome matrix frames remain the visual authority.

### Still open

1. A future pedestrian population may return only after a real mapped at-grade
   pedestrian-surface owner is published and verified worldwide. Do not restore
   road-offset sidewalks or inferred crossings to satisfy a population count.
2. London, Monaco, Manhattan, Baltimore, and Tokyo still show terrain,
   building-base, or road-corridor incoherence; Tokyo visibly clips buildings
   into roads and London still has an incoherent road vehicle. Green transport
   topology checks do not close these visual blockers.
3. Far-field height semantics and provider-dependent exact transport continuity
   remain separate audits. The latest Golden Gate run proves the latter can
   remove the selected bridge and vary from zero to a 6.051 m discontinuity.
   Do not combine either with the NPC authority.

Next bounded task: identify the first shared publication or grounding stage
that permits buildings and roads to occupy incompatible final space across
London, Monaco, Manhattan, Baltimore, and Tokyo. Do not patch a city or alter
the already-checkpointed NPC/traffic authority. Do not push or deploy.

## 2026-08-20 audit checkpoint 3 — structure authority after ground acceptance

### First authoritative loss

- The Golden Gate outage was not a missing generalized map feature. A direct
  decode of the same z13 Shortbread coverage found the named bridge footway,
  cycleway, and both motorway decks; the closest motorway centerlines passed
  12-21 m from the audit coordinate. A complete assembled run with every exact
  Overpass operation deliberately unavailable rendered the generalized bridge
  and grounded the walker on it.
- The first loss was provider reconciliation order. When exact core transport
  arrived, `retainRegionalTransportOutsideCore` removed every generalized core
  way before accepted-ground validation. `mergeExactRegionalStructures` then
  removed generalized structure copies before validation and, for an identical
  positive OSM id already present in core data, did not apply the regional exact
  record's provenance. If that remaining exact deck failed its ground contract,
  no bridge authority remained and custom water arrival could select a boat.
- This explains why the same coordinate/artifact could alternate between a
  visible bridge and an empty-water boat frame while count-only checks remained
  green. It also explains why a total exact-provider outage could behave better
  than a partially successful response.

### Completed bounded authority repair

- Generalized bridges, tunnels, covered roads, underground roads, and nonzero-
  layer transport inside the exact core are retained as explicit fallback
  candidates. Ordinary generalized core roads remain excluded, so this does not
  create a second street network.
- Exact regional records now upgrade matching exact core ways with lossless
  identity and regional-ground provenance. Generalized structure deduplication
  is deferred until accepted-ground filtering. That post-ground pass is the
  single owner-selection boundary: a surviving exact structure supersedes its
  generalized spatial/name match; a rejected exact structure leaves one
  generalized owner. No bridge renderer, visual ramp, inferred measurement,
  city exception, or provider identity was added.
- Source verification exercises all three provider-order states and verifies
  that core fallback retention excludes an ordinary residential way. Runtime
  diagnostics record retained/superseded authority counts.
- The assembled verifier now records provider outcomes, selected transport
  source, and accepted-ground selection. Its JFX and Golden Gate anchors must
  end with a non-boat player on a visible engineered surface. Counts alone can
  no longer approve the former empty-water frame.

### Verified result

- Local staged artifact:
  `4.3.0+8ef28985a726.6bf7dad502796dbe.staging` (`sourceDirty: true`, never
  deployed).
- In a real assembled Golden Gate run with all exact Overpass requests blocked,
  the final walking surface was generalized mapped feature
  `shortbread:streets:13:1308:3165:7:0`, named `Golden Gate Bridge`, classified
  as an elevated bridge, with one attached/visible structure mesh. The complete
  frame showed the deck, towers, terrain, water, HUD, collision-controlled
  walker, active vehicle traffic, and zero pedestrian NPCs.
- `verify:source`, artifact build/hash verification,
  `verify:assembled-locations`, and `verify:actors-vehicles` passed. The complete
  matrix covered Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural
  Iowa, and Tokyo. JFX and Golden Gate both passed the new visible-structure
  arrival check and all six assembled locations reported zero exact continuity
  breaks. Baltimore/London/Tokyo retained 11-14 visible vehicles and zero
  pedestrians. Every final installed-Chrome frame was inspected.

### Still open; do not call the world repaired

1. London, Monaco, Baltimore, Manhattan, and Tokyo still visibly disagree at
   building foundations, road corridors, or terrain. Tokyo buildings clip the
   road corridor; London/Monaco show severe road/ground shaping.
2. The grade verifier remains incomplete: it reports all-road steepness but
   fails only engineered roads. A prior Golden Gate final report contained an
   ordinary mapped road grade of 2.617 while
   `compiledRoadGradesWithinDesignBounds` stayed green.
3. Rural Iowa's complete frame starts on terrain despite mapped transport in
   the loaded world. Arrival-to-nearest-valid-road coherence needs its own
   worldwide audit; do not change it as part of bridge authority.
4. Far-field building height semantics and road/building footprint conflicts
   remain independent of this transport-source repair.

Next bounded task: trace the shared road/building/terrain disagreement from
accepted base ground and footprint conflict guards through final mesh/collision
publication, using the visibly failing London, Monaco, Baltimore, Manhattan,
and Tokyo frames. Keep the repaired provider-order and NPC authorities intact.
Do not push or deploy.

## 2026-08-20 audit checkpoint 4 — mapped building clearance owns inferred road width

### First authoritative loss

- The visible Tokyo road/building conflict was reproduced in the complete
  assembled game and then measured from the final published road and building
  collections. Before this change, London published 835 building footprints
  inside a rendered road width while only 16 crossed the mathematical
  centerline tested by the guard. Monaco was 475/14, Manhattan 97/3, and Tokyo
  3,679/59. The omitted conflicts were therefore real final geometry, not a
  camera or count interpretation.
- The first loss was the shared building/transport reconciliation stage.
  `footprintIntersectsRoadCenterline` rejected a building only when the exact
  centerline entered its polygon; it ignored the compiled road width. Later
  movement code treated road-core building collisions as likely ghosts and the
  traffic graph expanded every narrow road back to at least 4.8 m. These two
  downstream workarounds hid two physical owners occupying the same space.
- A vertical refinement of the same live data found 702 physical London and
  3,627 physical Tokyo at-grade conflicts. Every one used
  `fallback:road-class` width, not mapped `width=*`; none involved a building
  at least 60 m tall. The mapped centerlines and mapped building outlines were
  intact. The disappearing information was that an inferred cross-section had
  to yield to their mapped clearance.

### Completed bounded authority repair

- Mapped building outlines now constrain only class-default inferred at-grade
  road widths before final road mesh, traversal, collision, and traffic
  publication. The road keeps its source identity and original normalized
  cross-section; `resolvedCrossSection` records
  `authority=mapped_building_clearance`, source/resolved widths, mapped
  footprint distance, clearance, constraint feature id, and the explicit
  `mapped-footprint-clearance` inference method. It is not described as a
  surveyed measurement.
- A mapped centerline intersection, an explicit/mapped road cross-section
  conflict, an inferred building-footprint conflict, or less than the 1.2 m
  minimum publishable surface suppresses the conflicting building instead of
  creating overlapping owners. Grade-separated roads and buildings that
  explicitly allow passage below keep their independent vertical ownership.
- A resolved road narrower than the traffic renderer's actual 4.8 m vehicle
  envelope remains visible mapped context but becomes non-driveable. The
  traffic graph now consumes the resolved width exactly and excludes narrow or
  non-driveable segments; it no longer inflates them back through buildings.
- The building layer product publishes all reconciliation counts and the
  assembled verifier requires a non-null authority record, zero unresolved
  at-grade conflicts, and a minimum resolved surface width of at least 1.2 m.
  The actor verifier separately proves that a constrained narrow road produces
  no traffic edge and validates either promoted near vehicles or the actual
  17-part Living World traffic geometry.

### Verified result

- Local staged artifact:
  `4.3.0+dd5dbd250cd4.e082da92aee9a145.staging` (`sourceDirty: true`, never
  deployed).
- The corrected complete assembled matrix passed Baltimore/JFX, Golden Gate,
  London, Monaco, Manhattan, and rural Iowa. It reported zero unresolved
  at-grade conflicts everywhere. Resolved road/building counts were:
  Baltimore 318 constrained roads/249 newly non-driveable; Golden Gate 42/31;
  London 610/458; Monaco 304/202; Manhattan 44/36; and rural Iowa 3/3. Each
  minimum final width remained above 1.2 m. Building publication remained
  24,032 at JFX, 14,351 London, 5,714 Monaco, 10,763 Manhattan, and 144 rural
  Iowa, so the repair did not trade the skyline for empty road corridors.
- The final Tokyo actor run retained 12-14 visible articulated traffic vehicles
  and zero pedestrians. Its complete gameplay frame shows the narrow road
  ending at the mapped building edge instead of passing through the building.
  Final London, Monaco, Manhattan, Baltimore/JFX, Golden Gate, Iowa, and Tokyo
  frames were visually inspected with the assembled terrain, water, buildings,
  transport, population, atmosphere, HUD, collision, and player active.
- `verify:source`, staging artifact build/hash verification, the corrected full
  `verify:assembled-locations`, and final full Baltimore/London/Tokyo
  `verify:actors-vehicles` passed. The actor matrix retained 11-14, 12-13, and
  13 visible vehicles respectively with zero pedestrian NPCs.

### Still open; do not call the world repaired

1. The direct horizontal road/building overlap is closed, but London and Monaco
   still show severe ordinary-road/terrain shaping, and Tokyo, Monaco,
   Manhattan, Baltimore, and London still show building foundations that float,
   bury, or disagree with final terrain. The new Tokyo frame makes that vertical
   failure especially clear.
2. Ordinary at-grade road grades are still reported but not failed by the
   engineered-only grade gate. This is independent of cross-section width.
3. Rural Iowa still arrives on terrain rather than a nearby mapped transport
   surface. Far-field building heights and final LOD/culling remain separate.

Next bounded task: trace building base elevation from accepted terrain through
building-time terrain sampling, final terrain publication/water masking,
foundation/apron geometry, batching, collision base, and final visibility.
Compare the same London, Monaco, Manhattan, Baltimore, and Tokyo gameplay paths.
Do not reopen the repaired structure, NPC, or cross-section authorities. Do not
push or deploy.

## 2026-08-20 audit checkpoint 5 — rendered building foundations own collision

### First authoritative loss

- Final-world sampling ruled out a general stale-terrain explanation. Across
  6,000 Tokyo buildings, the accepted-ground values recorded at compilation and
  samples from the final terrain after water masking agreed within 0.000004 m.
  Equivalent Baltimore samples agreed within 0.000005 m. London, Monaco, and
  Manhattan were likewise stable except for a small, separate set of waterfront
  footprints affected by the later water mask.
- The first widespread loss was collision publication. The renderer extended
  every sloped building body down to its bounded low-ground foundation, but the
  collider began at the high-ground sample and retained only the mapped body
  height. The visible top and collision top matched while the visible downhill
  wall below the high sample had no collider.
- Before repair, the split exceeded 0.1 m in 4,203/6,000 sampled Tokyo
  buildings, 3,645/4,000 Baltimore, 3,833/4,000 London, 3,967/4,000 Monaco, and
  3,494/4,000 Manhattan. Gaps reached 8.96 m in Tokyo and the existing 12 m
  foundation cap in London/Monaco. Direct final collision queries found 3, 6,
  93, 695, and 10 respectively sampled downhill foundation interiors whose
  visible walls could be traversed.
- The same visual/collision split exists in the user-approved `fcc82f2`
  baseline and the recovery commit. It is a latent shared building-authority
  defect, not evidence that the current bridge compiler introduced the visual
  terrain shaping.

### Completed bounded authority repair

- Solid building collision now uses the exact rendered building-body extent:
  the accepted-ground visual base through mapped/inferred body height plus the
  bounded foundation rise. This preserves the same roof/top elevation while
  closing the non-colliding downhill segment.
- Passage-below semantics, mapped heights, footprint identity, provider
  provenance, terrain geometry, batching, facade geometry, and transport are
  unchanged. No terrain flattening, city exception, duplicate collider, fake
  foundation, or inferred measurement claim was added.
- The building layer product now publishes foundation-collision profile and
  mismatch counts. The complete assembled verifier requires a populated single
  authority and zero mismatches, and Tokyo is now a first-class member of the
  assembled location matrix rather than relying only on the actor check.

### Verified result

- Local staged artifact:
  `4.3.0+84c09596f92d.618c047d7d80a818.staging` (`sourceDirty: true`, never
  deployed).
- `verify:source`, hosting build/hash verification, the complete mutable-source
  seven-location matrix, the complete immutable-artifact seven-location matrix,
  and `verify:actors-vehicles` passed. Every location reported a nonzero
  foundation-collision population and zero mismatches. Baltimore/London/Tokyo
  retained 10-14 visible vehicles and exactly zero pedestrian NPCs.
- Complete artifact frames were opened and inspected for Baltimore/JFX, Golden
  Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo with terrain, water,
  buildings, transport, population, atmosphere, HUD, collision, and player
  control active.

### Still open; do not call the world repaired

1. This physical collision repair does not correct the visible ordinary-road
   and terrain shaping. London, Monaco, and Tokyo remain visibly incoherent;
   rural Iowa still arrives off-road. Those are separate authority traces.
2. Final water masking changed accepted-ground samples by more than 0.1 m for
   3/4,000 London, 7/4,000 Monaco, and 1/4,000 Manhattan sampled building
   footprints, reaching 4.88 m in Monaco. These waterfront cases need a separate
   hydrology/building ordering decision; they were not folded into this repair.
3. The user clarified that facade doors and glass storefronts should face the
   mapped street so the street wall reads naturally. The current frames do not
   prove that outcome. Audit mapped entrance provenance, facade-edge selection,
   street association, batching, and final visibility as its own bounded task;
   do not put NPCs on the transport graph or invent mapped entrances.
4. Ordinary-road grades, far-field building height/LOD, and rural arrival remain
   open production blockers.

Next bounded task: trace street-facing facade and entrance publication from
mapped entrance identity (or explicitly labeled non-mapped presentation) through
nearest eligible street association, facade edge selection, mesh batching, and
final complete-world visibility. Preserve the repaired foundation collision,
road clearance, provider-order, and no-pedestrian-on-transport authorities. Do
not push or deploy.

## 2026-08-20 audit checkpoint 6 — directed road attitude owns non-player vehicle pitch

### First authoritative loss

- The defect was reproduced in the normal assembled London and Monaco gameplay
  path, not an isolated vehicle scene. The traffic graph endpoint heights
  already matched the final compiled road surface. `agentPose` then discarded
  their directed vertical slope, and both the instanced and detailed vehicle
  render paths applied yaw only.
- Before repair, the worst visible London case predicted 0.2523 m of penetration
  on a 14.93% road chord; Monaco reached 0.2868 m. A London parked vehicle on an
  8.81% chord predicted 0.0807 m. These values are comparisons against compiled
  rendered geometry, not surveyed road or vehicle measurements.
- The loss covered moving ambient traffic, near-detail promotion, parked cars,
  and civic responders. The player-controlled vehicle was not the failing
  authority: its existing five-point road contact already derives terrain pitch
  and roll and renders with `YXZ` orientation.
- The recovery commit itself published position/yaw-only ambient traffic. This
  was therefore a shared latent vehicle-presentation defect, not evidence that
  the bridge compiler or the preceding building-collision repair changed road
  heights.

### Completed bounded authority repair

- Each directed traffic edge now publishes `surfacePitch` from the same two
  compiled surface endpoints that own its position. Reverse edges reverse the
  pitch naturally. A shared numeric helper only derives attitude; it does not
  modify topology, elevation, grade, source identity, or provenance.
- Far instanced traffic, promoted/detailed traffic, parked and claimed vehicles,
  and responders now consume road attitude through the existing vehicle root.
  Responders sample the same road surface fore and aft along their actual
  heading. The player vehicle keeps its existing contact model and receives no
  competing road-attitude writer.
- Publication diagnostics record sloped traffic edges, sloped vehicles, the
  `directed-traffic-edge` attitude authority, and render mismatches. The actor
  verifier includes Monaco and requires London/Monaco to contain both sloped
  edges and nonzero-pitch vehicles; matching zeros can no longer pass.
- No suspension simulation, fake ramp, city exception, duplicate vehicle or
  road renderer, road elevation rewrite, or inferred-as-surveyed measurement was
  introduced.

### Verified result

- Pre-commit local staged artifact:
  `4.3.0+377d10f70693.a5745ef727c68879.staging` (`sourceDirty: true`, never
  deployed).
- `verify:source`, hosting build/hash verification, source and packaged
  `verify:actors-vehicles`, and source and packaged
  `verify:assembled-locations` passed. Actor diagnostics reported Baltimore
  258 sloped edges/7 sloped vehicles, London 448/12, Monaco 496/12, and Tokyo
  366/12, with zero published/rendered attitude mismatches and exactly zero
  pedestrian NPCs at all four locations.
- Complete final gameplay frames were inspected for Baltimore/JFX, Golden Gate,
  London, Monaco, Manhattan, rural Iowa, and Tokyo with terrain, water,
  buildings, transport, population, atmosphere, HUD, collision, and player
  control active.

### Still open; do not call the world repaired

1. The inspected Golden Gate frame confirms the user's separate blocker: the
   driving deck appears vertically misaligned with its supports and contains a
   conspicuous longitudinal seam. Current continuity/count checks do not reject
   that visual failure. Trace it next as one structure/deck authority task.
2. London, Monaco, and Tokyo still visibly show ordinary-road/terrain shaping;
   rural Iowa still arrives away from mapped transport. This checkpoint changes
   vehicle attitude only.
3. Street-facing doors and glass storefronts, waterfront foundation/water-mask
   ordering, far-field height/LOD, and Baltimore skyline acceptance remain open
   as recorded blockers.

Next bounded task: at the same Golden Gate coordinates and normal player path,
compare the final deck surface, support/tower attachment, and seam against the
last approved/live version. Identify the first authoritative stage where their
shared geometry diverges before changing any code. Do not push or deploy.

## 2026-08-20 audit checkpoint 7 — published vertical control belongs to compiled transport

### First authoritative loss

- At the exact Golden Gate audit coordinate (`37.8115,-122.4774`), the complete
  current game published the selected walk/drive surface at 35.063 m while the
  separately rendered landmark truss/girders/suspenders assumed a 67 m deck.
  The resulting 31.94 m disagreement is the direct reason the roadway appeared
  below its supports. Counts and graph continuity could not detect it.
- Source comparison against local production commit `c7871f880d63` showed the
  predecessor mutating matching road features late from
  `bridge-landmark.js` and drawing a second landmark road deck at 67 m. The
  duplicate renderer visually concealed the compiled transport profile. Its
  removal established the correct single deck owner but also exposed that the
  transport compiler had never received the published bridge elevation input.
- The bridge district documents 67 m as clearance above mean higher high water.
  This is a published reference, not a surveyed scene elevation, and is now
  labeled that way in source data with the authority URL and datum.

### Completed bounded authority repair

- Added a generic transport-surface-control registry. Landmark-pack identity,
  exact mapped bridge name, elevated semantics, and reference-path proximity
  bind the control to both real Shortbread carriageway identities without
  replacing or fabricating either source feature.
- The structure station compiler resolves the published clearance against the
  mapped water surface and publishes the resulting minimum through the one
  compiled transport surface. Structure assembly, collision, traversal, road
  rendering, and actor contact continue to consume that same authority.
- Suspension towers/cables/truss now publish after transport compilation and
  sample the compiled road. The former landmark-only 67 m clamp is deleted; no
  second deck surface, visual-only ramp, city conditional in the compiler, or
  inferred-as-surveyed value was introduced.
- Runtime diagnostics expose control identity, source URL, datum, mapped-water
  sample count, resolution status, and landmark publication order. The
  assembled Golden Gate gate requires exactly two resolved controlled roads and
  a landmark that reports `compiled_transport_surface` ownership.

### Verified result

- Both mapped Golden Gate carriageways resolved a 67.08 m minimum from 122 and
  123 mapped-water samples. At the normal player path, walk, drive, and player
  contact agreed at 67.919 m within 0.00003 m. The final frame shows the
  roadway beside the stiffening truss instead of roughly 32 m below it.
- `verify:source`, mutable-source and immutable-artifact seven-location
  assembled matrices, packaged `verify:actors-vehicles`, and hosting artifact
  build/hash verification passed. Complete artifact frames were inspected for
  Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo.
  Staging artifact `4.3.0+cc3cd0e275b4.88622ca92bcc463a.staging` is local only.

### Still open; do not call the bridge or world repaired

1. The Golden Gate longitudinal/diagonal seam remains visible. Before this
   change, direct final-world geometry measured two 10.8 m mapped ribbons whose
   centerlines are 6.75-10.77 m apart, overlap by as much as 4.05 m, and had
   independently compiled vertical differences up to 1.12 m. The vertical
   checkpoint intentionally does not alter their horizontal surface ownership.
2. Do not restore the old landmark deck or late road mutation. The next change
   must publish one shared physical deck presentation while preserving both
   mapped carriageway identities for traffic and traversal.
3. London/Monaco/Tokyo road-terrain shaping, rural arrival, mapped-street-facing
   facade doors/storefronts, skyline/LOD, and waterfront ordering remain
   separate blockers.

Next bounded task: trace the two mapped carriageways through width inference,
parallel-road grouping, ribbon/marking batching, structure shells, collision,
and traversal. Remove the overlap at the first shared-deck authority stage,
verify the complete Golden Gate frame, then rerun the worldwide matrix. Do not
push or deploy.

## 2026-08-20 audit checkpoint 8 — mapped-water clearance is not a global deck floor

### First authoritative loss

- A real fully assembled run with the lossless OSM provider available replaced
  the generalized Shortbread bridge ways with complete 2.46 km mapped Golden
  Gate carriageways and their approach topology.
- Checkpoint 7 correctly resolved the published 67 m reference from mapped
  water, but then copied the maximum resolved value into
  `minimumStructureSurfaceY`. The transport surface compiler interpreted that
  property as an absolute lower bound at every sample, including land
  endpoints. Eleven exact connections broke, with a maximum 20.545 m delta,
  and one approach reached a 23.47% compiled grade.
- The generalized fallback had no authoritative approach connections at this
  location, so a count-only or fallback-only run could report zero
  discontinuities while hiding the lossless-source failure.

### Completed bounded authority correction

- Published navigation clearance remains a local hard lower bound at the
  mapped-water stations that produced it. It is no longer promoted into a
  global feature elevation floor.
- Exact transport graph nodes continue to own bridge endpoint tie-ins. The
  transport compiler still owns vertical profile, assembly, collision,
  traversal, and rendering; the landmark still owns no road deck or late
  elevation mutation.
- Added a complete mapped-bridge fixture that requires a 67 m water midpoint
  and exact 0.08 m surfaces at both connected endpoints. The reference remains
  labeled `published_reference_not_surveyed_scene_elevation`.

### Verified result

- `verify:source`, source and immutable-artifact seven-location assembled
  matrices, source and packaged actor/vehicle verification, and hosting
  build/hash verification passed. Every matrix location reported zero
  structure discontinuities and zero engineered-grade violations; actor runs
  retained zero pedestrian NPCs on transport and zero vehicle-attitude
  mismatches.
- Complete source and artifact frames were opened for Baltimore/JFX, Golden
  Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo. Temporary staged
  artifact `4.3.0+2bca4bea5a26.41d12289c45bf0ec.staging` was local only and
  built from dirty source.

### Still open

1. Golden Gate's overlapping directional ribbons and asymmetric roadway-side
   presentation remain visible and are the next bounded change. Do not alter
   the tower/cable/support design.
2. Provider success/fallback must remain covered separately: lossless source
   exposes real topology that generalized fallback cannot prove.
3. London/Monaco/Tokyo road-terrain shaping, rural arrival, street-facing
   facade doors/storefronts, skyline/LOD, and waterfront ordering remain open.

Next bounded task: restore the isolated shared-roadway work, publish one
physical Golden Gate road presentation while preserving both mapped traffic
identities, inspect the complete frame, and rerun both worldwide matrices.

## 2026-08-21 recovery checkpoint 1 — accepted ground is one provider-coherent stack

### First authoritative loss

- At the same World Trade Center coordinates and arrival camera, preserved
  candidate `4.3.0+88c3ff8b88a7.60a184335587db86.staging` accepted the
  `holland-tunnel-ground` classified Copernicus DSM as physical ground. That
  artifact contained a 69.36 m adjacent jump, 1,274 adjacent edges over 10 m,
  and 95.45% samples unchanged from the surface model. The final far field was
  then built independently from 42 Terrarium tiles and reached -492.623 m.
  Artificial terrain walls were visible in the complete frame. Transport was
  downstream and was not the first owner to lose correct geometry.
- The existing artifact builder also interpreted requested ground metres as
  raw EPSG:3857 metres. At New York latitude, a requested 45 km artifact covered
  only about 34 km on the ground. WTC happened to fit, but the identical
  Times Square gameplay envelope extended beyond it and silently reintroduced
  Terrarium. This was caught by the required game-client run after the first
  WTC improvement, before checkpointing.

### Completed bounded authority repair

- Runtime selects every covering artifact from exactly one highest-priority
  accepted provider, ordered finest to coarsest. It never mixes a lower-priority
  provider into that stack. Detail terrain, regional terrain, mapped-water beds,
  and far-building bases consume the same sampler.
- New York now uses reviewed USGS 3DEP 1/3 arc-second bare-earth source members
  4840 and 5223, locked in the export mosaic and individually bound to metadata
  hashes. Both 90 m delivery detail and 320 m delivery regional artifacts are
  normalized to EGM2008 through the pinned datum pipeline. Recorded source
  accuracy and normalization uncertainty are not claimed as surveyed scene
  measurements.
- Ground build plans convert requested ground extent to Web Mercator extent at
  the target latitude. The regional artifact covers 55 km, enough for the full
  22 km far field at WTC and Times Square. The superseded overlapping
  `holland-tunnel-ground` and `newyork-ground` runtime assets are deleted, so a
  catalog rebuild cannot restore competing physical authorities.
- Compact row-major Float64 encoding removes repeated per-sample JSON metadata
  while preserving all 95,290 elevations, grid spacing, extent, confidence,
  provenance, and hashes. Runtime decoding rejects wrong byte order, count,
  confidence, non-finite values, or content hash and preserves global sample
  keys. This is ownership/data reduction, not world-detail reduction.
- Release waits now prove a finite published terrain surface instead of
  requiring Terrarium cache entries. Regression fixtures cover provider
  coherence, finest/coarse fallback order, lower-priority exclusion, projected
  extent, retired catalog identities, artifact integrity, compact decoding, and
  grid identity.

### Verified result and remaining blockers

- Final complete Manhattan gameplay reports two artifacts
  (`newyork-detail-ground`, `newyork-regional-ground`), far authority
  `accepted-ground-stack`, zero elevation requests/cache bytes, zero unowned
  cells, 10,335 buildings, active traffic/Living World/Urban Sandbox, no road
  pedestrians, and no runtime, page, or local-resource errors. The inspected
  frame retains a tall skyline. The rendered/source neighborhood differs by no
  more than 0.0021 m.
- The identical WTC A/B removed the artificial Lower Manhattan walls and the
  -492.623 m fallback minimum. This does not establish a universal ground fix:
  it establishes the generic stack/extent/publication rule and replaces the
  proven-bad New York data with reviewed regional data.
- The seven-location assembled control run completed with all frames inspected.
  It correctly stayed red on Baltimore, Golden Gate, Monaco, and Manhattan
  topology/grade failures. The final Manhattan run passes every assembled gate
  except one exact 5.8597 m transport discontinuity; its worst ordinary mapped
  road remains 59.136% grade. Do not smooth or hide either result in the ground
  layer.
- `npm test` ran after the final edit. `verify:source` passed. `verify:world`
  remained red because it expects a far pedestrian character despite the
  explicit zero-pedestrian product requirement, and because its exact transport
  policy rejects a fallback run with zero authoritative connections even when
  the same diagnostic reports zero discontinuities. Do not convert either into
  a ground exception; resolve them with provider/test-policy authority.
- The first clean immutable-candidate rerun selected lossless OSM rather than
  generalized Shortbread. Ground evidence remained identical: two reviewed
  artifacts, zero Terrarium requests/cache bytes, and zero unowned cells. That
  run published 19,253 near buildings, retained the tall skyline, reproduced
  the 5.8597 m exact join, and measured a 66.453% worst ordinary road rather
  than the generalized run's 59.136%. Preserve both outcomes as provider-
  determinism evidence; do not lower building detail to force equal counts.
- Next bounded authority is deterministic provider/location selection, followed
  by one building identity/height catalog. Transport topology and simultaneous
  vertical solving, foundation composition, traffic contact, mapped façade
  frontage/storefronts, and memory ownership remain separate checkpoints. Do
  not push, deploy, promote, or call the release production-ready.

## 2026-08-20 audit checkpoint 9 — directional identities share one physical roadway

### First authoritative loss

- At the normal Golden Gate player path, the two real one-way carriageways had
  no mapped lane or width tags. Normalization therefore assigned each identity
  the complete 10.8 m motorway fallback width, and final presentation rendered
  both ribbons independently.
- Their mapped centerlines were only 6.75-10.77 m apart. The two inferred
  footprints overlapped by 0.03-4.05 m (mean 2.64 m), which created the visible
  longitudinal/diagonal seam and unequal roadway sides even after their
  vertical profiles agreed.
- This is a horizontal physical-presentation failure upstream of mesh
  publication. The bridge landmark compiler did not cause it, and tower/cable/
  support geometry did not need redesign.

### Completed bounded authority repair

- Added a generic shared-directional-carriageway presentation control. It
  binds exactly the two matched source road identities, orients and resamples
  their compiled paths, and publishes one averaged physical centerline after
  vertical transport compilation.
- The two source identities remain authoritative for provider provenance,
  topology, traversal, collision sampling, lane direction, and traffic. Only
  road ribbon, lane markings, and bridge shell share the single physical
  presentation; the second overlapping ribbon/shell is not published.
- The group uses the bridge district's published 19 m road-between-curbs and
  six-lane references. Source data records the official URL and labels the
  measurement `published_reference_not_surveyed_scene_width`; it is not
  described as surveyed geometry.
- The original complete mapped landmark path remains intact. Its axis is moved
  laterally to the compiled shared road center, while the existing two towers,
  two cable runs, girders, suspenders, and structure members remain unchanged.

### Verification and observed provider gaps

- Deterministic fixtures require two opposite directional identities to yield
  exactly one 19 m/six-lane physical presentation while retaining both source
  IDs. The complete Golden Gate gate additionally requires the landmark
  structure counts and `compiled_transport_surface_group` axis authority.
- Source and packaged actor/vehicle gates passed with active traffic, zero
  slope-attitude mismatches, correct lane side/direction, and zero pedestrian
  NPCs on transport. Source and packaged worldwide matrices passed complete
  runs; Baltimore/JFX, London, Monaco, Manhattan, rural Iowa, and Tokyo each
  must publish zero shared Golden Gate groups. All complete source and artifact
  frames were opened and inspected. Local-only artifact
  `4.3.0+c633918d4d00.60a184335587db86.staging` was never deployed.
- A lossless Monaco source run separately exposed an 8.9704 m exact connection
  mismatch and 47.727% grade between `osm:way:155081324` and
  `osm:way:155081354`. One packaged Tokyo lossless run exposed 12 exact
  discontinuities up to 15.9661 m and one 14.646% grade. Subsequent provider
  selections passed. This proves fallback-green matrices still do not establish
  lossless topology correctness; neither defect belongs to the shared Golden
  Gate group, and neither is patched here.

### Still open

1. Do not call the transport system or world production-ready. Monaco and Tokyo
   exact-provider topology failures need separate first-loss audits.
2. London/Monaco/Tokyo road-terrain shaping and rural Iowa arrival remain
   visibly incoherent in the complete frames.
3. The user-required mapped-street-facing doors and glass storefronts,
   skyline/LOD acceptance, and waterfront foundation/water ordering remain
   separate blockers.

Next bounded task after the user tests this checkpoint: trace mapped entrance
and street provenance through facade-edge selection, batching, LOD/culling, and
final visibility. Do not push or deploy.

## Current continuation after 2026-08-21 recovery checkpoint 1

Recovery checkpoint 1 above is now the latest authority result. New York near
and far terrain use the two-artifact reviewed USGS stack with no Terrarium
elevation requests inside the complete Manhattan gameplay envelope. The
production gate remains open. Continue with deterministic provider/location
selection as one bounded authority change; do not resume the older frontage
instruction immediately above until provider and building identity/height
authority are complete. Preserve the recorded 5.8597 m Manhattan transport
discontinuity and 59.136% ordinary-road grade as open evidence. Do not push,
deploy, promote, or reduce building/world detail.

## Current continuation after 2026-08-21 recovery checkpoint 2

Deterministic building-provider authority is now repaired in source. The first
loss was not the height resolver: the pinned June Overture PMTiles archive had
expired and returned 404, while the Overture adapter silently fetched
Shortbread inside an operation recorded as Overture success. Partial Overture
tile sets were also considered publishable, and the building layer product did
not record the actual winning source.

Source now pins reviewed Overture release `2026-08-19.0`, retries only the
failed tile identities once, rejects any remaining coverage hole, executes
Shortbread fallback under its own provider token, and publishes the actual
building source/decision. Candidate creation and release verification reject an
unreachable archive or one with fewer than fourteen expected public-retention
days. The official worldwide gate requires complete authoritative Overture
publication and cannot turn a generalized fallback green.

Two identical fresh Manhattan paths both published 15,272 buildings and 6,115
visible meshes from 9/9 tiles, with 15,192 mapped heights and 2,929 mapped-tall
records. Complete Baltimore, Golden Gate, London, Monaco, Manhattan, rural Iowa
and Tokyo frames were opened; all used the same pinned source with 9/9 or 12/12
coverage. This did not change height values, budgets, LOD, terrain, or transport.

The next bounded authority is building identity/height across near and far
publication. Baltimore still has only 23 mapped-tall records against 18,057
inferred heights; Tokyo has zero mapped-tall records in the tested core against
20,728 inferred heights. Treat those as the building blocker, not as permission
to scale all buildings, add city patches, or reduce detail. London/Monaco
foundation composition, rural Iowa arrival, road grades, transport topology,
traffic contact and mapped frontage remain separate. Do not push, deploy or
promote.

`npm test` remains red only on the already recorded far-pedestrian policy
conflict and zero-authoritative-connection policy conflict. Source verification
and the provider-release gate pass; no new provider, building, runtime, browser,
or local-resource failure appeared.

The first clean immutable candidate reproduced the source result exactly:
15,272 buildings, 6,115 visible meshes, 21,225 requested records, 9/9 complete
Overture tiles, 15,192 mapped heights, 2,929 mapped-tall records, and no
runtime/page/local-resource errors. Its full frame was opened and inspected.

## Current continuation after 2026-08-21 recovery checkpoint 3

The Baltimore skyline regression is now traced to publication coverage and
selection, not height resolution or the bridge compiler. The fixed-location
renderer advertised buildings through a 2,700-world-unit circular far-visible
domain, but building acquisition stopped at a 0.022-degree square. Transamerica
was 2,306.861 world units from the JFX origin and therefore visible by final LOD
authority but outside the provider's latitude edge. After provider coverage was
aligned, it was still displaced at the 26,000-record selection cap and then
rejected by a coarse loaded-road proximity test despite the exact conflict
resolver finding no conflict.

Source now derives building bounds by inverting the renderer projection,
clips rectangular provider tiles to the circular LOD domain before budgets,
retains sparse mapped buildings of at least 60 m before ordinary distance
distribution, and restricts coarse road-coverage eligibility to explicitly
inferred road-frontage geometry. Mapped Overture and Shortbread footprints flow
to the existing exact transport-conflict authority. No building height is
changed, no inferred measurement is labeled surveyed, and no detail tier is
removed.

The exact mapped Transamerica identity is again an attached visible mid-LOD
mesh with 161 m height and 40 levels from mapped metadata. Final JFX evidence
contains 65,561 decoded provider records, 48,915 circular-domain records,
26,000 selected, 25,623 rendered, 48 mapped-tall records, and 591 mapped
footprints retained beyond coarse road coverage. One World Trade Center remains
an attached visible near mesh with its mapped 417 m roof-height record.

Do not call the release production-ready. The fresh complete matrix is red at
Baltimore (13 exact joins, maximum 12.8544 m, one 15.9978% grade), Golden Gate
(seven joins, maximum 8.0876 m), and Tokyo (twelve joins, maximum 15.9661 m,
one 14.6464% grade). London, Monaco, Manhattan and rural Iowa pass. All seven
pass zero-pedestrian, building-provider, single-surface, lane-direction,
runtime and resource checks. Visual inspection confirms JFX's central deck is
above ground; exposed terrain and disconnected strips around it are real
composition gaps. Trace the earliest shared exact-connection loss through
source endpoints, deduplication, graph identity, simultaneous vertical solve,
assembly and final publication as the next bounded authority task.

Memory/data also remains open. An unforced JFX sample reached about 1.77 GB used
JS heap, while another comparable source load sampled about 626 MB. Establish
retained ownership with forced-GC/lifecycle evidence before changing caches or
budgets, and do not lower building, ground or far-region detail. Vehicle hill
contact, one building identity across near/far LOD, mapped street-facing doors
and glass storefronts, and broader world composition remain later bounded
tasks. Do not push, deploy, promote or mutate user data.
