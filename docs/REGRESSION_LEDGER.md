# Regression Ledger

> Verification reset, 2026-08-19: commands recorded in older ledger entries are
> historical context only. The legacy suite was quarantined after it proved it
> could pass obsolete or partial product states. Do not restore or run an old
> guard without re-deriving it from a current requirement under
> `docs/VERIFICATION_STRATEGY_2026-08-19.md`.

This is the durable record of visual and loading regressions already encountered in World Explorer 3D. Read it before changing terrain, water, sky, location loading, or asset publication. Add a dated entry whenever a regression is found and resolved.

Each resolved issue records the symptom, root cause, durable resolution, verification, and the shortcut that must not be reintroduced.

## 2026-08-20 — JFX absent after exact-source merge and competing bridge ownership

- Status: resolved in dirty local staging candidate
  `4.3.0+96bc2c7c8888.4dcef4b7ef9d5f7c.staging`; not committed, pushed or
  deployed.
- Symptom: Baltimore could publish thousands of ordinary roads while the JFX
  bridge was absent or appeared as an isolated flat slab. Other captures showed
  a raised road but no usable approach. The result changed with provider order,
  and old height-only evidence could pass either state.
- Root cause: the fixed regional exact-source query retained bridge/tunnel ways
  but requested at-grade endpoint neighbors for tunnels only. Exact JFX then
  replaced its generalized duplicate without importing the mapped approach,
  leaving the selected bridge with zero graph stations/connections. Separately,
  the structure renderer could compile its own fallback assembly, and the
  Golden Gate landmark renderer could mutate road heights and draw another deck.
  Finally, exact graph endpoints were forced after each road profile was fitted;
  infeasible endpoint pairs therefore preserved continuity by producing a steep
  one-sample ramp or tunnel-portal step.
- Resolution: the regional query now imports one topology-matched, driveable
  at-grade neighbor at every bridge and tunnel boundary. The transport compiler
  is the only surface/assembly authority; structure visuals only consume its
  published assembly, and landmark code is decoration-only. Exact engineered
  approach nodes participate in the shared feasibility projection, while mapped
  tunnel transition spans expand to the grade run required to reconcile modeled
  cover with exact portal nodes. Custom structure arrival uses the selected road
  tangent, and the HUD reads the authoritative actor surface.
- Evidence: the current verifier loads live primary-OSM ways 12115980,
  12115981 and 69531389 for JFX plus 158620175, 158620176 and 650907862 for the
  Baltimore Harbor Tunnel. The final actor stands on lossless
  `osm:way:12115981`; its compiler assembly publishes one visible matching body,
  one graph station and one connection. Across 599 compiled engineered roads,
  grade violations are zero. Three authoritative exact joins have zero
  discontinuities and a maximum 0.0115 m delta. The full-page gameplay frame
  was visually inspected; the generic canvas-only client was rejected after it
  captured a black non-game canvas while its text state described the loaded
  world. Source verification also reports no duplicate module identities.
- Guard: `npm run verify:source` and
  `WE3D_VERIFY_ROOT=dist node scripts/verification/jfx-player-surface.mjs`.
  The latter requires lossless JFX identity, a non-vacuous graph connection,
  compiler-owned visible geometry, exact continuity, zero engineered grade
  violations, matching actor/deck elevation, a full-page final gameplay image,
  and no runtime/browser/local-resource errors.
- Never reintroduce: tunnel-only endpoint neighbor loading, renderer-side
  assembly compilation, landmark-owned road height/deck geometry, exact-node
  forcing without grade-feasibility projection, vacuous continuity checks,
  height-only screenshots, or canvas-only captures in a multi-canvas page.

## 2026-08-18 — Walking arrival center was clear while the actor body still intersected a building

- Status: resolved locally on `steven/urban-sandbox-foundation`; not pushed or
  deployed.
- Symptom: a walk spawn at the center coordinates of a concave building could
  be reported valid and remain unmoved even though the shared physics query
  found the actor intersecting the footprint.
- Root cause: the walk spawn resolver tested point containment, while movement
  collision and the runtime invariant test the actor's full clearance radius.
  A point just outside a concave polygon but within body radius of its edge
  therefore passed the first contract and failed the second.
- Resolution: world-arrival validation now also uses the authoritative building
  collision query with a 1.5 m arrival clearance, while retaining the explicit
  roof-arrival exception. The complete Earth runtime cache identity chain was
  advanced so deployed browsers cannot keep the stale resolver.
- Guard: `npm run test:runtime`, `npm run test:module-versions`, and the future
  multi-floor stair/elevator arrival journey.
- Never reintroduce: point-only safety checks for an embodied actor, separate
  building-footprint math in an arrival feature, or source edits without the
  complete runtime module-version chain.

## 2026-08-17 — Earth terrain survives reloads and editable buildings rebuild the entire world

- Status: resolved locally on `steven/fix-memory-ownership`; not pushed or
  deployed. Target-device acceptance remains open.
- Symptom: dense Earth play settled at 715–730 MB live JavaScript heap, returning
  to title retained roughly 525 MB, and suppressing/restoring one building could
  trigger a complete provider/terrain rebuild with a reported 2.02 GB high-water
  mark. Chrome process memory remained high after the visible world changed.
- Root cause: `resetWorldForReload` called an optional `resetEarthStreaming`
  hook that had no implementation. Detailed terrain, the far-field terrain/
  buildings/water publication, accepted-ground artifact, and 49 elevation tiles
  survived while a replacement world compiled. Editable-world local/shared
  transactions called `loadRoads()` even though only one building changed. The
  4096² water ownership texture retained four RGBA channels although the shader
  samples only red, and terrain semantic color/material weights used Float32.
- Resolution: one mandatory Earth-streaming owner now invalidates asynchronous
  far generations and releases every ground publication/cache before a full
  reload. Editable building changes update collision filtering, direct meshes,
  and per-source ranges in batched index buffers without a world reload.
  Persistent suppressions compile once hidden so restore remains targeted. The
  water mask is read in bounded yielding chunks and published as R8 at the same
  4096 resolution; terrain semantic attributes are normalized Uint8, cached
  base elevations are Float32, and far building/water source descriptors are
  discarded after their runtime products publish.
- Evidence: installed Chrome dense New York fell from 644.6 MB immediately
  before representation work to 533.7 MB post-GC (the original diagnosis was
  715–730 MB). Terrain attributes fell from 86.42 MB to 47.36 MB; the water mask
  is exactly 16,777,216 bytes. Title release reaches zero terrain children,
  terrain bytes, water-mask bytes, far state, accepted ground, provider staging,
  and elevation tiles, then reloads at 568.3 MB without duplicate ownership.
  Baltimore suppression stayed on the same load sequence and moved from 729.0
  MB to 728.2 MB post-GC; persistence and targeted restore pass. San Francisco/
  London regional water/structure gates pass with R8 masks, and the landmark
  matrix proves the Baltimore JFX/Fort McHenry plus Bay Bridge/Yerba Buena
  rendered geometry with framebuffer A/B evidence.
- Guard: `npm run test:title-memory-release`,
  `npm run test:living-editable-world-browser`,
  `npm run diag:regional-structures`,
  `npm run diag:engineered-transport-landmarks`, module-identity,
  fixed-terrain-material, terrain-cancellation, fixed-horizon architecture, and
  target-device manual Chrome review.
- Never reintroduce: optional lifecycle owners, terrain resets split across
  loaders, full `loadRoads()` calls for one editable building, retained RGBA
  masks sampled as one channel, Float32 semantic weights, source descriptor
  graphs retained beside compiled GPU products, or memory claims based only on
  syntax/tests without forced-GC browser and rendered-frame evidence.

## 2026-08-17 — Regional bridges and tunnels counted but absent, duplicated, or compiled at the waterline

- Status: resolved locally; not pushed or deployed. Installed-Chrome visual
  acceptance is complete for the representative Baltimore and San Francisco
  landmarks; hands-on player acceptance remains open.
- Symptom: regional bridge/tunnel counts and source tags could pass while a
  famous structure was missing in the actual frame, a generalized copy could
  compete with its exact OSM way, or a bridge outside detailed terrain coverage
  could compile against bathymetric ground and sit at/below the mapped water.
  This affected the shared worldwide pipeline, not one Baltimore landmark.
- Root cause: exact/generalized reconciliation depended too heavily on names,
  although long engineered routes change names and way IDs across decks, bores,
  anchorages, and jurisdictions. Structure station compilation also received
  detailed-core water polygons only, so a regional bridge could not calculate
  clearance above the far-field water surface. Existing gates proved counts and
  tags but did not prove that the structure publisher changed a rendered frame.
- Resolution: exact and generalized structures now reconcile by structure
  family, direction, spatial distance, and overlapping length, while preserving
  nearby crossings. Published regional water polygons are passed transiently to
  the same structure compiler with their published surface elevation; bridge
  clearance is calculated above that surface rather than bathymetric terrain.
  Water candidates are bounds-filtered and reused per structure, the three
  dense-city refinement passes yield separately, and the transient polygons are
  released as soon as their derived profiles are compiled.
- Evidence: the installed-Chrome landmark matrix proves the Jones Falls
  Expressway bridge body, Fort McHenry Tunnel shell/portals, San
  Francisco-Oakland Bay Bridge body, and Yerba Buena Tunnel shell/portals using
  an A/B framebuffer comparison with structure visuals enabled/disabled. The
  exact Bay Bridge way (`osm:way:236348361`) compiles at `11.416 m` rather than
  the earlier waterline result and contributes more than 40,000 changed pixels.
  The gate also accepts a complete, elevated regional fallback during a real
  exact-provider outage, but fails if generalized geometry wins while an exact
  landmark candidate is present. All four landmarks have finite drive surfaces,
  all bridge bodies have full coverage, all tunnels have shell ranges and two
  portals, terrain has zero unowned cells, and transient water retention is zero.
- Global verification: New York passes with 1,375 regional bridges and 264
  tunnels and a maximum load long task of 4.223 s; Monaco passes with 113 exact
  tunnels and 1,068 below-terrain samples; London passes with 930 bridges, 2,087
  tunnels, and Tower Bridge coverage within 2.8 m. The global far-world water
  contract passes all 14 representative locations.
- Guard: `npm run diag:engineered-transport-landmarks`,
  `npm run test:fixed-regional-structures`, `npm run test:phase3-structures`,
  `npm run diag:new-york-regional-continuity`,
  `npm run diag:monaco-tunnels`, and the London scenario of
  `npm run diag:regional-structures`. These are diagnostic state/geometry checks;
  only `npm run test:integrated-render` has visual release authority. The old regional browser gate now
  allows 120 s for real world publication instead of a stale 10 s timeout.
- Never reintroduce: city-specific landmark exceptions, name-only source
  identity, count/tag-only visual acceptance, bathymetric terrain as the bridge
  water datum, a permanently retained second water-polygon owner, an exact-only
  availability requirement that removes the visible fallback, or a generic
  stacked-surface query as the sole proof of a particular deck/bore elevation.
- Ledger integrity: this full regression ledger was restored after it had been
  deleted from the working release. Future terrain, water, transport, and world
  publication work must read and update it rather than relying on scattered
  progress notes.

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
- Guard: `npm run test:fixed-regional-context`, `npm run test:phase5-aerial-transition`, and `npm run diag:new-york-regional-continuity`. The Chrome diagnostic requires Midtown core density, roads within 120 m and far buildings around Weehawken/Hoboken/Jersey City, finite walk/drive surfaces in Hoboken, no new world sequence after crossing the river, zero duplicate Shortbread tile URLs, no console errors, and no load long task above five seconds. Its direct-camera aerial image is retired and is not visual release evidence.
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
  `npm run diag:new-york-regional-continuity`, and
  `npm run diag:regional-structures`. These diagnostics require at
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

## 2026-08-17 — Discovery targets use the wrong surface coordinates and appear inside buildings

- Status: resolved in the 4.3.0 release candidate.
- Symptom: wildlife, detector targets, field equipment and companions could be placed at the wrong height or beside/inside building geometry. State assertions passed while the actual screenshot was dominated by a clipped wall, and an open Journal hid whether companion scale was credible.
- Root cause: Discovery callers passed `(x, z)` world coordinates to `sampleFeatureSurfaceY` as though it accepted coordinates, but that helper accepts a feature object. The separate Discovery placement paths also did not share a final building-clearance check, and the visual journey did not collapse the panel before scale evidence.
- Resolution: `sampleDiscoverySurfaceY` is now the single Discovery surface adapter over the authoritative walk surface with terrain fallback. Encounters and field targets reject non-finite surfaces and building collisions. Companion formation has explicit ground and airborne offsets, and the browser journey collapses/reopens the panel around unobstructed field, dog, bird and AR captures.
- Guard: `npm run test:world-discovery`, `npm run test:discovery-visuals`, and installed-Chrome `npm run test:world-discovery-browser`; human-review the generated field-animal, dog and bird screenshots. The journey asserts the selected target is collision-free and the City Pigeon is 0.241 m high at 1.513 m clearance.
- Never reintroduce: calling a feature sampler with raw coordinates, creating a second terrain authority for Discovery, accepting state-only visibility, or covering companion scale evidence with a persistent gameplay panel.

## 2026-08-17 — Tunnel acceptance requires portals on every source way segment

- Status: resolved in the 4.3.0 release candidate.
- Symptom: a real multi-segment tunnel could visibly have portals at the ends of the complete connected system but fail the browser check because an interior OpenStreetMap way segment did not own portal instances itself.
- Root cause: the acceptance harness treated each source way as a complete isolated tunnel. Real mapped tunnels are commonly split at intersections, tag changes or provider tile boundaries, while portals belong only at the exposed ends of the connected same-layer system.
- Resolution: the installed-Chrome landmark journey follows the connected same-layer tunnel graph, aggregates portal ownership across the system and records the selected and connected segment counts. The renderer/compiler remains the single generalized and exact structure path.
- Guard: `npm run diag:engineered-transport-landmarks` retains nonvisual JFX, San Francisco–Oakland Bay Bridge, Fort McHenry Tunnel and Yerba Buena Tunnel structure diagnostics. `npm run diag:monaco-tunnels` retains finite floors, collision/camera containment and portal coverage. Their manually positioned images are retired; visible acceptance belongs only to `npm run test:integrated-render`.
- Never reintroduce: per-way portal requirements for interior segments, city-name-only bridge meshes, tests that inspect records without rendered-pixel evidence, or a second bridge/tunnel renderer.

## 2026-08-17 — Production checks count render passes as logical world draw calls

- Status: resolved in the 4.3.0 release candidate; memory high-water monitoring remains open.
- Symptom: the Living/Editable World browser budget transiently reported 90 added calls even though the world added only 20 logical facade/population calls and rendered each through multiple frame passes.
- Root cause: the test compared renderer call totals taken at different points in the frame/pass cycle instead of measuring the logical batched world contributions and separately bounding the render-pass multiplier.
- Resolution: the journey now asserts facades plus population add no more than 22 logical calls and that the actual renderer multiplier remains at most five. The current run adds 20 logical calls and has multiplier 1 at the deterministic sample point.
- Guard: `npm run test:living-editable-world-browser`, `npm run test:title-memory-release`, `npm run test:session-lifecycle`, and target-hardware manual Chrome review. The title journey currently releases 1,020 geometries and drops heap from 689.5 MB to 469.8 MB; the heavy edit/reload journey's 2.02 GB heap high-water remains a release gate.
- Never reintroduce: treating frame-pass timing as logical scene ownership, increasing budgets to mask duplicated meshes, or declaring memory safe from one fresh-session snapshot.

## 2026-08-17 — Unreachable landing assets and orphan Discovery progression remain in production source

- Status: resolved in the 4.3.0 release candidate; files retained in a recoverable local archive.
- Symptom: strict asset reachability failed on 15 obsolete landing/gameplay images, and the module graph contained a second, unused Discovery progression implementation whose only consumer was its own test.
- Root cause: current landing media and Explorer progression had replaced older artifacts without removing the displaced files and self-only module.
- Resolution: the obsolete images and orphan `app/js/discovery/progression.js` were removed from the working source. The active Explorer progress/goals authority remains unchanged. Recovery copies are stored under `/Users/stevenreid/.codex/recovery/worldexplorer3d-unused-assets-20260817/`.
- Guard: `npm run audit:reachability` (550/550 reportable files, zero orphans), `npm run audit:assets` (94 reachable assets and 27 dynamic PBR assets), `npm run test:module-versions` and `npm run runtime:verify`.
- Never reintroduce: weakening strict audits, keeping self-tested production modules without a runtime consumer, or restoring legacy media without an intentional current-page reference.

## 2026-08-18 — Room members diverge on civic response and can forge outcomes

- Status: resolved locally on `steven/urban-sandbox-foundation`; not deployed.
- Symptom: two players could witness the same urban event but run separate local
  responder timelines, attention levels and consequences, while a browser-owned
  result would not be trustworthy enough for rewards or progression.
- Root cause: the existing civic lifecycle was a correct offline presentation
  model but had no authoritative room event boundary.
- Resolution: one transactional `urbanCivic/current` document now owns the event
  ID, actor, level, phase timestamps, last-known position and server-selected
  warning/citation/recovery outcome. Only the stopped actor inside the bounded
  search area can resolve contact; room clients can read but cannot write the
  document. Offline play retains the local model.
- Guard: `npm run test:urban-authority`, `npm run
  test:urban-authority-integration`, `npm run test:functions-runtime`, and `npm
  run test:rules` (77/77). The emulator journey requires two independent users,
  shared event/outcome IDs, rejected non-actor resolution and denied direct
  civic writes.
- Never reintroduce: independent per-client room attention clocks, client-picked
  outcomes, direct writes to civic state, or rewards derived from local session
  consequences.

## 2026-08-18 — Multi-floor interiors are state-only or elevator details disappear

- Status: first playable slice resolved locally on
  `steven/urban-sandbox-foundation`; floor-specific content depth remains open.
- Symptom: an interior could report a selected level without physical
  floor-to-floor traversal, retain too many floors, return somewhere other than
  its entrance, or render a working elevator as a featureless wall.
- Root cause: the prior runtime built one selected floor and had no stable
  vertical publication contract. The shared walking solver queried ground with
  an outdoor `-100` height sentinel, which selected the lowest overlapping
  streamed floor after elevator arrival. During the first visual pass, the
  elevator backing also sat in front of its doors and untone-mapped metal turned
  a nearby light into opaque glare.
- Resolution: a bounded floor model derives stable IDs from the exterior
  building, publishes at most active plus adjacent levels, owns continuous stair
  surfaces and level-aware collision, and exposes only proximity interactions.
  Elevator travel rebuilds that floor window without reloading Earth; lobby exit
  restores the exact exterior entrance and disposes interior colliders. Interior
  ground queries use the actor's feet height and clear cached contact at elevator
  travel. The elevator backing now sits behind two visible tone-mapped doors,
  frame, seam and indicator, with fixtures excluded from the connector approach.
- Guard: `npm run test:interior-floors`, `npm run
  test:interior-floors-browser`, `npm run test:plane-interiors`, and human review
  of `output/playwright/multifloor-interior/01-lobby-stairs-elevator.png`,
  `03-elevator-prompt.png`, `04-elevator-arrival.png` and
  `05-mobile-elevator-prompt.png`. The Chrome journey must physically hold
  ArrowUp to climb, retain at most three floor levels, keep one world-load
  sequence, keep the arrival camera on the destination surface, return to the
  same doorway and leave zero colliders.
- Never reintroduce: a floor-selector menu as traversal, whole-world loads on
  elevator use, unbounded floor scene retention, non-level-aware presence, exact
  mesh-count acceptance without screenshots, outdoor sentinel heights inside a
  vertical interior, or elevator backing/lighting that hides interactive details.

## 2026-08-18 — Building facades smear, entrances disappear or activate from the wrong wall

- Status: resolved locally on `steven/urban-sandbox-foundation`; not deployed.
- Symptom: generic buildings repeated one facade image without credible
  ground-level entrances; some facade art stretched into horizontal bands;
  inferred doors could float above the walk surface, disappear away from the
  world origin, or duplicate window panels on upper stories. The interior
  action could activate from an arbitrary side of the same building, and the
  mobile prompt looked actionable but did not enter.
- Root cause: the extrusion material projected the square facade atlas with a
  mesh UV direction that did not represent horizontal wall distance and actual
  building height. The first close-range correction then rendered door parts in
  separate instanced batches, so entrances still read as attachments instead of
  part of the architecture and paid extra draw/memory ownership. Entrance IDs
  also did not consistently use the published building identity, the lazy
  interior runtime started only after an interaction attempt, and inferred
  entrance height sampled terrain rather than the authoritative walk surface.
- Resolution: walls project the existing facade artwork by horizontal perimeter
  distance and real building height. The building geometry pass compiles the
  stable entrance catalog and attributes complete triangles on the correct wall;
  the owning facade shader samples one shared entrance atlas only inside that
  ground-floor bay. Facade and interaction therefore consume one building-owned
  entrance identity without door meshes, decorative groups or added draw calls.
  Physical corner/surface guards reject unsafe inferred entrances. The
  building-entry owner initializes while walking, measures only the doorway
  approach, aligns the generated interior to that door and routes desktop and
  touch through the same action handler; a visible door prompt has precedence
  over nearby NPC actions.
- Guard: `npm run test:living-world-facades`, `npm run
  test:building-facades-browser`, `npm run test:runtime`, `npm run
  test:mobile-controls`, `npm run test:plane-interiors`, `npm run
  test:interior-floors`, and human review of
  `output/playwright/building-facades/01-storefront-entrance.png`,
  `02-residential-entrance.png`, `03-office-entrance.png`, and
  `06-mobile-touch-prompt.png`. The browser journey requires published wall-bound
  entrances in residential, storefront and office variants, complete-triangle
  masks on the correct source geometry, outward approach normals, zero added
  draw calls, zero retained decorative meshes, desktop and touch entry, one
  world sequence, no arbitrary-wall prompt and no fatal browser errors. The
  current Baltimore fixture publishes 59 entrances and carries about 246 KiB of
  merged entrance attributes plus one 77 KiB atlas.
- Never reintroduce: a second building-wide window renderer, world-axis facade
  UVs, a parallel post-render door renderer, partial per-vertex triangle masks,
  unbounded one-mesh-per-door detail, terrain-only door height, building-center
  interaction range, a visual-only touch prompt, or city-specific door meshes.

## 2026-08-18 — Worldwide shared fallback and publication blockers

- Status: resolved locally on `steven/urban-sandbox-foundation`; not deployed;
  clean-candidate and real-device release gates remain open.
- Symptom: generalized Baltimore/New York footprints lost curated heights;
  dense cities could collapse toward grass during WorldCover outage; Everglades
  could publish without a far horizon; Tahoe/Panama chose walking on mapped
  water; vegetation changed after publication; and the exterior companion
  camera could cross a facade.
- Root cause: curated identity accepted provider IDs but had no bounded bridge
  to generalized footprints; sparse-biome and regional-surface policies ignored
  sufficient mapped settlement evidence; far terrain treated complete elevation
  failure as terminal; automatic arrival did not consistently honor exact water
  or the selector's explicit arrival mode; a debounced vegetation refresh crossed
  the immutable publication boundary; and the exterior camera arm did not query
  the existing building collision index. Ambient wildlife could also choose a
  building-occupied home and the companion follow transform swapped lateral and
  rear offsets.
- Resolution: add a unique seven-metre curated metadata identity join with both
  source identities preserved; use mapped roads/building density for spatial
  urban fallback while exact green polygons retain priority; publish the one far
  mesh in explicit accepted-ground flat-datum mode when elevation is unavailable;
  resolve exact/explicit arrival intent before fallback vehicle choice; flush
  vegetation before snapshot; reject building-occupied ambient homes; correct
  companion formation axes; and shorten only the exterior camera arm through the
  shared building collision owner. Polar HUD matching now uses physical distance.
- Evidence: Baltimore/New York report 21/41 mapped high-rises (161 m/366 m
  maxima); no-elevation Everglades owns all 97,969 cells with
  `accepted-ground-flat-datum`; runtime has 37/37 checks and stable 411-feature,
  two-mesh vegetation; companion, facade, engineered-landmark and Monaco tunnel
  Chrome journeys pass; the single full matrix captured 40 locations, its three
  discovered edge cases passed focused rendered reruns, and all 40 frames have a
  SHA-256-bound approved visual manifest.
- Guard: `test:phase4-provenance`, `test:city-surface-semantics`,
  `test:fixed-location-terrain-material`, `test:spawn-location-arrival`,
  `test:walking-camera-collision`, `test:runtime`, `test:world-discovery-browser`,
  `test:building-facades-browser`, `test:engineered-transport-landmarks-browser`,
  `test:monaco-tunnels-browser`, and the worldwide matrix plus visual review.
- Never reintroduce: untrusted proximity enrichment, city-name exceptions,
  duplicate terrain/water/camera owners, post-publication collection timers,
  automatic boat choice that overrides explicit land intent, weakened visual
  thresholds, or deploying from focused/synthetic evidence alone.

## Verification rule

A code-only pass is not enough for terrain, water, sky, or transitions. Before release:

1. Serve the canonical app through HTTP, never by opening a raw file.
2. Open a fresh Chrome tab with a unique candidate query so module caches cannot serve an earlier build.
3. Test at least one coastal city and one inland city at ground and drone altitude.
4. Change locations once in the same session and confirm the old city never appears through the loading screen.
5. Record screenshots, runtime state, and the exact commit tested.
6. Include an ocean-only location, a mountainous location, and a city outside North America; confirm that glaciers are terrain, open ocean has no land placeholder, and location labels follow the published origin.

## 2026-08-20 — Detailed-building metadata coverage diverged from publication coverage

- Status: resolved locally at audit checkpoint 1; not deployed; broader world
  coherence remains production-blocked.
- Symptom: the complete JFX world reported more than 24,000 rendered buildings
  while the expected Baltimore tall skyline was absent from the relevant world
  context. Count-only and bridge-surface checks stayed green.
- Root cause: detailed footprint publication covered 0.022 degrees around the
  selected origin, but bundled mapped metadata selection covered only 0.006
  degrees around the pack center and the live fallback queried only the small
  origin-centered metadata radius. JFX was inside footprint reach but outside
  metadata reach. A provider-type guard also prevented the compatible bundled
  semantic join when Overture successfully owned geometry.
- Resolution: one shared metadata authority now selects the nearest declared
  pack whose coverage intersects the existing building publication coverage.
  Bundled semantic enrichment is provider-independent, but cross-provider
  identity is still accepted only by the existing unique seven-metre join.
  Geometry IDs and mapped OSM semantic IDs remain separately recorded; inferred
  values are not described as mapped or surveyed.
- Evidence: staged JFX publishes 303 unique matches, 72 mapped-dimension matches,
  and 12 mapped tall buildings; downtown Baltimore visibly contains tall towers.
  Source, artifact, JFX, actor/vehicle, and six-location assembled checks pass.
  Rural Iowa does not select a city pack. Final frames for all required locations
  were manually inspected.
- Guard: `npm run verify:source`, `WE3D_VERIFY_ROOT=dist npm run
  verify:jfx-player-surface`, building metadata selection/provenance diagnostics,
  and complete-world visual review. A building count or generic visible-mesh
  count is never sufficient skyline proof.
- Never reintroduce: origin-only metadata eligibility narrower than published
  footprint coverage; geometry-provider branches that silently discard
  compatible mapped semantics; ambiguous proximity joins; city-name/radius
  exceptions; or claims that one NE-facing JFX frame proves downtown visibility.
- Open adjacent failures: controlled-player motorway arrival is not covered by
  the NPC motorway check; London/Monaco/Manhattan/Tokyo still show terrain,
  foundation, road, or building-corridor conflicts; the far-field height path
  remains independently inferred; and provider-response transport variability
  requires a separate bounded repair.

## 2026-08-20 — Derived-terrain feedback and cross-location release failure

- Status: partially repaired; production blocked.
- Symptom: Baltimore-only evidence could show a bridge while London, Monaco,
  Golden Gate and Manhattan still contained infeasible approaches, road/terrain
  breaks or buried ground floors.
- Root cause: transport profiles sometimes sampled the already-rendered terrain
  mesh while compiling authoritative graph elevations. Exact OSM stations were
  also inserted beside nearly coincident regular samples, creating artificial
  near-zero runs and extreme one-sample grades.
- Resolution retained: all transport compilation reads the accepted base DEM;
  rendered terrain is downstream only. Exact graph samples replace nearby
  synthetic samples. Recursive residual surface promotion is disabled so it
  cannot become another elevation owner.
- Evidence: the current six-location assembled run closes exact joins in
  Baltimore, Golden Gate, London and Monaco and removes the former 535x Golden
  Gate spike. Rural Iowa passes. Five urban/structure locations still fail the
  engineered-grade gate, Manhattan retains three exact elevated discontinuities,
  and London/Manhattan fail visual inspection.
- Never reintroduce: Baltimore-only approval, rendered-terrain feedback into the
  transport compiler, coincident synthetic/exact profile samples, city-specific
  exceptions, relaxed grade/continuity thresholds, or screenshot approval that
  ignores the final assembled terrain/building result.

## 2026-08-19 — Complete-world transport, population and sandbox coherence boundary

- Status: resolved in mutable local source; immutable-artifact and hands-on
  acceptance remain open; not deployed.
- Symptom: structure-focused checks could pass while final bridge joins still
  separated; distant people appeared as blocks until interaction; traffic was
  visually underspecified or disappeared; fast movement could pass through an
  actor; and two caught-screen handlers could relocate a player twice.
- Root cause: the last structural reconciliation ran before final at-grade node
  ownership, distant actor assemblies lacked final recognizable features, actor
  collision sampled only the frame endpoint despite its swept name, and the
  legacy generic caught handler did not delegate to the urban facility owner.
- Resolution: run final corridor reconciliation after exact-node finalization;
  let ordinary terrain-fitted roads own pure-surface rejoins; publish 17-piece
  distant pedestrian and traffic assemblies with stable LOD identity; use true
  segment-continuous collision; delegate caught/recovery through one sandbox
  authority; separate mapped police custody from mapped hospital recovery.
- Current evidence: the public landing-to-Baltimore journey passes with 300
  authoritative exact connections, zero discontinuities over 0.25 m, maximum
  measured delta 0.192 m, 912 structure bodies, 265 guarded roads, 27,169
  buildings, 10,579 roads, active population/sandbox owners and no runtime,
  browser or local-resource errors. Source health and the dedicated walking/
  driving Live GPS camera journey also pass.
- Never reintroduce: isolated hidden-layer screenshots as release proof,
  endpoint-only actor collision, actor replacement during LOD promotion, a
  second facility/road respawn handler, city-name bridge patches, or visual-only
  transition geometry outside the compiled transport surface.

## 2026-08-19 — Final-player bridge arrival and truthful landing capture

- Status: resolved in local staging candidate
  `4.3.0+96bc2c7c8888.4469827d9f3bcc8d.staging`; hands-on acceptance and
  deployment remain open.
- Symptom: the Jones Falls Expressway geometry existed and a vehicle could be
  placed on it, but the visible walking player appeared below it. Landing media
  could therefore be mistaken for proof of a different final player result.
- Root cause: world publication applied the authoritative custom-location spawn,
  then the shared-link runtime reapplied a mode-only state as if it also owned
  position. That second owner wrote the walker to raw terrain. A stale walking
  surface cache could preserve the lower layer after the overwrite.
- Resolution: world publication now owns final arrival; title paths no longer
  spawn again. Shared state may select a mode without moving an actor and may
  restore position only when complete coordinates are present. All restored
  positions pass through the shared safe-surface resolver, which invalidates the
  walking-road cache when changing vertical layers.
- Actual-player evidence: the normal visible Explore flow at
  `39.309728,-76.621428` settled with the player feet at 32.051251 m, the
  published walking surface at 32.051252 m, and rendered terrain at 25.918335 m.
  The selected surface was `osm:way:12115981`, tagged as an elevated bridge at
  vertical order 2. The immutable local candidate was then opened through the
  same visible flow and visually showed the player on the deck with the lower
  terrain and roads beside it. No camera write, hidden layer, diagnostic scene,
  or screenshot-only harness was used.
- Landing evidence: `baltimore-harbor-hero.webp` is now a direct 1280x720 frame
  from the normal boat-mode player runtime at Baltimore Inner Harbor, including
  the real HUD, water foreground, boat, waterfront, and visible tall buildings.
  It is not generated, composited, or rendered by a separate marketing scene.
- Never reintroduce: multiple arrival owners, mode-only state with implicit
  position authority, cached lower-layer walking surfaces across a respawn, or
  landing images that were not captured from the assembled player runtime.

## 2026-08-20 — Pedestrian NPCs derived entirely from vehicle transport

- Status: resolved locally; mapped pedestrian-surface publication remains open;
  not deployed.
- Symptom: the release matrix reported zero pedestrian motorway violations even
  though NPCs could appear on ordinary streets, crossings, ramps, bridges, and
  tunnels. The check was class-specific and did not ask where the complete NPC
  graph came from.
- Root cause: every audited location reported zero mapped pedestrian paths.
  `compilePedestrianGraph` nevertheless converted eligible vehicle-road
  centerlines into two offset `inferred_sidewalk` edges and periodically added
  `inferred_crossing` edges through the carriageway. Baltimore/JFX, Golden Gate,
  London, Monaco, Manhattan, and rural Iowa each published hundreds of these
  invented edges; Baltimore, London, and Tokyo each populated 24 agents on them.
- Resolution: pedestrian publication accepts only mapped, at-grade footways and
  rejects vehicle roads plus every ramp/elevated/bridge/tunnel path. No mapped
  footway owner is currently enabled, so population fails closed at zero rather
  than fabricating a surface. Traffic vehicles and the one Living World runtime
  remain active.
- Guard: `npm run verify:source`, `WE3D_VERIFY_ROOT=dist npm run
  verify:actors-vehicles`, and `WE3D_VERIFY_ROOT=dist npm run
  verify:assembled-locations`. The actor fixture requires ordinary roads to
  publish no pedestrian edge, retains a mapped at-grade footway with the real
  `structureKind: at_grade` runtime label, and rejects an unassociated footway
  bridge. Browser checks require zero vehicle-transport, engineered-transport,
  inferred-sidewalk, and inferred-crossing edges.
- Worldwide evidence: complete installed-Chrome frames were inspected for
  Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo.
  Baltimore/London/Tokyo retain 13-14 visible traffic vehicles with zero
  pedestrians. The six-location assembled matrix retains active terrain, roads,
  traffic, Living World, sandbox, atmosphere, HUD, collision diagnostics, and
  controls.
- Adjacent failure observed during revalidation: the NPC authority remained
  green at every location, but a later Golden Gate response omitted the bridge
  at the selected coordinate, entered boat mode, and exposed one 6.051 m exact
  at-grade discontinuity (`osm:way:12180960` to `osm:way:415852093`). The
  immediately preceding run had rendered the bridge with zero discontinuities.
  This does not reopen the NPC repair; it is evidence that provider-dependent
  transport completeness remains production-blocking.
- Never reintroduce: motorway-only pedestrian checks, road-centerline sidewalk
  offsets, periodic inferred crossings, pedestrian population count as proof of
  a valid surface, or an unassociated pedestrian path on engineered transport.
  Restore people only through an authoritative mapped at-grade pedestrian layer
  with its own worldwide final-frame verification.

## 2026-08-20 — Generalized structures pruned before exact ground acceptance

- Status: resolved locally; broader world coherence remains production blocked;
  not deployed.
- Symptom: identical Golden Gate coordinates and artifact could finish either
  on a rendered bridge or in a boat facing empty water. Road/building counts and
  the engineered-only grade check could remain green.
- Root cause: generalized core transport was discarded as soon as exact core
  data arrived, before ground validation. Exact-structure reconciliation also
  pruned generalized decks before validation and failed to upgrade an already-
  present positive OSM way with the regional exact record. A rejected exact deck
  could therefore leave zero physical-surface owners. Total exact outage was
  paradoxically safer because it retained the generalized core bridge.
- Resolution: retain only generalized engineered core structures as fallbacks;
  upgrade identical exact ways with lossless regional provenance; defer spatial/
  name deduplication to one post-ground authority pass. A surviving exact deck
  removes its generalized duplicate; a rejected exact deck leaves one mapped
  generalized owner. Ordinary core roads remain single-source.
- Guard: source fixtures cover accepted exact, rejected exact, enriched exact
  merge, and exclusion of ordinary core roads. The complete assembled verifier
  now requires JFX and Golden Gate to arrive on an attached, visible engineered
  structure and records provider/ground authority state.
- Worldwide evidence: local staging artifact
  `4.3.0+8ef28985a726.6bf7dad502796dbe.staging`; forced exact-provider failure
  still rendered and selected the generalized Golden Gate deck; the normal
  Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, and rural Iowa matrix
  passed with zero exact discontinuities; Baltimore/London/Tokyo retained
  vehicle traffic and zero pedestrians. All final frames were inspected.
- Never reintroduce: provider-success as proof that geometry can publish,
  generalized structure deletion before accepted-ground validation, duplicate
  renderers, city/landmark branches, or count-only structure acceptance.
- Adjacent blockers: ordinary-road grades are not part of the failing grade
  gate despite infeasible reported values; urban building/road/terrain conflicts
  and rural arrival coherence remain open.

## 2026-08-20 — Inferred road widths occupy mapped building footprints

- Status: resolved locally; vertical terrain/foundation coherence remains a
  production blocker; not deployed.
- Symptom: final Tokyo buildings visibly occupied road lanes while automated
  building and road counts remained high. Direct final-world measurement found
  835 London, 475 Monaco, 97 Manhattan, and 3,679 Tokyo building footprints
  inside rendered road widths. Only 16, 14, 3, and 59 respectively crossed the
  centerline recognized by the existing guard.
- Root cause: building reconciliation tested the centerline as a zero-width
  segment and ignored the compiled cross-section. All vertically confirmed
  London (702) and Tokyo (3,627) conflicts used inferred
  `fallback:road-class` widths and none involved a >=60 m building. Movement
  then ignored likely road-core building collisions, while Living World traffic
  inflated narrow roads back to 4.8 m. Mapped building and centerline identities
  were present; inferred width was the first stage that contradicted them.
- Resolution: mapped footprints constrain class-default at-grade road width
  before final mesh/traversal/traffic publication and publish explicit inferred
  provenance. Mapped width/lane authority, centerline intersections, inferred
  footprints, and insufficient clearance fail closed by suppressing the
  conflicting building. Grade-separated/passable structures are not flattened
  into this rule. Resolved surfaces below 4.8 m remain visible but non-driveable;
  traffic uses the resolved width and cannot recreate a wider lane.
- Guard: `verify:source` covers inferred-width resolution, mapped-width
  precedence, grade separation, centerline rejection, and non-driveable narrow
  roads. `verify:assembled-locations` requires the non-null final building-road
  authority, zero unresolved at-grade conflicts, and a >=1.2 m published width.
  `verify:actors-vehicles` requires narrow constrained roads to publish no
  traffic edge and validates the actual 17-part traffic model when no vehicle is
  close enough for near-detail promotion.
- Worldwide evidence: the corrected Baltimore/JFX, Golden Gate, London, Monaco,
  Manhattan, and rural Iowa assembled matrix passed with zero unresolved
  at-grade conflicts. Constrained/newly-non-driveable road counts were 318/249,
  42/31, 610/458, 304/202, 44/36, and 3/3 respectively. Tokyo retained 12-14
  visible traffic vehicles and zero pedestrians. Complete final frames were
  inspected; direct horizontal road/building occupation is absent in the
  inspected Tokyo/London paths, while the separate vertical foundation/terrain
  failure remains visible.
- Never reintroduce: centerline-only proof of road clearance, collision-ignore
  rules as physical reconciliation, widening traffic beyond the final road
  surface, treating inferred road-class width as surveyed data, suppressing
  mapped buildings merely to preserve an untagged class-default width, or a
  city-specific clearance branch.

## 2026-08-20 — Visible downhill building foundations had no collision owner

- Status: resolved locally; visible road/terrain shaping and facade frontage
  remain production blockers; not deployed.
- Symptom: on sloped ground, the rendered building body extended downhill but
  players and other collision consumers could pass through part of that visible
  wall. Count-only building checks could not detect the physical disagreement.
- Root cause: rendering used `baseElevation` plus `height + foundationRise`,
  while collision used `maximumGroundY + 0.03` plus only `height`. Tops matched,
  but collision omitted the entire rendered foundation rise. The defect also
  exists in the approved `fcc82f2` baseline; it was not introduced by bridge or
  road-width repair.
- Resolution: the rendered building body is the single vertical owner for solid
  building collision. Collider minimum, maximum, and height now match that body
  exactly. Passage-below semantics and source height/provenance remain intact.
- Guard: the building layer product records foundation collision profiles and
  mismatches; the seven-location assembled gate requires a populated authority
  and zero mismatches. Tokyo is explicitly included. Source and immutable
  artifact matrices passed for Baltimore/JFX, Golden Gate, London, Monaco,
  Manhattan, rural Iowa, and Tokyo. Actor verification retained vehicle traffic
  and exactly zero pedestrian NPCs.
- Evidence: staged artifact
  `4.3.0+84c09596f92d.618c047d7d80a818.staging`; pre-repair sampled pass-through
  interiors were Baltimore 6/4,000, London 93/4,000, Monaco 695/4,000,
  Manhattan 10/4,000, and Tokyo 3/6,000. All final artifact frames were opened.
- Never reintroduce: a collider that begins above a rendered solid wall,
  post-batching per-building reprojection as a second vertical owner, or claims
  that a rendered foundation height is a surveyed measurement.
- Adjacent blockers: London/Monaco/Tokyo ordinary-road shaping, rural arrival,
  a small set of post-building water-mask changes, far-field height/LOD, and the
  user-required mapped-street-facing doors and glass storefronts remain open.

## 2026-08-20 — Non-player vehicles discarded final road slope

- Status: resolved locally; Golden Gate deck/support alignment and broader
  world coherence remain production blockers; not deployed.
- Symptom: moving and parked vehicles were partially buried in rendered streets
  on hills. Complete-world measurements predicted up to 0.2523 m penetration in
  London and 0.2868 m in Monaco. The values compare compiled geometry and are
  not surveyed measurements.
- Root cause: traffic graph endpoints already held the final road-surface
  heights, but `agentPose` published position/yaw only. Instanced traffic,
  promoted detailed traffic, parked vehicles, and responders all rendered with
  yaw-only roots. The player car's independent multi-point contact path already
  handled pitch/roll correctly.
- Resolution: directed traffic edges publish one derived `surfacePitch`; every
  non-player vehicle presentation consumes it using the existing `YXZ` vehicle
  transform convention. Responder pitch samples the same road fore/aft along
  actual heading. No surface height or source identity changes.
- Guard: `verify:actors-vehicles` includes Monaco, requires nonzero sloped edges
  and vehicles in London/Monaco, and rejects any published/rendered pitch
  mismatch. Source and packaged runs reported Baltimore 258/7, London 448/12,
  Monaco 496/12, and Tokyo 366/12 sloped edges/vehicles, zero mismatches, and
  zero pedestrian NPCs. Source and packaged seven-location assembled matrices
  also passed and all final frames were inspected.
- Evidence: pre-commit staged artifact
  `4.3.0+377d10f70693.a5745ef727c68879.staging`; never deployed.
- Never reintroduce: yaw-only non-player vehicle poses, a second vehicle height
  owner, city-specific hill offsets, visual-only wheel/body lifting, or a test
  that accepts matching zero attitudes on a known sloped location.
- Adjacent blockers: the Golden Gate final frame visibly confirms deck/support
  misalignment and a longitudinal seam despite green continuity checks. Road/
  terrain shaping, rural arrival, facade frontage, skyline/LOD, and waterfront
  foundation ordering remain open.

## 2026-08-20 — Landmark deck height split from compiled transport surface

- Status: vertical alignment resolved locally; shared-carriageway seam remains
  a production blocker; not deployed.
- Symptom: at the normal Golden Gate player path, the driveable road was at
  35.063 m while landmark truss/girder/suspender geometry assumed 67 m. The
  roadway visibly passed far below its supports despite green count and
  continuity checks.
- Root cause: local production source `c7871f880d63` used a landmark-specific
  late road mutation and duplicate visual deck to conceal the generic compiled
  profile. When the duplicate owner was correctly removed, its published 67 m
  reference never moved upstream into transport compilation.
- Resolution: a generic, provenance-bearing transport surface control binds a
  published 67 m mean-higher-high-water clearance reference to both mapped
  bridge carriageway identities. Mapped water resolves the world-space minimum
  before the compiled surface is published. Landmark structure rendering is
  deferred and reads that final surface; it owns no driveable deck or vertical
  floor. The reference is explicitly labeled published, not surveyed.
- Guard: Golden Gate assembled verification requires two resolved controls,
  mapped-water samples, source URL/datum/status, and deferred landmark
  publication from `compiled_transport_surface`. A source fixture rejects a
  nearby road with a different mapped identity. Both source and immutable
  artifact seven-location matrices and packaged actor verification passed.
- Evidence: both carriageways resolved 67.08 m minimums from 122/123 water
  samples; player/walk/drive agreed at 67.919 m within 0.00003 m. All seven
  artifact frames were inspected. Local artifact
  `4.3.0+cc3cd0e275b4.88622ca92bcc463a.staging`; never deployed.
- Never reintroduce: landmark-owned road height, a duplicate landmark deck,
  visual-only lift, a city conditional inside the generic compiler, or a claim
  that the published clearance is a surveyed scene elevation.
- Adjacent blocker: the two 10.8 m carriageway ribbons still overlap by up to
  4.05 m and retain the visible longitudinal/diagonal seam. Repair shared-deck
  publication separately without replacing their mapped traffic identities.

## 2026-08-20 — Published mid-span clearance lifted complete bridge endpoints

- Status: resolved locally; shared-carriageway seam remains a production
  blocker; not deployed.
- Symptom: when lossless OSM transport succeeded at Golden Gate, 11 exact
  connections failed by up to 20.545 m and one engineered approach reached
  23.47%. Generalized fallback runs could remain green because they did not
  publish those exact approach connections.
- Root cause: the mapped-water resolver correctly derived the published 67 m
  reference, then promoted it to `minimumStructureSurfaceY`, an absolute lower
  bound consumed at every sample of both complete 2.46 km bridge ways. A
  navigation clearance above mean higher high water is not a surveyed global
  endpoint elevation.
- Resolution: the published control remains a hard lower bound only at mapped
  water stations. Exact graph-node surfaces retain endpoint authority. No
  landmark deck, visual ramp, horizontal road edit, or city branch was added.
- Guard: a complete-bridge profile fixture requires its mapped-water midpoint
  to remain at or above 67 m and both connected endpoints to remain at 0.08 m.
  Source and immutable-artifact seven-location matrices, source and packaged
  actor verification, and hosting verification passed; all final frames were
  inspected.
- Evidence: temporary local artifact
  `4.3.0+2bca4bea5a26.41d12289c45bf0ec.staging` (`sourceDirty: true`, never
  deployed).
- Never reintroduce: promoting a local clearance station into a global bridge
  elevation floor, treating published clearance as surveyed endpoint height,
  or accepting generalized fallback continuity as proof of lossless topology.
- Adjacent blocker: Golden Gate still has two overlapping full-width roadway
  ribbons. Fix their shared physical presentation separately while preserving
  both mapped directional identities and the existing bridge structure.

## 2026-08-20 — Directional Golden Gate roads rendered as duplicate physical decks

- Status: resolved locally; worldwide provider-sensitive topology and world
  coherence remain production blockers; not deployed.
- Symptom: Golden Gate's driving surface had a longitudinal/diagonal seam and
  unequal-looking sides although the bridge structure itself was acceptable.
- Root cause: both mapped one-way road identities lacked lane/width metadata,
  so each independently received a full 10.8 m motorway fallback ribbon. Their
  centerlines were 6.75-10.77 m apart and the physical ribbons overlapped by up
  to 4.05 m. Vertical continuity and object-count checks could remain green.
- Resolution: retain both mapped identities for topology, traversal, collision
  sampling, and directional traffic, but publish one source-bound physical road
  presentation, one marking set, and one bridge shell. The 19 m/six-lane control
  is an official published design reference explicitly labeled not surveyed.
  Landmark structure keeps its complete original path and components and reads
  the compiled shared center only for lateral alignment.
- Guard: fixtures require two opposite source identities, one centered shared
  group, both retained member IDs, 19 m width, and six lanes. Golden Gate final
  verification requires one group and full tower/cable/girder/suspender counts;
  all other worldwide matrix locations require zero groups. Source and packaged
  actor gates passed with active traffic, zero attitude mismatches, and zero
  pedestrian NPCs on transport. Complete source/artifact frames were inspected.
- Evidence: local artifact
  `4.3.0+c633918d4d00.60a184335587db86.staging` (`sourceDirty: true`, never
  deployed).
- Never reintroduce: two full-width physical ribbons for a shared directional
  deck, a landmark-owned duplicate driveable deck, replacement of directional
  source identities, city logic inside generic compilation, or claims that the
  published width is surveyed geometry.
- Adjacent blockers: one lossless Monaco run exposed an 8.9704 m exact mismatch
  and 47.727% grade; one packaged Tokyo run exposed 12 exact mismatches up to
  15.9661 m and a 14.646% grade. Provider retries passed, proving fallback can
  hide both. London/Monaco/Tokyo terrain shaping, rural Iowa arrival, facade
  frontage, skyline/LOD, and waterfront ordering remain open.

## 2026-08-21 — Classified DSM and Terrarium both owned New York ground

- Status: resolved as recovery checkpoint 1; worldwide transport, building,
  provider-determinism, frontage, and composition blockers remain; not deployed.
- Symptom: the complete World Trade Center frame showed artificial terrain
  embankments while automated checks accepted the world. At the same coordinates
  preserved candidate `4.3.0+88c3ff8b88a7.60a184335587db86.staging` published
  a -492.623 m far-field minimum and retained 42 Terrarium elevation tiles.
  WTC-only retesting could appear fixed while Times Square still crossed the
  accepted-artifact boundary.
- Root cause: the runtime accepted a building-contaminated classified DSM as
  near ground, then independently used Terrarium for far ground. The builder
  also treated requested ground metres as Web Mercator metres, shrinking real
  coverage at latitude. Overlapping equal-resolution New York artifacts could
  remain in the regenerated catalog. Transport and building compilers consumed
  these results but did not cause the first loss.
- Resolution: select an ordered detail/regional stack from one highest-priority
  provider; use it for near/far terrain, water-bed sampling, and far-building
  bases; scale requested ground extent into projected extent; publish reviewed
  locked-raster USGS 3DEP New York artifacts normalized to EGM2008; and delete
  the obsolete overlapping `holland-tunnel-ground` and `newyork-ground` runtime
  assets. No city branch, visual ramp, duplicate terrain renderer, fake height,
  or detail reduction was introduced.
- Data/resource result: 95,290 source-bound samples use hash-verified compact
  Float64 row-major encoding at unchanged 90 m/320 m delivery spacing. Final
  Manhattan uses zero Terrarium requests and zero elevation cache bytes instead
  of retaining fallback data. Source accuracy and uncertainty remain provenance
  fields and are not described as surveyed measurements.
- Guard: source verification rejects provider mixing, lower-priority leakage,
  obsolete catalog identities, Web Mercator extent regression, artifact hash or
  compact-decoder failure, and missing global sample keys. Browser release waits
  require a finite published terrain surface rather than nonzero fallback cache.
  Final Manhattan requires two reviewed artifact identities, far authority
  `accepted-ground-stack`, zero source tiles/requests, and zero unowned cells.
- Evidence: the final complete Manhattan frame retains tall buildings, 10,335
  near buildings, active traffic and sandbox systems, a grounded player, and no
  runtime/page/local-resource errors. Rendered/source terrain differs by at most
  0.0021 m in the sampled 80 m neighborhood. Seven worldwide control frames
  were inspected; the official Manhattan rerun is red only on the separately
  tracked 5.8597 m exact transport discontinuity.
- Gate status: final `verify:source` passed. The complete `verify:world` gate
  remained red on its far-pedestrian expectation (the product requirement is
  zero pedestrians) and its fallback exact-connection policy (zero
  authoritative connections and zero discontinuities). These failures are
  recorded, not waived or relabeled as ground failures.
- Immutable-candidate evidence: a clean lossless-OSM rerun kept the exact ground
  result (two reviewed artifacts, zero Terrarium requests/cache bytes, zero
  unowned cells) while publishing 19,253 near buildings and exposing a 66.453%
  ordinary-road grade. The generalized source run had 10,335 buildings and a
  59.136% worst road. This variation belongs to the next provider-determinism
  checkpoint and must not be hidden by reducing detail.
- Never reintroduce: accepting a DSM correction because counts/confidence alone
  are green, separate near/far ground providers inside one covered gameplay
  envelope, raw EPSG:3857 metres presented as ground extent, overlapping
  equal-resolution authorities selected by filename order, a terrain gate that
  requires fallback cache memory, or smoothing transport to conceal bad ground.
- Adjacent blockers: provider-sensitive source selection; Baltimore/Golden
  Gate/Monaco/Manhattan exact topology; ordinary-road shaping; unified building
  identities/heights across LOD; foundation/water ordering; mapped street-facing
  doors and glass storefronts; and ownership-based memory work.

## 2026-08-21 — Expired Overture release silently published generalized buildings

- Status: resolved as recovery checkpoint 2; unified building height/LOD and
  worldwide terrain/transport blockers remain open; local only, not deployed.
- Symptom: identical Manhattan coordinates published either 10,335 or 19,253
  near buildings, while the layer product named only the placeholder
  `selected-location-buildings`. The preserved checkpoint-1 candidate later
  reproduced 10,335 generalized buildings even though the provider session
  reported the outer `overture` operation as completed.
- First authoritative loss: `overture-tile-source.js` pinned release
  `2026-06-17.0`, whose official PMTiles archive now returns HTTP 404 under
  Overture's bounded public-release retention policy. `fetchGlobalBuildingData`
  caught that failure and fetched Shortbread inside the Overture provider task.
  The session therefore recorded Overture success, the layer product omitted
  the actual source, and partial Overture tile success was also accepted as a
  publishable world. Height selection and mesh batching were downstream.
- Resolution: pin reviewed release `2026-08-19.0`; require the entire requested
  Overture tile set after at most two bounded attempts; reject partial coverage;
  move Shortbread fallback into its own provider operation; and publish the
  winning building source and decision into the immutable layer product/runtime
  state. No building height, LOD, count budget, city condition, or visual scale
  was changed.
- Release guard: source fixtures prove transient failed tiles recover without
  losing coordinate order and permanent incomplete coverage throws. Candidate
  creation and full release verification range-check the pinned official
  archive and reject releases with fewer than fourteen expected retention days.
  The worldwide assembled gate requires the pinned release, complete coverage,
  zero failed tiles, matching requested/loaded counts, and authoritative
  Overture publication.
- Same-coordinate evidence: two fresh Manhattan source loads both published
  15,272 buildings and 6,115 visible building meshes from the same 9/9 complete
  release. Each requested 21,225 building/part records; final dimension evidence
  contained 15,192 mapped heights, 2,929 mapped-tall records, and only 164
  inferred heights. The official complete Manhattan assembled gate passed every
  check including `completePinnedBuildingAuthority`.
- Worldwide evidence: Baltimore 24,514 buildings (9/9 tiles), Golden Gate 592
  (9/9), London 16,452 (12/12), Monaco 5,985 (12/12), Manhattan 15,272
  (9/9), rural Iowa 3,210 (12/12), and Tokyo 24,160 (12/12). Every complete
  gameplay frame was opened with terrain, water, buildings, transport, living
  world, atmosphere, HUD, collision and player control active. No run had a
  runtime/page/local-resource error attributable to this change.
- Never reintroduce: an expiring provider release without a pre-candidate
  reachability/lifetime gate, accepting partial authoritative tiles, performing
  one provider's fallback inside another provider's ledger token, placeholder
  building source identity after publication, or count-only provider tests.
- Adjacent blocker exposed rather than hidden: Baltimore still publishes only
  23 mapped-tall records while 18,057 heights are inferred; Tokyo publishes zero
  mapped-tall records in the tested core while 20,728 heights are inferred.
  London/Monaco foundations and rural Iowa arrival remain visibly incoherent.
  The next bounded authority is one building identity/height catalog across
  near publication, far context, batching and LOD; do not reduce detail.
- Full `npm test` kept `verify:source` green and retained only the two previously
  recorded `verify:world` policy failures: its far-pedestrian expectation
  conflicts with the required zero pedestrians, and its exact-connection check
  rejects zero authoritative connections despite also reporting zero
  discontinuities. No new provider/building/runtime/browser/resource check failed.
- The first clean immutable candidate reproduced the source result exactly:
  15,272 buildings, 6,115 visible meshes, 21,225 requested records, 9/9 complete
  Overture tiles, 15,192 mapped heights, 2,929 mapped-tall records, and zero
  runtime/page/local-resource errors. Packaging did not change provider choice.

## 2026-08-21 — Final building LOD advertised mapped skyline outside provider authority

- Status: resolved locally as recovery checkpoint 3; exact transport,
  composition, far-building identity and resource blockers remain; not deployed.
- Symptom: Baltimore/JFX reported more than 24,000 rendered buildings but its
  expected tall skyline disappeared. The mapped Transamerica footprint,
  161 m height and 40 levels existed in provider and bundled metadata, while
  One World Trade Center's mapped 417 m record proved the height compiler could
  preserve a tall building when its identity reached final publication.
- First authoritative loss: final building LOD advertised a 2,700-world-unit
  circular domain, while acquisition used a 0.022-degree square. Transamerica
  was 2,306.861 world units from the JFX origin but beyond the square's latitude
  edge. Expanding acquisition alone exposed two downstream losses: ordinary
  footprints consumed the 26,000-record cap, then a coarse loaded-road test
  discarded the mapped footprint even though exact transport conflict returned
  `action: none`.
- Resolution: derive provider bounds from the same local projection and final
  LOD radius; clip rectangular tile coverage to the circular publication domain
  before selection; preserve mapped vessels and mapped buildings at or above
  60 m before ordinary distance distribution; and apply coarse road coverage
  only to inferred road-frontage geometry. Existing exact transport conflict
  resolution remains the sole physical road/building exclusion authority.
- Guard: source verification covers latitude-correct building bounds at
  Baltimore/London/Tokyo, exact Transamerica inclusion, circular clipping,
  deterministic vessel/tall/ordinary priority and mapped-versus-inferred road
  coverage. Complete JFX evidence requires the exact Transamerica Overture ID,
  bundled OSM provenance, mapped 161 m/40-level record, attached visible mesh,
  complete provider tiles and no unresolved physical conflict.
- Result: JFX decoded 65,561 provider records, retained 48,915 within the
  publication circle, selected 26,000 and rendered 25,623 with 48 mapped-tall
  records. The comparable pre-repair run rendered 24,510 with 23 mapped-tall
  records. This is a detail-preserving authority correction, not a count or
  visual-scale patch.
- Worldwide control: all seven required final worlds pass pinned building
  authority, zero pedestrians on transport, one physical bridge surface,
  lane-direction and runtime/resource checks. The gate remains red for exact
  transport at Baltimore (13), Golden Gate (7) and Tokyo (12), plus one grade
  violation each at Baltimore and Tokyo. Their complete frames were inspected.
- Never reintroduce: provider coverage smaller than advertised final LOD,
  rectangular tile corners consuming circular publication budgets, ordinary
  footprints displacing sparse mapped tall identities, coarse road coverage as
  an exclusion authority for mapped footprints, count-only skyline acceptance,
  city-specific landmark exceptions or reduced far/world detail.
- Adjacent blockers: JFX's deck is above terrain but surrounding road/ground
  joins are visibly disconnected; Golden Gate and Tokyo retain exact joins;
  unforced JFX heap samples vary from about 626 MB to 1.77 GB and require
  ownership evidence. Unified near/far building identities, mapped frontage and
  storefronts, vehicle hill contact and broader final-world composition remain
  separate checkpoints.

## 2026-08-21 — Metric proximity invented lossless cross-layer topology

- Status: resolved locally as recovery checkpoint 4; remaining exact joins and
  a Golden Gate publication-order race remain; not deployed.
- Symptom: the complete JFX world had 13 exact transport discontinuities up to
  12.8544 m even though its main deck was visibly above terrain. The four
  largest conflicts paired West North Avenue/other surface endpoints with the
  interior of elevated motorway link `osm:way:69531292`.
- First authoritative loss: the network compiler accepted a bounded metric
  endpoint-to-interior snap when vertical modes differed if either road type
  ended in `_link`. Both features had lossless source topology but did not share
  an OSM node. The graph therefore invented a physical connection before
  vertical solving, structure assembly, collision or rendering.
- Resolution: leave spatial candidate search/order unchanged; after the best
  candidate and provenance are resolved, reject only a lossless cross-layer
  endpoint-to-interior join with no shared source node. Shared-node ramps,
  same-surface exact drift and generalized metric conflation retain their
  existing authority. No city condition, geometry offset or detail/budget
  change was introduced.
- Guard: source fixtures reject the false nonshared cross-layer join, require
  the equivalent mapped shared-node ramp join, preserve same-surface exact
  endpoint drift and preserve generalized fallback. `verify:source` passes.
- Evidence: focused lossless JFX drops from 13 discontinuities/12.8544 m to
  3/5.5400 m. Its final gameplay frame shows the deck above ground and remaining
  open joins. Focused Golden Gate retains its two controlled directional road
  identities, compiled shared surface, symmetric six-lane deck and landmark
  binding; its separate 6.0511 m exact join remains.
- Rejected variants: rejecting every lossless nonshared metric connection broke
  legitimate Golden Gate binding. Moving provenance work into the dense match
  loop also caused the deck publication window to be missed. Never reintroduce
  either broad rule, topology inferred from `_link` naming without mapped-node
  evidence, or smoothing/render geometry that hides an invented graph edge.
- Adjacent blocker exposed: Golden Gate passes focused but, after a longer
  seven-location browser sequence, can publish towers/cables without surface
  controls or the shared driving deck and spawn the player in a boat below the
  span. This is a lifecycle/publication-order failure and must be traced from
  final road publication into landmark control and shared-surface compilation;
  bridge proportions are not the first loss. London retains three exact joins
  up to 5.1451 m; Monaco retains two up to 8.9704 m and a 47.7274% grade.
- Gate status: all seven complete frames were opened and building provider,
  skyline, zero-pedestrian, lane-direction and local-resource guards remained
  intact. Rural Iowa arrival and London/Monaco/Tokyo composition still look
  incomplete. Memory ownership, hills/vehicle contact, mapped facade frontage
  and remaining exact joins remain open; the release is not production-ready.

## 2026-08-21 — Structure name deleted a non-overlapping fallback surface

- Status: bounded authority corrected locally as recovery checkpoint 5; exact
  provider symptom revalidation remains open; not deployed.
- Symptom: a real exact-provider Golden Gate world published 8,111 roads and
  405 lossless connections but zero bridge controls/shared surfaces, placing a
  boat beneath the landmark. Exact-provider outage instead retained two
  generalized mapped carriageways and produced the correct symmetric deck.
- First code loss: post-ground structure dedup considered any exact and
  generalized structure with the same normalized family/name duplicates,
  regardless of spatial overlap. A surviving approach fragment could therefore
  delete a complete same-name fallback deck after a different exact deck
  fragment failed acceptance. Landmark rendering, vertical controls and shared
  surface compilation were downstream and received no road owner to bind.
- Resolution: remove name-only deletion. The existing generic physical proof—
  same structure family, compatible direction, bounded segment distance and
  minimum matched length/coverage—is now the sole dedup criterion. Mapped names
  remain provenance and do not become physical-surface identity. No city rule,
  duplicate renderer, geometry offset or detail reduction was added.
- Guard: a new source fixture requires a separated exact fragment and same-name
  generalized deck to remain two distinct surfaces. The existing coincident
  fixture still requires the exact structure to supersede its generalized
  duplicate. `verify:source` passes.
- Worldwide fallback control: all seven assembled locations passed the current
  automated gates and all complete frames were opened. Golden Gate rendered one
  centered 19 m/six-lane shared deck with two mapped member identities, matching
  sides, landmark binding and player collision; zero pedestrians remained.
- Verification limitation: every configured Overpass operation failed at
  Golden Gate during post-change focused and worldwide runs. Those runs prove
  fallback/non-regression, not exact closure. A real successful exact response
  must still retain one usable deck without overlap before release. Provider
  availability is itself a blocker and fallback-green results cannot waive it.
- Adjacent blockers: visible London/Monaco/Tokyo composition, rural Iowa arrival,
  exact joins/grades, vehicle hill contact, mapped street-facing facade detail
  and memory/data ownership remain open. The release is not production-ready.

## 2026-08-21 — Edge pitch passed while vehicle wheels penetrated curved roads

- Status: resolved locally as recovery checkpoint 6; not deployed. Separate
  Golden Gate exact-provider and final-world composition blockers remain.
- Symptom: non-player cars appeared partly below streets on hills even though
  the actor/vehicle gate reported matching road attitude. The same green gate
  was reproducible in complete London and Monaco worlds.
- First authoritative loss: the traffic graph reduced a road interval to two
  endpoint heights and one pitch. Population placement linearly interpolated
  that plane and the old test only compared that pitch with rendered pitch.
  Neither moving, promoted nor parked traffic sampled the final road beneath
  its four visible wheels; responders sampled only front/rear center points.
- Resolution: one wheel-contact layout now belongs to the canonical meter-based
  vehicle catalog and is consumed by both vehicle LOD renderers. Every non-player
  vehicle class resolves root height, pitch and roll from the final published
  road at those four locations. The rigid plane is lifted only enough to prevent
  penetration; remaining road twist is bounded suspension clearance. The player
  car keeps its existing multipoint physics authority.
- Guard: a deterministic curved-road fixture proves the old center/edge plane
  penetrates and requires four sampled contacts plus zero penetration. The real
  installed-Chrome gate requires all traffic vehicles to use the four-contact
  authority, zero attitude/root mismatch, at most 0.002 m penetration and at
  most 0.22 m suspension clearance, while retaining traffic and zero pedestrian
  NPCs.
- Evidence: former maximum penetration measured 0.2073 m Baltimore, 1.0254 m
  London, 1.0663 m Monaco and 0.7302 m Tokyo. Corrected runs sampled 14/14 cars
  per city with zero penetration; worst residual clearance was 0.1962 m Monaco.
  No runtime/browser/local-resource failures occurred.
- Worldwide control: Baltimore/JFX, London, Monaco, Manhattan, Iowa and Tokyo
  passed the complete assembled gate. Golden Gate remained red on the separate
  provider-sensitive missing control/shared deck plus one 6.0511 m exact join.
  All seven full frames were inspected and visible composition/arrival defects
  remain explicit blockers.
- Never reintroduce: pitch-equality-only tests, endpoint planes as wheel-contact
  authority, renderer-specific axle positions, per-city suspension offsets,
  visual-only road lifts, road-detail reduction or claims that a count/pitch
  diagnostic proves final contact.

## 2026-08-21 — Highest lateral DEM sample lifted the whole at-grade road

- Status: resolved locally as recovery checkpoint 7; not deployed. Longitudinal
  DEM steps and exact graph joins remain separate blockers.
- Symptom: complete Monaco gameplay showed an ordinary road raised into a false
  ramp/wall. Counts, bridge checks and traffic checks could remain green.
- First authoritative loss: `transport-surface-model` chose the highest of the
  center, left and right terrain samples as the elevation of the whole planar
  cross-section. One coarse hillside cell raised a measured runtime example by
  46.46 m. `surfaceTerrainSampler` then became a second downstream authority,
  so final ribbons and collision could resample incompatible lateral heights.
- Resolution: each driveable mapped centerline sample owns the at-grade vertical fit. One
  compiled planar transport surface owns center and edges. The terrain publisher
  consumes those canonical road references through one spatial index and
  reconciles only the carriageway plus a bounded shoulder blend. Rebuilds start
  from cached base terrain, reapply the same profile once and reposition
  terrain-dependent objects after publication.
- Guard: a deterministic steep lateral-slope fixture requires the compiled road
  to remain at the centerline fit rather than the high edge. Runtime diagnostics
  require every driveable at-grade road to carry the compiled surface authority, zero live
  terrain samplers and one terrain corridor publication.
- Worldwide evidence: `verify:source` and the real four-city actor/vehicle gate
  pass. Baltimore, London, Monaco and Tokyo retain traffic, four-wheel contact,
  zero wheel penetration, correct lane direction and exactly zero pedestrian
  NPCs. Seven complete frames were inspected; Monaco is improved while London
  road overlap, Tokyo road/building collision and Iowa arrival remain visible.
- Verification limitation: one exact-provider matrix exposed London and Golden
  Gate graph/grade failures. The clean committed candidate fell back in both
  controlled comparison attempts, but reproduced pre-change ordinary London
  grades up to 1.6965. Those failures are not waived by fallback. Accepted-ground
  schema staleness also remains under audit; an unproven rebuild is not a fix.
- Never reintroduce: highest-edge road lifting, center/left/right terrain folds,
  live post-compile surface samplers, city-specific terrain cuts, visual-only
  ramps, detail reduction or count-only acceptance.

## 2026-08-21 — Rural mapped approach was discarded by a second distance cutoff

- Status: resolved locally as recovery checkpoint 8; not deployed. Building
  height/LOD and London exact topology remain release blockers.
- Symptom: the real rural Iowa world showed the player alone in an empty field
  while roads and buildings were visible only on the horizon. Count gates passed.
- First authoritative loss: the canonical spawn search found a safe mapped walk
  approach, but `resolveCustomLocationArrival` rejected it if its distance from
  world origin exceeded 160 m. Runtime evidence showed 3,831 roads, 4,860
  buildings and the nearest driveable mapped road—22nd Street—at 176.2245 m.
- Resolution: remove the duplicate post-search cutoff and consume the generic
  safe mapped approach already selected inside the fixed-location world. The
  existing valid-terrain fallback remains authoritative when no route exists.
- Guard: the source fixture supplies a valid mapped approach beyond the retired
  cutoff and requires it to survive. The Iowa assembled gate requires the final
  walking surface to be a mapped road with transport identity inside the
  existing 2.7 km location traversal bound.
- Worldwide evidence: the focused Iowa gate and source gate pass; the final
  Iowa frame shows mapped 22nd Street at approximately `42.0782,-93.8696`.
  The seven-location matrix preserves other arrivals, traffic and zero
  pedestrians. London stays red on 26 exact joins up to 5.4286 m and five grade
  violations; those independent failures were not hidden.
- Never reintroduce: competing title/world spawns, a second origin cutoff after
  mapped selection, city-specific coordinates, synthetic rural roads,
  continuous-world streaming or count-only arrival proof.

## 2026-08-21 — Count-only skyline checks hid a second far-height authority

- Status: resolved locally as recovery checkpoint 9; not deployed. London and
  Tokyo composition remain visible release blockers.
- Symptom: Baltimore could report mapped tall buildings while the expected
  skyline appeared absent or short. The supposed downtown screenshot did not
  prove the World Trade Center camera path, and the assertion required only a
  positive mapped-tall count.
- Trace result: the current pinned detailed provider retains World Trade Center
  identity `overture:fda9f5db-1315-49ba-807a-9d41a4ad4b80`, mapped height
  123.5 m, attached visible mid-LOD mesh and matching collision. Transamerica
  likewise retains mapped 161 m. The remaining first code divergence was
  `far-building-massing`, which independently parsed/inferred height and clamped
  even mapped values to 180 m.
- Resolution: detailed and far publication now share `building-semantics` for
  explicit height, mapped levels and deterministic identity/world-seed
  inference. Remove the blanket mapped-height clamp. Preserve building count,
  far coverage, batching and LOD budgets.
- Data limitation: observed Shortbread far tiles group rings without per-ring
  height/name metadata. Final far results are therefore correctly labeled
  inferred, not mapped or surveyed. No fabricated height or city metadata was
  introduced.
- Guard: source fixtures require a mapped 417 m far tower to remain 417 m,
  mapped 40 levels to resolve to 128 m and inference to remain deterministic.
  Runtime diagnostics join mapped tall identities to final direct/batched
  visuals. JFX requires the exact World Trade Center identity and height.
- Worldwide evidence: source, exact JFX and seven-location assembled gates
  pass. Attached/visible mapped-tall coverage is 48/48 Baltimore, 34/34 Golden
  Gate, 207/207 London, 14/14 Monaco, 3,875/3,875 Manhattan, 0/0 Iowa and 2/2
  Tokyo. All complete frames were inspected. The independent actor/vehicle
  gate remains green in Baltimore, London, Monaco and Tokyo with 14/14 sampled
  four-wheel-contact vehicles, zero wheel penetration and zero visible
  pedestrian NPCs in both samples.
- Never reintroduce: count-only skyline acceptance, mislabeled camera evidence,
  an independent LOD height parser, blanket clipping of mapped towers, random
  reload-dependent inference, fake skyline geometry, city-specific heights or
  performance work that removes building/ground/far detail.
- Adjacent blockers: the green automated matrix still misses visible London
  road ribbons and Tokyo road/building conflicts. Mapped frontage/storefronts,
  memory/data ownership and final packaged release verification remain open.

## 2026-08-21 — Turn checks passed while the final road footprint had open wedges

- Status: resolved locally as recovery checkpoint 10; not deployed. Monaco
  vertical joins and Tokyo building/road cross-sections remain separate blockers.
- Symptom: complete London gameplay rendered broad, jagged carriageway edges
  and triangular openings near turns even though road counts, graph continuity
  and the initial triangle-integrity diagnostic passed.
- First authoritative loss: the final at-grade ribbon publisher used a clamped
  miter strip that could fold at sharp turns. The first solid-segment repair
  placed its join fan on the inside of the turn, which was already covered by
  overlapping segment rectangles, leaving the exposed outer wedge unfilled.
  Two-branch junctions were also omitted, and fixed-regional T junctions only
  retained feature endpoints rather than shared internal source-node branches.
- Resolution: publish at-grade roads as non-folding segment rectangles with a
  bounded fan on the outer turn side. Close every physical two-or-more-branch
  at-grade junction at the narrowest connected half-width. Preserve shared
  internal source-node branch identity. Keep bridge/tunnel surfaces on the
  compiled engineered ribbon owner.
- Guard: source fixtures prove exposed outer-wedge coverage, sharp-turn
  non-folding geometry, width-asymmetric two-branch closure and internal-node T
  topology. Complete-world diagnostics require positive solid geometry and
  zero folded triangles, degenerate triangles or undersized junction caps.
- Worldwide evidence: all seven road-surface gates pass with 79,867-254,607
  segment quads, 11,460-53,314 turn joins and no integrity failures. Six worlds
  pass the full assembled contract; Monaco separately reports three mapped
  vertical discontinuities up to 3.1604 m. All seven final gameplay frames were
  inspected; Golden Gate remains symmetric and six lanes wide.
- Scope boundary: raycasts at the London camera prove the remaining long dark
  slivers sit outside every road half-width and belong to mapped non-road
  traffic-island ground. Never pave arbitrary inter-road space, restore broad
  convex-hull fans, add city geometry, use a test-only camera, suppress mapped
  detail, or weaken the vertical-connection gate to make this checkpoint green.

## 2026-08-22 — One local building conflict mutated an entire road

- Status: resolved locally as recovery checkpoint 11; not deployed. London's
  visually jagged inter-road/turn composition remains the next release blocker.
- Symptom: complete Tokyo gameplay showed long mapped roads narrowed into thin
  strips or running incoherently between buildings. Automated building and road
  counts stayed green because both objects still existed.
- First authoritative loss: `building-road-footprint` wrote a locally inferred
  clearance width into feature-wide `road.width` and changed feature-wide
  `road.driveable`. Subsequent building decisions read that mutation, making
  publication depend on building load order. Every later road, terrain,
  traversal, traffic, collision and furniture consumer inherited it.
- Resolution: preserve mapped source identity and width. Publish immutable
  footprint-clearance profiles on bounded source-segment intervals with an
  eight-metre transition. Rendering, terrain, intersection closure, traversal,
  traffic/lane placement, reachability, spawn collision and furniture consume
  the same local function. A locally sub-4.8 m interval remains a mapped visual
  and walk surface but is excluded from vehicle traversal only there.
- Guard: source fixtures require order-independent profiles, full width outside
  a conflict on the same long segment, local-only traffic exclusion, unchanged
  mapped cross-sections/tunnels and non-folding variable-width final geometry.
  The assembled gate requires the interval authority whenever constraints are
  present and forbids any new whole-road disablement.
- Worldwide evidence: one complete seven-world run passed before the final
  source-boundary refinement. After it, Golden Gate, London, Monaco, Manhattan,
  Iowa and Tokyo passed, while a provider-sequenced Baltimore run exposed six
  unrelated vertical joins up to 11.3764 m and one grade violation. The same
  focused Baltimore path immediately passed with zero of both. Local profiles
  affect 259 roads/294 source segments in Baltimore, 29/37 Golden Gate, 523/693
  London, 247/504 Monaco, 42/47 Manhattan, 25/28 Iowa and 1,270/2,013 Tokyo;
  whole-road disablement is zero everywhere. All final frames were opened.
  Baltimore mapped-tall visuals remain complete and Golden Gate remains one
  symmetric six-lane surface. The provider-sensitive vertical result is not
  waived or attributed to local width.
- Actor/control evidence: Baltimore, London, Monaco and Tokyo each publish
  traffic and 14/14 four-wheel-contact vehicles with zero wheel penetration,
  bounded wheel gap, correct lane side/direction and zero visible pedestrians.
- Adjacent gate evidence: the final general `verify:world` journey was red with
  zero authoritative transport connections and a far-NPC representation
  failure. Neither consumes cross-section profiles; both remain release work.
- Packaged evidence: the first immutable-candidate Tokyo run exposed 42
  provider-sequenced vertical joins up to 15.9661 m and five grade violations;
  all cross-section/building/population/runtime checks passed. The identical
  packaged rerun reported zero joins and zero violations. Keep both results;
  the successful repeat does not waive nondeterministic transport topology.
- Open visual evidence: exact same-camera source/checkpoint-10 London frames
  contain the same broad jagged inter-road/turn field. It predates and is not
  worsened by this change, but the current triangle/cap gate still fails to
  classify it as visually incoherent. Diagnose its source identities and
  physical enclosure before editing; do not waive it as production-ready.
- Never reintroduce: feature-wide width mutation from a local footprint,
  order-dependent building decisions, duplicate road/building renderers,
  city-specific clearances, fake widths, detail/height reduction, test cameras,
  continuous streaming or claims that object counts prove composition.

## 2026-08-22 — CPU terrain height disagreed with the rendered physical surface

- Status: resolved locally as recovery checkpoint 12; not deployed. Worldwide
  road/junction enclosure and provider-sensitive vertical topology remain
  production blockers.
- Symptom: final London gameplay showed terrain through or above road ribbons,
  while the road mesh integrity/count gate passed. The same complete-frame
  review found road-edge/junction notches in Monaco and Tokyo. This is not a
  JFX-only or London-only acceptance problem.
- First authoritative loss: `terrainMeshHeightAt` bilinearly interpolated four
  terrain vertices, but the GPU rendered the cell's two triangle planes. A
  bilinear saddle is not the rendered physical surface. Separately, water and
  transport reapplied tiles sequentially and stitched a mesh before a neighbour
  could be recalculated, so the later tile could overwrite a shared edge.
- Resolution: sample the exact rendered triangle selected by the geometry
  diagonal. After all water/transport reapplications, publish each shared tile
  edge coordinate once across the whole terrain group and average its normals.
  Terrain remains one renderer and one resolution; roads, buildings, mapped
  heights, providers and detail budgets are unchanged.
- Guard: deterministic source fixtures prove triangle-plane sampling on a
  saddle and exact shared-edge publication for disagreeing adjacent tiles.
  Runtime diagnostics require `rendered-triangle-barycentric` and
  `one-shared-world-height-per-terrain-edge-coordinate` in the complete world.
- Worldwide evidence: all seven assembled locations publish the new authority
  and reconcile 2,814-10,728 shared vertices. Mapped-tall final visibility,
  shared far-building height authority, traffic, collision and runtime checks
  remain green. Four-city actor verification reports 14/14 sampled traffic
  vehicles, zero wheel penetration, bounded suspension gaps and zero visible
  pedestrian NPCs in each location.
- Remaining failed evidence: the worldwide matrix reports vertical topology/
  grade failures in Baltimore (44/11.3764 m; one grade), Golden Gate (6/5.3891
  m; one grade), London (27/5.4286 m; five grades), Manhattan (7/5.4999 m; one
  grade) and Tokyo (17/15.9661 m; one grade). Monaco and Iowa pass. The green
  road-footprint gate still accepts visibly incoherent London, Monaco and Tokyo
  road composition; final-frame enclosure is now an explicit next gate.
- Discarded theory/experiment: loading fallback street polygons did not remove
  the London shapes. Adaptive road tessellation and local surface lifts grew
  geometry dramatically and still left failures, so none of that experiment is
  shipped. Do not reintroduce it as a visual patch.
- Never reintroduce: bilinear CPU sampling against triangulated rendered
  terrain, per-tile final seam ownership, count-only road acceptance, paving
  arbitrary inter-road land, city-specific terrain cuts, duplicate surfaces,
  visual-only lifts or performance work that removes world detail.

## 2026-08-22 — Final at-grade renderer discarded the compiled road height

- Status: resolved locally as recovery checkpoint 13; not deployed. Remaining
  horizontal edge enclosure and provider-sensitive vertical joins are open.
- Symptom: complete London gameplay showed terrain through broad parts of a
  mapped carriageway. Camera raycasts found terrain first at points inside the
  mapped 7.9 m width and found road geometry farther down the same ray. Counts,
  triangle integrity and the claimed compiled authority were all green.
- First authoritative loss: the compiled transport surface already owned
  terrain shaping, traversal, collision and traffic, but final at-grade road
  geometry sampled `cachedTerrainHeight` for every vertex. Presentation was
  therefore derived from downstream terrain while diagnostics mislabeled it as
  compiled.
- Resolution: final at-grade geometry samples `sampleFeatureSurfaceY` from the
  existing compiled feature/shared surface. Any non-finite profile fallback is
  counted; assembled checks require `compiled_transport_surface_profile` and
  zero fallback calls.
- Guard: a deterministic sloped-profile fixture returns compiled height 4 m
  while its contradictory fallback returns 99 m; the fallback count must remain
  zero. Worldwide runtime checks enforce the same result in complete gameplay.
- Evidence: the same London frame loses its broad interior wedges while keeping
  191,946 segment quads, 31,644 joins and zero folded/degenerate triangles or
  fallbacks. Seven-location evidence retains mapped buildings/heights, far
  detail, traffic, terrain, collision and Golden Gate symmetry. Four-city actor
  verification retains 14/14 four-wheel contacts, zero penetration, bounded
  gap and zero visible pedestrian NPCs per location.
- Remaining evidence: smaller London edge notches remain. Baltimore, Golden
  Gate, London, Manhattan and Tokyo still expose provider-sensitive vertical
  failures; a focused Monaco response exposed three mapped joins up to 3.1604
  m and a corresponding visible step. Do not hide those with terrain draping.
- Discarded experiment: expanding the terrain corridor by each cell's half-
  diagonal did not materially close London or Monaco and was removed in full.
- Never reintroduce: final road heights sampled from rendered terrain,
  diagnostics that claim an unconsumed authority, visual road lifts, fake
  ramps, city branches, detail reduction, or a green count gate overriding a
  failed complete frame.
