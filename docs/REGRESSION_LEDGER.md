# Regression Ledger

This is the durable record of visual and loading regressions already encountered in World Explorer 3D. Read it before changing terrain, water, sky, location loading, or asset publication. Add a dated entry whenever a regression is found and resolved.

Each resolved issue records the symptom, root cause, durable resolution, verification, and the shortcut that must not be reintroduced.

## 2026-08-14 — Multiplayer invite, discovery, and shared-shape regressions

- Status: resolved locally; not pushed or deployed.
- Symptom: private room codes could not complete a join, featured-city behavior
  came from competing rotations, room controls exposed actions members could
  not save, transient listener errors erased visible shared state, and slabs or
  ramps could shift/overwrite when synchronized. The existing multiplayer test
  remained green because it never connected two users or created a backend
  room.
- Root cause: private room and player reads contradicted the client join order;
  the local builder used a 0.5 vertical grid while its Firestore serializer,
  document IDs, and rules required integer `gy`; featured status had both
  owner-facing and admin-facing writers; and listener errors were delivered as
  valid empty/deleted snapshots. Presence also read only 24 entries for rooms
  whose model permits 32 and initially published an Earth frame for Moon/Space
  rooms.
- Resolution: private rooms are unlisted but readable by an authenticated
  invite-code holder, while collection-wide private-room enumeration remains
  denied. A known room code permits the pre-join player count and self-membership
  write. One canonical block schema preserves half-grid coordinates and IDs
  across local, network, and rules layers. Admin claims exclusively own the
  featured flag, one Earth-city rotation owns the weekly callout, owner-only
  settings are hidden from members, presence supports all 32 entries, and active
  room listeners retain their last good state while reconnecting. Ghosts render
  only when the remote and local world frames match.
- UX: Join, Create, My Rooms, city discovery, and curated rooms are separate
  workflows. Friends, invites, recent players, and the leaderboard remain
  available under secondary tools instead of competing with the primary path.
- Evidence: `npm run test:multiplayer-integration` passes 8/8 in two independent
  installed-Chrome contexts using local Auth/Firestore emulators: create,
  private-code join, two-player presence, movement, chat, shared half-grid
  slab/column stack, and real start-hub UI. Firestore rules pass 52/52. The
  in-game builder renders all four shapes/eight materials, enforces 200 pieces,
  lands the walker on block surfaces, blocks a car on a cube, and drives a ramp.
- Terrain guard: this multiplayer change has no terrain, ground, water, biome,
  vegetation, road, building, or transport-owner diff from accepted commit
  `0bb624c86874aa6d044637620716c860ccac5b7c`. Do not change those systems while
  repairing multiplayer.
- Never reintroduce: a test that calls only local APIs, integer rounding of
  shared `gy`, member-visible owner controls, owner-authored featured flags,
  blanking live room state on listener error, hard-coded Earth join frames, or
  ghosts from a different world/location frame.

## 2026-08-13 — Tunnel shells snag surface streets, steep camera clipping, and intermittent building pass-through

- Status: resolved locally; not pushed or deployed.
- Symptom: parts of tunnel shells appeared above Monaco streets and stopped the
  car, the chase camera entered terrain on steep grades, and some building
  collisions were intermittently ignored.
- Root cause: tunnel cover was measured only at the centerline, internal terrain
  cover gaps were incorrectly treated as physical portals, and tunnel ceilings
  were registered as sideways vehicle obstacles. The vehicle query also stopped
  after its first overlap even when policy rejected that overlap, hiding a solid
  building later in the same spatial bucket. The chase camera ray owned roads,
  structures and buildings but not the terrain between car and camera.
- Resolution: shell publication now requires 0.75 m of cover across the full
  outside wall width; only real graph endpoints create portals. Actor collision
  contains side walls to the tunnel-driving height and does not publish lateral
  ceiling colliders. Collision queries continue past rejected overlaps, swept
  movement has no 64-sample distance hole, and the chase arm samples the shared
  `SurfaceQuery` terrain segment before accepting its position.
- Evidence: installed Chrome loaded 9,475 Monaco roads and 116 exact covered
  tunnel routes. The least-buried sampled roof stayed 0.969 m below terrain;
  240 street-level tunnel probes produced zero false blocks; 80 tunnel samples
  produced zero centerline blocks; a real building blocked both point and
  120 m swept collision. Real ArrowUp driving moved 11.14 m on a 17.99% grade
  while the camera-to-car segment retained at least 1.48 m of terrain clearance.
- Guard: `npm run test:monaco-tunnels-browser`, `npm run test:tunnel-system`,
  `npm run test:phase3-structures`, and `npm run test:phase5-controls`.
- Never reintroduce: centerline-only tunnel cover, portals at internal cover
  fluctuations, ceiling AABBs in lateral actor collision, stopping collision
  search after a rejected ghost, capped swept sampling, or a terrain-blind
  chase camera.

## 2026-08-12 — Monaco ground contact disappears outside detailed coverage

- Status: resolved locally; not pushed or deployed. Hardware-Chrome acceptance
  remains open.
- Symptom: after changing locations or moving beyond the detailed city tiles,
  an actor could fall through visible terrain. Switching travel modes snapped
  the actor back to a surface but caused a long pause.
- Root cause: the fixed 22 km location terrain was a render-only owner.
  Ground/vehicle physics sampled only the smaller accepted-ground artifact and
  returned no height where the visible fixed terrain continued. The replacement
  browser check then hid this gap by switching to walk mode before measuring
  the arrival.
- Resolution: the already-built fixed terrain grid is now the unified height
  fallback outside accepted detailed coverage. Physics interpolates the exact
  `a-c-b / b-c-d` triangles published to WebGL, rather than independently
  resampling the underlying DEM; it adds no streaming, fetch, or second
  renderer. The replacement journey now records actor contact before any
  test-owned mode switch or respawn.
- Evidence: at a Monaco point 220 m outside the 25 available detailed tiles,
  accepted ground reports `unavailable` while rendered and physical terrain
  both report `301.3996886 m`. The grounded car stayed within `0.29 m` of that
  surface with no console error. The 30-second fixed-world journey drove 39.5 m,
  flew 708.9 m across the measured detailed boundary, issued zero movement data
  requests, and retained finite fixed-terrain contact.
- Guard: `npm run test:fixed-world-travel-browser`,
  `npm run test:world-load-cancellation-browser`, and the fixed-world horizon
  architecture contract. The fixed-world drive portion selects a measured,
  collision-clear mapped-road segment instead of relying on provider ordering
  or a longest-road endpoint.
- Never reintroduce: render-only terrain beyond the physics domain, a mode
  switch as arrival recovery, or a test respawn before measuring the published
  actor/surface relationship.

## 2026-08-12 — Aerial water striping from competing geometry owners

- Status: resolved locally in software Chromium; hardware-Chrome acceptance
  remains open.
- Symptom: Monaco showed horizontal aerial bands and large triangular water
  artifacts, especially looking across the coast from drone altitude.
- Root cause: the far-water loader deleted vector-ring vertices by spacing and
  stride before triangulation, which changed concave coastline topology. It
  also published duplicate `ocean`/`water_polygons` triangles and continued
  drawing far water through the inner area already owned by detailed water.
- Resolution: preserve mapped vector-tile ring topology, discard overlapping
  lower-priority far-water triangles, and geometrically clip far water to the
  exact outside of the detailed-location bounds. Detailed water owns the inner
  location; far water owns only the horizon continuation.
- Evidence: layer-isolation renders proved the bands remained with far water
  alone and disappeared when it was hidden. The corrected Monaco publication
  has 76 far-water polygons, 10,320 clipped triangles, 38 detailed water
  surfaces, and no console errors; the inner harbor/coast frame no longer
  changes when far water is toggled.
- Guard: `npm run test:phase5-aerial-transition`, `npm run test:hydrology`, and
  coastal drone screenshots with far-water visibility A/B evidence.
- Never reintroduce: point-count/stride polygon simplification, coplanar far and
  detailed water in the same region, or polygon offset/fog as a substitute for
  one geometric depth owner.

## 2026-08-12 — Vehicle collision envelope wider than the rendered car

- Status: resolved locally; real narrow-bridge Chrome driving remains open.
- Symptom: cars stopped or snagged on some bridges and ramps that visibly had
  enough room for the vehicle.
- Root cause: the rendered car is 1.8 m wide by 3.5 m long, but building and
  bridge-barrier collision treated it as one 2 m-radius circle—over 4 m wide.
- Resolution: collision now uses a three-sample longitudinal capsule aligned to
  the car heading, with a 0.92 m radius and a 3.52 m overall length. This keeps
  the visible body dimensions while retaining swept wall/guardrail collision.
- Guard: `npm run test:phase5-controls` now requires the 1.8 m vehicle to pass
  a 3 m protected deck while the swept thin-wall test still blocks tunneling.
  The real Pregerson ramp journey also completes with zero center-collision
  samples and 0.074 m maximum surface error.
- Never reintroduce: a center circle wider than the rendered vehicle, or global
  widening of accurate mapped bridges to compensate for a false actor shape.

## 2026-08-12 — Ramps snag vehicles and tunnel ways create false portals

- Status: resolved locally; not pushed or deployed. Hardware-Chrome visual
  acceptance and a clean exact-commit extended release run remain open.
- Symptom: motorway ramps were narrower than the vehicle/barrier envelope,
  joined freeways with visible height steps, and could stop the car. Tunnels
  were flattened to the surface or showed exposed shells at internal OSM way
  boundaries. The chase camera could also pass below an elevated road.
- Root cause: link roads shared a 4.2 m fallback width; each structure profile
  independently chose its merge height; generalized tile topology was treated
  like exact OSM node topology; a temporary tunnel-presentation fallback erased
  subgrade semantics; tunnel shell publication was disabled; `Number(null)`
  reset vehicle elevation to zero; tunnel continuity required matching names;
  and road meshes were absent from camera obstruction ownership.
- Resolution: link classes now own complete cross-sections (6.2 m motorway,
  5.8 m trunk, 5.5 m primary, and 5.2 m secondary/tertiary). One compiled
  graph-node profile owns merge elevation. Exact OSM nodes remain authoritative;
  generalized connections require metric and vertical compatibility. Complete
  fallback roads stay driveable, but generalized bridges cannot publish hard
  engineered barriers/supports. Measured generalized tunnels may publish only
  non-colliding shells. Exact tunnel semantics and shell publication are
  restored, connected tunnel ways remain continuous across name changes, null
  elevation reset is handled explicitly, and chase-camera obstruction includes
  live road meshes.
- Evidence: real ArrowUp Pregerson fallback travel moved 7.18 m with 0.054 m
  maximum surface error and no collision. Holland exact OSM tunnel, underpass,
  covered-road, and building-passage journeys passed. The corrected Shortbread
  tunnel fallback crossed a real measured-cover portal with 0.151 m maximum
  surface error, zero lateral error/collision, 2.32 m minimum camera height, and
  no console errors. Inspected interior/exterior frames keep the car visible and
  the shell below the city surface. `npm run verify:pr` passes all 36 checks.
- Guard: `npm run test:phase2-transport`, `npm run test:phase3-structures`,
  `node scripts/test-tunnel-system-model.mjs`, focused real-input structure
  journeys, the world matrix, and `npm run verify:pr`.
- Never reintroduce: a universal link width, per-feature merge-height ownership,
  source node IDs from generalized tiles, name matching as physical tunnel
  continuity, terrain-draping every tunnel, generalized hard structure collision,
  a disabled tunnel publisher, or a structure test that teleports onto an
  explicitly non-driveable route.

## 2026-08-12 — Completed primary OSM coverage triggers a duplicate vessel query

- Status: resolved locally; not pushed or deployed.
- Symptom: locations without mapped ships issued a second Overpass request
  after Overture buildings loaded, delaying publication even though the first
  successful OSM response had already queried the same ship and houseboat
  categories over the same building bounds.
- Root cause: the building-detail owner treated zero matching vessels as
  unknown coverage. It did not distinguish a complete exact OSM query that
  returned zero from the generalized Shortbread fallback, where those semantic
  categories are genuinely unavailable.
- Resolution: primary-query coverage is now explicit load-session evidence. A
  complete zero is terminal; the supplemental exact vessel query runs only
  after generalized fallback coverage or another incomplete source. Existing
  mapped vessel records continue to merge into Overture footprints first.
- Evidence: the replacement-location Chrome journey now records one completed
  Monaco Overpass request instead of two, while retaining 1,794 roads, 6,633
  building records, 42 water areas and a published immutable world snapshot.
  The measured journey fell from about 18.50 s to 11.27 s in these live runs.
- Guard: `npm run test:hydrology`, `npm run test:provider-cancellation`, and
  `node scripts/test-world-load-cancellation-browser.mjs`.
- Never reintroduce: equating an authoritative empty result with unavailable
  coverage, or issuing a second narrower query whose categories and bounds were
  already included in the completed primary request.

## 2026-08-12 — Building publication rescans every mapped water body

- Status: resolved locally; not pushed or deployed. Release-wide cold p95 and
  final visual acceptance remain open.
- Symptom: the correct 85% building publication took about eight seconds in
  dense Baltimore even after provider-failure fan-out was fixed.
- Root cause: every sample of every building footprint linearly searched every
  mapped water area, including water bodies on the opposite side of the fixed
  location. The same transport publication also rebuilt bridge guardrail
  conflicts with exhaustive road scans, recompiled unchanged at-grade profiles,
  and linearly searched all transport descriptors for each compiled connection.
- Resolution: one location-scoped water-area index now preserves source-order
  classification and the exact 45-metre nearby-water rule while returning only
  spatial candidates. Bridge barriers use an indexed road-conflict query. The
  initial throwaway guardrail pass and identical final at-grade profile rebuild
  are removed. Transport connection publication resolves descriptors through
  its existing unique-ID map.
- Evidence: on identical Baltimore output (5,125 roads, 26,163 building
  records, 74 water areas and 49 terrain tiles), mapped-water classification
  fell from about 5.51 s to 0.18 s, building geometry from 7.99 s to 2.00 s,
  and the measured cold load from 23.08 s to 15.59 s. The earlier exhaustive
  bridge visual pass fell from 7.37 s to about 0.12 s. Miami, Tokyo and London
  browser matrices retained mapped water/building publication with local water
  classification between 0.10 s and 0.25 s. Transport, hydrology and spatial
  parity contracts pass.
- Guard: `npm run test:hydrology`,
  `npm run test:bridge-road-conflict-index`, `npm run test:phase2-transport`,
  `npm run test:phase3-structures`, and the blocked-WorldCover Chrome matrix.
- Never reintroduce: an all-water or all-road scan inside a per-feature loop,
  temporary guardrail/collider publication before the final compiled graph, an
  identical second profile pass, or descriptor lookup by repeated array scan.

## 2026-08-12 — WorldCover outage serializes a location through 50 failures

- Status: resolved locally; not pushed or deployed. Overall cold-load budget
  remains an independent release condition.
- Symptom: Baltimore eventually published the correct fallback world, but a
  Titiler outage stretched the load to about 54 seconds while all 50
  WorldCover requests failed in six-request waves.
- Root cause: concurrency was bounded, but provider availability was not. Each
  failed request merely opened another queue slot, so a known-down endpoint was
  retried once for every terrain tile.
- Resolution: the WorldCover owner now uses one provider outage circuit. A
  timeout, network error, HTTP 429 or 5xx response opens a 60-second cooldown,
  aborts sibling requests and rejects queued/new network work as unavailable.
  Cached blobs remain usable, caller cancellation does not poison the provider,
  and the normal mapped/PBR fallback remains unchanged.
- Evidence: the 50-request browser contract finishes in about 70 ms after six
  provider calls, one circuit trip and five sibling aborts. A real installed
  Chrome run with Titiler blocked still published Baltimore with 5,125 roads,
  26,163 buildings, mapped water, 49 terrain tiles and no fatal console errors.
- Guard: `npm run test:provider-outage-circuit`,
  `npm run test:worldcover-provider-outage`, and the blocked-WorldCover world
  matrix provider snapshot.
- Never reintroduce: per-tile retries after endpoint availability is already
  known, a second WorldCover loader, fallback removal, or a higher cold-load
  budget used to conceal provider-failure fan-out.

## 2026-08-12 — Weather state has multiple mutable-context writers

- Status: resolved locally; not pushed or deployed.
- Symptom: weather mode, live/active weather, reverse-geocoded place labels and
  caches could be initialized or replaced from multiple modules, making state
  transitions and lifecycle tests dependent on import order.
- Root cause: `state.js`, `weather.js`, and the place resolver all treated
  shared `ctx` fields as writable ownership rather than a compatibility view.
- Resolution: one weather-state service owns those fields and caches. Existing
  consumers retain read compatibility, while all mutations use service methods.
- Evidence: the behavioral service contract, lifecycle contract, mobile
  portrait/landscape gameplay, module identity, maintainability gate and full
  PR tier pass.
- Guard: `npm run test:weather-state` plus `npm run test:maintainability`; the
  latter rejects direct weather-state writers outside the service.
- Never reintroduce: import-order initialization of weather state, ad hoc cache
  replacement, or direct `ctx` assignments from UI/provider modules.

## 2026-08-11 — Movement outside road coverage scans the entire city every frame

- Status: resolved locally; not pushed or deployed.
- Symptom: car and walking movement became visibly uneven after crossing the
  detailed-location boundary. Monaco outer-region walking reached 69–100 ms p95
  frames even though the fixed world itself was no longer loading.
- Root cause: a miss in the three bounded road-index radii silently fell back to
  evaluating every road segment. Each ordinary off-coverage lookup cost roughly
  15–22 ms and movement/ground queries could invoke it repeatedly in one frame.
- Resolution: an indexed miss is authoritative for normal gameplay. The active
  road membership set is built with the spatial index, continuity candidates
  remain bounded, and the all-road path now requires `forceFullScan: true` for
  diagnostics. This also prevents selecting a road kilometres from the actor.
- Evidence: installed Chrome loaded Monaco with 1,794 roads, 6,633 buildings,
  52 terrain children, and a stable world publication. Off-coverage lookup p95
  fell to 0.1 ms or less; car, walk, drone, and plane outer-region frame p95 was
  17.6–17.7 ms. Minimap redraws were 4–10.5 ms, disproving the earlier theory
  that another minimap pipeline was required.
- Guard: `npm run test:movement-query-bounds`, the existing transport compiler
  performance contract, and the installed-Chrome movement-boundary diagnostic.
  The contract proves an ordinary miss evaluates zero segments while the
  explicit diagnostic scan remains available.
- Never reintroduce: an implicit full-city fallback after an indexed miss, a
  per-frame allocation of the full road list, or a second minimap/preload system
  without measured evidence that the existing bounded redraw is the bottleneck.

## 2026-08-11 — Provider tile bursts and authoritative-empty fallback duplication

- Status: resolved locally; not pushed or deployed.
- Symptom: one fixed location could start every Shortbread or Overture tile at
  once. A successful Overture query containing no building tile payload was
  misclassified as provider failure and followed by a second Shortbread batch.
- Root cause: each provider owned a separate `Promise.allSettled` fan-out, and
  Overture decided availability from decoded payload count instead of completed
  coverage. Successful empty coverage and unavailable coverage were therefore
  indistinguishable.
- Resolution: one pure shared scheduler limits provider batches to eight
  in-flight tiles while retaining ordered settled results and world-load
  cancellation. Successful empty Overture coverage now publishes
  `authoritative-empty`; only zero successful tile responses can start exactly
  one Shortbread fallback. Provider decisions and maximum observed concurrency
  are recorded in diagnostics.
- Test correction: startup timing is a release budget only with a hardware WebGL
  renderer. SwiftShader continues to enforce request, byte, activation, provider,
  error, and cache-mutation correctness, but is explicitly ineligible for
  runtime-ready and long-task budgets. Installed Chrome still enforces both.
- Guard: `npm run test:provider-cancellation`, `npm run test:earth-core-boundaries`,
  `npm run test:load-performance-comparison`, and the hardware-Chrome startup
  gate. Tests require concurrency never exceed eight, each Overture tile be
  requested once, authoritative empty never invoke fallback, and true
  unavailability invoke one fallback.
- Never reintroduce: unbounded per-provider fan-out, transient duplicate whole
  batches, fallback based on decoded feature count, or treating SwiftShader
  latency as hardware production evidence.

## 2026-08-11 — title imported the complete Earth world before location intent

- Status: resolved locally; not pushed or deployed.
- Symptom: the title made 298 script requests and transferred about 4.00 MB of
  local data even when the player had not chosen Earth. Ground, terrain, and
  world compilation code was evaluated before it could produce a visible
  location.
- Root cause: `app-entry.js` directly imported the four legacy Earth roots.
  `world.js` alone reached 106 modules and `terrain.js` reached 52; there was no
  single readiness boundary between the title shell and location publication.
- Resolution: a small idempotent facade owns `ensureEarthRuntimeReady()` and a
  compatible `loadRoads()` entry. It imports the ground → terrain → world →
  building-entry cohort exactly once after Earth intent. Idle Chrome now makes
  175 script requests and transfers 2.88 MB, while Explore installs the real
  loader before location compilation.
- Test correction: the lifecycle plateau test still required all five
  environment adapters at idle even though Mars was deliberately deferred. It
  now requires the four title/exercised adapters at idle, explicitly activates
  Mars intent, and then requires the fifth adapter.
- Guard: the startup browser gate forbids the Earth runtime roots on idle,
  requires requested and ready states after Explore, and uses ceilings of 220
  requests, 190 scripts, and 3.1 MB. The title planetary journey proves no
  Earth road load precedes Moon, Mars, or Space and proves Earth return still
  publishes a real road world. The 20-cycle lifecycle plateau remains green.
- Never reintroduce: direct Earth compiler imports in the title entry, a lazy
  stub that does not install the real world loader, or an adapter-count test
  that mistakes an intentionally deferred environment for missing behavior.

## 2026-08-11 — startup policy and far-building tests passed for the wrong reasons

- Status: resolved locally; not pushed or deployed.
- Symptom: the startup workload test passed by finding expected strings in
  source while Chrome loaded hundreds of scripts and optional systems. A
  building-quality test failed solely because the currently required fixed
  far-building massing module existed.
- Root cause: tests encoded an earlier implementation shape rather than an
  observable product contract. The title also used full-resolution gameplay
  images for five tiny destination thumbnails and automatically contacted
  location providers for the default selection.
- Resolution: startup policy is tested as pure behavior and Chromium enforces
  measured budgets plus a no-Earth-provider-on-idle rule. Diagnostics use
  cache-only terrain peeks. The default selector no longer performs automatic
  reverse-geocode/bathymetry work. Dedicated 256-pixel UI thumbnails preserve
  the title presentation while reducing local transfer from 11.95 MB to
  7.64 MB. The far-building test now verifies stable-identity determinism,
  mapped height preservation, and tall-sliver rejection.
- Follow-up: the same gate now forbids idle Gaia and Earth PBR requests and
  requires Explore to activate them. Interiors and fishing use complete lazy
  facades, are absent from the idle title graph, and are explicitly initialized
  by the browser gate. The block builder is likewise absent until its UI or B
  control is used, and the Mars world is absent until direct Mars or
  Space-to-Mars intent. Challenge and Live Earth implementations remain absent
  until Missions/leaderboard or Live Data intent; their real controls and the
  complete nine-layer Live Earth registry are verified after activation.
  Runtime, plane/interior, block-builder, and Mars return journeys remain green.
- Guard: `npm run verify:pr` owns the measured title gate and recurring
  player-facing contracts. Provider/world matrices and browser journeys remain
  in `release:verify`; do not move live provider matrices into the fast PR tier
  or restore source-string assertions as evidence of runtime behavior.

- Never reintroduce: importing an optional feature solely to bind one title
  button, loading Live Earth on ordinary Explore selector open, or replacing a
  deferred feature with an inert stub that cannot prove its real UI/registry
  after intent.

## 2026-08-11 — planetary return test observed an intermediate state as completion

- Status: resolved locally; not pushed or deployed.
- Symptom: the Mars browser journey reported that returning to Earth failed to
  restore Earth scene ownership even though the asynchronous restoration was
  still running.
- Root cause: the test treated `ENV.EARTH` plus retained road data as completion.
  The environment commits before the selected Earth world finishes resuming,
  and old road arrays can already be populated at that intermediate point.
- Resolution: Earth return readiness now requires visible Earth scene
  ownership, no active Moon/Mars state, hidden Mars surface, and published roads.
- Guard: the Mars title journey now passes direct launch, cancelled return,
  relaunch, and return to visibly restored Baltimore. Never use an environment
  enum alone as proof that an asynchronous environment handoff is complete.

## 2026-08-08 — Source-pattern tests claim player-visible behavior

- Status: resolved on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: tests could pass because a function name, constant, or code fragment existed even when the browser behavior was absent or had moved to a better implementation. Several names also implied runtime/production coverage despite checking architecture only.
- Root cause: structural prohibitions, pure behavior, rendered evidence, and release evidence were combined under broad legacy test names.
- Resolution: renamed and narrowed the location, fixed-horizon, and release-architecture suites; removed their visual source claims; added executed published-location/HUD identity behavior; moved globe activation/ocean launch to the existing browser owner; and replaced hardcoded vehicle configuration regex checks with one frozen runtime configuration contract.
- Guard: the release path executes `test-world-location-identity`, `test-world-load-cancellation-browser`, `test-fixed-world-travel-browser`, and the world matrix. Source checks may block only explicit dependency, ownership, deleted-symbol, asset-identity, or lifecycle rules.
- Never reintroduce: treating a matching source string as proof of visual output, labeling synthetic/direct-state evidence as real gameplay, or keeping an obsolete test solely because it already exists.

## 2026-08-08 — Bundled data schema drift can look like an empty location

- Status: resolved on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: a changed or malformed bundled building-metadata/landmark file could return `null` or an empty result, making missing detail look like legitimate lack of mapped data rather than a provider failure.
- Root cause: the JSON files declared schema version, identity, source, and license, but their runtime adapters checked only for an `elements` array and did not expose the declared provenance.
- Resolution: validate version-1 index/pack schemas, pack identities, and element arrays before publication; expose schema and license provenance; propagate fetch aborts; and keep injected fixture requests outside the normal runtime promise caches.
- Guard: `npm run test:provider-cancellation` executes valid packs, schema changes, timeout/abort propagation, provenance, and cache isolation. `npm run test:world-load-cancellation-browser` exercises the actual local packs through the live finalizer.
- Never reintroduce: treating malformed provider data as a valid empty location, accepting a pack under the wrong identity, or allowing test fixtures to populate runtime caches.

## 2026-08-08 — Successful Overpass request leaves unused endpoint attempts alive

- Status: resolved on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: after one Overpass endpoint returned valid world data, stagger timers for the other endpoints could remain alive and wake later even though their result could no longer be used. The adapter was also hard-wired to global `fetch`, so its timeout and schema behavior could not be tested without real network calls.
- Root cause: endpoint requests shared a result race but did not share a request-owned cancellation controller. Only controllers already created at the instant of success were aborted; attempts still waiting on their stagger delay were outside that cancellation set.
- Resolution: one internal request controller now owns every stagger delay and endpoint request. The first valid response aborts that controller and all unused attempts. Endpoint/fetch injection is restricted to adapter options so deterministic fixtures can execute success provenance, malformed payload, timeout classification, and session cancellation without a parallel runtime path.
- Guard: `npm run test:provider-cancellation` and `npm run test:world-load-cancellation-browser`. The live Baltimore→Monaco journey must still abort the superseded request, publish the replacement, and finish every provider ledger at zero.
- Never reintroduce: independent stagger timers without a winning-request cancellation owner, duplicate retries after success, or source-string checks standing in for executed provider failure behavior.

## 2026-08-08 — City can publish before valid terrain surface detail settles

- Status: resolved on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: a dense city could intermittently appear with grass immediately beside buildings even though a later inspection or rerun showed the expected built gray WorldCover/PBR surface.
- Root cause: every detailed grid tile queued WorldCover before accepted-ground height validation. Fail-closed edge tiles then became hidden, so their surface requests were temporary work that was loaded and discarded while competing with valid city tiles. Final publication required geometry readiness but did not explicitly require the visible central terrain materials to have settled.
- Resolution: queue WorldCover only after the terrain mesh passes accepted-ground height validation. Before committing and revealing the matching snapshot, require visible, height-valid detailed terrain in the central fixed area to report zero pending surface-material work; record readiness, pending count, timeout, and wait duration in the immutable terrain product.
- Guard: `npm run test:city-surface-semantics`, `npm run test:terrain-tile-cancellation`, `npm run test:initial-play-workload`, and `npm run test:world-load-cancellation-browser`. The browser journey requires terrain readiness with `pending=0` and `timedOut=false`, then records nearby mesh WorldCover/PBR states for visual review.
- Never reintroduce: starting surface-provider work before a tile is known to be publishable, fetch/build/discard work for invalid terrain, or revealing a city while its core visible surface materials are still pending.

## 2026-08-08 — Building detail republishes presentation before finalization

- Status: resolved on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: the building-detail pass built a provenance snapshot and called `publishLocationWorld`, then the final world owner rebuilt provenance and published presentation again after landmarks.
- Root cause: an earlier incremental-loading path retained its own publication call after the loader had moved structure, terrain, traversal, spawn, and visibility work into finalization.
- Resolution: building detail now compiles only its records and meshes, invalidates the terrain-height cache, and reports record counts. Finalization is the sole provenance and presentation owner. Unused publication options were removed from building and landmark calls, and the maintainability guard rejects any new application call site outside `world/load-support.js`.
- Guard: `npm run test:building-publication-scheduling`, `npm run test:phase3-ownership`, `npm run test:maintainability`, and the real transition browser test, which requires one immutable snapshot revision for the replacement location.
- Never reintroduce: making partially loaded geometry visible from a provider/detail adapter, rebuilding the same provenance snapshot twice, or passing unused publisher callbacks through adapters.

## 2026-08-08 — Browser event timing falsely reports terrain scheduler over-budget

- Status: resolved in the local test authority; runtime budget remains 12.
- Symptom: Baltimore→London reported a raw Playwright Terrain-RGB request-event peak of 17 while the bounded scheduler reported 12.
- Root cause: an image's `onload` resolves the scheduler worker before Playwright emits its later `requestfinished` notification. URL-level tracing showed every peak request was a unique London tile, with no Baltimore URL and no duplicate URL.
- Resolution: keep the scheduler's measured maximum of 12 as the blocking concurrency claim; separately require zero duplicate Terrain-RGB URLs, at most one canceled 12-request batch, and zero final in-flight work. Retain the raw event peak as a diagnostic only. The replacement coordinator still waits for the canceled generation promise, but no arbitrary sleep was added.
- Guard: `WORLD_LOAD_REPLACEMENT_LOCATION=london npm run test:world-load-cancellation-browser` records the peak URL set and duplicate URL counts.
- Never reintroduce: raising the runtime concurrency budget, adding a fixed delay to satisfy event ordering, or treating Playwright notification lag as proof of duplicate loading.

## 2026-08-08 — Superseded location keeps loading and overlaps terrain requests

- Status: resolved on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: selecting a second location waited for the prior city's provider work, allowed stale results to finish, and could leave hundreds of terrain image requests running or discarded during transitions.
- Root cause: location identity lived in mutable application state; the world loader serialized different selections without invalidating the active request; Overpass endpoint staggering ignored cancellation; and the far-terrain `Promise.all` launched every elevation image at once with no generation-owned abort.
- Resolution: each load now owns an immutable request and explicit session state machine. A different selection supersedes the active session once, aborts its OSM/Shortbread signal, prevents its publication, cancels its far-terrain generation, and begins the replacement only after legacy collection mutation has stopped. Far-terrain elevation work is capped at 12 concurrent requests, and aborting a generation clears its active image sources, evicts those request entries, and prevents further batches.
- Guard: `npm run test:world-load-session`, `npm run test:world-load-coordinator`, `npm run test:far-field-elevation-loader`, `npm run test:terrain-tile-cancellation`, and `npm run test:world-load-cancellation-browser`. The browser guard performs a rapid Baltimore→Monaco transition and requires Baltimore=`superseded`, its OSM work=`aborted`, Monaco=`published`, no active requests at completion, and measured z12 concurrency ≤12.
- Never reintroduce: waiting for a different location without invalidating the active request, source-name tests that do not execute cancellation, unbounded terrain `Promise.all`, treating a discarded response as an aborted request, or raising the network budget to hide overlap.

## 2026-08-08 — Superseded provider starts fallback work

- Status: resolved and revalidated on the local `steven/earth-core-recovery` branch; not released or deployed.
- Symptom: changing locations could abort an authoritative request but still start a fallback dataset, publish fallback terrain, or leave water/building/landmark requests outside the session ledger.
- Root cause: accepted-ground and Overture adapters converted aborts into ordinary provider failures; Overture tile batches and retry delay did not receive the session signal; mapped water, metadata, and landmarks were not consistently run as session-owned provider work.
- Resolution: propagate the session signal through all of these blocking paths, rethrow aborts before any fallback, make retry delay cancelable, and classify provider work as aborted whenever the owning controller is aborted.
- Guard: `npm run test:provider-cancellation`, `npm run test:world-load-cancellation-browser`, and the provider ledger in the runtime snapshot.
- Never reintroduce: catch-all fallback after `AbortError`, provider calls without the active session signal, non-cancelable retry sleeps, or treating a session-owned abort as a provider failure.

## 2026-08-08 — Dense mapped city appeared to resolve to grass between buildings

- Status: disproven for the current local Monaco and London paths with rendered GPU evidence.
- Symptom: dense buildings and roads are present, but the exposed city ground visibly resolves to grass immediately beside building walls.
- Evidence: the center terrain tile reports WorldCover `built` as its dominant class (13,355 of 16,384 pixels, confidence 0.815), a built-blend attribute with maximum weight 1, and `smoothed-worldcover-built-blended-pbr`; the rendered frame still visibly shows grass across the built district.
- Investigation result: the original screenshot interpretation was not sufficient to prove a render failure. A controlled render of the actual Monaco terrain mesh proves that all six Three.js shader insertions compiled and that high-built pixels render gray (`~30,34,35`) while natural pixels render green (`~3,9,1`), with a measured RGB distance of 50.0. No visual material patch was needed.
- Resolution: retain authoritative per-pixel WorldCover classification, expose compile/weight diagnostics, and make rendered built-versus-natural sampling part of the real Chromium transition guard. The stale source assertion that treated grass fallback as visible proof remains removed.
- Guard: `npm run test:world-load-cancellation-browser` and `WORLD_LOAD_REPLACEMENT_LOCATION=london npm run test:world-load-cancellation-browser` write city-specific surface captures, require every shader insertion, sample matched high-built and natural pixels, and reject visually indistinguishable output. Monaco measured RGB distance 37.7–50.2 across runs; London measured 37.5.
- Never use: whole-tile urban paint, whole-tile grass fallback for a built-dominant tile, fabricated sidewalks, building-footprint-colored overlays, or hiding the symptom with fog/lighting.

## 2026-08-07 — Mapped water ends at the detailed-city boundary

- Status: resolved in the 4.1.3 release candidate; production reference was 4.1.2 at commit `f7d04023138d5c1ca7e4a30a6597bfa880ba900d`.
- Symptom: Baltimore harbor and similar mapped water appeared near the city, then disappeared beneath distant land at the fixed detailed-area boundary.
- Root cause: the 4.1.3 far field extended land and buildings to the horizon, but its mapped context loaded only land, sites, and buildings. The authoritative near-water pipeline still loaded only the selected city's detailed bounds.
- Resolution: load low-detail Shortbread `ocean` and `water_polygons` for the entire fixed 22 km far field, simplify only sub-grid shoreline detail, and triangulate the mapped polygons (including visible holes) into a separate horizon-water mesh above the coarse terrain. Water bodies smaller than 200 m are intentionally left to the detailed pipeline because they are below the 320 m horizon grid's useful resolution. Near water remains the higher-detail visible owner at the city center.
- Guard: `npm run test:phase5-aerial-transition`; inspect Baltimore and London from drone altitude in Chrome.
- Never reintroduce: a rectangular blue plane, water inferred from low elevation, terrain vertex colors used as a water substitute, or continuous movement-based streaming.
- Global semantic note: Shortbread stores glaciers in `water_polygons`; the far-water parser must exclude `kind=glacier` so snow/rock terrain remains the visual owner.

## 2026-08-07 — Previous city visible during location transition

- Status: resolved in the 4.1.3 release candidate.
- Symptom: while another city loaded, the prior rendered city showed behind the transition content instead of the normal loading image.
- Root cause: JavaScript assigned the CSS `background` shorthand. That reset the loading screen's black `background-color` to transparent while a fresh Chrome session downloaded or decoded the image.
- Resolution: retain an explicit opaque black background and set `backgroundImage`, `backgroundPosition`, `backgroundSize`, and `backgroundRepeat` individually.
- Guard: `npm run test:loading-transition`, `npm run test:loading-transition-browser`; test a second location with browser cache disabled.
- Never reintroduce: a `loading.style.background = ...` shorthand for the full-screen transition.

## 2026-08-07 — Open-ocean destination renders green ground or a fake shoreline

- Status: resolved in the 4.1.3 release candidate.
- Symptom: a selected Atlantic location showed the green loading ground beneath the boat and reported a precise distance to a shoreline that did not exist.
- Root cause: open-ocean loads deliberately publish no land terrain, but the green bootstrap plane could retire only after a land terrain tile became ready. Separately, clipped vector-ocean tile edges were treated as real coastline boundaries.
- Resolution: suppress the bootstrap plane when the accepted-ground activation selects `open-ocean-surface-only`; use one fixed open-ocean surface extending to the horizon; and mark ocean-polygon edge distances as unknown so the HUD does not present them as shoreline measurements.
- Guard: `node scripts/test-accepted-ground-activation.mjs`; run `atlantic_ocean_custom` through the world matrix and verify zero active land terrain, open-ocean water to the horizon, and no “to shore” subtitle.
- Never reintroduce: fabricated land beneath an ocean-only load, a rectangular city water plane, or coastline claims derived from vector-tile clipping edges.

## 2026-08-07 — Published world keeps the previous location name

- Status: resolved in the 4.1.3 release candidate.
- Symptom: coordinates and geometry changed to a new world location while the HUD or mutable custom selection retained Baltimore/the prior city.
- Root cause: a delayed title/session restoration could mutate the selected location while an already-started world load was completing; reverse-geocoded labels were also accepted without checking their coordinates.
- Resolution: each load captures its requested selection and restores that exact selection before becoming ready. Weather place labels are accepted only when their coordinates match the loaded origin.
- Guard: the world matrix records `locationPresentation`; test a city → ocean → lake sequence and require the selection, origin, resolved HUD label, and rendered geometry to agree at every stop.
- Never reintroduce: using a mutable title-screen selection or an unmatched reverse-geocode result as the identity of an already-published world.

## 2026-08-07 — Custom city arrival is trapped by a steep or enclosed road segment

- Status: resolved in the 4.1.3 release candidate.
- Symptom: a custom city could load successfully but place the walker against a terrain/building wall or on a severe road ramp.
- Root cause: arrival scoring validated the immediate spawn point but did not evaluate whether the mapped road remained usable beyond that point.
- Resolution: mapped spawn candidates sample both directions along a 40 m terrain corridor, choose the lower-change heading, and penalize severe corridor elevation changes while remaining within 160 m of the selected coordinate.
- Guard: `npm run test:phase5-production`; visually inspect a custom Sydney ground arrival and its drone context.
- Never reintroduce: city-name exceptions, camera-only flips, or accepting a spawn solely because the exact point is collision-free.

## 2026-08-06 — False blue square or water moat around a city

- Status: resolved; architectural constraint remains active.
- Symptom: a blue square surrounded Baltimore, London, and other locations even where no water was mapped.
- Root cause: coarse far terrain was classified as water using an elevation threshold and/or a tile-sized water owner, turning rectangular coverage bounds into visible water.
- Resolution: only mapped polygon/ribbon sources may publish water. Elevation can position a mapped water surface or its bed, but cannot decide whether water exists.
- Guard: aerial-transition contract rejects elevation-as-water classification; visual checks use inland and coastal cities.
- Never reintroduce: `sourceMeters <= 0.75` or any equivalent elevation-only water test.

## 2026-08-06 — Blank world and stars visible through the ground

- Status: resolved.
- Symptom: terrain and buildings stopped in a square, leaving empty sky below the horizon.
- Root cause: removal of the erroneous water owner also removed the only coarse background surface.
- Resolution: a fixed-location terrain clipmap extends beyond the camera far plane. It is loaded once per selected location, not continuously while moving.
- Guard: far-field outer-distance and sky-behind-ground contracts plus drone-altitude screenshot review.
- Never reintroduce: hiding stars that should be astronomically visible; the ground must occlude them through correct geometry and depth ordering.

## 2026-08-06 — Stripes or seams on distant ground

- Status: resolved.
- Symptom: alternating ground stripes appeared near the transition between detailed and coarse terrain.
- Root cause: overlapping coplanar detailed and far meshes caused depth fighting.
- Resolution: the far-field grid includes exact detailed-tile edges and excludes only cells with complete detailed terrain coverage.
- Guard: `cellInsideDetailedCoverage` and exact seam-axis assertions in `test:phase5-aerial-transition`.
- Never reintroduce: broad polygon offset as a substitute for non-overlapping ownership.

## 2026-08-06 — Disabled features still add initial loading work

- Status: resolved; performance constraint remains active.
- Symptom: location loading performed work for disabled sidewalks/footpaths or built temporary results that were discarded.
- Root cause: publication policy and fetch/build policy were not consistently coupled.
- Resolution: disabled visual categories must be excluded before network fetch and compilation, and each accepted dataset must have one publication owner.
- Guard: initial-play workload and publication-ownership contracts; compare phase timings in the world-matrix report.
- Never reintroduce: fetch/build/discard pipelines for a feature disabled by product policy.

## 2026-08-08 — Partially compiled city geometry appears during a location load

- Status: resolved locally for the 4.1.4 candidate.
- Symptom: terrain, buildings, water, or landmarks from an in-progress load could appear before the matching world publication was ready; ownership was repaired later by a per-frame adoption pass.
- Root cause: location-world builders attached meshes directly to the global Three.js scene even though an Earth scene root already existed.
- Resolution: all location-world geometry now enters the existing Earth root through one owner. The root stays hidden while the selected location compiles and is revealed only after the matching immutable `WorldSnapshot` commits. A superseded session cannot reveal or discard the replacement session's root.
- Guard: `npm run test:maintainability`, `npm run test:surface-contract`, and `npm run test:world-load-cancellation-browser`; the browser journey requires the replacement root hidden while building, then all tracked meshes and terrain under the visible published root with zero direct-scene escapes.
- Never reintroduce: direct `appCtx.scene.add(...)` calls from location-world compilers, a second scene-staging pipeline, or frame-loop adoption as normal publication behavior.

## 2026-08-08 — WorldCover tile squares and missing inland horizon terrain

- Status: resolved locally for the 4.1.4 candidate; sustained travel and fixed-world network evidence pass.
- Symptom: farmland could show one rectangular grass tile inside brown fields, Monaco hills could break into categorical color blocks, and Lake Tahoe could finalize with a flat empty horizon when one coarse elevation tile failed.
- Root cause: each WorldCover tile selected its own grass/soil/forest PBR color map even though spatial WorldCover tint already owned land-cover variation. Separately, the far clipmap treated one failed z12 elevation tile as failure of the entire fixed horizon.
- Resolution: the nearest ready WorldCover tile selects one location-wide PBR base mode; all ready neighbors reuse it while retaining natural-surface tint. Fixed-location outer geometry uses that same PBR/tint authority. Missing z12 outer-elevation tiles retry through unique z11 parent tiles under the same 12-worker scheduler; non-ocean matrix locations cannot finalize unless horizon terrain is ready.
- Guard: `npm run test:worldcover-detail-mode`, `npm run test:fixed-location-terrain-material`, `npm run test:far-field-elevation-loader`, and the eight-class world matrix assertion that `publishedDetailModes` has exactly one location owner and non-ocean `farTerrainClipmap.status` is `ready`.
- Never reintroduce: per-tile categorical albedo ownership, a second terrain presentation/material authority, an unconditional extra elevation pass, or silent fixed-world publication after outer terrain becomes unavailable.

## 2026-08-08 — Movement or Space return reloads the selected Earth world

- Status: guarded locally for the 4.1.4 candidate; not released or deployed.
- Symptom: movement could appear correct while silently starting another terrain or provider pipeline, and a Space return could rebuild Earth instead of restoring the retained publication.
- Root cause risk: prior synthetic journeys advanced controllers without real browser time or request capture, so they could not prove network-idle ownership or the visible return transition.
- Resolution: one release-owned Chromium journey drives for 30 real seconds, flies for 30 real seconds across the measured detailed-terrain boundary, enters Space, and returns to the captured aircraft pose and unchanged Earth request.
- Guard: `npm run test:fixed-world-travel-browser`; ready-world drive/flight and Earth return must issue zero fixed-world data requests, keep publication counts stable, restore the same request/location/root, and produce no console errors.
- Never reintroduce: actor-driven fixed-world loaders, travel-mode terrain refreshes, Earth republishing during a retained Space return, or a state-only substitute for the rendered transition.

## 2026-08-09 — Detailed city terrain appears as a gray square

- Status: resolved locally for the 4.1.4 candidate; not released or deployed.
- Symptom: at drone altitude, a rectangular gray city surface was visibly surrounded by pale or differently colored far land even though both surfaces represented one fixed location.
- Root cause: the detailed 7×7 terrain footprint converted coarse WorldCover `built` pixels into a gray hardscape shader, while separately authored outer geometry could not reproduce that detailed raster. A prior attempted fix also treated multiplicative WorldCover tints as final far-field RGB. Together those independent presentation authorities exposed the detailed tile boundary as an asphalt square inside pale land.
- Resolution: detailed and outer fixed-location geometry now share the same PBR texture, physical repeat scale, natural-surface tint, shadow behavior, and location detail mode. Coarse `built` land-cover pixels are neutral and no longer allocate a hardscape raster or terrain shader; exact mapped roads, hardscape landuse, water, and building geometry own city surfaces. The obsolete far-color and WorldCover-built-shader modules were deleted. No cover plane, streaming owner, or cosmetic boundary overlay was added.
- Guard: `npm run test:fixed-location-terrain-material`; the release world matrix must capture forced-daylight drone views so city-scale and natural-surface boundaries are part of the hash-bound visual review. The production-shaped artifact was also loaded with installed Google Chrome 151 from port 4193: Baltimore published 24,678 buildings, 3,526 roads, 69 mapped water areas, and 49 detailed terrain tiles; the inspected drone frame has mapped water and continuous terrain with no gray city rectangle.
- Never reintroduce: absolute use of `surfaceTints`, coarse built-up classification as terrain hardscape, a separate background material authority, a generic green fallback in a known snow/sand location, or a street-level-only terrain release gate.

## 2026-08-09 — Polar fixed-location terrain requests expand without bound

- Status: resolved locally for the 4.1.4 candidate; not released or deployed.
- Symptom: Antarctica spent far longer loading than ordinary locations and initially requested 529 outer elevation tiles, 676 mapped-context tiles, and 144 mapped-water tiles for one fixed location.
- Root cause: a fixed Web Mercator zoom was combined with a fixed physical radius. Longitude spans expand near the Mercator latitude limit, so the same 22 km location multiplied into hundreds of tile requests.
- Resolution: fixed-location terrain, mapped context, and mapped water now select a latitude-aware source zoom bounded to at most 81 tiles while retaining the same physical horizon. Antarctica resolves to 36 elevation, 49 context, and 36 water tiles; its outer terrain inherits the selected snow/rock material rather than a generic green fallback.
- Guard: `npm run test:fixed-location-terrain-material`, `node scripts/test-fixed-world-horizon-architecture.mjs`, and the Antarctica world-matrix visual/state capture.
- Never reintroduce: fixed zoom for a fixed-meter polar extent, raising concurrency to hide an oversized request set, or a second polar-only terrain renderer.

## 2026-08-09 — Fixed-world flight test rejects a successful boundary crossing

- Status: resolved locally for the 4.1.4 candidate; not released or deployed.
- Symptom: the sustained-flight journey crossed the measured detailed-terrain boundary, remained stable, and loaded no new world data, but failed because total displacement was 708.9 m instead of an unrelated 750 m threshold.
- Root cause: the test mixed a product contract (cross the measured boundary without reloading) with a machine-timing-dependent distance target. The aircraft began only 120 m inside the detailed bounds and the required check point was 100 m beyond them.
- Resolution: the journey still runs for 30 real seconds and now asserts the measured boundary crossing directly, together with active/airborne state, immutable publication, zero movement data requests, and retained Earth return.
- Guard: `npm run test:fixed-world-travel-browser`.
- Never reintroduce: a fixed travel-distance threshold when the tested acceptance boundary is calculated from the rendered terrain itself.

## 2026-08-13 — New York freezes and loses New Jersey regional continuity

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: New York could freeze during publication, detailed roads and buildings ended about 1.8–1.9 km from Midtown, the visible New Jersey side of the Hudson became a blank band, and mapped water developed aerial stripes outside the detailed city.
- Root cause: the exact OSM district remained capped to the detailed city while the far-building pass excluded the much larger terrain rectangle; simply compiling every generalized regional road produced an 18,042-road, 39.7-second transport publication. Regional roads were also rejected by a ground check that understood only detailed accepted-ground tiles. In water, the 320 m terrain grid was not physically masked beneath regional mapped water, overlapping OSM water records could use different heights, and a centroid-only duplicate rule deleted partial triangles.
- Resolution: one bounded Shortbread request now loads a fixed 6.5 km location context concurrently with the exact core request. The exact core remains lossless; outer roads use a geographically spread 2,400-road generalized LOD, shared decoded and in-flight tile cache, coarser at-grade sampling, and the already loaded fixed terrain as their ground authority. The outer request decodes only streets because terrain/WorldCover already own generalized land. Far-building exclusion now follows the actual detailed building radius. Final geometry publication yields between major stages. Regional mapped water normalizes overlapping records to one physical surface and masks the coarse terrain beneath coastal and inland water without deleting partial triangles.
- Guard: `npm run test:fixed-regional-context`, `npm run test:phase5-aerial-transition`, and `npm run test:new-york-regional-continuity-browser`. The Chrome journey requires Midtown core density, roads within 120 m and far buildings around Weehawken/Hoboken/Jersey City, finite walk/drive surfaces in Hoboken, no new world sequence after crossing the river, zero duplicate Shortbread tile URLs, no console errors, and no load long task above five seconds. Its aerial Hoboken screenshot is a mandatory visual review artifact.
- Never reintroduce: actor-driven streaming, an unbounded all-street regional compile, excluding far buildings by the terrain rectangle, requiring detailed accepted-ground under generalized regional roads, centroid-only water triangle deletion, a depth-biased water overlay, fixed sleep-based readiness, or an asynchronous predicate passed to Playwright's browser-side wait.

## 2026-08-13 — Regional building gaps and missing engineered transport

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or
  deployed.
- Symptom: neighborhoods inside the visible fixed location had missing building
  blocks, New York/London/San Francisco lost mapped bridges and tunnels outside
  the detailed core, and the Golden Gate Bridge was beyond the fixed context.
- Root cause: far buildings were chosen as the largest footprints per tile and
  then globally capped, which concentrated the budget and emptied other
  neighborhoods. London's 6.5 km request exceeded the old tile budget and fell
  to zoom 13, where the requested building layer was absent. Bridges, tunnels,
  and ramps were competing with ordinary streets for a generic road cap. The
  final mesh publisher then ignored the regional subdivision assigned by the
  feature compiler and rebuilt every retained structure at core-city density.
  An exact San Francisco outer-grid endpoint could also round just outside its
  bounds and invalidate the whole fixed terrain mesh.
- Resolution: one fixed 8 km location context now retains zoom-14 buildings
  within a 144-tile ceiling and publishes 85% of eligible regional building
  records in every source tile. Up to 26,000 geographically distributed
  buildings retain simplified footprint geometry; the remainder use one
  GPU-instanced oriented-box LOD, avoiding hundreds of thousands of meshes or
  another loading pipeline. Mapped bridge/tunnel/layer structures are protected from the
  ordinary-road cap; only a bounded set of real endpoint approaches and a
  geographically spread general-road LOD are added. The publisher honors the
  regional subdivision selected upstream. Far-terrain endpoints use a small
  tolerant bounds check and sample the already-loaded interior side. This adds
  no movement streaming or second location pipeline.
- Guard: `npm run test:fixed-regional-context`,
  `node scripts/test-fixed-world-horizon-architecture.mjs`,
  `npm run test:new-york-regional-continuity-browser`, and
  `npm run test:regional-structures-browser`. The browser evidence requires at
  at least 84% published regional building coverage, hundreds of retained
  mapped structures, Tower Bridge and Golden Gate by source name, and a finite
  driveable road surface at each landmark. Visual
  screenshots remain mandatory because record counts cannot prove a complete
  rendered neighborhood.
- Never reintroduce: largest-N-per-tile building selection, a second rectangular
  terrain-hole exclusion after the exact building boundary already owns deduplication, silently selecting
  a zoom without the requested building layer, letting ordinary street budgets
  discard engineered transport, making a downstream renderer override its
  compiler's regional LOD, strict floating-point equality at clipmap endpoints,
  or actor-driven regional loading.

## 2026-08-13 — Regional water bands and rectangular LOD seam

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: the Thames was crossed by horizontal terrain bands, while San Francisco showed a large diagonal water slab aligned with the detailed-location boundary.
- Root cause: the 320 m far-terrain grid decided water ownership only at terrain vertices, so triangles with no vertex inside a narrow river could still cover it. Regional water was separately cut at the rectangular detailed-terrain bounds. Its triangles also faced downward and its material used fallback defaults instead of the detailed-water profile, exposing the handoff through different lighting and color.
- Resolution: exact mapped water polygons are rasterized once per fixed location into a 4096² one-channel ownership texture; the far-terrain fragment shader discards only fragments inside those mapped polygons. Regional mapped water remains a continuous baseline beneath the detailed refinement, uses the shared water profile and wave compiler directly, and reverses XY-to-XZ triangle winding so all water normals face upward. No water is inferred from elevation, no depth override or blue plane was added, and movement does not trigger loading.
- Guard: `npm run test:phase5-aerial-transition`, `npm run test:regional-structures-browser`, and `npm run test:new-york-regional-continuity-browser`. London and San Francisco browser reports require the fragment-mask authority and upward regional-water normals; New York requires the same 4096² mapped-water ownership. A/B screenshots hide far terrain, far water, and detailed water independently so a future boundary can be assigned to its real owner before code changes.
- Never reintroduce: vertex-only terrain masking as the sole water authority, clipping regional water at a rectangular LOD boundary, downward far-water winding, timing-dependent fallback water styles, `depthTest: false`, polygon-offset concealment, or synthetic water coverage.

## 2026-08-13 — Bridge records exist but bridges, ramps, and tunnel mouths are absent

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: New York retained hundreds of records tagged as bridges and tunnels, but named East River bridges could be visually absent, ramps could lose their connection to a major road, and tunnels either had no visible entrance or appeared to enter terrain at a guessed point. The old browser gate passed by counting records even when no structure mesh was published.
- Root cause: the regional Shortbread street schema carries bridge/tunnel continuity but not the complete layer, lane, width, endpoint, and engineered geometry needed to compile a lossless structure. The visual publisher rejected generalized road bridges entirely, and exact bridge/tunnel ways outside the small core were never requested. Tunnel portal instances and masks were collected but not published. Terrain-height inference also treated underground cover changes as portal locations, producing false entrances under water or buildings. Finally, exact approaches competed with capped ordinary regional streets.
- Resolution: one bounded fixed-location OSM adapter requests only driveable ways explicitly tagged as bridge or tunnel plus the exact surface mates at true tunnel endpoints. Those ways merge into the existing transport compiler before publication; they do not create another renderer, world, or actor-driven loading system. Exact structures and their required approaches have a protected budget. Complete generalized bridges retain a non-colliding continuity deck only when exact detail is unavailable. Exact tunnel way endpoints and exact surface connectivity now own portals, the portal beams are actually published, and a local fragment aperture reveals each mouth while preserving the mapped terrain roof over the rest of the tunnel.
- Guard: `npm run test:fixed-regional-structures`, `npm run test:fixed-regional-context`, `npm run test:phase3-structures`, `npm run test:new-york-regional-continuity-browser`, and `npm run test:regional-structures-browser`. The New York browser journey resolves named bridge and tunnel targets by nearest road segment, requires lossless source geometry, finite drive surfaces, published bridge shells and tunnel portals, and focused screenshots of Brooklyn, Manhattan, Queensboro, Lincoln, and Holland. London supplies a non-New-York structure check and mandatory gameplay-frame review.
- Never reintroduce: treating a bridge/tunnel tag count as rendered proof, using sparse vertex distance instead of segment distance, relying on generalized vector-tile streets as engineered-detail authority, inferring exact tunnel portals from terrain cover, cutting the whole tunnel corridor out of terrain, allowing ordinary-road budgets to discard exact approaches, or adding a second structure renderer/editor pipeline.

## 2026-08-13 — Terrain work drifts from the accepted ground and counted bridges remain visually absent

- Status: corrected locally; load-performance and London provider evidence remain open. Not pushed or deployed.
- Symptom: work intended to close mountain seams changed the accepted fixed-ground mesh density; meanwhile tests counted exact bridge records and a merged elevated shell even though named road bridges still appeared as thin asphalt ribbons. Regional building facades also aliased to pale blocks at the user's aerial camera.
- Root cause: the August 9 ground-material contract did not also guard the accepted fixed-mesh density. In the bridge publisher, `renderRoadFullDeckBody` and `renderRoadSupports` were computed from exact structure authority, but `renderDeckBody` and `renderSideGirders` ignored those decisions and emitted only connector/skywalk geometry. The regional facade shader used only window-scale cells, which disappear under aerial pixel filtering.
- Resolution: retain the August 9 320 m fixed-location ground mesh and its single shared PBR/WorldCover presentation; later water masking remains a separate polygon authority and tunnels remain untouched. Lossless road bridges now publish the already-compiled deck body and girders beneath the drive surface. The existing regional facade owner blends to a larger antialiased floor/bay pattern at aerial distance; no second building renderer was added.
- Guard: `npm run test:fixed-location-terrain-material`, `node scripts/test-fixed-world-horizon-architecture.mjs`, and `npm run test:phase3-structures`. The New York installed-Chrome journey captures the user's Central Park camera with detailed/regional A/B frames and named Brooklyn, Manhattan, and Queensboro bridge frames. It requires both regional building tiers to own the distance-adaptive facade and now records bridge deck/girder publication.
- Never reintroduce: selecting terrain baselines from a candidate label instead of this ledger, changing ground geometry while fixing an unrelated renderer, accepting tag/mesh counts without a named gameplay frame, calculating a road-bridge visual decision without using it at publication, or adding a second facade/terrain/structure renderer to hide an ownership bug.

## 2026-08-13 — Manhattan and visible New Jersey lose roads and buildings

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: Midtown looked populated, but Upper Manhattan and the visible New Jersey side of the Hudson contained broad blank areas with few or no roads and buildings. The 22 km terrain continued beyond the mapped city context, making the missing data look like a city boundary. Increasing coverage initially introduced a seven-second Chrome freeze.
- Root cause: the fixed mapped context ended at 8 km while terrain extended 22 km; a road selector named `spreadAcrossArea` still selected globally by priority instead of distributing records geographically; and the old 144-tile ceiling silently forced larger requests from zoom 14 to zoom 13, where street/building detail is insufficient. Once the source extent was corrected, destructive array shifting and global structure-versus-road comparisons exposed quadratic work, and all structure compiler phases ran inside one browser task.
- Resolution: the one non-streaming fixed-location publication now requests a 14 km zoom-14 context (256 shared tiles under a 288-tile ceiling). A real geographic cell round-robin retains a 7,200-road general LOD while all exact mapped bridge/tunnel ways remain protected. The far-building owner publishes 85% of eligible mapped buildings up to a 750,000-instance ceiling. Building selection uses cursors, structure stacking and road candidate searches use spatial indexes, and structure compilation yields between its existing authoritative phases. No movement loader, second city renderer, or duplicate temporary pipeline was added.
- Guard: `npm run test:fixed-regional-context`, `npm run test:building-coverage`, `npm run test:phase3-structures`, and `npm run test:new-york-regional-continuity-browser`. The installed-Chrome journey checks Lower Manhattan, Upper East Side, Harlem, Washington Heights, Inwood, Weehawken, North Bergen, Secaucus, Hoboken, Jersey City, and Kearny for mapped building evidence and a nearby road; it also requires at least 85% source selection, zero duplicate Shortbread URLs, traversal into Hoboken without a second world load, and no load-time browser task over five seconds. Lower Manhattan, Inwood, and Kearny screenshots require visual inspection.
- Never reintroduce: an 8 km data boundary inside a 22 km visible world, silently degrading dense-city source zoom to satisfy a tile cap, a priority-only selector mislabeled as geographic spread, `Array.shift()` over hundreds of thousands of records, comparing every structure against every road, running all compilation phases in one browser task, or reducing exact bridge/tunnel coverage to meet a performance budget.

## 2026-08-14 — Terrain ownership, land-use fallback, stale candidates, and load freezes

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: a detailed square and a differently colored regional surface could reappear, city ground could become grass when an OSM request failed, and candidate URLs could claim a new version while serving mutable source files. New York could also freeze Chrome during regional decoding, road publication, terrain tinting, or water-mask conversion.
- Root cause: the far mesh excluded sampled points instead of complete published detailed cells; detailed and regional terrain did not share the same deterministic mapped semantic fallback; provider-dependent WorldCover results could therefore become the city-surface authority. The local server trusted arbitrary query labels instead of binding a URL to an artifact. Several large loops and a 16.7-million-pixel mask copy ran in single browser tasks. Some browser gates also encoded universal absolute counts and flight distances that were not valid across datasets or the actual vehicle acceleration curve.
- Resolution: one executable rendering contract now owns the fixed terrain grid, gap-fill grid, mapped-water delegation, land-use responsibilities, and required geography matrix. Regional terrain excludes only complete, actually published detailed cells and reports zero unowned cells. The same-request Shortbread land/site polygons apply deterministic semantic tints to both detailed and regional terrain; only explicit hardscape publishes overlay geometry. The water mask uses the canvas RGBA buffer directly. Shortbread decoding, road-ribbon publication, and detailed-tile tinting yield cooperatively and tinting is idempotent. Local candidates are clean, content-addressed hosting artifacts with an embedded manifest; a mismatched `?candidate=` returns HTTP 409 and source previews reject candidate labels. Provider-aware structure tests require lossless geometry when exact OSM succeeds and a working generalized bridge/tunnel fallback when it does not.
- Evidence: installed Chrome passed Monaco (zero uncovered cells, 115 exact tunnels, building/tunnel collision), New York (61.99 s cold load, 4.27 s maximum load task, 10,959 roads, 27,154 detailed and 170,703 regional buildings, 1,328 bridges, 314 tunnels), London (16,713 roads, 213,910 regional buildings, 845 bridges, 2,323 tunnels), San Francisco (Golden Gate drive surface, 585 bridges, 168 tunnels), and Baltimore (detailed-boundary flight, no movement or Earth-return world-data requests). Gameplay screenshots were inspected for every geography.
- Guard: `npm run test:world-rendering-contract`, `npm run test:local-candidate`, `npm run test:monaco-tunnels-browser`, `npm run test:new-york-regional-continuity-browser`, `WE_STRUCTURE_SCENARIO=london npm run test:regional-structures-browser`, `WE_STRUCTURE_SCENARIO=sanfrancisco npm run test:regional-structures-browser`, and `npm run test:fixed-world-travel-browser`.
- Never reintroduce: query-string-only candidate identity, point-sampled terrain exclusion, a second city ground renderer, broad residential/commercial overlay polygons, unmapped water cutouts, provider failure as permission to make all city ground grass, copying a 4096² canvas mask in JavaScript, synchronous whole-region conversion/publication loops, absolute far-building counts as a cross-city quality proxy, or movement-triggered world loading.

### Final release-gate corrections

- The player-input gate no longer runs a second simulated movement owner or searches routes for up to 24 minutes. It selects a collision-clear mapped road geometrically, then real browser keyboard events are the only movement authority. SwiftShader evidence is judged by displacement, steering, camera following, ground contact, collision safety, and console state—not by an arbitrary number of slow Playwright host round-trips.
- The runtime lane probe now keeps the complete 2 m vehicle collider inside the mapped road width. The old probe overhung every road edge by 1.2 m and falsely counted adjacent buildings and shoulders. The corrected Baltimore run sampled 486 road positions, completed 24 unblocked drive journeys, and measured a 1.03% lane collision rate.
- Every source-test HTTP server now publishes the same explicit mutable-source manifest, while immutable hosting artifacts retain their embedded content-addressed manifest. A missing source manifest can no longer create a false same-origin 404, and a mutable source server still cannot accept a release-candidate query label.
- The final forced-daylight matrix passed its automated assertions in Baltimore, New York, Monaco, and London. Every location reported zero unowned terrain cells and mapped semantic tinting on both detailed and regional terrain. Monaco proved that the same-request mapped fallback remains continuous when WorldCover is unavailable. The captured frames were inspected, but release visual approval remains intentionally unasserted until the clean immutable candidate is tested by the user.
- Additional guards: `npm run test:player-drive-input`, `npm run test:runtime`, `npm run test:maintainability`, and `WORLD_MATRIX_IDS=baltimore,newyork,london,monaco WORLD_MATRIX_CAPTURE_DRONE=1 WORLD_MATRIX_FORCE_DAYLIGHT=1 npm run test:world-matrix`.

## 2026-08-14 — Spatial land-use data was multiplied over one grass material

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: dense city ground looked like a continuous grass sheet even though
  parks, water, developed land, forest, sand, and agriculture classifications
  were already being loaded. Vertex colors changed, but the close-range detail
  still read as grass everywhere.
- Root cause: WorldCover and mapped Shortbread polygons only published RGB
  tints. `worldCoverBaseDetailMode` selected one repeating PBR set for the whole
  fixed location, and the built classifier deliberately resolved that set to
  grass. A neutral tint cannot remove grass blades from a diffuse/normal map.
- Resolution: WorldCover now retains a compact categorical byte per sample.
  Detailed and regional vertices translate it into semantic material weights;
  mapped land/site polygons override those weights with their exact semantic
  mode. The existing terrain `MeshStandardMaterial` blends shared bundled
  urban, grass, forest, sand, soil, rock, and snow sources in one shader. It
  creates no second mesh or overlay and does not clone six texture sets per
  terrain tile. Exact mapped water, parking/paved geometry, tunnels, terrain
  portals, and the accepted terrain geometry remain separate unchanged owners.
- Evidence: the focused Hollywood Chrome matrix passed with 50 semantic
  terrain-material meshes and nonzero urban, grass, forest, sand, and soil
  samples. Baltimore and New York drone frames were inspected; Central Park
  stays natural while surrounding developed ground no longer inherits the
  grass material. All locations retain zero unowned terrain cells and exact
  mapped-water ownership. Runtime invariants passed after waiting for the
  asynchronous vegetation publication instead of sampling it prematurely.
- Guard: `npm run test:city-surface-semantics`,
  `npm run test:fixed-location-terrain-material`,
  `npm run test:world-rendering-contract`, `npm run test:runtime`, and the
  focused world matrix with `WORLD_MATRIX_REQUIRE_WORLDCOVER=1`. The matrix
  records semantic material mesh count and per-class sample totals.
- Never reintroduce: one location-wide grass texture over categorical land
  cover, tint-only assertions as proof of surface material, broad developed or
  natural overlay meshes, per-tile copies of every biome texture, using
  WorldCover water as permission to invent water, or testing vegetation before
  its asynchronous surface source is ready.

## Verification rule

A code-only pass is not enough for terrain, water, sky, or transitions. Before release:

1. Serve the canonical app through HTTP, never by opening a raw file.
2. Open a fresh Chrome tab with a unique candidate query so module caches cannot serve an earlier build.
3. Test at least one coastal city and one inland city at ground and drone altitude.
4. Change locations once in the same session and confirm the old city never appears through the loading screen.
5. Record screenshots, runtime state, and the exact commit tested.
6. Include an ocean-only location, a mountainous location, and a city outside North America; confirm that glaciers are terrain, open ocean has no land placeholder, and location labels follow the published origin.
# 2026-08-13 — Tunnel tags forced exposed tubes and parallel bores blocked cars

- Status: resolved locally; user Chrome acceptance remains open. Not pushed or deployed.
- Symptom: Monaco tunnel tubes appeared above terrain, closely spaced tunnels tangled together, and cars could pass through walls or be stopped on the valid centerline of a neighboring bore.
- Root cause: the subgrade compiler used the chord between high endpoints, and exact `tunnel=yes` metadata forced a full-length shell regardless of measured terrain cover. Tunnel collision was deliberately withheld. The vehicle ghost rule also suppressed all building interiors on road cores, while indiscriminate tunnel-wall collision could block a close parallel mapped road.
- Resolution: local terrain is now a hard upper bound for subgrade alignment, including physical roof cover. Exact mapped centerlines remain authoritative, but measured cover owns shell and portal ranges. Lossless compiled shells publish side-wall/ceiling collision; the active mapped road core suppresses only a neighboring transport shell, never an ordinary full-detail building, and walls outside road cores remain solid.
- Evidence: the latest installed-Chrome Monaco guard retained 165 exact tunnel routes and sampled 1,308 covered stations. Maximum roof exposure is -0.012 m; 5,614 side walls and 2,836 ceilings are registered; 71/80 sampled wall probes hit; no sampled centerline is falsely blocked; a real Monaco commercial building remains solid; and there are no console errors.
- Guard: `npm run test:monaco-tunnels-browser`, `npm run test:phase3-structures`, `npm run test:transport-surface`, and `npm run test:phase5-controls`.
- Never reintroduce: endpoint-chord ownership for tunnel depth, full-shell publication based only on a tunnel tag, globally disabled exact tunnel collision, or a road-core exception that makes ordinary full-detail buildings non-solid.

# 2026-08-13 — Regional crossings were recomputed as detailed junction caps

- Status: resolved locally; not pushed or deployed.
- Symptom: dense fixed locations spent excessive time compiling transport even though regional topology was already mapped, and loading varied badly with provider timing and machine load.
- Root cause: the detailed renderer performed pairwise geometric crossing discovery across thousands of fixed regional LOD roads after their source-node junctions had already been registered. It duplicated topology work to create distant junction caps that are not visually resolvable.
- Resolution: fixed regional roads retain canonical source-node junctions but skip the duplicate geometric crossing pass. Detailed core roads still receive geometric crossing discovery. Regional engineered profiles use four-to-eight metre samples while preserving exact source vertices and vehicle-grade continuity.
- Evidence: the New York installed-Chrome run retained 13,017 roads, 1,333 bridges, 314 tunnels, and all twelve Manhattan/New Jersey continuity targets. Intersection detection measured 0.645 seconds; total transport publication 11.1 seconds; the full warm location load passed in 41.1 seconds with a 4.347-second maximum load task.
- Guard: `npm run test:transport-surface` verifies regional source-node junction retention and the engineered-profile sample budget; `npm run test:new-york-regional-continuity-browser` verifies geographic coverage and load behavior.
- Never reintroduce: geometric all-pairs crossing discovery for the regional LOD, deleting source-node junctions, or lowering the regional road/building coverage to hide compiler cost.

# 2026-08-13 — Unpublished water polygons cut holes through mountain terrain

- Status: water-ownership and facade fixes retained locally; the accompanying 100 m terrain experiment was rejected and superseded by the accepted August 9 ground contract. Not pushed or deployed.
- Symptom: sky/water-colored strips appeared through solid slopes, and distant buildings lost visible facade detail before the edge of the fixed mapped location.
- Root cause: the terrain ownership mask discarded every source water polygon even when that polygon failed triangulation and produced no water mesh. In the New York fixture this created 700 terrain cutouts for only 555 published water surfaces. The regional facade shader also faded out inside the 14 km fixed map. Mesh density was not the cause of either ownership defect.
- Resolution: terrain delegates a water footprint only when that exact mapped identity successfully produced render geometry. The fixed ground remains the accepted 320 m, non-streaming, shared-PBR/WorldCover implementation recorded in the August 9 entry. Existing detailed facade atlases remain authoritative near the origin; the existing regional shader remains authoritative outside it and covers the full fixed map.
- Evidence: the ownership run reported 85 published water surfaces / 85 terrain cutouts in Monaco and 555/555 in New York. All 1,034 detailed Monaco exterior materials and both regional building meshes reported facade ownership. The 100 m mesh and its 200,704-vertex measurement are rejected evidence and are not the candidate baseline.
- Guard: `node scripts/test-fixed-world-horizon-architecture.mjs` asserts the accepted 320 m mesh; `npm run test:monaco-tunnels-browser`, `npm run test:new-york-regional-continuity-browser`, and `npm run test:module-versions` retain the water/facade checks.
- Never reintroduce: masking terrain for an untriangulated water polygon, treating an unrelated mesh-density experiment as the ground fix, fading regional facades inside the fixed mapped extent, actor-driven terrain streaming, or a second background terrain/building renderer.

# 2026-08-13 — London regional buildings disappear when the provider zoom is downgraded

- Status: resolved locally; performance remains open. Not pushed or deployed.
- Symptom: London loaded terrain, water, roads, 855 bridges, and 2,151 tunnels, yet the entire regional building owner published zero buildings and no far facades.
- Root cause: the 28 km London context exceeded a New-York-sized 288-tile ceiling. Generic tile-budget logic silently selected zoom 13, but Shortbread's building layer is available at zoom 14; the loader therefore treated an unsupported generalized layer as a successful empty city.
- Resolution: building coverage has its own provider-capability budget, separate from terrain and water. It retains zoom 14 for every shipped fixed-location preset through London's latitude. The same single regional-building owner publishes exact footprints plus its bounded instanced LOD; no fallback renderer or second request pipeline was added.
- Evidence: the fresh installed-Chrome London run published 749,155 of 881,365 eligible regional buildings (85.0%), 855 bridges, and 2,151 tunnels; the landmark road surface was finite and the mapped-water terrain mask stayed active. Cold-cache load time was 106.5 seconds, so release performance remains open.
- Guard: `node scripts/test-fixed-world-horizon-architecture.mjs` uses the full 28 km London bounds and requires zoom 14; `WE_STRUCTURE_SCENARIO=london npm run test:regional-structures-browser` requires at least 50,000 regional buildings and 84% published coverage.
- Never reintroduce: using a terrain-style zoom downgrade for a source layer that does not exist at the downgraded zoom, interpreting authoritative zero as valid coverage, weakening the browser assertion, or adding another regional building renderer.

# 2026-08-14 — London loads hundreds of thousands of invisible far-building details

- Status: resolved locally; broader load performance remains open. Not pushed or deployed.
- Symptom: the correct London visual took 106.5 seconds to become testable and published 749,155 regional buildings, even though most individual outer footprints are not resolvable at the aerial distance where that owner is used.
- Root cause: regional roads silently selected Shortbread z13 while far buildings separately selected z14, preventing the shared in-flight tile owner from coalescing the requests. The decoded cache was also smaller than a London z14 set. After fetch, the far-building pass converted every one of roughly 931,000 source polygons before applying its publication cap.
- Resolution: roads and buildings share one z14 tile identity and one London-sized decoded cache. Detailed buildings remain unchanged. The single far-building owner samples polygons spatially across every regional tile before descriptor/geometry creation, publishes at most 280,000 regional buildings, and retains exact footprint geometry for at most 9,000 of them; the remainder use the existing oriented-instance facade owner. No post-entry streaming or second renderer was added.
- Evidence: the repeat installed-Chrome London journey completed in 53.9 seconds, a 49.4% reduction. It published 213,994 of 931,536 source regional polygons (23.0%), 11,157 roads, 16,490 detailed buildings, 288 bridges, and 508 tunnels; the landmark bridge surface was driveable, mapped-water terrain ownership remained active, the inspected frame retained metropolitan coverage, and the console was clean.
- Guard: `node scripts/test-fixed-world-horizon-architecture.mjs` fixes the 280,000/9,000 far-LOD budgets and verifies distributed source sampling; `npm run test:fixed-regional-context` requires London roads to remain z14; `WE_STRUCTURE_SCENARIO=london npm run test:regional-structures-browser` requires at least 150,000 regional buildings, 20% published coverage, bridge/tunnel coverage, a driveable landmark surface, water ownership, and no console errors.
- Never reintroduce: separate zoom identities for consumers of the same Shortbread region, a decoded cache smaller than the supported metropolitan request, converting every far polygon before selection, applying the far-LOD reduction to detailed city buildings, reducing exact bridge/tunnel authority to pay for buildings, or actor-driven building streaming.

# 2026-08-14 — Exact poles become boats/gray slabs and non-city biomes lose their surface identity

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: the exact North Pole could enter boat mode or show a flat gray placeholder because WorldCover ends at 83 N and Web Mercator ends near 85.051 degrees. Amazon rendered a sparse grid of identical trees over green ground, Sahara rendered a pale slab, and steep Grand Canyon faces inherited grass. The old matrix passed label/count checks without proving those visible results.
- Root cause: arrival mode, projection limits, terrain availability, and surface semantics had no shared world-domain authority. Missing polar provider data fell through ordinary ocean/terrain code. Vegetation sampled categorical raster pixels directly with one global 950-instance cap. Terrain material classification did not derive exposed substrate from geometry, and WorldCover statistics were not scoped to a location. Tests equated terrain with Web-Mercator cache entries and required a non-polar far clipmap even for a dedicated cryosphere surface.
- Resolution: coordinates at or beyond 86 degrees now resolve first to a walkable cryosphere domain and use a WGS84 local ENU projection. One fixed non-streaming mesh owns Arctic sea ice or the Antarctic ice sheet, with a shared render/collision height sampler and no out-of-range provider requests. A pure biome classifier is refreshed from location-scoped aggregated semantic classes. Tropical forest reuses existing forest weights and mapped-water exclusions to publish collision-checked, jittered, multilayer instanced canopy/understory/vines; it does not request a second dataset. One terrain material derives rock exposure from slope, protects mapped urban/sand/snow, and applies arid rock/soil warmth with subtle non-repeating elevation variation.
- Evidence: installed Chrome loads exact North and South Pole in walking mode with one cryosphere owner and no console errors; the South Pole transition no longer inherits the previous pole mesh. Amazon publishes 9,000 semantic vegetation placements in four GPU batches plus five mapped waterways without raster-grid placement. Sahara retains a sand-dominant semantic surface. Grand Canyon retains real elevation and mapped Colorado River water while steep faces compile to exposed rock instead of grass. Gameplay and drone frames were inspected. The final North Pole A/B proved green stripes were the loading plane intersecting ice relief; declaring the polar mesh ready now retires that plane before gameplay.
- Guard: `npm run test:world-surface-domain`, `npm run test:city-surface-semantics`, `npm run test:fixed-location-terrain-material`, and installed-Chrome world-matrix fixtures `north_pole_custom`, `south_pole_custom`, `amazon_custom`, `sahara_custom`, and `grand_canyon_custom`. The release matrix requires one cryosphere owner, mapped Amazon waterways, at least 4,000 tropical vegetation features/four presentation layers, and no console errors. A cryosphere proves terrain through its visible semantic owner—not a Web-Mercator tile-cache count or far clipmap.
- Never reintroduce: reverse-geocoder water hints outranking polar geography, longitude-scaled planar projection at exact poles, a gray/green loading plane left under authoritative terrain, out-of-range WorldCover/Shortbread calls, cumulative cross-location land-cover statistics, raster-grid tree placement, oversized far trees, grass on steep natural cliffs, synthetic water inferred from biome data, a second terrain/vegetation renderer, actor-driven biome streaming, or cache-count assertions as proof of visible ground.

# 2026-08-14 — Inland coordinates inherit boat/open-water state and every biome runs the city load plan

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed.
- Symptom: the inland Côte d’Ivoire coordinate `7.8939, -4.9369` entered boat mode under an open-water plane, Arctic land could be labeled open water, Amazon canopy coverage remained sparse, and polar loads took city-like time despite having no mapped transport or buildings.
- Root cause: `arrivalMode: boat` and water words from reverse-geocoder labels were treated as surface proof after an accepted-ground miss. That mutable hint survived selection changes and overruled positive land elevation. The world loader also entered the terrestrial Overpass/Shortbread/structure loop after publishing its complete one-mesh cryosphere surface.
- Resolution: one verified coordinate-evidence record now owns worldwide land/open-ocean selection. GEBCO elevation at or above -5 m proves land, elevation below -5 m proves open ocean, structured reverse water fields are only a fallback, and unknown/provider-failed coordinates conservatively remain land. Place names and requested arrival modes cannot create ocean. Exact polar coordinates still win first as cryosphere. The selected evidence is preserved through the location session and used by terrain, loading, and spawn. Explicit load plans bypass every terrestrial feature provider for cryosphere and verified open ocean; land retains the mapped pipeline and its settlement-evidence building gate. Amazon remains one semantic vegetation owner but now publishes up to 12,000 collision-checked placements and 120,000 compact canopy crowns in four GPU-instanced layers.
- Evidence: the provider response for Côte d’Ivoire is `+284 m` and the browser selector changes a previous verified-ocean selection back to `arrivalMode: auto`, verified land. Installed-Chrome gameplay starts Côte d’Ivoire and Longyearbyen in walking mode with land domains, no synthetic water, 256 and 169 mapped roads respectively, and no console errors. Exact North Pole starts walking with one cryosphere owner in 314.5 ms and zero mapped-feature work. Amazon publishes 12,000 placements, 120,000 crowns, four vegetation meshes, and five mapped waterways in 18.6 s. The same focused run measured 19.1 s for Côte d’Ivoire and 25.3 s for Svalbard, proving workload follows location content instead of a fixed delay.
- Guard: `npm run test:world-surface-domain`, `npm run test:accepted-ground-activation`, `npm run test:globe-selector`, `npm run test:globe-selector-browser`, `npm run test:runtime`, and focused world-matrix IDs `ivory_coast_inland_regression,svalbard_land_regression,north_pole_custom,amazon_custom`. The focused-only land fixtures do not extend the normal release matrix unless explicitly requested.
- Never reintroduce: names as point-in-water evidence, boat preference as geography, stale water state across coordinate changes, synthetic open ocean on unknown/provider-failed coordinates, terrestrial providers after a complete surface-only world is published, a second jungle renderer/provider, or identical artificial loading delays across different world-domain plans.

# 2026-08-14 — Private rooms cannot be joined and half-height shared shapes overwrite one another

- Status: resolved locally on `steven/earth-core-recovery`; not pushed or deployed. User Chrome acceptance remains open.
- Symptom: a signed-in player with a valid private invite code could not complete the join flow. Shared slabs and ramps could move to an integer height or overwrite another block. Featured-room discovery had competing city rotations, members saw settings they could not save, and transient listener failures could look like a deleted room.
- Root cause: Firestore required private-room membership before the client could read the room and count capacity, although membership creation required the room's join code. The local builder used a 0.5 vertical grid while multiplayer document IDs and validation rounded or rejected half steps. Room discovery, UI permissions, initial world presence, and reconnect behavior had separate partial contracts.
- Resolution: authenticated invite holders may directly get a known private room and read its player list for the pre-join capacity check, but private rooms remain excluded from list queries. One shared block catalog now owns horizontal/vertical normalization, canonical IDs, shape/material validation, direct stacking, and support surfaces. One featured-city model owns discovery; only admins curate `featured`. Presence uses the room world/location from its first write, ghosts require compatible world frames, and room-related listeners retain last-known state during reconnects. The globe hub now separates Join, Create, My Rooms, city discovery, and curated rooms.
- Evidence: Firestore rules pass 52/52. Two independent installed-Chrome contexts plus local Auth/Firestore emulators pass eight end-to-end assertions: private create/join, two-player presence, movement propagation, chat, half-grid slab/column coexistence, and the actual globe-hub workflow. The real editor journey lands the player on cube, slab, ramp, and column support surfaces, proves jump, vehicle collision, ramp driving, and Earth/Moon/Space/Earth ownership. Runtime invariants and iPhone/Android/landscape browser controls also pass. The generic web-game harness reports correct title state but captures a black WebGL frame in both headless and headed modes; its screenshot is not visual release evidence.
- Guard: `npm run test:multiplayer-contract`, `npm run test:rules`, `WE3D_BROWSER_CHANNEL=chrome npm run test:multiplayer-integration`, `WE3D_BROWSER_CHANNEL=chrome npm run test:editor-multiplayer`, `npm run test:block-builder`, `npm run test:runtime`, and `npm run test:mobile-controls`.
- Never reintroduce: membership-before-invite-read deadlocks, private-room collection enumeration, integer-only shared vertical coordinates, shape-specific stacking exceptions, a second featured-city rotation, member-visible owner controls, Earth-zero presence for non-Earth rooms, clearing good state on transient snapshot errors, or treating synthetic API presence as proof that two browsers can play together.
- Terrain protection: this change is based on worldwide surface baseline `0bb624c86874aa6d044637620716c860ccac5b7c` and changes no terrain, ground, water, biome, vegetation, road, building, or transport authority file. Bright green at the edge of the block-builder evidence is vegetation canopy, not a replacement ground plane.

# 2026-08-14 — Destination thumbnails regress to rounded squares

- Status: resolved locally on `steven/earth-core-recovery`; deployment pending final release verification.
- Symptom: the Earth, Moon, Mars, and Ocean controls in the globe hub read as rounded square texture tiles instead of round world destinations.
- Root cause: all four source thumbnails are square raster images and their presentation relied only on percentage corner rounding while several responsive button rules resize the same elements.
- Resolution: one destination-thumbnail rule now enforces a square aspect ratio, a circular clip path, and a full circular radius at every responsive size. Space remains the intentionally rectangular exception.
- Guard: `npm run test:globe-selector-browser` checks equal rendered dimensions, the circular clip contract for Earth/Moon/Mars/Ocean, the rectangular Space exception, and captures the day/night hub for visual inspection.
- Never reintroduce: unmasked square world thumbnails, separate per-planet shape rules, converting Space into a circle, or changing terrain/planet/ocean runtime geometry to fix a launch-control presentation defect.

# 2026-08-14 — Provider outages turn dense city blocks into grass

- Status: resolved on `steven/earth-core-recovery`; deployment pending.
- Symptom: New York and London could show grass between dense city buildings even though mapped roads and building coverage proved the area was developed. The result varied with optional WorldCover availability.
- Root cause: the one semantic terrain material initialized unclassified vertices as grass. Detailed tiles already measured building/road density, and the regional source already counted buildings per tile, but neither signal owned a spatial fallback. Stale green vertex tint and base-material color inputs also multiplied the corrected urban material when an optional texture was absent.
- Resolution: detailed tiles with dense mapped settlement evidence and no mapped green land use now initialize as developed; regional tiles do the same only where their own building count crosses the shared threshold. Exact mapped parks, water, forest, sand, soil, and rock still override the fallback. Developed vertices clear stale green inputs and keep the semantic shader input neutral before exact tints apply. This remains one terrain mesh/material authority and does not add sidewalks, a second renderer, or a location-wide square.
- Evidence: the initial New York release frame measured about 11,506 urban versus 194,265 grass semantic samples. The corrected Chrome run measured about 123,504 urban versus 82,516 grass and visually retained green Central Park inside developed Manhattan. A separate London outage run proved a 100% urban-weight nearest tile was still green because its material color remained `6b8e4a`; the final inspected frame is developed gray at Haymarket while mapped parks remain green. The regression contract reproduces the failing 603-building/228-road tile, proves it is developed without optional land-cover data, inspects the actual material stack at the actor, and proves an explicit green land use still wins.
- Guard: `npm run test:city-surface-semantics`, `npm run test:fixed-location-terrain-material`, `npm run test:world-rendering-contract`, and the installed-Chrome release matrix for Baltimore, New York, London, and Monaco.
- Never reintroduce: unconditional grass for unclassified dense settlement, location-wide city pavement, green vertex/base-color multiplication over developed PBR material, or a second ground renderer to conceal provider gaps.
