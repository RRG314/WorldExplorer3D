**Later geometry repair:** See [Street geometry repair](STREET_GEOMETRY_REPAIR_2026-09-13.md)
for implemented terrain/frontage/marking corrections and subsequent live contact
evidence. The rejected initial result below is retained as failure history.

> **Visual acceptance failed — Sacramento Street, San Francisco.** The user's
> September 13 screenshot shows buckled sidewalks and separated road surfaces.
> The subsequently observed 3,232/3,232 coverage counter does not establish
> correct geometry. This supersedes any implication below that completing the
> coverage run would finish San Francisco acceptance.
>
> A captured 65×65 ground/contact grid and actual road vertices are preserved in
> `evidence-2026-09-13/sf-buckled-ground.json`. Maximum observed road-vertex
> separation is about 3.345 world units; the nearby one-unit ground samples
> include a height change of 0.818. These measurements establish a mismatch;
> they do not by themselves determine whether the originating error is the
> elevation source, transport grading, or publication order.
>
> The previous at-grade audit only rejected negative clearance. It now detects
> excessive positive clearance as well, excludes structure-owned roads, and
> exposes those failures to street readiness diagnostics. Five targeted audit
> tests pass, including a compact capture from this failed scene. **Those are
> passing defect-detector tests, not a repaired-geometry or visual pass.**
>
> The visual repair remains open. Road profiles, graded terrain, sidewalk
> elevations and building frontage constraints must agree before release.
> No city-specific flattening or arbitrary global road lowering was applied.

# Roads and pavement validation — September 13, 2026

The local R&D branch now provides complete loaded-source pavement coverage
independently of the nearby detail window. Monaco has completed its real-world
coverage run and a movement check beyond the original detail rectangle.
San Francisco validation of the final implementation is in progress.
**Whole-app release acceptance remains open:** measured loading time and
JavaScript heap still exceed the existing targets.

## What the implementation changes

The former 144-cell count is the local working window, not a city-wide sidewalk
count. One source snapshot and footprint compiler now drive both nearby raised
surfaces and a distant terrain-material layer. The distant layer paints the
compiled pavement areas directly on existing ground, preserving obstacle holes
and disconnected areas. It cannot sink through a second terrain mesh or exhaust
memory through repeated terrain tessellation. The measured city uses one-world-
unit distant texels; nearby curb geometry and walking contact retain their
separate, finer representation.

Nearby surfaces share exact Float32 vertices, and walking contact reads those
same indexed buffers. A bounded packet cache reuses unchanged geometry inputs.
Only an acknowledged worker chunk runs before a nearby rebuild starts. Loading
also suspends ordinary scene simulation and rendering. The unused airplane
visual is no longer constructed automatically after a walking/driving startup.

## Repeatable verification

`npm run verify:streets` passed **90 contract tests**, all **six frozen hill
cases**, and the source gate. Checks cover polygon holes, translation, terrain
clearance, render/contact agreement, stale publications, worker-message cloning,
cache invalidation and disposal. Mask allocation tests include 1,758-, 3,337-
and 12,000-cell inventories without discarding cells. These are CPU checks;
they do not certify every real city visually.

The browser integration at `/scripts/verification/street-streaming.html` completed
**340/340 applicable cells** across four districts. Of 384 source cells, 44
contain no applicable pavement. It uses captured San Francisco layouts on a
generated slope, not a complete actual city. Both distant and nearby district
views were inspected. Distant coverage added **zero meshes/draw calls**, with
1,404,192 bytes of retained atlas/address data. Returning reused **75/75** detail
packets in 709 ms versus 4,719 ms initially. After disposal, GPU counters returned
to baseline: **1,173 geometries, zero textures**. Relevant artifacts are
`terrain-mask-return.json`, `terrain-mask-disposed.json` and `terrain-mask-far.png`
in `evidence-2026-09-13`.

## Monaco: actual Chrome world

Origin: **43.7384, 7.4246**, temporary Low graphics. This loaded input contained
12,818 roads and 8,106 buildings; source inventories vary between live loads.

- Coverage completed **1,662/1,662 applicable cells** from 32,478 source cells.
- Coverage bounds: x −7,360 to 6,656; z −5,952 to 3,776 world units.
- Atlas/address storage remained **7,018,528 bytes**, with zero added pavement
  geometry and zero additional draw calls. The worker terminated on completion.
- The street and overhead views were inspected. The drone route ended at local
  **x −295.56, z 424.20**, outside the original z ±384 detail rectangle.
  Coverage remained complete and retained atlas bytes stayed unchanged.
- Nearby position buffers measured **3,762,516 bytes**, plus 2,839,728 index
  bytes. The earlier flat representation used 18,874,980 position bytes.
- At coverage completion, JavaScript heap measured **1,262,758,952 bytes**;
  after movement it measured **1,267,286,397 bytes**. This short observation is
  not proof of long-term heap stability and excludes other tabs/GPU allocations.
- First play: **92,817 ms**. This fails the 25-second target. Heap fails the
  768 MiB target, and near terrain refinement remains above its 8× warning budget.

See `monaco-terrain-mask-complete.json`, `monaco-terrain-mask-after-move.json`,
`monaco-terrain-mask-route-final.json` and the overhead/route screenshots. This
was a one-way city route; the controlled out-and-back cache check was performed
in the integration scene. No actual Monaco return-route pass is claimed.

## Failures that guided the repair

The earlier full-region geometry approach was rejected after actual tests. San
Francisco first failed because a live vehicle object was sent to a worker; the
message now contains only numeric coordinates. A corrected run then stopped at
1,433/3,337 cells when flat vertex buffers reached 16 MiB. Shared-vertex storage
alone was insufficient in Monaco: 595/1,758 cells exhausted its geometry budget
while draping the wider region. These failed runs are retained in the evidence,
not represented as passing tests.

That evidence led to the distant terrain-material representation. The nearby
window still refines against terrain and road edges, but the entire distant
region no longer duplicates those surfaces as geometry. Actual Monaco ground
and road samples are retained in `monaco-actual-ground.json` for further local
investigation without repeatedly loading a whole city.

## Remaining release requirements

Complete San Francisco's final run, preserve the Medium graphics preference,
and record any console or visual failures. Whole-app loading, the broader
building/road/vegetation memory footprint and excessive near terrain refinement
remain performance work. Full-city results must not be relabeled as release
passes merely because pavement coverage now completes. Missing source buildings
and uncertain setbacks also remain data limitations, not permission to invent
building footprints or pave every vacant plot.

All work and evidence are local to `steven/street-system-rd`. No GitHub push,
main-branch change or deployment was performed.
