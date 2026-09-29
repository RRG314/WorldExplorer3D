# Visual quality verification

September 28, 2026. Local implementation on `steven/visual-quality`; production
unchanged. This is not a release approval or completion of the full visual plan.

## Implemented

- Quality settings preserve active exposure and authored car materials. Manual
  sky presets supply the visual state consumed by weather.
- Terrain slope blending conserves weights across refreshes. Bare ground and
  missing vegetation no longer imply dunes. Dark photographic shadows have
  reduced authority; mineral and snow materials ignore obsolete green vertex tint.
- Ship equipment retains emissive strength, console housings and cables.
  Furniture preserves imported transforms, physical height and wall contact.
  Shared licensed bulkhead/carpet maps and corrected light intensities improve
  material consistency. Pending furnishings and surface maps respect disposal.
- The distorted navigation console was rejected after source/runtime comparison
  and removed from the runtime catalog/package. Stations use the approved
  LuddePudde instrument module. Interaction and collision authority are retained.
- Sketchfab vegetation uses denoises trees, fern and grass, plus lev26's bush.
  Tree LODs retain trunk origins and share identical texture allocations.
  Source licenses, hashes and conversion records are recorded with the assets.
- Model URLs carry content revisions. Hosting builds reject stale revisions.
- Near/mid facade openings filter by pixel footprint, fading subpixel windows to
  their coverage instead of aliasing; mapped footprints and bay counts are unchanged.
- Remote walking players use the existing licensed character and animation
  controller. Mode changes and departure cancel/release character instances.
  Room membership, network poses and interpolation remain with multiplayer.

## Current checks

| Evidence | Result and scope |
| --- | --- |
| Targeted components | 32 passed: presentation, biome, atmosphere, asset integrity/budgets, revision hashes, vegetation and remote-character cancellation |
| Terrain shader fixture | Rendered rock/sand/forest/snow; black imagery and obsolete green tint assertions passed; screenshots inspected |
| Vegetation fixture | Five families loaded; near and LOD views inspected; shared-map LOD view used seven textures and six draw calls |
| Space browser sweep | 97 checks passed before the final wall-module substitution; destinations and ship images inspected; two reboard/release cycles returned to the same resource footprint |
| Final ship-only sweep | Nine checks passed after wall-module substitution, including 25 room captures, crew, furnishings, camera modes, exit and retention; screenshots inspected |
| Ship research | Specimen placement, measurement, fabrication and pod launch passed earlier in this implementation |
| Public multiplayer | Two-client isolated-service browser journey passed |
| Weekly room | After the avatar change, two authenticated clients joined the same public Chicago room/world; membership and curated remote character verified; no browser errors; member screenshot inspected |
| Remote-character browser fixture | Four vehicle/return and leave/rejoin cycles, animation present, stable 17 geometries/two textures, no graphics errors; screenshots inspected |
| Facade checks | Six layout/texture components passed; actual near and merged-mid shaders passed four building styles, color parity and eight-attribute budget; three distance views inspected |
| Final city check | London loaded and walked after the facade change without browser/graphics/local-asset errors; screenshot inspected |
| Final terrain holdouts | Canyon and Iowa loaded and walked without page/graphics/local-asset errors; images inspected, remaining appearance limits below |

Evidence is under `output/visual-quality/` and `output/verification/`. These
ignored captures are local test artifacts, not shipped content. Source tests,
controlled rendering fixtures, full-world browser journeys and live services
are different evidence levels. Emulator passes do not certify live signed-in
production behavior or physical phone performance.

The first remote-character fixture failed because its test selected the name
sprite after child order changed on a mode switch. The fixture now selects the
character by identity; the corrected four-cycle run passed. Earlier failed
captures are retained, not counted as successful evidence.

## Visual findings and remaining acceptance

The twelve-location initial functional matrix included a subsequently rejected
image-color recovery experiment. It is historical evidence, not the final build.
That experiment softened cliffs and was removed. A stronger rock mip bias was
also rejected; the current distance bias is 1.5 levels.

Sahara's gray-green rock color was present in the aerial source, with correct
mineral weights. Iowa's field color likewise comes from imagery rather than a
concrete material override. These observations do not make either landscape
visually complete. Close agricultural detail, canyon repetition and regional
vegetation still require work. The Amazon sample uses generic broadleaf trees,
not a validated tropical family. Some utility-room furnishings remain basic;
repeated wall instruments improve consistency but do not finish room variety.
Other-world rendering retains approximations and some simple satellite surfaces.
Remote vehicle/drone/space proxies remain primitive; only walkers were replaced.
Remote character customization is not transmitted by the current room protocol.

The shared presentation-owner consolidation, regional asset coverage, broader regional facade
review, compressed-texture pilot and matched whole-game performance measurements
remain open. No claim of improved whole-game FPS, peak memory, startup time or
production readiness follows from these checks. The previously failed release
performance thresholds remain unchanged. Physical phone verification is pending.

## Historic sites and release review

The September 28 follow-up added documented Giza ruin metadata, terrain-sampled
historic walls and matching collision, bounded fortification presentation rules,
and Elizabeth Tower facade detail. Old generic landmark models are disposed
only when their identity and footprint match a replacement. Foundations keep
the existing robust terrain envelope but remove the 12 m support cap.

Targeted tests cover steep relief, invalid ground, wall collision extents,
landmark cancellation/disposal and metadata matching without changing neighboring
buildings. Real-browser historic-material and tower fixtures were rendered and
inspected. Full-world Giza, Mutianyu, Westminster and San Francisco checks loaded
and walked, but functional passes did expose further visual issues. Repeated
captures after those repairs are distinct from final acceptance.

The public documentation review removed personal checkout paths and obsolete
release-state claims. Production is 5.3, not 5.2. The next compatible release is
5.4; internal refactoring alone does not require 6.0. No deployment or GitHub
publication is established by these local checks.

Final targeted run: 27 facade/foundation/historic component checks passed, plus
one static-structure ownership/bounds check. The source gate and whitespace
checks passed. The latest Mutianyu load/walk capture has matching wall/building
stone and no residential facade on the wall-adjacent footprint; its tower detail
and scene lighting still need visual refinement. The final Elizabeth Tower
fixture retained its visible detail with 12 draw calls instead of 95; 127 of
2,457,600 image channels differed after batching. This is a fixture comparison,
not a whole-world frame-rate or memory result. No graphics errors were reported.

The broad regional-art plan and failed full-game performance acceptance are
still open. The existing local preview artifact predates these source changes.

## Regional building foundation

The regional-building extension passed 33 targeted checks covering source-class
precedence, mapped/inferred roof authority, distinct roof forms, runoff direction,
closed single-slope perimeters, regional country lookup, residential classification,
and facade/part integration. The source gate and whitespace check passed.

Roof and regional-material fixtures were rendered and their screenshots inspected.
The final regional fixture reported 12 draw calls, six textures and no GL error;
the roof-direction fixture reported 13 draw calls and no GL error. These are
small component scenes, not full-world performance measurements.

The Tokyo world check completed loading and walking without browser or local
asset errors. First playable was 116 seconds in that sample; it was not a matched
comparison and preceded the coordinate-only country fallback. It is not accepted
as a loading-performance result.

Four Sketchfab candidates were downloaded and visually inspected. None is
registered as a runtime building asset: the Japanese diorama is excessively
fragmented, the Mediterranean model has coarse textures, and the cabin and arched
window need narrower style eligibility and in-world review. Roof and timber
surfaces from Poly Haven are integrated with shared texture ownership and
source/conversion records.

Regional facades remain too similar to meet the intended architectural quality.
Authored component integration, district and tropical coverage, a current frozen
world/traversal/space/multiplayer regression run and matched performance acceptance
remain release requirements. Production and the existing packaged preview have
not been updated by this work.


## Baltimore driving and flight investigation

Road searches now reject segments whose best possible score cannot improve the
current result before sampling their height. Connection rules are evaluated once
per road rather than per segment. Differential checks preserve selected roads,
heights and grade-separated transition behavior. Compiled static batches retain
their transforms; moving actors keep automatic updates.

Decoded model templates now have a 64 MiB estimated idle-resource budget. Active
instances and derived vegetation retain explicit leases, so eviction cannot
invalidate their textures. This bounds idle model resources, not total browser
memory. A real-model fixture completed three vegetation rebuilds with all five
families visible, seven textures and no graphics error; its image was inspected.

Physical M1 Chrome, fixed medium quality, 1280×800 at device scale 1, same Baltimore
coordinates. Two repetitions followed a 100 m drive and a 1.5 km flight, with
identical starting poses and normal physics/input after setup:

| Version | Driving FPS, repetitions | Flight FPS, repetitions |
| --- | --- | --- |
| Preserved 5.2 production | 38.7 / 48.4 | 38.3 / 36.7 |
| Previous 3720 candidate | 35.4 / 46.8 | 41.8 / 41.2 |
| Patched source | 45.5 / 53.6 | 40.3 / 42.9 |

All fixed routes completed without page errors. Driving improved in this sample;
flight is essentially unchanged from the previous candidate and above the sampled
5.2 averages. First-flight p99 was worse than 5.2, although the worst frame was
shorter. These live-provider samples are not a statistical or all-location
non-regression certification: 5.2 selected 27,603 buildings, versus 25,587 in both
newer versions. No threshold has been relaxed.

Earlier sustained-flight samples used a two-second climb input that sometimes
looped the aircraft and produced different routes. They are diagnostic captures,
not valid comparative flight benchmarks. The driver now uses bounded pitch input
for normal takeoff and fixed-distance routes for comparisons. The older replay
harness no longer caps the JavaScript heap and now requires the hardware renderer.

The packaged candidate still requires validation before performance acceptance or
production promotion. Evidence: local `baltimore-fixed-route-*` reports under
`output/architecture-evaluation/`; raw profiles and captures are not shipped.


The packaged inspection also found obsolete presentation work: invisible or
promoted ambient character rigs remained in the scene graph, and urban detail
selection followed a parked vehicle/walker during flight. Hidden population hosts
now detach without disposing their agent-owned resources. Visibility restores
the same host and its current pose. Population/detail focus follows the active
Earth actor; airborne detail selection includes altitude. Civic simulation keeps
its existing authority.

Three real-character hide/restore cycles passed with ten geometries, one texture,
and no graphics error; the final walking pose was inspected. Population demand,
distribution, attachment and focus component checks passed. The preceding source
flight reduced attached bones from 2,503 to 147 and restored 2,503 at the ground
origin. Final direct-driving focus and frozen-build checks remain pending below.


### Frozen candidate a09cf0d9

`5.3.0+a09cf0d9f270.d38a22c92653b16b.staging` completed the same two driving
and two flight routes, then returned to the original ground scenario. No page
errors occurred. Driving measured 43.3 / 54.2 FPS and flight 43.1 / 40.6 FPS.
Compared with the sampled 5.2 routes, averages were approximately 11–13% higher.
First-flight p99 remains worse (66.7 ms versus 35.4 ms); occasional hitches remain.
These are limited same-location measurements, not universal performance claims.

Nearby detail restored all 20 NPCs after return. Attached Earth bones changed
from 2,503 on the ground to 147 during flight and back to 2,503. Main Menu
released the mapped building/road/terrain collections. The uncollected heap was
still about 1,018 MiB after five seconds; this is not a total-process memory
measurement or proof of the earlier 3.8 GiB concern being resolved.

The frozen ship check passed nine checks covering all-room renders, seven crew,
loaded furnishings, camera modes, exit and two reboarding cycles. Released
resources returned to 30 geometries / 33 textures in both cycles. Science and
Baltimore recovery screenshots were inspected. This validates the changed
ownership paths, not the outstanding overall visual-quality plan.


## September 29 travel-stall investigation

Changes under verification:

- Background road and vegetation preparation yields past a rendering opportunity between 2 ms slices; initial loading retains its existing scheduling.
- The invisible astronomical sky defers descendant matrix updates and refreshes before it becomes visible. Explicit world-space queries retain normal behavior.
- Collision checks query normalized saved-building suppression state directly instead of repeatedly copying the full world-edit snapshot.
- Vegetation cells share the bounded family cache's materials. Replacing a cell releases its instance buffers without discarding identical compiled programs.
- Vegetation contact indexes are prepared cooperatively and published with the corresponding visual placements, rather than rebuilt by the next movement query.
- Distant pavement source scanning and worker messages are split into chunks. Worker tests retain identical multi-kilometre coverage.

The real vegetation browser fixture retained programs 0, 1 and 2 over three replacements, with 8 geometries, 7 textures and no graphics errors. Its final image was inspected. A real Baltimore night/day cycle restored and hid the sky correctly. Targeted store persistence, collision, cancellation, source-transfer and actual-worker checks passed. These are not whole-game acceptance.

The initial distance-based diagnostic did not complete its driving route and is recorded as failed. Subsequent windows are explicitly 15-second diagnostic input windows, not matched route comparisons with 5.2. The frame report now includes the delay before its first eligible RAF, previously outside the measured interval.

The contact-publication source run completed driving, flight, underwater, Earth return and space without page errors. Driving p99 was 48.2/51.3 ms, flight p99 34.6/35.2 ms; a 349.6 ms Earth-return frame and other isolated spikes remained. The later chunked pavement source change still requires frozen-build verification. No universal smoothness, memory or production-readiness claim follows from these results. Regional art and the broader visual plan remain open.

### Follow-up: packaged stalls and delayed terrain shaders

The `2b614f09` packaged run did not pass performance acceptance: isolated frames
reached 417 ms driving and 849 ms flying. CPU and WebGL-boundary traces separated
shader linking from first-use geometry/texture uploads. A subsequent upload
probe did not reproduce an individual buffer upload over 8 ms; it does not rule
out a costly batch of smaller uploads.

The original fixed driving heading ran into a building. Those stationary/timed
windows are diagnostic evidence only. The corrected Baltimore comparison starts
on mapped East Baltimore Street at x=-128, z=82.347, heading 1.625248 radians and
requires 100 world units of actual driving; flight requires 1,500 world units.

Distant pavement previously attached terrain shader hooks after interactive
entry. A trace measured a 224 ms render with eight new programs. The replacement
installs a stable material binding before the first playable render, then swaps
atlas uniforms as cells arrive. Resident programs are prepared with the actual
composer render target. No coverage, texture resolution or geometry was removed.

Targeted tests cover atlas replacement, unchanged program keys/material versions,
compiled-uniform identity, old-texture disposal and correct renderer-target
restoration. A real WebGL fixture replaced the atlas three times: one retained
program, two resident textures, zero GL errors; the pavement image was inspected.
The source journey completed both driving and flight routes without page errors.
Driving worst frames were 51.9/66.6 ms; flight 133.4/35.3 ms. The terrain-program
burst no longer appeared. These are source observations, not frozen release
acceptance or a claim that every travel mode is smooth.

Artifacts: `output/architecture-evaluation/travel-frozen-2b614f09/`,
`travel-frozen-gpu-upload/`, `travel-mapped-graphics/`,
`travel-stable-pavement-programs/`, and
`output/visual-quality/pavement-program-retention/`.

### September 29: spatial tunnel shading and travel follow-up

The frozen `dcc0ec91` build remained below the corrected 5.2 comparison in
average travel FPS. It was not promoted. Subsequent source work keeps all tunnel
openings but indexes them by location: the Baltimore distant terrain previously
scanned 100 openings per fragment; its largest cell now contains 16 candidates.
The descriptor, cell and reference data share one texture sampler. Rotated,
sloped, overlapping and wide-area aperture parity tests passed. A real WebGL
fixture preserved pavement while openings moved, cleared and returned.

In the source comparison, median whole-composer GPU time during flight changed
from 32.5 to 24.9 ms. This is diagnostic evidence, not a universal FPS guarantee.
A later run without GPU/CPU timing instrumentation completed both driving routes
at 46.6/45.7 FPS and both flight routes at 52.9/52.3 FPS. Worst frames were
49.9/50.0 ms driving and 85.2/35.3 ms flying. The initial corrected 5.2 sample was
51.2/52.0 FPS driving and 48.5/51.6 FPS flying; a later instrumented 5.2 run varied
substantially. Driving parity and final frozen acceptance remain open.

The same source journey completed ocean entry, Earth return, restoration of
nearby NPC detail, space entry and Main Menu cleanup without browser errors.
These are single-client journeys, not new multiplayer or physical-phone proof.

Additional repairs retain static vegetation transforms, batch compatible opaque
maritime facilities by spatial cell, preserve shared vegetation materials during
world teardown, share background rendering opportunities between producers, and
avoid temporary filtered arrays in wheel-contact calculations. Water and boat
wake program variants now share their live uniforms; a lighting-switch fixture
retained state across three switches with zero GL errors. The water-state repair did not remove the harbor band. Its separate coverage
repair is described below.

The gas-giant cloud lattice was traced to large-coordinate noise evaluation.
Bounded hash arithmetic and decorrelated cloud scales removed the repeated grid
in the inspected gallery. All twelve views (four bodies, three altitudes) passed
without graphics errors. These are modeled local clouds over the existing
catalog imagery, not measured weather. Nebula rendering was unchanged. The
full frozen `dcc0ec91` space/ship gallery previously passed 97 functional checks;
its images still show basic utility furnishings and some simple moon/satellite
surfaces. Those art limitations are not closed by the cloud repair.

Artifacts: `output/architecture-evaluation/travel-shared-budget/`,
`travel-52-gpu-time/`, `travel-current-cpu/`, `travel-surface-matrix/`,
`travel-spatial-portals/`, `travel-water-state/`, and
`output/verification/{portal-spatial-grid,water-program-state,atmosphere-gallery}/`.


The harbor gap came from excluding distant water over the entire detailed
terrain rectangle, even where no detailed water had been published. Regional
water now subtracts the actual detailed polygons and river triangles, including
explicit island exclusions. Publication handles either completion order and
releases the temporary source rings after the handoff. The full Baltimore image
shows continuous harbor water again. Geometry tests preserve dry islands and
exclude a second surface over a descending river. The post-repair source routes
completed without browser errors, but driving FPS varied to 45.5/30.6 and flight
to 49.5/50.4; this remains unsuitable as a final performance acceptance result.


### Packaged travel verification — September 29

Candidate `5.3.0+428c287139a9.990f5fc84dc62511.staging` completed both
Baltimore driving and flight routes, ground-detail restoration, ocean, Earth
return and space transitions with no reported runtime errors. First playable
was 47.9 seconds. Driving averaged 40.4/44.7 FPS, flight 51.7/51.8 FPS.
Maximum route frame intervals were 167/48 ms driving and 133/50 ms flying.
Driving does not meet the sampled 5.2 baseline; this is not release acceptance.
The driving and harbor-flight screenshots were inspected. Harbor coverage is
continuous, but these views do not establish worldwide art completeness.

The next source change indexes pavement shoulder contributions by spatial cell,
retaining source order and exact weighted heights. An exhaustive comparison
across more than 2,000 positions and 80 differently sized/offset roads passed,
as did the existing height, continuity and cooperative-publication checks.
The source browser run completed all four routes without errors: driving
48.7/43.4 FPS, flight 50.2/50.4 FPS. A 135 ms driving interval remains.
The subsequent diagnostic run found no buffer uploads longer than 8 ms;
pavement sampling and road-contact construction still consume background CPU,
and renderer submission remains substantial. Instrumented results are not
substitutes for uninstrumented acceptance. Local evidence is in
`output/architecture-evaluation/travel-frozen-428c2871`,
`travel-indexed-pavement`, and `travel-remaining-stalls`.

Production and the existing port-4193 preview have not been promoted. Remaining
release work includes resolving ground frame pacing and completing the broader
regional/ship art acceptance already listed above. No new live multiplayer or
physical-phone verification is claimed by these runs.


### Space surfaces and frame pacing — September 29

Parent-planet sky placement now uses a mean synchronous-orbit model: body-fixed
landing latitude/longitude, catalog radii, masses and orbital period determine
direction and apparent diameter. Local sky objects follow camera translation
without following camera rotation. Apollo 11 Earth is about 1.905 degrees wide;
Europa's sub-Jupiter view is about 12 degrees. This is not a time-dependent
orbital ephemeris or libration model. Reference context:
https://science.nasa.gov/moon/tidal-locking/ and
https://science.nasa.gov/jupiter/jupiter-moons/europa/europa-facts/.

A repeated whole-scene name lookup was removed from planetary frames. Hidden
constellation figures no longer rebuild their line buffers after observer
movement; the current projection is generated when the overlay becomes visible.
The browser fixture confirmed 12 observer changes with zero hidden buffer
updates, followed by 88 refreshed figures on show. Star projection stays active.

Surface material noise now avoids large sine-hash arguments and filters detail
below the pixel footprint. Outer-world render lights receive display compensation
without changing physical environment values. Ten solid-world screenshots were
inspected; Europa's former near-black ground is readable. These are still coarse
regional surfaces with repetitive detail and simple rover/rock artwork. They do
not meet the requested premium-game art quality yet.

Moon and Europa landing-button/return-launch journeys passed without browser
errors. The initial Moon verifier timed out because it did not open the Travel
menu containing the return action; the corrected real menu journey passed.
A headed Chrome sweep exercised ten solid surfaces with three seconds of forward
movement each. Preparing the first render under the arrival cover removed an
initial Mercury hitch in the follow-up run; all ten follow-up samples were near
60 FPS, maximum frame intervals about 19 ms. These short samples do not prove
sustained travel performance. Results: `output/verification/space-surface-warmup`.

A 61-public-destination headed Chrome sweep completed without browser errors.
Arrival screenshots were reviewed in four contact sheets. Ordinary stellar
systems sampled near 60 FPS; nebulae about 37 FPS and galaxies about 29 FPS.
Most samples issued zero network requests; only three issued one each. The
filtered follow-up reused the initial report filename, so the initial full JSON
was overwritten; its console results and 61 screenshots remain, and the runner
now accepts a separate output directory. Do not claim a preserved complete raw
baseline report or statistical significance from this run.

Empty-density volume samples now bypass noise evaluation without changing ray
step counts, resolution or density functions. Follow-up samples: Milky Way
52 FPS, Andromeda 58, Triangulum 59, nebulae 47–48, inner-galaxy regions 33.
A fixed-camera WebGL before/after comparison found identical nebula pixels;
galaxy variants differed in 60 and 2 color channels respectively, by at most
1/255. The galaxy skipped-density bound is below .00028 integrated opacity.
Fixtures and sampled results: `output/verification/space-volume-parity` and
`output/verification/space-destination-travel`. No sustained 60 FPS claim for
dense volumes, mobile acceptance, or production promotion is made.

## Sustained travel and lifecycle checks — September 29

Longer driving exposed a 1.77-second shader-compilation pause when responders
added point lights. Responders now use fixed light slots; field-light toggles
change intensity without changing shader variants. The browser fixture retained
one program across spawn, movement and removal, with red/blue illumination
visually inspected. Distant reacting NPCs retain simulation but stop updating
invisible skeletons; ground return restores presentation.

Pavement publication uses bounded frame scheduling, exact numeric vertex and
contact indexes, transferable worker buffers and bounded exact-height caching.
High flight retains accepted nearby paving while the terrain coverage layer
continues; missing near-mesh support uses the accepted elevation field.

A sustained source capture measured 55.75 FPS driving for 20 seconds and
57.58 FPS flying for 45 seconds, with maximum intervals of 83.4 and 150 ms.
That capture included CPU profiling and is diagnostic, not final artifact
acceptance. The matched 5.2 capture measured 45.10/48.35 FPS driving and
37.23/39.27 FPS flying; host variability prevents treating a single run as a
universal speedup. Earlier GPU-instrumented captures are retained separately
and are not substituted for ordinary frame timing. Driving and flight images
were inspected. The car reaches a building at the end of the straight route;
its moving fraction is recorded rather than claiming continuous clear-road travel.

All 1,512 current component/source checks passed after repairing six stale
fixtures: revised biome classification, cached planetary-atmosphere setup,
asset-loader registration, content-versioned URLs and asynchronous acquisition,
and dated attribution assertions. These are component results, not multiplayer
or whole-game visual certification. Packaged performance and gameplay checks
remain pending. Production and the existing user preview are unchanged.

## September 29: packaged performance and allocation follow-up

Candidate `5.4.0+e84c1d84d329.a3cb1270c770c62b.staging` failed desktop
mode budgets: stationary driving averaged 40.93 FPS and sampled gameplay heap
reached 1.55 GB. Flight included an 816.6 ms frame. Retention, resource cleanup,
moving-world coverage and mobile checks passed.

The follow-up preserves polygon membership and material weights while indexing
coastline edges and water bounds, reusing blend scratch storage and avoiding
projection-query closures. Local-light cutoff pruning has rendered parity within
one channel value out of 255, including legacy zero-decay behavior. Stable
street-light slots prevent quality changes from altering shader light counts.
All 1,516 current contracts and the source audit passed.

The subsequent packaged d0a507d6 run reduced ground-play JavaScript heap to
552–607 MiB, with no forced collection during gameplay. The largest flight frame
was 133.4 ms, down from 816.6 ms. Loading took 50 seconds. Ground modes averaged
40–43 FPS and driving activation took 1,996 ms, so release acceptance still
failed. Mobile, retention, coverage and browser-error checks passed. These are
JavaScript heap measurements, not total browser or GPU memory.

## Character draw consolidation

Compatible solid-colour skinned parts now share geometry and vertex colours.
The authored triangles, weights, bones and animation clips are retained.
Weapons, independently animated parts, textures and recolourable uniforms stay
separate. Template geometry remains shared while instances own their materials
and skeletons.

The eight actual character assets were compared over idle, walk, run and wave
animations at two times each. Draw counts fell from 9–17 to 1–4 for seven assets;
the recolourable ship uniform remained unchanged. Six assets had zero or single
channel-value differences; the casual man's comparison changed six channel
samples across all frames, with a maximum difference of 20/255. This is near
pixel parity, not bit-identical rendering. Screenshots were inspected.
The remote-character fixture completed six vehicle/return and leave/rejoin
cycles with animation present, four geometries, two textures and no GL errors.
Full-world performance after this change remains to be measured.

## Sky reflection capture lifecycle

The 36eb0731 package retained the lower heap footprint (511–560 MiB on the
ground), passed mode-switch response limits and completed flight at 57.25 FPS.
Stationary walking/driving still failed the frame-rate budget. It is not an
accepted release candidate.

A subsequent CPU trace found recurring 42–44 ms shader links from the sky
reflection capture material. That material was disposed after every capture.
The engine now retains one capture scene/material per PMREM generator and
updates its uniforms; replacing the generator disposes the previous capture.
Six rendered sky updates retained program identities and resource counts. The
reference comparison differed by at most 1/255 in the first capture and was
identical thereafter. A fresh source driving window had no recurring capture
shader link, averaged 48.60 FPS and peaked at 66.6 ms. This source diagnostic
is not a replacement for packaged acceptance.

One preceding diagnostic failed before gameplay without a sufficient failure
snapshot. The subsequent run recorded live Overpass timeouts and completed
using fallback data. Failure UI and console capture have been added to the
profiling harness. Local source-host AppCheck warnings do not certify live
service access; multiplayer verification remains a separate check.

### Opaque draw order — September 29

The latest frozen build still missed the ground frame-rate budget. Its lightweight
measurement used live actor coordinates and renderer counters, avoiding repeated
full-world diagnostic snapshots between timed modes. It measured 41.1 FPS standing,
41.7 FPS driving and 57.4 FPS in sustained flight; flight still had a 200 ms maximum
frame. World coverage, teardown, retention and resource checks passed. This is a
failed performance acceptance result, not a deployment approval.

A same-session draw-order comparison on the physical M1 at 1440 × 900 measured
43.4/44.2 FPS with material-first opaque ordering and 46.4/45.6 FPS with
front-to-back ordering. Median instrumented GPU time fell from 29.11 to 25.86 ms.
Explicit group and render layers remain authoritative; transparent sorting is
unchanged. The render fixture matched all pixels at four camera positions with
separated surfaces. An initial coincident floor/block boundary changed one pixel,
consistent with competing equal-depth fragments. This does not establish visual
parity for every possible scene; packaged gameplay checks remain required.

A paired Gaussian bloom experiment retained image quality but did not demonstrate
a useful whole-scene improvement. It was not integrated. Bloom resolution,
strength, antialiasing and shadows are unchanged.
