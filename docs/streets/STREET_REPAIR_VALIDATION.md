# Street repair implementation and validation

Local app branch: `steven/street-system-rd`. Work dated 12 September 2026.
This record supplements the baseline [street-system audit](STREET_SYSTEM_AUDIT.md).
The baseline inventory and probe results remain historical evidence.

## What changed

The app now compiles nearby sidewalks as polygonal surfaces. It subtracts the
carriageway, building footprints, water, gardens and parking areas; preserves
mapped pedestrian areas and their holes; joins sidewalk bends using the road
renderer’s own turn footprint; and extends paving to nearby, parallel building
frontages. Inference remains bounded: a distant building does not establish that
the intervening garden, yard or forecourt is a public sidewalk.

A source-way street-section resolver interprets left/right, explicit absence,
separate mapping and width units. Navigation uses the same side semantics and
samples the laterally shifted surface. The app’s pedestrian-feature policy is enabled; it previously discarded every mapped sidewalk before compilation. Separately mapped paths now receive the same close-frontage inference as roadway-side paving. Solid crossing ribbons are suppressed so pedestrian connectivity does not paint a second surface over asphalt. The map request now includes ordinary
at-grade walking ways; the previous query selected pedestrian ways only when
certain structure tags were present. The generalized map adapter preserves
per-side tags when its provider supplies them.

The pavement worker operates on a resident neighborhood, with one acknowledged
cell in flight. It uses integer polygon operations and constructs a continuous
outline for each street side. The main thread applies the accepted terrain and
road-profile clearance, publishes rendering and walking contact together, and
stages replacements before retiring the old coverage. Adjacent cells share
material batches. Movement, terrain/road publication and editable-world change
notifications request refreshed coverage.

Where width is inferred, mapped on-street parking contributes to carriageway width; explicit total widths are preserved and adjacent parking bays are excluded. Orientation-based fallback dimensions remain estimates. The source distinction follows [OSM street parking](https://wiki.openstreetmap.org/wiki/Street_parking) and [carriageway width](https://wiki.openstreetmap.org/wiki/Key:width).

Road batches now have world-space asphalt UVs and reuse the existing asphalt
textures. Pavement uses a deterministic light-concrete slab diffuse texture, with the bundled normal and roughness maps when available. This separates paving visually from the brown urban-ground material. Replacement road meshes are staged before disposal, and the road mesh
collection is replaced so cached ground queries cannot retain disposed meshes.
Road triangles receive additional samples where their interiors disagree with
the terrain; planar roads retain their original triangle count. A spatial index
of the published road triangles gives the walking and vehicle fast paths exact
contact at their own coordinates, without scanning regional meshes. Physical
support ends at the published asphalt boundary.

The affected ownership boundaries are source acquisition and normalization,
road/sidewalk geometry, terrain sampling, world publication and reset, walking,
pedestrian navigation, vegetation exclusion and editable-world notifications.
No production deployment or GitHub publication is part of this work.

## Evidence and limitations

| Check | Evidence level | Result |
|---|---|---|
| Width units, side tags, frontage boundaries, road turns, holes, obstacles and resident coverage | Executed module tests | Passing at the latest targeted run |
| Mesh/contact agreement, failed replacement retention and superseded-world disposal | Executed runtime tests with controlled renderer/worker adapters | Passing; these are not GPU tests |
| Full current contract suite | Executed tests, one test process at a time | 394 passed; includes corner and cell-boundary regressions, terrain curvature and slope contact, cancellation/disposal, deferred startup ordering and renderer menu/resume lifecycle checks |
| Source/import graph | Executed source gate | Passed on the final source revision |
| Baltimore walk from road onto sidewalk | Actual local WebGL app and normal movement controller | Sidewalk contact at y=4.8910748, player eye at y=6.5910748; screenshot and UI data retained |
| Baltimore movement across coverage threshold | Actual local WebGL app, drone movement | New coverage published after movement; UI data and overhead image retained |
| Dense San Francisco frontage cell | Captured public-map input, offline reproduction and CPU profile | Old path spent approximately 11 seconds in Clipper containment repair. Continuous side outlines reduced the same compile-and-mesh operation to about 66 ms |
| San Francisco neighborhood publication | Actual local WebGL app | With pedestrian inputs restored: 141 cells, 35,105 top triangles and 72 draw calls. The captured frontage rebuild took 7.2 seconds; the earlier narrow-path publication took 2.5 seconds |
| Baltimore with mapped paths enabled | Actual local WebGL app | 137 cells, 27,632 top triangles, 70 draw calls, 2,161 mapped sidewalk inputs; publication took 2.6 seconds. Final overhead capture retained |
| Hilly road visual quality | Actual local WebGL inspection | Road contact matches the rendered road (75.8801498), and mapped sidewalk contact matches pavement (78.6645504). Street-level and overhead inspection performed; full release-quality acceptance remains open |

Saved screenshots and UI diagnostics are in [evidence-2026-09-12](evidence-2026-09-12/).
The three small public-map fixtures in `tests/fixtures/streets/` have their own
provenance and attribution. The Baltimore fixture was a completed cell, not the
exact cell from an earlier timeout. The San Francisco fixture reproduced the
polygon performance defect directly.

Earlier floating-kernel errors, worker timeouts and interrupted city runs are
failed or interrupted evidence. They are not counted as successful checks.
The broad app still loads many thousands of roads and buildings; this work has
not established a frame-time or memory certification for the entire product.

Counts of inferred frontages are per compilation segment and can repeat across cells; they are not counts of distinct buildings. Earlier mapped-path counts cover the loaded dataset; the final runtime reports only resident input counts. Rendered pavement remains bounded to the resident neighborhood.

The browser runs encountered unavailable detailed-provider requests and used
provider fallbacks. Inferred widths/frontages must not be represented as surveyed
geometry. The historical metre/world-unit contract still spans multiple road,
vehicle and terrain consumers; this repair does not claim a complete dimensional
migration. Crossing paint and lowered kerbs now have source-semantic, geometry and controlled WebGL checks (see below). Real-location ramp coverage, surveyed plaza boundaries and arbitrary edited building entrance thresholds still need acceptance cases before a professional release can be certified.

## Earlier local integration checkpoint

The final Low-graphics Baltimore load published 137 occupied cells, 29,359 top
triangles, 45,940 curb triangles and 70 pavement draw calls in 2,235 ms. Worker
compilation accounted for 1,441 ms. Resident input filtering selected 408 roads,
464 buildings and 277 mapped sidewalks from a loaded region containing 18,444
roads and 26,621 buildings. Earlier intermediate timings above are historical;
an intermediate full-carriageway union rebuild took 18,905 ms before the resident
input change. Different provider responses and graphics settings mean these are
observations, not a controlled benchmark.

Actual walking contact was 9.108943668, exactly matching the rendered pavement
sample, with the player eye 1.7 units above it. After normal controller movement,
contact and pavement both measured 9.253329818. Final walking and overhead
screenshots and the contact JSON are retained in the evidence folder. The overhead
inspection shows connected paving between nearby frontages and carriageways.

A fresh Medium-graphics run became unresponsive and was closed. A native process
sample measured a 3.6 GiB renderer footprint; it did not identify the responsible
JavaScript function. The subsequent Low run completed, but this does **not** prove
Medium graphics caused the failure or that the broader loading defect is fixed.
Graphics were restored to Low and the owned test world was closed.

**Release status: local testing candidate, not professional-release acceptance.**
At this checkpoint, the remaining acceptance blockers included the unresolved load stall, visual intersection markings and curb ramps, the legacy dimensional contract, and broader location/device performance coverage. The follow-up below records the subsequent crossing and corner work; it does not certify release readiness. The local test also logged a
Firebase App Check reCAPTCHA error; connected-service readiness was not tested.

## Reproduce locally

Start the existing local preview server with `node scripts/serve-local-preview.mjs`
and open `http://127.0.0.1:4192/app/`. The normal UI does not show verification tools.
Adding `?streetDiagnostics=1` exposes publication counts and walking/surface
inspection controls. Adding `streetFixture=1` also exposes the current worker
input for a local geometry reproduction; it is intentionally opt-in.

Run the current checks sequentially after closing the test world:

```sh
node scripts/verification/source.mjs
node scripts/verification/current-contracts.mjs
```

Resource handling follows the owner’s 8 GiB Mac constraint: no subagents,
no copied dependency tree and one test world at a time. Dependency directories
are reused through ignored local symlinks. Earlier saved work and Git history
are preserved.


## Follow-up: reported city corners and crossings

The owner reported visible strips and lowered square corners near 39.3098,
-76.6150. Direct scene raycasts confirmed that the squares were exposed terrain,
not lighting artifacts. The first small-recess repair did not close the case.
The captured geometry then identified two separate causes:

- Straight-wall frontage bands omitted the space around an outside building
  corner. Bounded polygon closing now includes the nearby building footprint,
  followed by exact road/building/land-use subtraction. Context extends beyond
  each worker cell before clipping, avoiding artificial cell-edge curbs.
- The conservative frontage search stopped short of attached urban buildings.
  Shared footprint vertices now establish stronger attached-building evidence,
  allowing a wider search for the actual wall. Isolated buildings retain the
  shorter search. The 24-metre extension is an inference limit, not a prescribed
  sidewalk width or a surveyed public-access claim.

All three formerly exposed test points on the two corners now raycast to the
sidewalk mesh. `reported-corners-final-3d.png` and
`reported-corners-final-contact.json` retain that actual-world evidence.

Crossing ways retain their source tags and tagged crossing/kerb nodes. Supported
marked crossings are clipped to carriageway polygons and draped onto the accepted
road triangles. Explicitly unmarked crossings remain unpainted. Lowered/flush
kerbs generate a locally refined ramp with the same triangles used for contact.
No lowered curb is inferred solely from traffic signals. These distinctions
follow [OSM crossing markings](https://wiki.openstreetmap.org/wiki/Key:crossing:markings)
and [OSM kerb mapping](https://wiki.openstreetmap.org/wiki/Key:kerb).

The small real-WebGL test at `scripts/verification/street-scene.html` exercises
the actual worker and publication runtime with synthetic source geometry.
It visually verified crossing paint, the concrete material, and a ramp meeting
road contact at y=0.1800000072. This is controlled rendering evidence, distinct
from the actual Baltimore location. Its ramp count includes repeated references
across worker cells and must not be presented as a count of distinct crossings.

Ground fallback no longer raycasts the indexed pavement meshes a second time,
or considers their paint/curb faces as fallback walking support. Detailed startup
phase tracing remains opt-in. The historical Medium stall is not considered
resolved merely by passing geometry tests.


### Later Medium-graphics check

The Medium run at the reported street completed and remained interactive.
It published 123 occupied cells, 27,747 pavement triangles, 41,354 curb triangles
and 3,110 marking triangles in 7,846 ms (6,161 ms worker time). This provider
response contained 369 resident pedestrian inputs; earlier responses at the
same location had no resident mapped sidewalks. These differing inputs prevent
using the timings as a controlled performance comparison.

Normal walking then reached pavement at y=25.3776158082 with the eye at
27.0776158082. The pavement index returned exactly the same support height.
The final concrete appearance was inspected at sunset and with the Day control.
See `reported-street-concrete-day-medium.png` and
`reported-street-medium-walk.json`. One successful Medium run means the earlier
stall was not reproduced in this case; it is not an all-device stability claim.


### Menu rendering and final verification status

After the successful Medium street check, changing locations through the globe
became unresponsive. Source inspection found that the old regional city continued
rendering behind the title globe even after `gameStarted` became false. The core
render system now stops city drawing at the menu and resumes it on entry.
Executable lifecycle tests cover both direct rendering and the composer path,
including repeated menu frames with no city draws or renderer measurements.

A fresh browser attempt after that change also became unresponsive during entry;
the browser inspection timed out, and the owned tab was closed. Consequently,
the lifecycle tests establish the renderer gate, but the complete browser
menu/change-location journey remains **unverified**. The broader loading stall is
**unresolved**, and another heavy retry needs a concrete diagnosis first.

Final source gate: passed. Final current-contract suite: **379 passed, zero
failed or skipped**. These checks ran sequentially with no world test active.
The added cell-boundary regression compares the same frontage/corner geometry
with different worker cell sizes. No coordinate-specific production rules were
introduced. The captured Baltimore coordinates appear only in the fixture and
verification evidence.

All owned browser tabs are closed. Graphics were restored to Low through the
settings UI; the local preview server remains available for the owner's testing.
There was no production deployment, main-branch update or GitHub push.


## Terrain and resource follow-up

The road-edge height sampled by the sidewalk now comes from the rendered road at
that station, including changing cross slope and terrain corrections between
segment endpoints. The worker's regular paving grid is refined locally where
terrain bends inside a triangle; curbs follow the same base/top samplers.
Planar slopes keep their original triangle count. The error target is 0.03 world
units with at most three refinement levels. This is bounded approximation, not
an exact terrain-facet intersection or a guarantee for arbitrary cliffs.

Walking contact now indexes the final Float32 render buffer directly. The worker
no longer sends a second object graph of triangle points. Disposing a publication
clears its contact index, staging arrays and mesh references. Superseding a build
or resetting the world terminates the old worker and settles its pending request
immediately, including cancellation while a worker has not replied. Synchronous
worker-send errors clear their timer and handlers too.

Optional post-startup jobs now run sequentially; an active job cannot be queued
a second time. Independent module downloads remain concurrent, while gameplay
runtime construction was already ordered. Environment-context compilation now
calculates a feature's center once per compilation, avoiding repeated full
polygon scans across 25–81 cells. Its cache is local to that compilation so a
later world cannot inherit stale coordinates. The title globe already stops its
own animation loop on close; the earlier city-renderer menu gate is retained.

### Executed checks

- **394 current contracts passed**, zero failures or skips; source gate passed.
- Runtime tests cover flat, uphill, downhill, cross-slope, below-sea-level and
  high-elevation contact. Curved rises and hollows check interpolated pavement
  clearance as well as matching curb/contact vertices. Existing street tests
  retain cell-seam, mapped-side semantics and protected-area exclusion coverage.
- Actual WebGL scene inspection covered uphill, cross-slope, high-elevation and
  rolling terrain. The rolling case used the real worker and publication path:
  624 additional terrain-refinement triangles, 96,948 position-buffer bytes,
  with ramp and road contact both at y=0.1800000072. The images and raw results
  are in the evidence folder. These are synthetic geometry cases, not additional
  real-city acceptance runs.
- Five sequential real-WebGL replacements held at **16 renderer geometries,
  one texture, 18 scene objects and 12 pavement meshes**. No pavement worker
  remained active after any replacement. No warning or error was logged in that
  controlled scene. The JavaScript heap readings increased from approximately
  17.9 MB to 27.3 MB during the five iterations; garbage collection was not
  forced, and this short check does **not** establish a steady-state heap bound.
- Separate lifecycle tests cover eight replacements, disposal of old contact
  and owned resources, stalled-worker cancellation, and synchronous send failure.

### Inspect the full app without adding a monitoring loop

Open `/app/?streetDiagnostics=1`, expand **Street surface verification**, and
choose **Inspect memory and running work**. Inspect twice to see which registered
systems advanced between readings. The report includes browser-reported JS heap
when available, unique scene geometry-buffer bytes, renderer geometry/texture
counts, the pavement worker state and deferred-job state. It performs work only
when clicked. Geometry bytes exclude textures, driver allocations and other tabs;
JavaScript heap is not the browser's total footprint.

The owner's reported 3.3 GB browser usage has **not** been attributed to one
subsystem or proven reduced by this pass. The full-city intermittent entry stall
also remains an open integration issue: no further heavy city instance was
started alongside the owner's browser during this pass. These targeted repairs
and bounded scene checks establish specific improvements, not worldwide release
certification. Real-map bridge/tunnel transitions, arbitrary cliff/stair cases,
terrain-edit transitions and sustained city-load memory measurements remain
required acceptance work. The preview server is retained; all owned test tabs
are closed. No production or GitHub changes were made.
