# Pavement coverage and terrain integration

The street system uses one footprint compiler for both nearby sidewalks and
complete loaded-location coverage. The detailed window remains 768 world units
across. Its 144 possible grid cells are a local working set, not the number of
sidewalks in a city.

## Rendering and contact

Nearby pavement has indexed geometry, raised curbs, crossings and walking
contact. Contact queries interpolate the published render vertices. Terrain
revision changes invalidate this detail; the previous publication remains until
its replacement is ready. Unchanged flat worker packets are reused from a
bounded 16 MiB cache. The packet fingerprint includes geometry and semantic
inputs, so a changed source cannot reuse stale geometry.

The distant layer draws the same compiled footprints in the existing terrain
and ground-cover materials. It adds no pavement meshes or draw calls. It follows
the rendered terrain by construction and supplies visual coverage while nearby
curbs and contact remain separately managed. Courtyard holes and obstacles are
preserved. The near window masks out the distant material treatment beneath its
raised surfaces.

A worker indexes the entire loaded source region, including independently
mapped sidewalks and paved areas. Cells with no pavement work are excluded using
the same rules as the detailed compiler. Every applicable cell is then compiled
and written to a sparse texture atlas. Diagnostics distinguish source cells,
applicable cells, completed cells, nonempty cells and painted area. They do not
call 144 cells complete-location coverage.

The atlas is at most 4096 by 4096 single-channel texels, with a separate address
table. Resolution is one world unit per texel for the measured cities; larger
inventories choose a coarser distant resolution without discarding cells. This
is distant visual detail, not a survey-quality reconstruction or a replacement
for nearby curb geometry. Existing source gaps and ambiguous setbacks remain
uncertainties; the compiler does not invent buildings to close them.

## Scheduling and lifecycle

Only one acknowledged geometry/coverage worker chunk is active at a time. Near
publication waits for the current coverage chunk before starting. Completed
coverage does not rebuild when the camera moves or terrain heights change.
Changed source collections rebuild the coverage, retaining the previous atlas
until the replacement is complete. World reset terminates workers, clears the
packet cache, restores material hooks and releases textures and geometry.

Terrain refinement for nearby pavement bisects offending edges rather than
splitting all three edges repeatedly. The existing error tolerance and spatial
scale remain tested. This reduces unnecessary work on narrow frontage triangles;
it does not waive terrain-clearance checks or make a failed city acceptable.

## Validation

Run `npm run verify:streets` for the sequential contract suite, frozen hill
matrix and source checks. Use the integration page at
`/scripts/verification/street-streaming.html` for complete coverage, movement,
return and resource disposal. The same compiler, worker and renderer integration
are used there, with a generated slope and captured layouts. It is not a full
city load.

Actual city routes and resource measurements are recorded in
[the September 13 validation report](STREET_VALIDATION_2026-09-13.md).
Release acceptance also requires the 25-second first-play and 768 MiB JavaScript
heap targets. Earlier actual city runs fail those budgets. A passing component
check does not override those failures or certify every location visually.

## Reference architecture

Epic's [World Partition documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
describes a persistent world divided into cells loaded by streaming sources.
Its [HLOD documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition---hierarchical-level-of-detail-in-unreal-engine)
describes less expensive distant representations. This implementation applies
that separation to this app's footprint compiler, Three.js terrain materials
and nearby contact geometry; it does not depend on Unreal Engine.
