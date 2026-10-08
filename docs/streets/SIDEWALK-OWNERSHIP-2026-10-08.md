# Sidewalk ownership repair — October 8

Owner report: Light Street, Baltimore, 39.2867, -76.6121, heading 249°,
preview 4413d5d. Pavement looks like a web of strips. The repair must apply to
the shared street system and preserve roads, bridges, tunnels and coverage.

## Findings from the current runtime

The fallback-provider scene reproduced the report. It retained 18,912 roads,
44,090 detailed buildings and 426 road meshes. Four conflicts contribute:

1. Road-offset inferred sidewalks and separately mapped pedestrian paths each
   drew a curb. They lacked a common geometric ownership rule.
2. Generic pedestrian routing lines could expand toward buildings. Shared
   building vertices also authorized 24 metres of extra frontage, despite
   providing no evidence of public paving.
3. Mapped pedestrian areas already had material-bearing land-use meshes, but
   the pavement compiler drew white concrete over them. Coarse path ribbons
   could cover the same areas outside resident pavement.
4. Brick and concrete textures are published under the engine's direct PBR
   handles; looking only in the terrain texture registry silently substituted
   generic pavement for brick plazas.

Shortbread's lean schema lacks several full OSM sidewalk and width attributes.
Road-class defaults therefore remain approximate. A tested road-width inference
experiment did not reliably fix this report and was removed before acceptance.
Its unapplied source is retained with its diagnostic output. No new road width,
lane, bridge or tunnel profile inference is part of this repair.

Relevant source semantics: [OSM sidewalks](https://wiki.openstreetmap.org/wiki/Sidewalks),
[separately mapped sidewalks](https://wiki.openstreetmap.org/wiki/Tag:footway%3Dsidewalk),
and [Shortbread schema](https://shortbread-tiles.org/schema/1.0/).
Routing centerlines are not surveyed pavement polygons.

## Implementation and ownership

Associate only overlapping, nearly parallel ground pedestrian/road segments.
The associated mapped path replaces that road's redundant inferred strip over
the corresponding interval. Inferred urban sidewalks connect to that path;
mapped planting, water, buildings and other carriageways still cut the result.
A generic standalone route cannot authorize paving its surroundings. Explicit
sidewalk widths remain authoritative. Ordinary frontage is bounded to 7 metres
beyond a carriageway; touching building vertices grant no additional reach.

Existing mapped pedestrian meshes retain their material, holes and boundaries.
The compiler and coarse-path renderer subtract these areas. A contact-only
world-space view of their accepted geometry joins the existing resident pavement
index, with cancellation and disposal through its existing lifecycle. Batching
preserves pedestrian-area identity. No duplicate plaza mesh is introduced.

Compile-only ownership masks are deduplicated in fingerprints and excluded from
main-thread terrain/contact packets. Existing bounded cache limits remain.
Transport source records, road meshes, route profiles and collision generation
are not replaced by the pavement compiler.

## Evidence ledger

| Check | Result and scope |
| --- | --- |
| Original runtime capture | Reproduced; `output/verification/sidewalk-layout-before` |
| First association/frontage attempt | Rejected visually; white plaza overlay remained |
| Mapped-area material attempt | Overlay fixed, curb/path gaps remained; not treated as complete |
| Width inference experiment | Removed; did not reliably resolve this layout |
| Normal provider diagnostic | Exact OSM became available; preserved separately under `sidewalk-layout-connected`, not used as a like-for-like fallback comparison |
| Forced-fallback final geometry | Actual installed Chrome; same 18,912 roads, 44,090 buildings and 426 road meshes; zero page errors. Connected sidewalk bands and distinct brick plazas. All screenshots inspected. `sidewalk-layout-final-fallback` |
| Focused source checks | 33 pass after final cache/ownership changes; captured Light Street, crossing/planting exclusions, mapped-area holes, slope interpolation, world-space contact, cancellation, storage and carriageway ownership |
| First complete source run | 2,169/2,170; one older occlusion fixture depended on the rejected 24-metre frontage extension. The fixture was moved inside the new bounded reach, retaining actual occlusion sensitivity. Not relabeled as passing |
| Final source chain | All 2,170 tests pass, plus dependency, ownership, boundary-type, inventory and test-sensitivity checks |
| Prescribed real keyboard driving | Both movement bursts pass; zero game/provider errors; images inspected. `sidewalk-final-actions-complete`. This is movement/input evidence, not a full route-following or art certificate |
| Multi-location pavement | All six Monaco/San Francisco hill cases pass. Captured Baltimore, Monaco and San Francisco layouts preserve coverage at 32/64/128 output sizes with zero area beyond rounding allowance |
| Baltimore bridge regression | All nine checks pass; 742 joins, zero discontinuities, maximum vertical delta 0.23025 m within the unchanged 0.25 m threshold; no runtime errors or missing local assets. Screenshot inspected. `sidewalk-bridge-endpoints` |
| Monaco tunnel drive | All six checks pass: entered and exited, zero junction steps, remained on the carriageway, no airborne frames or runtime errors. Approach, bore and exit images inspected. `sidewalk-monaco-tunnel`. This certifies the tested driving path, not the surrounding hillside art |
| Packaged or hosted acceptance | Pending; source evidence above does not certify the old hosted package |

Earlier road and plaza tests expecting unsupported 19–24 metre fill were changed
deliberately: shared building vertices are not evidence for that fill. Mapped
wide plazas remain supported. The carriageway occlusion test now places both
sightlines within the permitted search distance, so disabling occlusion would
still fail it. No road continuity threshold or coverage requirement was relaxed.

The viewport still reflects approximate generalized road widths and ordinary
terrain/material limitations. This repair is not a claim of surveyed curb
geometry everywhere, complete world streaming, or full release acceptance.

The first prescribed movement run completed both bursts without game errors but
its isolated Node process retained open service connections after the browser
closed. It reached the harness deadline. The final verifier explicitly exits
only after its normal browser-close promise resolves; that final run completed
with status 0. Earlier output is retained as incomplete harness evidence.
