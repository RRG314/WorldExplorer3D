# Street replacement implementation status

Latest status: **in progress, not release accepted**. The current sequential verification command last passed 225 tests before the final resumable-partition correction, six hill fixtures, all three pinned saved-layout replays (Baltimore, Monaco and San Francisco), and production parsing/source checks. Actual Monaco and San Francisco screenshots still show frontage gaps, and actual full-world startup remains above the performance target. The entries below preserve earlier failures and superseded results in chronological order; they are not all claims about the latest code.

Updated September 15, 2026. Work is local to `steven/street-system-rd`. Main, production and research remain unchanged. **The replacement is not release accepted.**

## Implemented

The application no longer imports the experimental RDT runtime. Stable geographic hashing and appearance random sequences were extracted without changing their outputs. Geographic hash depth no longer controls source selection, road simplification, building collision detail, vegetation density or nearest-road query cadence. Legacy mode settings normalize to baseline. Regression tests scan production sources for reintroduced experimental dependencies.

The road query cache now invalidates on elapsed time, displacement, vertical movement, surface revision and transition proximity. A stale terrain callback can no longer override an accepted feature profile through `sampleFeatureSurfaceY`.

Road rendering and pavement subtraction now share carriageway width, placement, turn and polygon-union construction. Ground roads are compiled as nonoverlapping regional tops; elevated and underground structures retain their independent surfaces. The publisher no longer calls the per-road ground-sheet or circular-cap generators. Its current height integration partitions road polygons against published near and far terrain triangles. This removes overlapping top surfaces, but **does not yet implement the planned independent regional grade solver**. The publication reports that height authority explicitly.

## Evidence

The post-ground-repair San Francisco load, before the unioned-road replacement, is saved in `audit-2026-09-13/sf-ground-repaired-*`. Its screenshot no longer has the earlier large folded sheets at the captured intersection. Road seams and frontage gaps remain visible. This is a local observation, not citywide acceptance.

That load took 160,363 ms to first play and reported 1,116,268,783 bytes of JavaScript heap and 360,845,791 geometry bytes. Road publication alone took 74,729 ms. It still fails performance targets. The profile comparison also reports departures from intended road elevations, especially against coarse distant terrain; agreeing with rendered ground is insufficient.

Exact polygon intersection of the captured road triangles found 430 overlapping triangle pairs; 145 pairs cross through each other's planes. Pairwise overlap area totals 56.07 square world units (this is not unique overlap area). Maximum sampled difference is approximately 0.073 world units. The saved overlap report identifies offending triangles and intersection polygons. This establishes an actual layered geometry defect independently of coverage counts.

Seven new regional-carriageway tests cover exact junction area, duplicate and reordered sources, tile-size invariance, bridge exclusion, pavement/asphalt separation, crest partitioning, far support, explicit missing-support failure and retirement of old publisher calls. The full CPU street tests and six hill fixtures passed after this change; the source gate initially caught a duplicate module import identity, which was corrected, then passed. A new real-app load is being evaluated; it is not yet accepted.

## Subsequent integration evidence

A real San Francisco load initially failed because near terrain tiles continued appearing after the far-terrain mesh had already decided which holes to leave. The rejected road cell had 212.68 square world units of overlapping support. Far publication now awaits the near construction queue, uses actual Float32 mesh bounds, and rejects superseded or failed construction. Three lifecycle tests cover this ordering. The next real load successfully published all carriageway regions.

The resulting `sf-unioned-roads-*` artifacts preserve the screenshot, runtime diagnostics and nearby surface geometry. Exact triangle clipping finds zero positive-area overlapping road-top pairs (tolerance 1e-6 square world units) among 510 captured triangles. The earlier capture had 430 overlapping pairs. This establishes a local geometry improvement, not whole-city acceptance. Visible frontage gaps and coarse-terrain grade departures remain.

That load took 167,756 ms to first play, including approximately 50 seconds rebuilding terrain. Geometry accounts for 368,470,197 bytes. The initially observed 3,569,886,629-byte JavaScript heap is **not a clean per-world memory measurement**: subsequent instrumentation found approximately 2.7 GB already present before road loading in the reused preview tab. Closing the owned tab and creating a fresh one reduced the pre-load baseline to about 44 MB. The clean run still rises substantially during loading, so the resource gate remains open. Future verification must start with a fresh owned tab and also test normal in-app teardown separately; navigation to a blank page alone is insufficient evidence of release.

Compiler failure is now fatal to that world load rather than allowing partial gameplay or automatic retry. Failure cleanup calls the ordinary world resource owner as well as discarding scene staging. Source-level and component evidence must still be supplemented with an actual failed-load disposal journey.

The latest full CPU run passed 172 tests, six hill fixtures and the source gate before the final failure-cleanup call was added. These checks are not a replacement for visual routes or resource measurements.

## Remaining acceptance gates

- Complete the independent road/junction grade solution and make terrain its consumer. Coarse distant terrain must not overwrite road grades.
- Complete continuous block frontage and explicit hillside/entrance transitions, with movement agreement.
- Publish terrain, roads, pavement and contact as one compatible regional revision, including cancellation and location changes.
- Replace baseline source truncation and broad upfront regional work with bounded residency that preserves required topology and completeness.
- Close all prior screenshot failures with fresh evidence, run whole-region scans and sequential visual journeys in Monaco, San Francisco, Baltimore and contrasting environments.
- Meet the documented loading, memory, disposal and frame-time targets. No completion claim is supported until these gates pass.

## Clean-tab resource run and teardown

The fresh San Francisco preview started near 44 MB heap and reached 2,434,511,965 bytes at first inspection after a 151,191 ms first-play load. Tracked geometry was 345,405,875 bytes (946 geometries, 300 textures). Returning through the normal Main Menu released the world: geometry fell to 3,642,252 bytes (32 geometries, 35 textures), and a later inspection after collection reported 269,859,092 bytes of heap. These are saved as `sf-fresh-tab-runtime.json`, `sf-title-release-runtime.json` and `sf-title-release-settled-runtime.json`. This is one cleanup journey, not the required repeated-location leak test.

Source inspection additionally found transport models and POI callbacks absent from reset. The reset now explicitly clears those owners and removes diagnostic controls that close over a previous pavement compilation. Four targeted lifecycle/failure tests passed after these changes. Actual post-change disposal remains to be checked in a subsequent journey.

Memory interpretation follows the [MDN documentation for performance.memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory): this legacy estimate can include shared heaps and omit workers. It is not a precise application-tab retained-memory measurement. The diagnostic label now states that limitation. The observed large clean-load cost still fails the provisional resource target.

## Monaco integration check

A fresh Monaco load at requested coordinates 43.7397, 7.4243 spawned on Avenue Saint-Michel near 43.7400, 7.4237. Saved daylight start and walking screenshots show a continuous road top on the inspected slope; large bare gaps toward building facades remain visible and fail frontage acceptance. This was a short walking check, not the required regional journey. First play took 90,651 ms; inspection reported 1,146,425,004 bytes of legacy heap and 213,066,645 tracked geometry bytes. The road contact index contains 1,394,380 triangles across the entire loaded region, demonstrating how much distant geometry is still prepared upfront.

Independent overlap analysis of 623 captured road triangles reports zero positive-area overlapping pairs and two collapsed triangles. The first audit version misclassified degenerate triangles as clipping regions; that audit defect was reproduced and corrected with its own regression. Collapsed geometry is tracked separately and must not be silently interpreted as a valid area. The normal Main Menu action removed the revised diagnostic panel; the owned preview tab was then closed.

Run `node scripts/verification/street-captured-road-overlap.mjs <capture.json>` to check saved render geometry. This command reports captured scope explicitly; elevated crossings require layer review. It does not certify all terrain, frontage, movement or regional coverage.

## Contact storage change

The contact index now stores source references and triangle records in typed arrays (28 bytes per input triangle plus four bytes per spatial-cell reference) instead of a separate JavaScript object for every triangle. It preserves Float64 barycentric denominators and existing layer/reference-height selection. Decal clipping materializes only query candidates; point queries do not allocate triangle objects. Disposal clears both source references and packed buffers. Reported byte counts exclude source geometry, map/string overhead and transient construction arrays, so they must not be presented as total heap usage.

Saved San Francisco and Monaco triangle interiors agree with the new index within 1e-5 world units. Stacked surfaces, batch terrain-mode ranges, decal projection and disposal pass targeted checks. The full current suite passes 181 tests, six hill fixtures and the source gate. A new Baltimore browser journey is the next integration check; active-world memory reduction has not yet been measured in an equal-content comparison.

## Baltimore and terrain scheduling

The packed contact index was exercised by the real Baltimore loader and a short walking check near Guilford Avenue/Biddle Street. Saved artifacts are `baltimore-packed-contact-*`. First play took 168,034 ms, tracked geometry was 388,256,592 bytes, and the legacy heap estimate was 1,603,306,019 bytes. Road contact covers 2,452,399 triangles with 69,178,256 record bytes and 18,210,676 bucket-reference bytes, excluding source geometry and map overhead. The different city/source contents prevent a valid before/after heap reduction percentage.

Terrain grading still took approximately 50 seconds. Its scheduler previously yielded only between whole tiles. Calculation now yields in bounded vertex batches and keeps newly calculated heights private until each tile is complete. Cancellation retires the unfinished calculation without changing that tile's published position array. Synchronous initial construction and cooperative rebuilding use the same calculation generator, rather than different height rules. This improves scheduling, not the unresolved regional height-authority design or total work volume. The real-app responsiveness result is pending; 183 CPU tests, six hill fixtures and source validation pass.

## Verification-process defect corrected

The first cooperative-grading integration attempt failed before world loading. A broad replacement had also inserted `await` into the synchronous water-mask function. Component tests and the old source gate passed because neither parsed that lazy runtime entrypoint. The unintended water-mask edit is reverted. Source verification now parses all 731 production JavaScript modules without executing them and checks a deliberately invalid-await control. The corrected suite passes all 183 tests, six hill fixtures and this expanded source gate.

Startup traces now distinguish Earth-module import and editable-world initialization from world compilation. Launch failure restores the location menu and logs the actual error rather than leaving an empty gameplay view. The two failed preview attempts were closed; they provide no evidence of terrain scheduling performance. A corrected real-app run is required before accepting that change.

## Partial terrain coverage and delayed images

The corrected startup run used the persisted Baltimore selection, not the intended Monaco selection. It must not be described as a Monaco comparison. Its `cooperative-terrain-runtime.json` reports null terrain-compilation statistics: the new scheduler had stopped when it encountered an unavailable tile. The apparent 9.7-second grading duration is therefore rejected as performance evidence.

Transport grading now visits published, visible detailed tiles only. A failure to regrade a published tile throws explicitly; cancellation remains distinct. Accepted-ground tiles outside artifact coverage are recorded as excluded and are never inserted as hidden meshes that could later overlap distant terrain. For worldwide image fallback, the publication queue now waits for source readiness before publishing the tile. Failed or superseded image requests cannot silently add a late mesh. Four additional lifecycle tests cover delayed readiness, source failure, supersession and excluded accepted-ground tiles. The full suite passes 187 tests, six hill fixtures and parsing of all 731 production modules. A new real-app verification of the combined correction remains required.

## Confirmed cooperative Monaco integration

The fresh run explicitly selected 43.739700, 7.424300 before starting. `monaco-cooperative-terrain-runtime.json` records 25 published detailed terrain meshes, 24 explicitly excluded tiles outside accepted-ground coverage, 1,319 cooperative grading yields and a maximum measured grading chunk of 72.9 ms. Grading took 21,526.7 ms; first play still took 88,466 ms. Legacy heap was 1,231,998,297 bytes and tracked geometry 191,921,691 bytes. These measurements confirm completion of the grading calculation, unlike the rejected null-statistics run. They do not meet the loading target or establish whole-app frame-time acceptance.

The daylight image `monaco-cooperative-terrain-street.png` still shows bare frontage gaps. The test world returned through Main Menu and its owned tab was closed. No browser world from this verification remains running.

## Geometric frontage and corner replacement

A reproduced angled wall at 8–12 world units from a road was rejected by the old roughly 14-degree parallelism test even at its valid 10-unit midpoint. Frontage visibility now considers actual ray intersections, keeps short walls as occluders, and partitions source intervals at facade endpoints, visibility exchanges and setback-limit crossings. Short walls alone do not imply an urban sidewalk. Road-width samples used by pavement and visibility barriers now come from the same canonical carriageway primitives, independent of output tile size. The alternate recursive barrier-width sampler is removed.

A subsequent Monaco browser load completed in 86,024 ms, with 1,999,184,418 bytes of legacy heap and 167,876,523 tracked geometry bytes. Source contents and spawn differed from the preceding run, so this is not an equal-content performance or visual comparison. The captured exposed ground point has neither road nor pavement underneath; it is outside the nearby private service road's footprint. Initial visual suspicion of terrain covering that point was incorrect. Independent analysis of 1,208 captured road triangles finds no positive-area overlaps. This does not certify the full road system. The owned tab returned through Main Menu and was closed.

`monaco-frontage-layout.json` preserves all 328 roads, 1,056 buildings, 203 land-use polygons and 208 linear features used by that resident pavement compilation. Replaying the complete saved extent with 32-, 64- and 128-unit cells exposed tile-dependent corner closing: initial symmetric difference reached 3.79 square world units. The dilation/erosion closing filter has now been removed. Corner regions instead require existing pavement on both adjoining building faces and intersections with actual curb boundaries. The original Baltimore reported-corner and Chase-frontage regressions pass. This replacement has CPU evidence but has not yet had a new real-world browser journey.

The complete-layout replay remains a failing acceptance check. Raw differences after the corner replacement are about 0.448 and 0.302 square world units, mostly narrow boundary differences; differences outside its 0.002-unit allowance remain about 0.00667 and 0.01491 square world units. A sampled boundary-distance diagnostic also reports large distances for some contours, requiring topology interpretation rather than treating aggregate area as proof of correctness. Run `node scripts/verification/street-layout-replay.mjs docs/streets/audit-2026-09-13/monaco-frontage-layout.json`; its nonzero exit is intentional while the mismatch remains.

Increasing clipping precision and replacing custom ring reconstruction with the library's native containment tree did not pass this replay. The finer-grid candidate produced an approximately 2.64-square-unit discrepancy; the native tree reproduced it and took about 38 seconds for the 128-unit replay versus about four seconds with the existing reconstruction. Both experiments were rejected; production keeps the original millimetre clipping grid and existing reconstruction. No native-tree experiment remains active. The latest completed general suite passed 206 tests, six hill fixtures and production source validation before the additional retirement guard was added.

## Baltimore integration of geometric corners

A fresh load explicitly selected 39.303500, -76.611800 and spawned on Guilford Avenue. The daylight start and short walking images are saved as `baltimore-geometric-corners-*`; pavement meets the nearest visible facade, while recess gaps farther ahead remain visible. The complete resident input is saved for offline replay. First play was 171,490 ms, tracked geometry 391,845,911 bytes and legacy heap 2,988,906,983 bytes. The terrain calculation completed with 1,786 yields and a maximum measured chunk of 112.2 ms, but took 62,849.4 ms overall. Road contact contains 2,296,564 triangles. This run fails loading/memory and complete visual acceptance; it is not a release pass. General verification now passes 207 tests, six hill fixtures and all 732 production-module syntax checks.

## Redundant road subdivision and retired generators

The carriageway mesher no longer adds a 32-unit grid before partitioning its triangles against the actual terrain planes. The terrain partition supplies the required creases directly. Analytic sloped-plane and sharp-crest regressions preserve footprint and contact while the sloped-plane case uses less than half the triangles. A whole-world resource reduction has not yet been measured.

The unused per-road ground-sheet generator and circular junction-cap module are deleted from production source. Their old source-gate fixtures had continued to test retired geometry; those checks now compile the actual carriageway implementation and inspect sharp turns, outer wedges and crossing ownership. Two superseded sheet-generator unit tests were removed because the production compiler now has their plane/crest coverage. The resulting general suite passes 207 tests, six hill fixtures and all 731 remaining production-module syntax checks. Static retirement checks reject reintroduction of those generators, the RDT runtime, the corner closing filter and the alternate road-barrier width sampler.

The Baltimore curb transition recorded `contact.source = sidewalk` and identical contact/pavement height 19.850351357654304 world units. This is one actual movement check. The test world returned through Main Menu and its tab was closed.

## San Francisco single terrain partition run

Actual source-loader run at Sacramento Street, 37.792361, -122.4142088, heading 171. First play: 177,722 ms; terrain grading: 62,921.8 ms; maximum cooperative chunk: 85.4 ms. Legacy heap reading: 2,173,229,719 bytes (not retained heap); tracked geometry: 306,138,788 bytes. Road mesh buffers: 65,945,960 bytes. Contact storage: 1,831,151 triangles, 4,056,279 bucket references. Compared with the earlier clean SF capture, road mesh bytes decreased but contact references and startup time increased: no overall performance improvement is established.

Inspected `sf-single-partition-street.png` and `sf-single-partition-walk.png`: no earlier folded sheets at this captured hill/intersection; frontage gaps remain visible beside the left glass building on the walking view. Captured rendered road height 103.04337070303495 and contact height 103.04337070303498 agree at the walker. Independent overlap audit: 627 captured road triangles, zero degenerate triangles and zero positive-area overlap pairs at 1e-6 area tolerance. Scope is the saved nearby capture, not the regional road network. Saved full resident layout for subsequent replay. Main Menu cleanup and owned tab closure confirmed; only the untouched user error tab remains.

Evidence: `audit-2026-09-13/sf-single-partition-{runtime,contact,surfaces,overlap,layout}.json` and corresponding screenshots. Street replacement remains incomplete.

## Mandatory pavement support; recursive fallback retired

Pavement now requires the same near-plus-far published terrain partition as carriageways. Missing or overlapping support rejects the staged publication instead of invoking depth-limited triangle refinement. The partition is allocated within the publication try/finally and disposed on success, cancellation and failure. Removed `conformRoadTriangles` from production source and migrated the old synthetic street scene to the union carriageway compiler. Curbs still use bounded local refinement; accepted independent street grades and explicit hillside transitions remain unfinished.

The previous publisher harness had no terrain geometry and silently exercised fallback. It now provides support topology, with a separate missing-support rejection/resource cleanup test. The full sequential suite passes 213 tests, six hill fixtures and the production source/parse checks. The changed contract initially failed 14 mocked publication tests; their absent terrain support was corrected, not bypassed. Two planar tests expected two triangles despite opposite terrain diagonals; they now expect the necessary four-way partition.

Actual Monaco test at Galeries du Parc Palace (43.7399190, 7.4248226, heading 258) published successfully with fallback removed. First play 87,391 ms; legacy heap estimate 858,486,271 bytes; tracked geometry 166,655,621 bytes. Walked forward and inspected both `monaco-mandatory-partition-street.png` and `-walk.png`; broad unfilled frontage remains, so this is not a visual acceptance pass. Runtime/contact JSON saved beside them. Returned to Main Menu and closed the owned world. No claim of retained-heap reduction or full-location acceptance.

## Fixed construction regions and output-boundary precision

`prepareStreetPavement` now constructs fixed 64-world-unit regions before packaging the result into requested output chunks. Packaging cannot choose another facade or rerun the region boolean design. Larger outputs preserve the accepted pieces and derive only their external curb perimeter; smaller outputs crop accepted outlines. Partial requested windows no longer drop partially overlapping boundary cells. Region result caches use weak ownership tied to the prepared input. This is a horizontal construction/packaging separation, not the still-missing independent regional height solution or a streaming implementation. Default runtime construction remains 64 units.

A small deterministic regression exposed a second rounding defect: a valid thin sloping triangle can lose its half-width intersection when cropped again on the design grid. Construction still uses the original 0.001-world grid; packaging uses 0.000001-world intersections to preserve accepted sloping edges. The replay comparison also measures at 0.000001 rather than rounding the measured geometry back to the production grid. Its 0.002-world boundary allowance and 1e-5 beyond-allowance area failure threshold remain unchanged. These are horizontal double-precision comparisons, not certification of final Float32 rendering.

Saved complete resident-layout replays now pass at output sizes 32/64/128:

| Capture | 32-unit raw difference area | 128-unit raw difference area | Beyond allowance |
|---|---:|---:|---:|
| Baltimore | 0.0004581459 | 0.0000018590 | 0 / 0 |
| Monaco | 0.0001621485 | 0.0000016448 | 0 / 0 |
| San Francisco | 0.0006178701 | 0.0000018350 | 0 / 0 |

All areas are square world units. Reports are `*-layout-replay-output-precision.json`. The earlier before-regions and intermediate measurement reports remain failures, retained as evidence. A polygon-clipping comparison experiment failed with an output-ring error; it was removed from the checker and is recorded in `baltimore-layout-replay-independent.json`. The accepted checker still uses Clipper at a distinct measurement precision, so it is not a fully independent polygon-kernel certification. Independent captured-road overlap tests remain separate.

New regressions cover holes, output sizes 16/32/48/128, false internal curbs, partial windows and the narrow triangle. `street-layout-regression.mjs` runs all three entire saved extents sequentially, records input hashes and fails rather than skipping a missing capture. It is part of `scripts/verification/streets.mjs`. No full-world/GPU process runs alongside these replays. The latest Monaco actual-app test preceded this packaging change; default runtime region size is unchanged, but no new browser acceptance is inferred from that fact.

Open release blockers remain: independent street/junction grades; complete block frontage and hillside treatments; regional atomic publication; bounded residency and removal of silent source truncation; full-region source/geometry scans; long movement and repeated location-switch acceptance; stated performance targets.

## Latest browser lifecycle checks

The migrated synthetic rolling-terrain scene uses the production union carriageway mesher and mandatory pavement partition. Inspected `rolling-mandatory-partition.png`; road, pavement and painted crossing follow the intentionally rolling terrain without visible missing top sheets. Five real-worker rebuilds retained 16 renderer geometries, one texture, 12 pavement meshes, 18 scene children and 31,968 pavement position bytes; no worker remained active after each. Legacy JS heap readings rose from about 20.5 MB to 29.5 MB without a retained-heap/GC measurement, so this is stable counted render resources, not a JS-leak certification.

The missing-support button removes the terrain support for one real-worker rebuild, then restores it. The rebuild rejected with 57.6 square world units uncovered; prior visible pavement and contact remained, the worker terminated, and counted geometries/textures/scene children matched before and after. Evidence: `rolling-mandatory-partition-rebuild.json`, `rolling-missing-support-rejection.json`. This does not replace the still-pending complete application startup-failure journey. Both owned test scenes were closed.

Final CPU command for this checkpoint: `node scripts/verification/streets.mjs`, log `/tmp/street-regional-publication-acceptance.log`: 217 tests, six hill fixtures, three pinned complete saved resident-layout replays, and production source/parse checks passed. `git diff --check` passed. No deployment, main-branch change or GitHub update.


## Missing-building selection and flight stalls — September 15

The loader requested only 85% of available building footprints and separately capped each source tile at 1,200. Selection now retains all candidates within the existing overall safety limit; dense tiles no longer lose buildings to a second limit. Two executable selection tests verify identity retention for 10, 1,201, 9,000 and 10,000 colocated source buildings and preservation of the 12,000 configured safety ceiling. This does not establish that every other publication rejection is correct or that buildings outside the residency domain are present.

The owner clarified that the flight regression is freezes/stuttering. Inspection found that nearby pavement could replace its entire 768-unit square after just 128 units of movement. Focus updates now retain accepted detail until the actor reaches a 128-unit boundary margin. The overview worker advances one cell per presentation tick instead of draining an 80 ms burst. Neither correction changes aircraft physics or substitutes approximate terrain. The runtime already limits physics catch-up to 100 ms; performance telemetry incorrectly used that limited delta too. It now receives the actual frame interval, with a regression proving that a two-second freeze is measured as two seconds while simulation remains capped at 100 ms. Diagnostic inspection includes frame percentiles and aircraft position/state.

Evidence: the sequential street command passed 223 tests, six hill fixtures, three pinned saved-layout replays and the production source gate. Targeted tests cover low flight over negative, flat and high terrain, retained detail during interior movement, boundary-triggered replacement, and one overview cell per tick. These are component checks, not full-app flight acceptance. A fresh Monaco browser journey is in progress; do not infer smooth flight from these checks.


### Actual Monaco flight check and subsequent correction

A fresh local browser world loaded the same Monaco coordinates and published 9,417 buildings, compared with 8,070 in the previous recorded run. That is consistent with removing artificial selection loss, but does not prove complete regional source coverage. The aircraft was entered through Travel → Fly Plane and travelled north before settling on the ground. This was a short mixed flight/taxi journey, not a sustained controlled flight benchmark.

The first two attempted diagnostic snapshots were overwritten by live compiler progress before capture; they are retained as `monaco-flight-start-compiler-progress.json` and `monaco-flight-after-compiler-progress.json`, **not** frame measurements. The valid `monaco-flight-settled.json` shows a recent 1,800-frame window with p95 149.9 ms, p99 414.82 ms and maximum 1,533.3 ms. That window includes street reconstruction and diagnostic interaction; it is not an isolated flight-only percentile. The replacement took 63,670 ms. Reported heap was 993,344,497 bytes, tracked geometry 169,364,605 bytes. These results fail interactive performance acceptance despite the reduced rebuild frequency. The test returned through Main Menu and its owned tab was closed; user tabs were preserved.

Following that failure, runtime pavement conformance now yields within a cell after small triangle/curb groups rather than processing an entire dense cell in one synchronous call. Output stays private until all groups succeed; cancellation preserves the input. Crossing projection also yields on an 8 ms scheduling budget. New tests verify byte-for-byte equivalent numeric output to the synchronous implementation and cancellation without partial mutation. The 8 ms value is a scheduling target, not a measured maximum: one triangle projection, partition construction, geometry indexing, contact-index construction and mapped-path regeneration can still exceed it. A new full-app flight measurement is required after this correction. Flight, loading and global street acceptance remain open.


### Retest rejected changed validation scope; corrected with resumable partitioning

The next Monaco launch rejected pavement during startup. The first cooperative implementation split the source cell into separately validated groups; one group had source area 28.1598985 and excess projected area 0.0001110348, exceeding its newly smaller validation budget. This changed acceptance semantics unintentionally. `monaco-cooperative-validation-failure.json` preserves the real browser warning. The failed world returned to the selector and the owned tab was closed. This was a regression introduced by the first scheduling implementation, not a provider outage.

The corrected implementation resumes the original partition loop between triangles. It retains the exact original whole-cell summation, output order, acceptance scope and tolerance. The synchronous and cooperative paths consume the same generator. A new regression concentrates a tiny support-area excess in early triangles to verify that scheduling boundaries cannot change validation. The affected terrain, carriageway, publication and capture tests pass, as does the production source gate. The preceding full sequential command passed 225 tests; its result predates this final correction. Another Monaco startup/flight journey is in progress.


### Corrected startup and real rebuild verification

The final Monaco retest completed startup with resumable partitioning. The saved `monaco-resumable-startup.json` records a settled recent frame window with p95 33.4 ms, maximum 35.4 ms and no frames over 50 ms. The aircraft launch again ended in nearby urban geometry, so this is **not** a sustained-flight acceptance run.

A user-visible Rebuild sidewalks operation then exercised the actual runtime against Monaco terrain while the aircraft remained stationary. `monaco-resumable-rebuild.json` records 22,665 ms for the replacement, p95 35.3 ms, p99 83.2 ms, maximum 483.3 ms and eight frames over 100 ms in the recent 1,800-frame window. The rebuilt window differs from the first flight/taxi run and benefits from cached packets: do not present the 63,670-to-22,665 ms difference as a controlled speedup. The observed frame behavior improves on the earlier run, but still fails the no-stall-over-250-ms target. Startup itself remains slow, and overall memory acceptance remains open.

`monaco-resumable-rebuild-events.json` shows roughly 77 ms between mapped-path start/completion and another 71 ms through subsequent publication; those timestamps include surrounding work and are not isolated profiler samples. These synchronous stages remain candidates for further scheduling/residency work. `monaco-resumable-taxi.png` was visually inspected: aircraft is on the ground between buildings, frontage gaps remain. No claim of visually complete streets or globally verified flight is supported.

Final code verification: 44 affected terrain/carriageway/publication/capture tests and the production parse/source gate pass after the resumable-partition correction. The earlier complete sequential suite passed 225 tests before this final correction. All three owned world-test tabs from this investigation were closed; each successful world returned through Main Menu first. The mutable preview server remains on port 4192 for owner testing. Main, production, research and GitHub were not changed.


## Follow-up: remaining flight stalls and synchronous publication

Owner requested completion after the partial flight repair. Contact-index construction, pavement vertex indexing and mapped-path construction now consume resumable iterators. Synchronous callers consume the identical iterators, preserving results. Nearby replacement builds both pavement and mapped-path contacts before committing; the distant overview completion also awaits scheduled path/contact preparation. Obsolete builds check cancellation before commitment. Four new tests compare captured Monaco/San Francisco indexed geometry and contacts, mapped-path clipping/grouping and cancellation. The sequential street command passed 230 tests, six hill fixtures, three regional replays and the source gate.

Actual movement-triggered Monaco verification still failed: `monaco-scheduled-publication.json` records p95 133.4 ms and maximum 2,900.1 ms in its recent 1,800-frame window, with a 64,595 ms replacement. The newly instrumented publication stages had maximum slice 47.6 ms, so they did not explain the largest remaining block. Aircraft entered from Travel and crossed into the next pavement region, then encountered hillside geometry; it is not a sustained-flight acceptance run. The owned test returned through Main Menu and closed.

Further inspection found synchronous per-cell road-edge profile preparation: metre-spaced samples of the same road segments were repeated for neighbouring cells. This preparation is now resumable and profiles are shared only within one publication. Cache identity includes geometry, widths, lateral offset, metre scale and surface bias; changing ground/contact identity or terrain revision clears it. Publication cleanup clears profiles and source references. A new test verifies exact sampled heights, no repeated station queries for adjacent cells and invalidation on revision changes. The affected tests and source gate pass; a fresh Monaco verification is underway. Conformance now reports its own maximum slice separately, avoiding an unsupported attribution of all frame stalls to contact construction.

## Vegetation publication follow-up

`monaco-profile-reuse-publication.json` records the next movement-triggered rebuild at 39,941 ms, maximum publication slice 59.8 ms and conformance slice 62.9 ms. The frame window still failed: p95 114.81 ms, maximum 1,733.3 ms. These are successive runs, not a controlled benchmark; shorter construction does not establish smooth flight.

An instrumented fresh Monaco load isolated vegetation refresh: initial collection 327.6 ms and post-pavement collection 363.6 ms; the latter refresh blocked for 377.3 ms total, including 13.6 ms model publication. Events are saved in `monaco-vegetation-blocking-events.json`. This proves one blocking stage, not that it explains every earlier multi-second frame.

Background vegetation refresh now drains the same placement and model-construction iterators cooperatively. Existing vegetation and collision placements remain accepted during preparation; staged roots commit together, retired roots dispose across scheduled turns. Refresh replacement, location reset and pavement replacement invalidate obsolete preparation. Startup's explicit synchronous flush still consumes the same algorithm before readiness; it is not a second vegetation policy. The diagnostic snapshot exposes background maximum slice separately from elapsed completion time. Tests check exact seeded placement/exclusion results, cancellation, preparation visibility, atomic collision/visual replacement and disposal on failure. Browser acceptance remains pending.

Runtime verification of cooperative vegetation: `monaco-cooperative-vegetation-flight.json` and its screenshot capture another short movement-triggered Monaco replacement. Vegetation completed over 622.5 ms elapsed with maximum construction slice 26.9 ms and 980 instances. Pavement replacement elapsed 19,464 ms. Recent 1,800-frame p95 was 35.3 ms, maximum 283.4 ms; session maximum remained 1,335.2 ms. Aircraft again settled against hillside geometry, so this is not sustained flight. Heap estimate was 1.44 GB and does not pass the memory target. The owned tab returned to Main Menu and closed. 240 CPU tests, six hill fixtures and all three regional replays passed. Source verification initially caught inconsistent scheduler import identity; normalizing the new imports to `?v=1` passed its rerun.

Follow-on attribution now retains maximum duration and slow-call count per runtime system, rather than discarding a stall's evidence on the next fast frame. A deterministic clock test verifies retention. This is diagnostic evidence collection, not an additional claimed performance fix.

Runtime attribution run (`monaco-runtime-attribution-flight.json`) isolated the largest recorded system call to `core.renderer` at 1,138.7 ms; `core.presentation` recorded 171.1 ms. No simulation system crossed 16.7 ms. Recent frame maximum was 150 ms and p95 50.1 ms; session maximum remained 1,418.7 ms. This does not distinguish first-use rendering from steady streaming and is not a flight acceptance pass. The owned world closed after capture.

The distant mask previously invalidated its complete atlas and lookup textures on every cell. It now uses Three r128's public `copyTextureToTexture` DataTexture path to upload the changed rectangle and address pixel. CPU arrays retain every cell for initialization/context restoration. No alternate full-atlas update path runs per cell. Upload byte and maximum-call timing appear in overview diagnostics. API behavior checked against https://raw.githubusercontent.com/mrdoob/three.js/r128/src/renderers/WebGLRenderer.js . The subimage unit test passed; four streaming harness tests initially lacked the required Vector2/renderer API, then all 11 passed after updating the stand-in. Source gate passes. Real GPU verification is pending.

## Final evidence from this continuation

The real subimage-upload run separated startup from plane entry. `monaco-subimage-before-flight.json` already contains the 1,125.6 ms maximum renderer call before selecting the plane. At 79 cells, incremental texture transfers totalled 323,900 bytes with maximum upload call 1 ms. `monaco-subimage-stationary.json` remains stationary evidence: the diagnostic overlay covered the Travel menu and intercepted the attempted flight selection. It must not be counted as a flight run.

After collapsing the overlay, aircraft mode was confirmed in the HUD before movement. `monaco-subimage-flight.json` records the changed pavement bounds and 20,334 ms replacement, maximum publication slice 12.8 ms, conformance slice 18.5 ms, and vegetation slice 19.7 ms. By 947 overview cells, incremental uploads totalled 3,882,700 bytes with maximum call 1 ms. The saved screenshot was visually inspected; the plane again stopped against hillside building geometry. Heap estimate was 1,115,924,592 bytes. Sustained flight, complete-city appearance and memory acceptance remain open.

That longer run exposed a pre-existing precision bug in rolling telemetry: threshold increments used double-precision values but ring eviction read Float32-rounded values. Counts could drift, including a negative `over16_7`. Earlier rolling threshold counts must therefore not be used as acceptance evidence. The ring now stores Float64 samples; a 12,000-frame test spanning threshold boundaries and repeated wraparound agrees with direct window counts. The final screenshot/JSON preceded this telemetry correction; it was not silently edited to invent corrected measurements.

Final sequential verification passed 243 tests, six hill fixtures, three regional saved-layout replays and the source gate (`/tmp/final-street-flight-regression.log`). `git diff --check` passed. All owned browser test worlds from this continuation returned through Main Menu and closed; no CPU test process remains. The existing port 4192 preview remains for owner testing. Main, research, production and GitHub remain untouched. This continuation establishes specific scheduling/upload repairs, not global street or release acceptance.

### September 15 — continued startup and ownership investigation (in progress)

Two changes are under verification: the first real world render now occurs before dismissing the loading cover, and far-terrain publication releases construction arrays and non-seam point-cache entries. The render change accounts for initial graphics work under loading; it does not reduce or hide that work in frame measurements. Focused direct/composer and far-terrain boundary-refresh tests pass. No memory-budget or sustained-flight acceptance is implied.

A fresh browser load at **37.7923, -122.4144** failed pavement publication: source area 891.692722, supported area 891.694006608371, excess 0.0012846083706108402 world units squared. The existing validator rejected it and the world returned to selection. Evidence: `audit-2026-09-13/sf-startup-area-validation-failure.json`. The threshold is unchanged. An instrumented repeat is collecting the largest individual triangle discrepancy to distinguish an actual support overlap from numerical clipping error.

The source audit also establishes unresolved ownership conflicts:

- `terrain.js::applyTransportTerrainCorridors` grades visible detailed terrain tiles. Far clipmap geometry samples accepted/source elevation and refreshes its detailed boundary, but does not receive the same corridor grading field.
- `compiler/street-carriageway-mesh.js` partitions the road footprint against published terrain and samples its height. It explicitly remains a temporary integration, not independent road-profile ownership.
- `terrain/reprojection.js` preserves accepted-ground building foundations. Road grading subsequently changes surrounding ground, so facade contact cannot be solved by changing sidewalk height alone.

The prior Monaco maximum profile residual of about 80 metres was approximately 7.6 km from the origin; it must not be represented as a measurement of the player's nearby road. These findings require a coordinated profile/terrain/foundation design and regional visual acceptance; coverage counts do not close them.

The instrumented failure isolated **overlap between two detailed terrain tiles**, not far terrain or a large polygon hole. The largest failing input triangle has X/Z vertices (376,-164), (372.701,-168), (373.201,-164). The two tile edges were 373.94281005859375 and 373.9427795410156. Their different local Float32 origins produced the discrepancy. Full contributions are saved in `audit-2026-09-13/sf-startup-partition-triangles.json`.

Detailed tile construction now publishes horizontal vertices in a shared world-coordinate Float32 frame, using canonical geographic corner coordinates and zero horizontal mesh translation. Far-terrain fallback coverage uses those same corners. Ground contact and pavement partitioning locate actual stored grid intervals rather than assuming Float32 stations remain perfectly uniform. The area acceptance threshold remains unchanged. The captured triangle regression rejects the old overlapping edges and accepts the shared-edge construction with area residual below 1e-10. Negative/positive regional origins and unequal stored grid intervals are covered.

The sequential street command passed 251 tests, six hillside fixtures, three pinned regional layout replays, and source validation (`/tmp/world-grid-street-regression.log`). A fresh full browser load of the same San Francisco coordinates is the next acceptance check; this CPU result does not close that gate.

The fresh San Francisco browser load succeeded after the boundary repair. Street-level and overhead captures (`sf-shared-grid-street.png`, `sf-shared-grid-overhead.png`) were inspected. First actual render ran under loading (1752.3 ms, 31 programs). Full startup remained **187436 ms**. Snapshot `sf-shared-grid-startup.json` records approximately 1.43 GB legacy heap and 332873056 bytes of unique scene geometry. The loaded source counts differ from the earlier failed load, so these are not controlled performance comparisons. The exact captured-triangle test remains the isolated regression evidence.

A real flight was confirmed in the HUD and traveled approximately 2.4 km from the origin. `sf-shared-grid-flight.json` records the aircraft airborne, speed 68.96 world units/s, a 4483.4 ms worst frame and **4479.7 ms in core.renderer**, with rolling p95 49.9 ms. Vegetation was cooperative with a 9.9 ms maximum slice in that snapshot. Heap estimate was about 1.84 GB. A throttle/climb browser click timed out during the journey and is not counted as successful input. This flight **fails** performance acceptance; the test world was closed. Opt-in bounded WebGL-call attribution is now added to distinguish shader, upload and draw costs before selecting the next repair. It is diagnostic evidence collection, not itself a performance fix.

The attributed repeat (`sf-graphics-attributed-flight.json`) did **not** reproduce the prior 4.48-second renderer call. Its first render spent 1171.2 ms across 3534 buffer uploads and 640.8 ms across 223 image uploads. A later slow render was 312.7 ms; flight still had a 1232.4 ms rolling worst frame and p95 48.5 ms, with presentation, simulation and nearby-capture work also recording stalls. This variability is evidence against declaring one upload patch a complete flight fix.

Two further repairs are under verification:

- Facade images are pooled by asset URL. Deterministic repeat/offset values move to material shader uniforms and mid-distance vertex attributes, preserving variant appearance without separate GPU images for each phase/style alias. The sharing/projection/disposal component regression passes; visual verification remains required.
- The pavement rebuild's far-terrain contact index is constructed cooperatively and retains only triangles whose bounds intersect the current compilation extent. The full source scan yields and supports cancellation; allocation is sized to selected records. Detailed terrain support remains available. Focused tests compare bounded/full projection results, enforce preserved overlap rejection, and check worker cleanup when cancelled before its first message. This does not discard world content or narrow the region the pavement build promises to publish.

Combined browser verification (San Francisco, same coordinates/source counts):

- `sf-shared-facades-street.png` was visually inspected; facade pattern/phase remained consistent with the previous street view.
- `sf-bounded-support-startup.json`: 284 renderer textures versus 330 in the earlier comparable startup snapshot; first render 1334.8 ms; 188 image uploads versus 223 in the attributed pre-sharing run. Total load remained 182028 ms and does not pass the startup target. Timing differences are not a controlled guarantee.
- `sf-bounded-support-flight.json`: aircraft airborne about 2.9 km from origin; last 1800 frames p95 35.4 ms, maximum 335.2 ms. Renderer maximum 78.9 ms. This dense-city window still fails the no-stall target.
- `sf-bounded-support-flight-later.json`: aircraft still airborne about 5.7 km from origin; last 1800 frames p95/p99 18.7 ms, maximum 99.9 ms. This later, less dense window passes the provisional frame-time limits, but does not certify the entire route. The world was closed afterward.

Further CPU-only work targets the expensive terrain-grading pass. Facade influence pruning now rejects candidates beyond the maximum legal attached/mapped frontage reach before per-point searches; points already inside the carriageway do not need a facade search to determine their grade weight. Full-field comparisons against the unpruned frontage resolver preserve exact heights for attached rows, absent sidewalks and 60-metre mapped sidewalk widths. This is scheduling/query reduction, not a substitute for the unresolved independent road/terrain/foundation architecture.

Monaco cross-location verification at **43.7397, 7.4243**:

- The latest complete CPU command passed **256 tests**, six hillside fixtures, three pinned regional replays and source validation (`/tmp/frontage-pruning-regression.log`).
- The real world loaded and the street view was inspected (`monaco-shared-grid-street.png`). It still has unsatisfactory hillside/building interfaces. The selected spawn's nearest road is a mapped private service road; its visible/contact surface agrees, but that does not establish adequate public-space geometry. Tags/contact are recorded in `monaco-shared-grid-contact.json`.
- `monaco-shared-grid-startup.json`: 71511 ms total loading, 4332.9 ms transport terrain grading, 17 ms maximum height-compilation chunk. The influence resolver skipped **1239943** out-of-range candidate searches and performed 101738 facade queries. Full-field equality tests support this optimization; these counts are workload accounting, not sidewalk coverage evidence.
- Render resources: 581 geometries, 174 textures. First render 1322.2 ms. Stationary rolling p95 33.4 ms, worst frame 748 ms, so this check does not pass the no-stall target.
- All owned test-world tabs were returned to the menu and closed. Only the existing preview server is retained for user testing. No GitHub update, commit, production deployment, research work or main-branch change was made.

**Acceptance remains open.** Concrete repairs above are verified at their stated evidence levels. Remaining blockers are unified road/profile/terrain/foundation ownership, complete bounded scene residency, long startup, and residual non-renderer stalls. The later SF flight window is a passing window, not a global release result.
