# Complete pavement coverage with bounded memory

The current implementation is incomplete. Roads and buildings cover a larger
loaded region than pavement areas. `street-pavement-runtime.js` filters input to
a 384-unit radius, compiles that window, and replaces the entire publication
after the player moves 128 units. It has no distant area representation. A
successful 144-cell publication therefore leaves visible streets without the
same sidewalk treatment. Increasing this radius alone is not an acceptable fix:
the existing window already took 28–37 seconds to publish in the measured cities.

## What changed in this verification pass

The loading message now describes nearby grid cells. `street-coverage.js`
measures required street-side and mapped-sidewalk length inside and outside the
publication window. The diagnostic quality assessment fails when loaded streets
requiring sidewalks remain outside it. This is an audit of compilation scope;
it cannot prove that every required sidewalk polygon was actually created.
Explicit absence, elevated structures and unresolved rural requirements are
handled separately. Data missing before the loaded input cannot be recovered by
this metric.

The material visibility repair, numerical clipping repair and repeatable test
protocol are implemented. The residency redesign below is **not implemented**.

## Replace the publication model

1. **Index the complete loaded location once.** Retain stable source IDs,
   semantic exclusions and footprint context in a spatial index. Compute the
   required street cells from that index, including separately mapped sidewalks
   and mapped pedestrian areas. Moving the player must not recreate this index.
   Publish required/available/missing cell counts alongside length coverage.

2. **Compile shared area outlines before assigning display detail.** Curbs,
   carriageways, building fronts, explicit paving and protected land need one
   planar ownership solution per cell with neighboring context. Close gaps only
   where mapping or frontage evidence supports paving. An absent building is
   not permission to pave an entire block. Keep evidence classification with
   the resulting areas so missing source data is distinguishable from a failed
   compiler operation.

3. **Provide distant areas and nearby detail from those same outlines.** The
   distant representation needs fewer terrain subdivisions and no tiny curb or
   paint geometry. Nearby cells add detailed terrain conformance, curbs,
   crossings and contact. Both representations must retain the same outer
   boundaries. A distant road should not lose its surrounding paved area just
   because detailed contact geometry is unloaded. Select detail by screen error
   and distance, including drone/aircraft views, rather than by vehicle position
   alone.

4. **Retain unchanged cells and replace only affected cells.** Keys must include
   source/topology, accepted terrain and detail revisions. Keep an old accepted
   cell visible until its replacement and contact data are ready. Release its
   buffers and index entries after the swap. A terrain edit invalidates affected
   cells and their shared seam context; a camera move changes residency and
   detail selection. These are different events.

5. **Bound the queue and resource ownership.** Use one worker, one acknowledged
   result at a time, near-first priority and cancellation of stale requests.
   Keep plain source data, polygon caches, mesh buffers, contact indexes and GPU
   textures under separate measured budgets. Avoid retaining both object-heavy
   triangle copies and their final typed buffers. Prepare upcoming cells ahead
   of travel; do not compile the whole region synchronously before first play.

6. **Resolve the height-field discontinuities before reducing refinement.**
   Monaco's full runtime expanded 33,544 base triangles into 432,538. Capture
   the actual accepted ground and at-grade road-contact field where refinement
   concentrates. Test it for jumps and inconsistent neighbor sampling. Fix the
   shared field or its ownership boundaries, then tessellate to a measured
   error. Silencing this signal with a lower refinement limit can reintroduce
   terrain penetration. Bridges and tunnels must retain their own surfaces and
   cannot supply ground-sidewalk elevations.

## Acceptance of the replacement

Use the same recorded routes in Baltimore, Monaco and San Francisco. Verify the
whole loaded domain's required-cell inventory, distant visible pavement, and
near-detail coverage along each route. Record unknown or missing source areas
explicitly. At fixed stops capture street-height and overhead views, then repeat
after leaving, returning and changing camera orientation. Compare shared cell
seams, polygon ownership and render/contact height against the accepted terrain.

Run a repeated out-and-back traversal to prove unchanged cells are reused and
memory stabilizes. Assert that cache eviction releases GPU buffers and contact
indexes, stale workers cannot publish, and a cancelled initial load can recover.
Include delayed terrain arrivals and alternating detail levels. The same tests
must detect deliberately missing cells, buried triangles, raised bridge leakage
and leaked resources. A percentage based only on scheduled cells is insufficient.

First play must meet the existing 25-second target on the 8 GiB reference Mac;
the initial JavaScript heap acceptance budget is 768 MiB. Measure total browser
and GPU resources separately where available. A city that loads but misses these
budgets fails performance acceptance. The present Monaco and San Francisco runs
fail; no new full-city performance result is claimed for the small compiler
optimization in this pass.

## Established practice

Epic's [World Partition documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
describes a persistent world divided into cells, loaded by streaming sources.
Its [HLOD documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition---hierarchical-level-of-detail-in-unreal-engine)
describes less expensive representations for distant content. These support the
separation of world coverage from resident detail. They do not supply this app's
OSM frontage geometry or terrain contracts. The design above applies those
principles to the app's own source, compiler, Three.js renderer and contact
ownership; installing an Unreal feature is not the implementation proposed here.
