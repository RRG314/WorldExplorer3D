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
textures. Pavement reuses the bundled concrete diffuse, normal and roughness maps when available, with an owned procedural fallback. Replacement road meshes are staged before disposal, and the road mesh
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
| Full current contract suite | Executed tests, one test process at a time | 371 passed; includes the final asphalt-edge guard, resident-input filtering, parking widths and curb-clearance checks |
| Source/import graph | Executed source gate | Passed on the final source revision |
| Baltimore walk from road onto sidewalk | Actual local WebGL app and normal movement controller | Sidewalk contact at y=4.8910748, player eye at y=6.5910748; screenshot and UI data retained |
| Baltimore movement across coverage threshold | Actual local WebGL app, drone movement | New coverage published after movement; UI data and overhead image retained |
| Dense San Francisco frontage cell | Captured public-map input, offline reproduction and CPU profile | Old path spent approximately 11 seconds in Clipper containment repair. Continuous side outlines reduced the same compile-and-mesh operation to about 66 ms |
| San Francisco neighborhood publication | Actual local WebGL app | With pedestrian inputs restored: 141 cells, 35,105 top triangles and 72 draw calls. The captured frontage rebuild took 7.2 seconds; the earlier narrow-path publication took 2.5 seconds |
| Baltimore with mapped paths enabled | Actual local WebGL app | 137 cells, 27,632 top triangles, 70 draw calls, 2,161 mapped sidewalk inputs; publication took 2.6 seconds. Final overhead capture retained |
| Hilly road visual quality | Actual local WebGL inspection | Road contact matches the rendered road (75.8801498), and mapped sidewalk contact matches pavement (78.6645504). Street-level and overhead inspection performed; full release-quality acceptance remains open |

Saved screenshots and UI diagnostics are in [evidence-2026-09-12](evidence-2026-09-12/).
The two small public-map fixtures in `tests/fixtures/streets/` have their own
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
migration. Detailed curb ramps and crosswalk markings, surveyed plaza boundaries and arbitrary edited
building entrance thresholds also require explicit acceptance cases before a
professional release can be certified.

## Final local integration check

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
The remaining acceptance blockers include the unresolved load stall, visual
intersection markings and curb ramps, the legacy dimensional contract, and
broader location/device performance coverage. The local test also logged a
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
