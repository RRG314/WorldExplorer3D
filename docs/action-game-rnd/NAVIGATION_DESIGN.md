# Navigation design

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

`living-world/navigation-graphs.js` already compiles pedestrian and traffic graphs from geographic transport/surface data. Preserve roads, structural levels, walk offsets and generated identity. Do not replace them with a manually authored whole-city navmesh.

Proposed hierarchy: geographic route graph → local walkable region/interior link → short-horizon steering and collision. Vehicle paths remain transport-specific. Entrances connect indoor and outdoor spaces only when door, elevation and permission permit. Bridge/tunnel levels must never connect solely because X/Z coordinates overlap.

[Recast introduction](https://recastnav.com/md_Docs_2__1__Introduction.html) and [FAQ](https://recastnav.com/md_Docs_2__3__FAQ.html), accessed 2026-09-27 UTC, describe navigation-mesh generation and tiled/dynamic use. Evaluate a bounded per-tile mesh only where existing graph plus local collision fails (complex interiors/crowds). No Recast dependency is currently added.

Dynamic obstacles use spatial occupancy and local avoidance first. If a persistent shared Block closes a route, increment the relevant navigation revision and replan affected actors. Cover points should be derived from accepted colliders, with reachable approach and exposure checks; an arbitrary point behind a mesh is not valid cover.

Tests need disconnected islands, narrow door, ramp/stairs, bridge above road, moving vehicle, closed door, shared Block insertion/removal and world teardown. Profile route queue time and stuck actors before choosing Worker/Wasm acceleration. Geometry snapshots and stable IDs are prerequisites for off-thread work.
