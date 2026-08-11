# Next Production Release Plan

## Current release train — truthful loading and regression gates (2026-08-11)

**Target:** the next patch release may be nominated only after the accepted
4.1.4 one-location terrain/building presentation remains intact and the
runtime-loading regressions below are closed. This is a local implementation
train; it does not authorize a push or deployment.

Completed in the current tranche:

- Runtime diagnostics are cache-only and cannot initiate terrain requests.
- Automated `advanceTime(ms)` now advances the runtime kernel by the requested
  deterministic duration instead of waiting one unrelated browser frame.
- The title workload is measured in Chromium. The gate covers runtime-ready
  time, request/script counts, encoded local bytes, long tasks, provider
  requests, request failures, page errors, and diagnostic cache mutation.
- Full-resolution destination images are no longer downloaded for 58-pixel
  title thumbnails. Measured local transfer fell from 11.95 MB to 7.64 MB.
- Gaia catalog data and all 27 Earth PBR images now start only after an
  applicable environment is selected. Interiors and fishing initialize through
  explicit on-demand facades. The block builder and Mars surface runtime also
  initialize only after their explicit controls are used. Installed Chrome now
  measures 4.21 MB across 318 scripts and 348 requests, while browser activation
  checks prove each deferred owner still becomes available.
- The false source-text startup test is now a pure policy test plus the browser
  workload gate. The stale test requiring fixed far-building massing to be
  deleted was replaced with current deterministic geometry-quality behavior.
- `verify:pr` is a bounded deterministic/player-contract tier with one browser
  startup measurement. Stable pushes retain `runtime:verify`; manual release
  verification additionally owns provider matrices and browser journeys.

Remaining exit conditions, in order:

1. Continue splitting title shell from location runtime. The improved measured
   baseline still eagerly reaches challenges, Live Earth, and the retained Moon
   support modules. The next checkpoint must isolate only owners that can be
   deferred without breaking selector or Earth/Moon/Space transition behavior.
2. Bound Shortbread and Overture tile concurrency and classify provider
   capabilities so an authoritative empty result is not followed by duplicate
   fallback work. Preserve OSM for roads/hydrology/landuse and Overture for
   building massing; do not replace the application with Overture-only data.
3. Fix movement-boundary hitches by removing the per-frame full-road fallback
   and separating minimap tile decode/redraw from actor-frame work. Require the
   existing cross-boundary car/walk/drone/plane diagnostic to prove the fix.
4. Make feature timers/listeners disposable and active only while their owner is
   active, beginning with weather and touch controls.
5. Migrate one high-change domain at a time out of shared mutable `ctx`, with a
   one-writer service API and lifecycle tests. Do not attempt a full rewrite.
6. Run the extended release suite, worldwide visual matrix, hardware-eligible
   Chrome performance session, immutable production artifact verification, and
   explicit human visual acceptance. Only then nominate the version/deployment.

Current measured budgets are regression ceilings, not production targets:
10 s runtime-ready, 350 requests, 325 local scripts, 4.4 MB local encoded data,
and a 3.0 s maximum title long task. Each architecture checkpoint must lower a
ceiling when its verified baseline improves; ceilings must never be raised to
hide a regression.

**Plan status:** Phase 6 blocked by failed visual acceptance; affected Phase 1–5
exit conditions are reopened
**Starting baseline:** `3823aea9333717ab1ea5032fb4ca929900ab8a81`  
**Release rule:** no production deployment until every phase exit condition and the final production gate pass  
**Design rule:** locations are evidence fixtures, never locations for patches

## Endpoint

This plan ends with one production candidate in which a single accepted-ground provider supplies height, a single normalized transport compiler supplies connectivity and vertical alignment, rendering/collision/navigation consume that same compiled product, each environment has one lifecycle owner, and real player journeys plus inspected presentation and hardware-eligible performance approve the artifact.

The implementation should be developed as one bounded release train with one reviewable commit per phase. If a phase fails, reset only to that phase's recorded rollback commit; do not partially promote it. Continuous Earth remains prohibited.

## Release-wide invariants and budgets

These apply to every phase:

- No unknown elevation is represented as `0`.
- No renderer, controller or visual pass independently changes accepted ground or compiled transport height.
- No terminal wall/barrier crosses a valid bridge, ramp, tunnel or elevated-road path.
- Actor travel limits do not reduce city, terrain, minimap, horizon, atmosphere, cloud, sky or space presentation.
- No location-name conditionals in production geometry, physics or controller code.
- Source provenance and schema/release identity survive normalization.
- Required screenshots are visually inspected by a named reviewer; generation alone is not a pass.

Production performance budgets, measured on a supported mid-tier Mac and Windows machine with hardware WebGL at 1440×900 or the nearest supported resolution:

| Metric | Budget |
|---|---:|
| interaction-ready world load, warm network | p95 ≤ 8 s |
| interaction-ready world load, cold network | p95 ≤ 15 s with visible progress and no >2 s unresponsive interval |
| active gameplay frame time | p95 ≤ 25 ms, p99 ≤ 50 ms |
| long animation frames | no task ≥ 200 ms after readiness; ≤ 2 tasks ≥ 100 ms per minute |
| sustained frame rate | median ≥ 50 FPS desktop; ≥ 30 FPS supported mobile |
| draw calls | p95 ≤ 250 desktop; ≤ 180 supported mobile |
| visible triangles | p95 ≤ 2.0M desktop; ≤ 1.0M supported mobile |
| mode switch | p95 ≤ 1.0 s Earth modes; ≤ 2.0 s environment switch |
| 10 repeated mode/location cycles | 0 renderer growth, 0 active-owner growth, ≤ 10% heap growth after GC opportunity |
| 10-minute drive | no upward trend in geometry, texture, listener, RAF, timer or cache counts after warm-up |
| minimap draw | p95 ≤ 8 ms desktop; ≤ 12 ms supported mobile |

SwiftShader runs remain useful deterministic checks but are always marked `budgetEligible:false`.

## Worldwide scenario catalog

Every phase selects relevant categories from this shared catalog:

- dense flat city;
- coastal city and water-adjacent tunnel;
- mountain city and buildings on slopes;
- alpine terrain;
- desert;
- below-sea-level terrain;
- high plateau;
- polar terrain;
- major bridge;
- long tunnel;
- short underpass;
- covered road and building passage;
- stacked interchange and complex ramps;
- famous urban intersection;
- vector/DEM tile boundary;
- sparse rural road.

Named fixtures include Baltimore (dense city), Miami Beach (coast), Swiss Alps (alpine), Golden Gate (major bridge), Holland Tunnel (long water-adjacent tunnel), and Pregerson Interchange (stacked interchange). At least one second fixture is required for every structure type to prevent a named-location patch.

## Phase 0 — Make acceptance tell the truth

**Single objective:** establish a reproducible baseline and replace false-positive release assertions before changing production behavior.

**Implementation checkpoint (2026-07-28):** Phase 0 guardrails are implemented on the audit branch. The readiness contract rejects the former one-sample road pass, blocked accepted ground, absent linear-feature presentation, synthetic direct-state “gameplay,” software-renderer performance, unreviewed screenshots and screenshot reviews whose hashes no longer match. The real keyboard-input drive launches through visible UI, waits for stable world readiness, reaches drive through the player-facing `F` cycle, and records input, surface, camera and movement telemetry. SwiftShader may satisfy only a reduced functional-motion threshold and always remains `releaseEligible:false`; hardware evidence still requires the full distance, sampling and camera thresholds. The journey also exposed and fixed a mode-cycle trap in which an unavailable plane transition left `F` stuck retrying drone-to-plane instead of continuing to drive.

**Owned systems:** test harness, evidence schema, release toolchain, artifact manifest prototype.

**Expected files to change:**

- `scripts/test-runtime-invariants.mjs`
- `scripts/test-world-matrix.mjs`
- `scripts/world-matrix-assertions.mjs`
- `scripts/test-phase5-sustained-earth.mjs`
- `scripts/test-travel-control-runtime.mjs`
- `scripts/test-space-flight-controls.mjs`
- test utilities and package scripts
- CI/release workflow and artifact-manifest files

**Prohibited files:** all `app/js/terrain/**`, `app/js/world/**`, controller/physics, renderer and production presentation files.

**Entry conditions:** audit baseline builds; exact snapshot and external test dependencies are recorded; default Python environment problem is understood.

**Work items:**

1. Lock Node/browser/Python dependencies, including `pyproj`, into one documented command.
2. Fail road readiness on unknown/no-hit samples and enforce statistically meaningful minimum samples.
3. Fail accepted-ground readiness when blocked/unconfigured.
4. Replace the zero-mesh readiness assertion with an explicit product requirement.
5. Separate deterministic simulated-frame soak from real-time gameplay soak.
6. Drive controls with browser input events in the acceptance layer; retain state injection only in unit tests.
7. Add screenshot metadata, deterministic camera/checkpoints, image comparison tolerances, and mandatory human sign-off.
8. Add artifact manifest containing full commit, lockfile digest, asset hashes, build timestamp/tool versions and deployment identifier.

**Automated tests:** pure assertions for pass/fail semantics; intentional broken-scene fixtures must fail; cache-stale test; required/optional request classification; full aggregate test in a clean environment.

**Visual/gameplay tests:** launch current Baltimore baseline and require the known floating geometry/blank minimap evidence to fail review. Exercise one five-minute real-input drive to validate harness timing.

**Worldwide categories:** dense city, alpine, coast, bridge, tunnel, interchange.

**Performance budgets:** harness must label hardware eligibility, record frame-time percentiles and LoAFs, and add ≤5% measurement overhead.

**Regression checks:** existing pure geometry contracts remain; no production file diff.

**Exit conditions:** a deliberately broken visual/runtime fixture fails; blocked ground cannot pass; no-hit roads cannot pass; simulated and real-time evidence are distinct; the entire clean toolchain is reproducible.

**Rollback point:** baseline `3823aea`.

**Expected commit boundary:** `test: make production acceptance outcome-based`.

## Phase 1 — Establish one geospatial and accepted-ground authority

**Single objective:** every production height and lat/lon conversion comes from one explicit metric-frame and accepted-ground contract.

**Owned systems:** local coordinate frame, terrain source/provider, datum, missing-data behavior, terrain publication and authorized height consumers.

**Expected files to change:**

- `app/js/config.js`
- `app/js/terrain/source-contract.js`
- `app/js/terrain/provider-adapter.js`
- `app/js/terrain/ground-provider-registry.js`
- `app/js/terrain/ground-artifact.js`
- `app/js/terrain/accepted-ground-runtime.js`
- `app/js/terrain/tiles.js`, `rebuild.js`, `height-sampling.js`, seams/material/LOD files
- `app/js/ground.js`, surface query/rules and a mechanical consumer allowlist

**Prohibited files:** transport geometry/graph, building facade/roof rules, controllers, space, UI, water visuals beyond adopting the ground API.

**Entry conditions:** Phase 0 committed; selected production DEM provider documents encoding, datum, coverage and license; representative artifacts are available.

**Work items:**

1. Define WGS84 input, local origin, `+X east`, `+Y up`, `-Z north`, meters and inverse conversion in one service.
2. Choose and record accepted vertical datum and provider release.
3. Return `{status, heightMeters, provenance, uncertainty}`; never numeric zero for missing data.
4. Delay atomic publication until required coverage is ready or show an explicit recoverable unavailable state.
5. Make render mesh, collision and sampling share the same decoded samples.
6. Add seam handling, normals and error-based LOD without smoothing away topography.
7. Route legitimate callers through accepted ground; fail unauthorized raw imports.

**Automated tests:** CRS round trips and axis fixtures; Terrarium/selected encoding decode vectors; datum fixtures; missing/corrupt/timeout behavior; tile seam equality; render/collision sample parity; authorized-consumer audit.

**Visual/gameplay tests:** inspect alpine ridges/valleys, mountain buildings, coastlines, below-sea-level terrain, plateau, polar terrain and a four-tile corner. No visible facets/seams or zero-elevation cliffs.

**Worldwide categories:** alpine, mountain city, coast, below sea level, plateau, polar, desert, tile boundary.

**Performance budgets:** ground sampling p95 ≤0.2 ms cached; no synchronous network/decode in frame; terrain stays within release-wide triangle/draw budgets.

**Regression checks:** minimap and spawn coordinates round-trip; sky/space axes unaffected; horizon not reduced.

**Exit conditions:** accepted-ground status is active with full scenario coverage; zero-as-missing is impossible; all production height consumers are enumerated and authorized; render/collision parity passes.

**Rollback point:** Phase 0 commit.

**Expected commit boundary:** `feat: establish accepted ground authority`.

**Implementation checkpoint (2026-07-28):** The catalog now contains one real,
complete Baltimore artifact built from the USGS 3DEP `MD_4County_D24` bare-earth
DEM mosaic. Its reviewed source attestation binds the official project report,
NAD83(2011)/NAVD88(GEOID18) source frame, source release, accuracy and hashes.
The build exports an uncompressed Float32 raster, decodes it deterministically,
normalizes every sample to WGS84(G1674)/EGM2008 with pinned NOAA datum grids,
combines source/datum/sampling uncertainty, and compiles 14,042 samples at
60-meter spacing into a SHA-256-bound 7 km × 7 km artifact.

World loading verifies that artifact before publication. Vector features
returned outside its accepted coverage are removed before district compilation,
and the transport coverage gate runs before geometry creation. Unsupported
locations publish no roads, buildings or terrain and expose
`no-accepted-ground-artifact-for-location`; returning to Baltimore restores the
accepted artifact normally. The runtime gate now measures 483 road probes and
24 representative journeys instead of one fabricated sample. Baltimore passed
with a 4.17% blocked-journey rate, 1.76% blocking lane-collision rate, exact
14-sample render/walk/drive surface parity and no console errors. Path
presentation is published as one accepted-surface batch rather than hundreds of
independent ribbons. Artifact corruption, edge coverage, outside-coverage,
Float32 TIFF decoding, accepted-ground selection, datum and unauthorized raw
consumer checks pass. The physics collision-response seam is isolated and the
maintainability guard now passes (`physics.js` 650 lines).

**Phase 1 exit checkpoint (2026-07-29):** Phase 1 engineering is complete and
the Phase 2 entry condition is satisfied. FABDEM remains excluded because its
production-use rights were not accepted. The public unsigned Copernicus
GLO-30 distribution now feeds a separate, correction-attested derived-ground
provider; direct DSM data is never relabeled as ground. The builder preserves
raw and classified products, hashes every source object, applies a conservative
slope-adaptive progressive morphological filter, caps classified corrections,
records uncertainty/provenance, and carries the required attribution and
liability notice into manifests and application legal surfaces.

Eight global artifacts now add Monaco, Swiss Alps, Svalbard, Antarctica, Dubai
desert, Dead Sea, Lhasa plateau, and an exact four-source-tile corner to the
Baltimore artifact. All Phase 1 worldwide categories therefore have active
coverage. Integrity-before-parse, corruption, complete edges, outside coverage,
below-sea values, plateau height, four-tile binding, source/ground separation,
authorized consumers, render/collision sampling parity, and the 0.2 ms cached
sampling budget pass. Visible browser launches at Monaco, Swiss Alps, Dead Sea,
and the four-tile corner reached ready state with the expected accepted
artifact and no runtime errors or visible zero-elevation/source-tile cliff.
The browser run was software-rendered and is not being misrepresented as the
later hardware-eligible release performance gate. Full evidence and reproduction
commands are in `docs/PHASE1_ACCEPTED_GROUND_HANDOFF.md`.

## Phase 2 — Compile one professional transport surface and graph

**Single objective:** one lossless transport model owns topology, vertical alignment and the products consumed by road rendering, collision and navigation.

**Owned systems:** transport ingestion/normalization, graph stitching, road corridor, at-grade cut/fill, structure-independent vertical alignment, mesh/collision/navigation publication.

**Expected files to change:**

- `app/js/world/shortbread-source.js` or replacement transport source adapter
- `app/js/world/compiler/transport-surface-model.js`
- district source/selected-location adapter
- `app/js/world/load-roads.js`, navigation, road render and surface-contract files
- transport semantics and graph utilities

**Prohibited files:** tunnel portal/wall visuals, building sources/presentation, water/ocean, player controller behavior, space, unrelated UI.

**Entry conditions:** Phase 1 active-ground API committed; authoritative source supplies or stably enriches full transport semantics.

**Work items:**

1. Preserve stable source identity and raw values for bridge, tunnel, covered, layer, level, location, cutting, embankment, incline, lanes, placement, width, surface, access, maxheight, destination, junction and one-way.
2. Join endpoint-to-endpoint and endpoint-to-interior fragments with metric tolerance and provenance/confidence.
3. Distinguish merges from planar crossings using topology and vertical ordering.
4. Derive widths/lanes only when absent and mark every fallback.
5. Build corridor joins/caps/markings/sidewalk boundaries without triangle fans, circular artifacts, overlap or gaps.
6. Fit signed terrain-aware cut/fill and bounded vertical curves; never drape every DEM bump.
7. Publish one immutable graph/surface used by mesh, collision and navigation.
8. Mark incomplete uncertain routes non-drivable or transition them safely; never add a blocking wall.

**Automated tests:** tag normalization; directionality; lane/placement width; graph joins including sub-meter drift and tile boundaries; intersection topology; grade/curvature/cross-section; mesh manifold/overlap checks; render/collision/navigation sample parity.

**Visual/gameplay tests:** forward/reverse steering on curves; dense intersection; rural road; tile boundary; at-grade hills; ramp merges and stacked crossings viewed from car, walk, drone and plane.

**Worldwide categories:** dense city, rural, mountain road, intersection, stacked interchange, complex ramps, tile boundary.

**Performance budgets:** cached road surface query p95 ≤0.25 ms; spatial query p95 ≤0.5 ms; compilation does not block a frame >100 ms; overall render budgets apply.

**Regression checks:** actor-only boundary; current 4.1 UI/My Places/double-click/globe selection unaffected; no Continuous Earth code.

**Exit conditions:** every scenario has one graph/surface identity across render/collision/navigation; no unsupported terminal wall; grades and clearances pass; real-input journeys complete.

**Rollback point:** Phase 1 commit.

**Expected commit boundary:** `feat: make compiled transport the sole road authority`.

**Phase 2 exit checkpoint (2026-07-29):** Phase 2 engineering is complete and
the Phase 3 entry condition is satisfied. Public OSM/Overpass is the lossless
primary transport source; public OSM Shortbread is a generalized fallback.
Normalization preserves stable source identity and 33 raw transport fields,
including direction, access, lane, placement, structure and vertical-order
semantics. Generalized grade-separated fragments are explicitly uncertain and
non-drivable rather than being promoted with invented structure metadata.

One immutable compiled graph now owns sub-meter endpoint joins,
endpoint-to-interior joins, shared source-node topology, crossing separation,
direction and connection provenance. The same graph stations and compiled
surface feed ribbons, markings, collision/surface queries and walk/drive
navigation. At-grade profiles use bounded signed cross-section cut/fill and
vertical smoothing; placement-aware bounded-miter corridors replace the former
independent terrain mutation and unbounded corner behavior.

The complete `npm test` chain passes. The runtime gate passed on two distinct
public responses, including a 3,522-road/25,362-building run with 13,822 walk
segments, 12,881 drive segments, exact render/walk/drive surface parity, a
resolved mapped-footway route and no console errors. Public-source smoke
coverage loaded Monaco, Svalbard, Antarctica and Dubai desert transport, while
unsupported Sydney correctly failed closed. The 600-feature compiler test
completed in 3.3 ms; cached surface and spatial p95 queries were 0.0068 ms and
0.0341 ms, respectively. Hosting build/verification and strict reachability
also pass. SwiftShader evidence is functional only and is not claimed as the
later hardware-eligible release performance gate. Full ownership, source
policy, evidence and Phase 3 constraints are recorded in
`docs/PHASE2_COMPILED_TRANSPORT_HANDOFF.md`.

## Phase 3 — Specialize structures without fragmenting authority

**Completion:** complete on the Phase 3 commit boundary. Named and paired
real-input journeys pass on Apple M1 Metal with inspected screenshots,
accepted public ground, physical portal exits, stacked clearance, enclosed
camera clearance, and zero centerline structure collisions.

**Single objective:** bridges, ramps, overpasses, tunnels, covered roads and building passages are typed products of the Phase 2 transport model.

**Owned systems:** structure taxonomy, stacking, independent vertical profiles, bridge decks/supports/side barriers, tunnel portals/masking/walls/ceilings/lighting/collision.

**Expected files to change:**

- `app/js/structure-semantics.js` and `structure-semantics/**`
- `app/js/world/compiler/tunnel-system-model.js`
- `app/js/terrain/structure-tunnel-visuals.js`
- `app/js/terrain/structure-visuals.js` and visual meshes
- `app/js/world/bridge-guardrails.js`, bridge support/landmark/safety files
- structure-specific scenario fixtures

**Prohibited files:** accepted-ground provider internals, base transport graph/corridor except documented interface corrections, building source merge, water owner, controllers, space/UI.

**Entry conditions:** Phase 2 graph/surface is sole transport authority; full source semantics and incomplete-route state are available.

**Work items:**

1. Normalize distinct bridge, tunnel, covered, underground, building-passage, culvert, cutting and indoor cases.
2. Compute deck thickness, fascia, lateral guardrails, piers, abutments, portal cuts/masks, ceiling/walls and clearance from the compiled alignment.
3. Join split structure ways and approaches across tiles.
4. Apply smooth vertical transitions and ramp tapers within grade/clearance budgets.
5. Make collision and camera clearance match visuals.
6. Make incomplete source routes safe and non-trapping without disguising them with a wall.

**Automated tests:** taxonomy table; stacked ordering; clearance; side-only barriers; no barrier spanning drivable centerline; portal/approach continuity; split chains; incomplete-route policy; mode-spawn safety.

**Visual/gameplay tests:** complete Holland Tunnel spawn/entry/exit; switch walk/drive inside and after; second long tunnel; short underpass; covered road; building passage; Golden Gate approach/exit; second bridge; Pregerson traversal and ramp merge. Inspect portal, terrain mask, deck, supports, barriers and camera clipping.

**Worldwide categories:** major bridge, long tunnel, water-adjacent tunnel, short underpass, covered/building passage, interchange/ramps, tile boundary.

**Performance budgets:** structure compilation within world-load budget; portals/supports do not push scene over release-wide render budgets; no mode switch >1 s.

**Regression checks:** base at-grade roads unchanged; no location conditionals; no terminal walls; actor-only bounds.

**Exit conditions:** all named and type-paired journeys complete by real input, inspected screenshots pass, collision/visual/graph agree, and no player can be trapped.

**Rollback point:** Phase 2 commit.

**Expected commit boundary:** `feat: compile grade-separated transport structures`.

## Phase 4 — Make buildings and water provenance-safe

**Single objective:** building and water presentation has one owner per feature and never guesses across incompatible data identities.

**Owned systems:** Overture/OSM building assembly, parent/part suppression, height/foundation/roof/facade/material provenance, water/ocean ownership and boat surface selection.

**Expected files to change:**

- Overture/Shortbread/OSM/Overpass building source and building-pass files
- building semantics, batching, roof/facade/material and landmark opt-out files
- `app/js/world/water-body-contract.js`
- ocean/bathymetry and boat water-query ownership interfaces
- coastline/waterway rendering files

**Prohibited files:** ground provider implementation, transport compiler/structures, controllers beyond consuming the resolved water surface, space, core runtime lifecycle.

**Entry conditions:** accepted ground is stable; stable identity/provenance policy is approved; all cross-source merge cases are enumerated.

**Work items:**

1. Define Overture as geometry authority where complete; use OSM semantic enrichment only with stable explicit mapping.
2. Assemble outline/parts across tile boundaries before parent suppression.
3. Preserve height, levels, min-height, material, color and roof attributes; deterministic generic values only when absent and marked inferred.
4. Prevent generic rules from overwriting mapped landmarks.
5. Place foundations/parts from accepted ground without floating or terrain mutation.
6. Create one water-surface registry resolving ocean/inland/coast priority and elevation.
7. Require polygon containment and navigability for boat-mode selection.

**Automated tests:** identity/provenance; parent/part tile boundary; height/min-height/roof/material mapping; no duplicate shell; foundation parity; coastline ownership; no duplicate water sheet; boat eligibility.

**Visual/gameplay tests:** dense landmark district, generic residential area, sloped mountain buildings, coastal city, inland water, water-adjacent tunnel and boat entry/exit. Inspect facades, roofs, floating parts and water seams.

**Worldwide categories:** dense city, mountain city, coast, inland water, below-sea-level, tile boundary.

**Performance budgets:** stable building/water counts after load; batching keeps overall calls/triangles in release budget; no duplicate geometry publication.

**Regression checks:** transport clearance and tunnel portals remain visible; landmark identity preserved; no inferred data presented as mapped.

**Exit conditions:** every rendered building/water feature has one authority/provenance record; parent/part and coast fixtures pass; no floating/duplicate geometry in inspected evidence.

**Rollback point:** Phase 3 commit.

**Expected commit boundary:** `feat: enforce building and water provenance ownership`.

**Phase 4 exit checkpoint (2026-07-29):** One immutable building provenance
model now owns every rendered source feature, batch, roof and collider.
Overture is authoritative only with complete tile coverage, parent suppression
waits for complete part assembly, and OSM enrichment requires explicit stable
identity. Mapped fields and landmarks are protected from generic inference;
foundations bind to accepted ground without terrain mutation.

Ocean, coast, inland water and waterways now publish through one priority-aware
water registry with stable part identity, holes, access and navigability.
Boat discovery requires registry-backed containment and vertical reachability,
and subgrade transport context blocks tunnel-to-water activation. Pure
contracts, the Baltimore runtime ownership gate, and accepted-ground journeys
covering Baltimore, Monaco, Golden Gate, Holland Tunnel and the Dead Sea pass
on Apple M1 Metal without permission-gated data. The city, slope, coast,
inland-water, boat and tunnel evidence is recorded in
`docs/PHASE4_BUILDING_WATER_STATUS.md`.

## Phase 5 — Unify controller transitions and environment lifecycle

**Single objective:** normal player input drives independent, stable controllers through one transition state machine and one lifecycle lease per active environment.

**Owned systems:** driving/walking/drone/plane/boat/space controllers, camera state, mode transition, renderer/RAF/listener/timer/cache ownership and disposal.

**Expected files to change:**

- controller/input/physics/walking/plane/drone/boat files
- `app/js/space/runtime.js` and space scene/controller dependencies
- runtime kernel/lifecycle scope and renderer lifecycle
- mode-transition and environment entry/exit files
- lifecycle/control tests

**Prohibited files:** terrain source/datum, transport/building/water compilers, production data adapters, broad visual restyling, UI redesign.

**Entry conditions:** surface/structure/water APIs are stable; Phase 0 real-input harness is working; v3 space behavior capture is available as oracle.

**Work items:**

1. Correct forward/reverse steering sign, stale input state, surface attachment, suspension and camera smoothing from browser input.
2. Make walk/drive/tunnel/bridge transitions preserve valid pose and clear controller-local state.
3. Stabilize drone/plane camera and actor-only travel boundaries.
4. Inject Three.js dependencies into space control math; define spacecraft-local forward/right/up axes and quaternion composition.
5. Verify pitch/yaw/roll and chase camera across axis/pole crossings and Earth/Moon/Mars transitions.
6. Lease every renderer, RAF, listener, timer and cache to a session; dispose/cancel on exit.
7. Expose owner/resource counts to diagnostics and assert they return to baseline.

**Automated tests:** controller unit vectors; event-driven browser control; reverse steering; transition state table; surface attachment; space quaternion/camera invariants; 10-cycle renderer/RAF/listener/timer/cache test; stale async cancellation.

**Visual/gameplay tests:** 10-minute continuous drive, meaningful walk, tunnel/bridge switches, district drone/plane flight, boat transitions, space pitch/yaw across all local axes, launch and Earth/Moon/Mars round trips. Compare v3 space behavior without copying the release.

**Worldwide categories:** dense/mountain/coastal districts, bridge, tunnel, interchange, water.

**Performance budgets:** all release-wide budgets; controller update p95 ≤0.5 ms each; zero resource-owner growth across cycles.

**Regression checks:** UI feature parity, sky/stars/asteroids/Kuiper belt/spacecraft/galaxy/planets, horizon and district presentation remain intact.

**Exit conditions:** normal input proves every controller and transition; no camera flip/shake/trap; repeated transitions have stable owners/resources; sustained budgets pass on eligible hardware.

**Rollback point:** Phase 4 commit.

**Expected commit boundary:** `feat: make controller and renderer lifecycles deterministic`.

**Phase 5 exit checkpoint (2026-07-30):** Controller ownership, stale-input
clearing, accepted-surface attachment and transition state are deterministic.
The sustained Baltimore run completed 120 simulated seconds each for walk,
drive and drone plus 60 seconds for plane with walk p95 at 0.4 ms and no
controller conflict or failure. Space and ocean each completed ten launch/exit
cycles with one active renderer/RAF lease and no owner growth. Space local-axis,
quaternion-camera, planetary round-trip and real-keyboard structure transition
evidence is recorded in `docs/PHASE5_CONTROLLER_LIFECYCLE_STATUS.md`.

## Phase 6 — Production candidate and immutable promotion

**Single objective:** prove and promote exactly one reproducible artifact, with no new architecture or features.

**Current gate:** blocked. Direct player review found selector handoff failures,
incorrect water/land arrivals, overlapping ground presentation, visibly
disconnected or misaligned bridges/tunnels/skywalks, stale Earth sky state and
minimap drift. These are production-runtime defects, so Phase 6 cannot absorb
them or proceed to deployment.

**Owned systems:** release evidence, build artifact, deployment manifest, rollback package, changelog/release notes.

**Expected files to change:** version/changelog/release metadata, CI workflow, generated immutable manifest. Test evidence may be attached outside runtime source.

**Prohibited files:** all production geometry, data, rendering, controllers, UI and lifecycle code. Any required production-code change returns the candidate to its owning phase.

**Entry conditions:** Phases 0–5 committed independently; all Blocker/High findings closed; branch is clean; approved dependency/source releases are locked.

**Work items:**

1. Build once from a clean checkout.
2. Generate and sign/store commit, dependency, source-release and content hashes.
3. Run all four test layers:
   - pure geometry/data contracts;
   - runtime ownership/lifecycle;
   - worldwide real-world scenario matrix;
   - human-visible gameplay and sustained sessions.
4. Run eligible macOS and Windows-compatible Chromium; WebKit; supported physical iOS and Android smoke tests.
5. Two-person visual review of release screenshots/video and traceable results.
6. Produce concise release notes and an exact rollback artifact.
7. Promote the already-tested artifact without rebuilding; verify deployed hashes.

**Automated tests:** full locked suite, clean build reproducibility, artifact hash verification, cache-stale check, required network/source smoke tests.

**Visual/gameplay tests:** every required journey from Phases 1–5, including Holland complete exit and mode switches, interchange/ramp/bridge traversal, 10-minute drive, walk, drone/plane, space axes, mountain/coast and mobile.

**Worldwide categories:** entire catalog.

**Performance budgets:** all release-wide budgets must pass on eligible machines; no waiver converts an ineligible run into a pass.

**Regression checks:** current 4.1 UI direction, My Places, double-click exploration, globe custom location, space/sky parity and surrounding environment; Continuous Earth absent; actor-only boundaries.

**Exit conditions:** clean suite and human review; zero open Blocker/High findings; immutable artifact matches the release commit and deployed bytes; rollback is tested.

**Rollback point:** Phase 5 commit plus the previously promoted production artifact.

**Expected commit boundary:** `release: prepare WorldExplorer3D <version> production artifact`.

### Visual-coherence recovery order

The candidate returns to the owning phases in this order. A later owner cannot
patch around an earlier unresolved surface:

1. Resolve the selected place to one canonical latitude/longitude and preserve
   that identity through load, spawn, HUD and minimap.
2. Activate one accepted elevation surface and one ground-presentation owner.
   Missing presentation is allowed to fail closed; a fallback sheet may not
   overlay an accepted textured surface.
3. Compile the OSM water mask and semantic transport graph in the accepted
   ground coordinate frame.
4. Compile road grades, cuts, fills, bridges, portals and tunnels against that
   frozen surface. Incomplete elevated connectors and structures without valid
   endpoints are suppressed rather than rendered.
5. Place buildings and other detail after transport exclusions and vertical
   structure envelopes are known.
6. Attach actors, cameras and the minimap only after the compiled world is
   published.
7. Run named visual journeys before long soaks or release verification:
   Baltimore harbor, Monaco land arrival, San Francisco terrain, representative
   bridge/overpass transitions, tunnel portals, disconnected elevated
   walkways, ground-owner seams, minimap centering and every return-to-Earth
   path.

OSM is the semantic and topology authority for mapped roads, water, buildings
and structure tags. It is not an elevation raster or photographic ground
texture. Production therefore uses OSM plus exactly one accepted DEM/elevation
authority and one presentation layer. Optional building sources may fill
coverage only after normalization and deduplication; they never override OSM
topology or accepted ground.

## Commit and review discipline

- One architectural objective per commit/PR; fixups are squashed into their owning phase before merge.
- Generated evidence is not mixed into runtime commits unless it is a small stable fixture.
- No cache-bust-only commits; asset hashes come from the build.
- Required checks are Phase 0 truth tests, subsystem contract tests, typed scenario journeys, lifecycle soak, eligible performance and artifact equivalence.
- Branch protection should require review, linear history or merge queue, passing required checks and exact artifact provenance.
- Rollback means promoting the previously verified immutable artifact, not rebuilding an old branch.

## Definition of done

The plan is complete—not extended with more location patches—when Phase 6 verifies the immutable candidate and every audit Blocker/High finding is closed. Medium/Low work may be deferred only where the audit explicitly permits it and where it does not undermine a release-wide invariant.
