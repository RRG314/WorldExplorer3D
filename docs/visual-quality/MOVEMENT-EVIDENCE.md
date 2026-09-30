# Movement regression evidence — September 29, 2026

Authoritative frozen candidate: dist, 5.4.0+8940b944b163.bbaade0123e1a4f1.staging, source 8940b944b1634e59747314aaf73db3c063876d8a. Existing uncommitted performance-retention CPU profiling change preserved.
Baseline: /Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70/.local-candidates/5.2.0+db62593ba377.6342cddaba06fc68.production; manifest source db62593ba377e276e5079c78238fa3a83e501c93. No substitute tag.
Hosted manifest freshly checked: 5.3.0+2839df5d6bbe.114f3c83341f2200.production. No deployment performed.

## Acceptance authority

Owner clarification: 5.2 is only a diagnostic reference and may have major defects. Success means smooth current gameplay, including problems shared with 5.2. Do not use baseline parity as acceptance.

## Evidence limits and reproduction

Existing accepted-8940b944 reports and plane CPU trace are preserved. The old plane trace lacks a frame-window clock origin, so individual stalls cannot be reliably correlated to CPU samples. Its sampled GC total is about 1.079 seconds over a 91.117 second profile; this alone does not prove a cause.

The existing comparison only measures short ground routes and discards raw deltas. Added opt-in travel investigation with raw intervals, monotonic window timestamps, distance, moving fraction, and >50/100/200 ms hitch counts and duration. Runtime remains frozen. Travel probes are diagnostic, not release acceptance; blocked driving must be reported as blocked.

## Source change map against actual 5.2

- core-frame-systems: transport-detail step/readiness gating before simulation; pavement overview update each frame and pavement focus at LOD cadence; renderer ownership/first-render preparation changes.
- plane-mode: initial urban launch corridor clearance changed; flight integration otherwise unchanged in this file.
- terrain/rebuild, road-contact-index, surface-material-blend: terrain ownership, queries and allocation changes.
- world/street-pavement-runtime and street-overview: new geometry publication and presentation during travel.
- living-world/population, urban-sandbox/runtime, character/animation: actor detail, culling and animation changes.
- scene-bootstrap, opaque-order, sky, night-lighting: rendering, sort order, reflection capture and light lifecycle changes.

These are investigation targets, not proven causes. Isolation and matched measurements remain required.

First probe failed before timing because the new output directory was not created; repaired. Next replay found absent public fixtures and was deliberately interrupted by closing only owned Chrome PID 43957; no valid comparison claimed. Recording missing public responses before replay.

## Current-candidate reproduction and trace

- `movement-fixture-record`: candidate continuous flight 60.014 s / 8,600 world units; average 59.09 FPS but four >50 ms frames totaling 550 ms (three approximately 150 ms). Recording mode, not release acceptance. Screenshot inspected. The previous straight driving probe struck a building; explicitly invalid as sustained driving acceptance.
- `movement-candidate-cpu`: road-following controls progressed 348/1,151 route units; screenshot shows car on Saint Paul Place. Clock alignment uses CDP NavigationStart plus RAF timestamps. A 766.6 ms entered-flight interval overlaps 729.14 ms sampled GC. Settled-flight 66.6/83.4/50.1 ms intervals overlap 52.37/78.73/44.52 ms GC respectively. Profiler startup is outside the measured RAF intervals and can perturb heap behavior. These are diagnostic samples, not uninstrumented performance claims.
- Pre-profile heaps were 1,705 MiB after loading and 1,777 MiB before flight; after the large collection, 428 MiB. This indicates substantial temporary memory, not evidence of a retained leak.
- `movement-candidate-allocations`: sampled allocated traffic (includes collected objects) was ~6,240 MiB over 60 s driving and ~2,973 MiB over 60 s flight. These estimates are NOT resident heap. Driving camera calls into `evaluateNearestRoadCandidate` account for a large hot allocation stack (~593 MiB self, plus surface sampling). Rendering uniform setters are another contributor. Two missing dynamic locality responses invalidate this run as controlled performance acceptance, but source allocation stacks remain diagnostic evidence.
- `movement-material-sort-isolation`: Three material ordering reduced sampled renderer/uniform traffic, but did not improve measured driving frame pacing. Dynamic weather requests caused replay misses; no performance comparison/repair claim. Retain current production-intended sort pending stronger evidence.

## Camera-query repair under isolated verification

Camera obstruction probes currently invoke the full driving nearest-road solver at every ray sample. With target height NaN and no preferred road, its winner is simply the closest segment. New unintegrated `cameraRoadSurfaceHit` computes that same projection without connectivity/transition results and samples height only if its width overlaps the probe. Curved/stacked/variable-width parity and under-overpass tests pass; fewer than 3% of reference height queries in the test matrix. Browser-only substitution of this function in the frozen package is in progress. Packaged files remain unchanged.

Manual Baltimore replay now fixes both locality and weather metadata using actual recorded responses nearest the origin; provider URLs/hashes are recorded. All geometry, elevation and map requests retain exact fixture keys. This avoids frame-dependent reverse-geocoding coordinates from invalidating a fixed clear/day scenario. Live weather and GPS semantics still require separate functional verification.

Camera browser isolation (`movement-camera-query-replay`) completed with zero replay misses. Same 60-second road route progressed continuously; sampled allocated traffic decreased from ~6,240 to ~5,430 MiB. The old nearest-road evaluator self allocation fell from ~650 to ~70 MiB across all callers; dedicated camera projection accounted for ~68 MiB. This proves removal of unnecessary query allocation, not a smoothness fix: a 250 ms frame remained. Integrated the parity-tested camera helper into source; frozen dist remains untouched.

## Nearby interaction query repair

`movement-nearby-vehicle-isolation` replay completed with zero misses. The original query constructed wheel-contact snapshots for every vehicle before filtering visibility/radius. Filtering by the unchanged path X/Z first reduced this query's sampled driving allocation from ~481 MiB to ~0.44 MiB. Full returned snapshots, stable distance ordering, visibility, promotion, bridges and radius behavior pass parity tests. Integrated into source. The isolated instrumented driving and flight minute each had no >50 ms frames (maximum ~33.5 ms); this is encouraging, not uninstrumented acceptance.

A fresh uninstrumented frozen control is running with lightweight readiness polling, avoiding full-world diagnostic snapshots while loading. This distinguishes the test's own transient allocations from runtime defects.

## Uninstrumented check: primary pause persists

`movement-light-readiness-control` (zero replay misses) used direct readiness flags instead of full diagnostics. Driving: 323.9 units, one 50.1 ms interval. Flight: 8,604.7 units, four >50 ms intervals totaling 499.9 ms, maximum 166.6 ms. Hitches cluster at page time ~135.9–136.2 s, confirming snapshots during loading were not the sole cause.

`movement-query-repairs-uninstrumented` applied camera and nearby repairs together in browser only. Zero misses; driving 293.8 units / 92.7% moving with a 66.7 ms interval. Flight 8,542.5 units with three >50 ms intervals totaling 816.6 ms, maximum 483.2 ms. These results do NOT establish improvement; the primary pause remains. Stop treating lower sampled allocation as smoothness acceptance. Next diagnostic isolates loading allocation sources.

## Loading and harness checks

Loading-only sampled allocation (`movement-load-allocations`) estimates 23,350 MiB total traffic across terrain, source conversion, road/building compilation and gameplay preparation. A separate profile excluding already-collected samples (`movement-load-surviving-samples`) reports ~389.7 MiB uncollected samples at playable. These are different sampling semantics, not a retained leak measurement.

Route planning previously copied every road's points across the browser protocol. Planning now runs inside the page and returns only the chosen route. `movement-local-route-control` still reproduced a 266.6 ms entered-driving frame and three settled-flight intervals totaling 483.3 ms (max 183.4); zero misses. Therefore that copy was a confound but not the primary cause.

Prescribed web-game source action client ran against integrated source. Screenshot inspected: car, roads and buildings rendered, car reached a building corner during the short scripted turn. The check failed on local Firebase recaptcha/App Check errors (receipts retained); no functional acceptance claimed. Staging-attestation adapter now uses the shared validated helper when credentials are supplied.

## Pavement isolation

`movement-overview-idle-isolation` prevented subsequent overview steps and awaited its already-running preparation; retained the accepted first cell and all worker/source state. Zero fixture misses. Driving settled minute: 60.00 FPS, max 16.8 ms. Flight: three >50 ms intervals totaling 733.3 ms, max 416.6 ms, while reported heap dropped from ~2.55 GB to ~1.02 GB. Pausing ongoing overview work does not remove the primary collection pause. Its awaited preparation delays entry relative to control, so the driving result alone does not establish a matched production improvement. No runtime suspension integrated.

Capturing V8 GC events next without heap sampling or forced collection to identify the remaining collection's type/reason and clock overlap.

## Specific collection cause: buffer sweep

`movement-gc-events` records V8 events without forced collection. The main renderer's memory-reducer collection begins with a 230 ms incremental-marking-start event and finalizes in a 492 ms major collection (heap 1,765.6 MB → 442.3 MB). Its ArrayBuffer sweep takes 308 ms wall / 170 ms thread CPU, a substantial part of the movement pause. This identifies a buffer-lifetime/volume target rather than treating all temporary allocations equally.

`movement-buffer-constructors` counts explicit JS buffer allocations during loading (native/internal allocations excluded): 734,717 Float32Array buffers (~594 MB), 792,068 Float64Array buffers (~578 MB), and ~25k integer buffers. Sampled caller stacks identify signed road-profile smoothing as the largest individual source by count: it clones a Float64Array in each of eight passes. Replaced those copies with a rolling original-left-neighbor value, preserving the Jacobi calculation exactly. 600 irregular/bounded profile parity cases pass byte-for-byte Float32 results, and a constructor check confirms Float64 allocations fall from nine to one per invocation. Browser-only isolated uninstrumented verification is running; smoothness is not yet established.

`movement-profile-smoothing-isolation` completed with zero misses. Driving settled 59.75 FPS / max 33.4 ms; entered driving had 116.6 and 50.1 ms intervals. Settled flight max 116.7 ms, four >50 ms intervals totaling 400 ms. Reported entered-driving heap ~1.10 GB versus ~2.45 GB in the GC-event control, but profiling/control timing differs and one run cannot establish repeatability. Primary hitch magnitude decreased; smoothness still not established.

Next repair groups same-lifetime transport model fields into disjoint views of shared backing buffers. Published ground profiles, compiler-only scratch and published edge profiles remain separate allocations, so scratch is not retained by the model. No values, precision, geometry or profile algorithms change. Model parity passes across 72 at-grade/elevated/subgrade cases; wheel contact and ordinary profile checks pass. Browser-only `profile-buffers` isolation applies storage packing plus the already-tested signed smoothing repair to the frozen package; running now.

`movement-profile-buffers-isolation` completed with zero replay misses. Entered driving max 100 ms; settled driving max 50 ms. Settled flight had three >50 ms intervals totaling 416.6 ms, max 166.6 ms. Packing alone did not demonstrate additional pacing improvement.

The trace-backed next isolation replaces temporary Float64 backing buffers with append-only 64 KiB pages. Disjoint ranges are never reused, so prior views cannot be overwritten; only the current page remains in the allocator. Oversized profiles receive dedicated buffers. Published geometry remains separate. Zero-fill, rollover, oversized allocation and profile/model parity tests pass. Frozen-package browser-only `profile-scratch` trial is underway; no smoothness claim.

`movement-profile-scratch-isolation`: zero misses, sustained drive max 50 ms; sustained flight max 483.3 ms with two >50 ms frames totaling 700 ms. No pacing improvement established. Removed the scratch-page allocator from gameplay source; retained it only in the diagnostic harness to reproduce the rejected experiment. Repeated full-feature profile compilation during loading is the next source-level investigation.

Constructor-count follow-up (`movement-scratch-buffer-counts`, zero misses) confirms the rejected scratch experiment reduced explicit Float32/Float64 backing allocations from 1,526,785 to 722,676. This is an allocation improvement, not pacing acceptance. The remaining large buffer groups include per-feature traversal distances and published profiles/building geometry.

Prescribed source action check with a disposable registered staging App Check token reached driving. Screenshot inspected; no App Check errors, but a live NOAA station-directory connection reset failed the console-error check. This is not a passing live-provider journey. Its browser/server and remote debug token were cleaned up.

## Redundant navigation invalidation

`refreshEditableBuildingVisibility` unconditionally discarded walk/drive traversal networks after a visual building refresh. Traversal reads road and linear features, not building visibility; actual editable mutations already invalidate at their own boundary. Final world loading builds the networks, refreshes building visibility, then population initialization asks for the networks again. This repeats graph construction and its temporary per-feature buffers. Removed the presentation-only invalidation in source; preserving mutation invalidation. Browser-only frozen-package isolation `building-visibility-graph` is running independently of all other source repairs. A focused lifecycle regression checks visibility and graph identity.

Navigation-invalidation isolation completed with zero misses: drive max 50.1 ms; flight three >50 ms intervals totaling 566.7 ms, max 316.7 ms. Ten loading/lifecycle tests pass, including unchanged visibility and preserved graph identity. This removes redundant work but does not independently establish smoothness. Running the camera, nearby-query, profile-buffer and graph-invalidation repairs together under the frozen browser-only substitution harness.

## Combined repairs remain below acceptance

`movement-integrated-repairs` applied camera/nearby/profile buffers/visibility invalidation together, twice, without a profiler. Both had zero fixture misses. Settled driving: max 66.6 / 50.1 ms and 286.6 / 299.1 units travelled. Settled flight: max 266.7 / 233.4 ms; >50 ms totals 450 / 633.3 ms. This is still a failed smoothness result, not release readiness.

Prepared an opt-in keyboard orbit driver to retain dense-city flight coverage instead of leaving the city. It has not yet run. Prepared a sampled compiled-profile usage diagnostic: observes published surface fields before replacement, to test whether provisional profiles are discarded unread. This is diagnostic instrumentation only and is not gameplay code.

## Provisional profile lifetime evidence

`movement-profile-usage`: zero misses; 23,073 features / 46,293 profile compilations. Sampled every 32nd feature: 577 initial profiles were replaced, and 432 of those had no reads of any of seven published surface fields before replacement. The remaining 145 initial samples were not replaced (principally linear features). This supports targeting the initial road-only compilation, not suppressing final or linear profiles.

Prepared a demand-compiled provisional road helper, not yet wired into the source loader. It captures original feature annotations, materializes on the first published-field read, and cancels without compilation when authoritative publication writes its replacement model. Three focused parity/lifetime tests pass; an error-propagation case is added pending its next run. Full Baltimore published-profile fingerprint comparison is underway before timing this repair.

The prescribed source action client now passed two action bursts with registered staging attestation and only the exact recorded NOAA directory response replayed (hash receipt retained). Both screenshots inspected. The scripted turn ends at a building wall, so this is a control/render/collision smoke check, not sustained driving acceptance. Live NOAA availability and physical-phone performance remain unverified. Disposable token, temporary credential and owned processes were cleaned up.

`movement-profile-hash-control` and `movement-profile-hash-provisional` matched all 181 SHA-256 blocks covering all 23,073 published road/linear models. Four focused provisional-lifetime/error tests pass. However, `movement-provisional-profile-isolation` still had five settled-flight >50 ms frames totaling 1166.6 ms (max 450 ms). The helper remains verification-only; it was not wired into the source loader.

## Building buffer ownership repair

Explicit buffer allocation evidence identifies geometry batching as a large Float64 byte source (hundreds of MB during loading). Most attributes were buffered in Float64 then copied to Float32. Only transformed normals are consumed by a later numeric calculation (facade masks). Building batching now keeps those normals and indices in Float64, writes other fields in final Float32 form, and explicitly transfers exact-sized backing storage to BufferAttributes. Other `buildMergedGeometry` callers retain copy semantics; rolled-back spare capacity is copied to an exact-sized array.

Five batch/vertex-storage tests pass, preserving every attribute/index byte, facade masks, bounds and building edit boundaries. Isolated browser replay (`movement-building-buffer-isolation`) had zero misses: entered drive max 33.4 ms, settled drive max 50 ms, settled flight three >50 ms frames totaling 416.6 ms, max 183.3 ms. Still not smoothness acceptance. The next combined trial uses a two-minute keyboard-controlled orbit over Baltimore, so leaving the dense city cannot mask its workload. Same-bundle browser patches now compose explicitly; all patch hashes are retained.

## Dense-city orbit and provider diagnosis

`movement-city-orbit-repairs` stayed airborne for two minutes with normal keyboard controls, radius 727–750 world units, covering 8,709 units. Flight averaged 44.02 FPS with five >50 ms frames totaling 800.1 ms (max 199.9 ms). This run is **invalid as controlled acceptance**: eight exact minimap tile requests were missing from replay. Screenshot inspected; full city, aircraft and minimap visible. No smoothness claim.

Recorded the eight missing public tiles separately. A naive request returned an access-blocked image despite HTTP 200; those eight entries were removed. Identified application User-Agent and local Referer returned actual map tiles; one was visually inspected and the error-image hash is excluded. No geometry/coverage substitutions were made. Running a clock-aligned CPU diagnostic on the same city orbit with these fixtures.

Latest source action smoke reached driving and rendered the updated building buffers, but failed on a live NOAA tide-predictions CORS response. Screenshot inspected; failure retained. The opt-in NOAA replay now covers all three exact recorded Baltimore NOAA URLs, with verified byte hashes and explicit non-live scope. Rerun pending the sequential CPU diagnostic.

`movement-city-orbit-cpu`: zero fixture misses. Its 1116.7 ms interval overlaps 1067.5 ms sampled GC; another 266.6 ms interval overlaps 235.2 ms GC. Profiler perturbation precludes treating these as acceptance timings. Aggregate sampled self time across call sites: Three scene projection 9.41 s / matrix-world updates 6.09 s over the ~122 s trace.

`movement-building-source-actions-replay` passes the prescribed two action bursts with exact recorded NOAA responses and registered staging attestation; both screenshots inspected. Car approaches a building wall on the scripted turn. This certifies the source control/render/collision smoke only, not sustained route smoothness or live NOAA availability.

`movement-city-orbit-gpu`: zero fixture misses; asynchronous whole-render GPU queries (no flush/wait/forced GC). Settled GPU median 30.09 ms, p95 33.36 ms; CPU render submission median 8.1 ms, p95 10.5 ms. The aircraft keeps moving throughout. Whole-scene render cost independently exceeds a 60 FPS budget; allocation repairs cannot resolve that by themselves. Scene inventory: 9,067 objects, 6,757 meshes, 5,643 automatic matrices. A short diagnostic splitting GPU time by render pass is underway to identify which rendering work dominates before changing it.

The per-pass timer diagnostic is not additive on this renderer: many short postprocessing passes each report ~11 ms even though the whole frame interval is much shorter than their sum. Do not sum these queries or treat their latency as exclusive GPU service time. The regular 33 ms RAF intervals and ~43 FPS dense flight remain the user-visible evidence; the whole-frame GPU timer is supporting diagnostic evidence only.

Prepared a verification-only depth prepass for opaque immutable building batches, excluding transparency, alpha/displacement, polygon offsets and clipping. It shares original geometry and respects existing visibility/side; no runtime integration. First check compares full rendered canvas bytes with and without the pass in the same synchronous camera state. This tests whether removing hidden shading can preserve the image before timing it.

`movement-building-depth-parity` reported zero changed canvas pixels at its initial fixed flight view; screenshot inspected. A framebuffer-variation guard has been added for future parity runs because the original comparison did not explicitly reject uniform/blank readback. `movement-building-depth-isolation` completed with zero misses but remained 44.74 FPS, p95 33.4 ms, three >100 ms pauses (max 183.3 ms). It is not integrated. The query/helper stay verification-only.

The next GC-event capture runs the **integrated** repairs on the city orbit, to distinguish remaining collection work from the older pre-repair ArrayBuffer sweep evidence. No further runtime optimization is stacked on that old trace.

`movement-city-repaired-gc` completed with zero misses. Main-thread major collections: 77.259 ms (heap 1,578.3 MB → 449.1 MB) and 52.849 ms (532.0 MB → 431.5 MB); incremental starts 70.642 / 55.930 ms. `V8.GC_MC_FINISH_SWEEP_ARRAY_BUFFERS` is now 0.005 / 0.026 ms in this capture, versus the older 308 ms sweep. This is a meaningful changed diagnostic, not matched causal attribution of each source repair. 269 minor collections total598.9ms, max34.86ms. The old buffer-sweep target is no longer dominant in this run; retained heap / allocation rate and rendering remain targets. Flight max183.3ms, still not smoothness acceptance.

Running uninstrumented material-first opaque ordering over the city with the same integrated patches. The prior material-order test covered a different ground/straight-flight workload, so it cannot settle the city rendering question. Order change remains diagnostic-only.

`movement-city-material-order` is worse: 38.95 settled FPS, max766.6ms, ten >50ms frames; zero misses. Keep packaged front-to-back ordering. No runtime ordering change.

Source inspection identifies unconditional terrain texture reads even when a surface's blend weight is exactly zero. Prepared a verification-only shader transform that skips those reads using explicit UV derivatives evaluated outside the branch, retaining all blend weights and filtering. Biased triplanar rock samples remain untouched. First whole-world shader/canvas parity check is running before any timing or source integration. This is a hypothesis under test, not an accepted optimization.

`movement-terrain-weight-parity`: zero replay misses/errors; all 1,296,000 canvas pixels match exactly, with 3,935 distinct colors (nonblank readback), across 26 terrain materials in the initial city-flight view. Screenshot inspected. Sustained uninstrumented timing is running. A separate small mixed-surface/filtering parity fixture has been prepared but not yet run; no terrain shader source change yet.


## Acceptance clarification and rendering experiments

The owner accepts the current average frame rate; remaining release work targets visible jitter and stalls, not a perfect 60 FPS. Preserve quality. No acceptance claim from FPS alone.

Terrain weight timing:44.26FPS, max183.4ms, five >50ms frames totaling716.7ms, zero misses; not integrated. Scene-only postprocessing diagnostic:50.51FPS, zero misses, not a shipping quality choice. Inactive local-light omission:49.35FPS but max383.3ms and eight >50ms frames totaling1450ms; not integrated. Its image comparison changed only six channel values by1 across1,296,000pixels; inspected. Neither rendering experiment resolves the stalls.

A matched all-repairs uninstrumented control runs with the repaired provider fixtures. Next targeted diagnostic records bounded actor/camera poses to distinguish chase-camera relative motion under uneven frames from actual renderer/GC stalls. No camera runtime change yet.

## Moving-target camera jitter — reproduced and repaired

Valid all-repairs city control (`movement-city-control-valid`):43.20FPS, six >50ms intervals totaling900ms, max250ms, no provider misses. Average FPS is acceptable per the owner; stalls remain a separate concern.

Bounded actor/camera traces (`movement-camera-motion-control`) identify frame-duration-correlated chase lag. Plane camera relative longitudinal velocity averages+4.115units/s on short frames and−2.468 on long frames; this means repeated pull-away/pull-back even with smooth actor movement. Same route with exact moving-target integration (`movement-camera-path-isolation`):+0.008/+0.022units/s, eliminating that cadence bias; mean absolute relative motion3.38→0.97units/s. Driving mean absolute relative motion0.170→0.094 and p950.784→0.296. These are camera diagnostics, not claims that all physical turning/acceleration should disappear. Flight FPS41.36→41.06, unchanged within run variability. Both zero fixture misses. Max patched short flight66.6ms; short duration does not settle long-stall acceptance.

New source helper analytically integrates exponential following along the target segment, preserving stationary response. Both chase cameras use it; constrained driving camera retains its former endpoint response and all final clearance checks. Four bounded histories expire across mode changes.18 focused smoothing/ground-clearance/body tests pass. Flight screenshot inspected; prescribed source action smoke is running.

Remaining allocation lead: population simulation still samples four-wheel road contacts for X/Z-only distance and pedestrian crossing decisions. Existing allocation stacks identify these call sites; rendered vehicle poses and full snapshot consumers must retain contact sampling. A composable isolation is prepared to omit sampling only at these three distance-only sites.

Source camera action run initially failed to launch because the existing collision-ratio helper still used cameraSmoothingBlend after its import was removed. Restored that import; verify:source passes (1211 parsed files). `movement-camera-source-actions-fixed` then passed both prescribed bursts with no error files; both screenshots inspected. Flight source/C-key smoke is prepared, not yet run. Eight new smoother tests now include valid-history collision retraction.

`movement-population-distance-isolation` (camera repair plus three distance-only call omissions):zero misses,43.54FPS, max450ms, six >50ms intervals totaling1200ms. This does not improve stalls; distance omission is NOT integrated. Small180-case X/Z/contact parity test passed, but is not performance proof. Current allocation diagnostic runs all integrated repairs and camera path only, on45seconds of city flight.

## Repeated light uniform traversal

Refreshed current city allocation capture (`movement-current-flight-allocations`,45s, all integrated repairs plus camera):2,873MiB estimated allocation including collected objects. Renderer subtree776MiB; repeated structured-light traversal459MiB, including vec3 setter322MiB. Unlike the older buffer sweep, this is active per-frame work. Three r128 refreshes light uniforms when switching programs; front-to-back ordering revisits programs, whose WebGL uniforms already retain their same-view values.

A verification-only guard reuses only the five numeric light arrays, only for the same object within one render view. Each renderer invocation and nested return invalidates it; ArrayCamera is bypassed; sampler/texture uniforms are untouched. Five ownership/nested/error tests pass. Whole-city parity:1,296,000 pixels,3,846 colors,0differences. Small rendered fixture:five cases covering program switching, inactive daytime pools, changed night lights, moved camera and ArrayCamera all exact; screenshot inspected.

`movement-light-uniform-isolation`:zero misses,44.05FPS, four >50ms intervals totaling533.5ms, max183.4ms; no >200ms. This is an encouraging single trial, not repeatable acceptance. Allocation capture of the guard is running to verify that the measured allocation source is actually reduced before source integration.

Prescribed source plane smoke also completed four bursts with C-key switches (chase→cockpit→overhead→chase), no error files; all four screenshots inspected. The scripted route hits a tall building after the first burst, so this verifies camera switching and collision/control smoke, not sustained flight. Normal city-orbit evidence is separate.

Light allocation isolation confirmed:45s total estimated allocation2,873→2,623MiB; dominant vec3 light setter322→126MiB. The uninstrumented120s guard trial skipped2,761,076 of3,200,436 repeated numeric-light-root updates. Pixel parity and per-view invalidation evidence support integrating this cause-specific repair.

Integrated `engine/light-uniform-reuse.js` at renderer initialization. Same tested render algorithm, with idempotent installation, weak ownership of original setters, removal of all transient light-state references after each render, and automatic restoration during renderer disposal. Six guard tests and eight camera tests pass; source check parses1215files with0failures. Moved existing opaque-sort installation after the renderer-null guard, preserving the startup error UI on renderer creation failure. Prescribed source driving smoke with the final engine integration is running. Runtime repair scope is frozen pending gameplay/release validation; do not chase average FPS or integrate rejected experiments.

## Final source checkpoint

Integrated light/camera source driving smoke `movement-light-reuse-source-actions` passed both bursts with no error files; both screenshots inspected. Full current contracts:1,547 passed,0failed/skipped. Source syntax:1,215 files passed. Runtime scope remains frozen for packaged validation. Preserved the original8940dist in `.local-candidates`; retired only the verified generated d93staging copy, preserving its source commit and historical evidence. Four saved candidates remain.
