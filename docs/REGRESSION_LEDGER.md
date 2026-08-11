# Regression Ledger

This is the durable record of visual and loading regressions already encountered in World Explorer 3D. Read it before changing terrain, water, sky, location loading, or asset publication. Add a dated entry whenever a regression is found and resolved.

Each resolved issue records the symptom, root cause, durable resolution, verification, and the shortcut that must not be reintroduced.

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

## Verification rule

A code-only pass is not enough for terrain, water, sky, or transitions. Before release:

1. Serve the canonical app through HTTP, never by opening a raw file.
2. Open a fresh Chrome tab with a unique candidate query so module caches cannot serve an earlier build.
3. Test at least one coastal city and one inland city at ground and drone altitude.
4. Change locations once in the same session and confirm the old city never appears through the loading screen.
5. Record screenshots, runtime state, and the exact commit tested.
6. Include an ocean-only location, a mountainous location, and a city outside North America; confirm that glaciers are terrain, open ocean has no land placeholder, and location labels follow the published origin.
