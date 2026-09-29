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
