# Roads, sidewalks, and the surrounding world

App R&D audit — 12 September 2026. Source baseline: `f88af9db`, branch `steven/street-system-rd`.

The main quality problem is structural: the app draws roads, mapped footpaths, paved areas, buildings, and pedestrian routes through separate pipelines. It has substantial terrain and transport engineering already, but no complete shared description of the street surface between the roadway and the building frontage. Making the existing ribbons wider cannot supply that missing relationship.

This report covers the Earth street system and its connected consumers. It does not certify the entire product. It records source inspection, reproducible baseline defects, and primary-source research. Full loaded-world visual acceptance has not been completed. The earlier small street prototype is not part of this baseline and is not evidence of worldwide readiness.

## Workspace and evidence

Work is isolated in `WorldExplorer3D-street-system-rd`, a new Git worktree of the app baseline. Prior prototype work is preserved separately. No dependency installation, renderer edits, deployment, or GitHub publication was performed for this audit. The checkout shares Git objects; it does not copy the prior dependency trees or build outputs.

The repeatable inventory scans all **696 JavaScript modules** under `app/js`; **149** mention the selected street/world contracts. The accompanying JSON records source hashes, imports, and line references. Those counts describe lexical dependencies, including comments, not 149 individually verified runtime owners. The ownership map below is based on targeted code inspection.

Run from this checkout:

```sh
node scripts/audits/street-system-inventory.mjs
node scripts/audits/street-system-probes.mjs
node --test --test-concurrency=1 tests/road-terrain-conformance-current.test.mjs tests/road-terrain-reconciliation-current.test.mjs tests/earth-traversal-current.test.mjs
```

The selected existing tests passed **9/9**. The probes reproduced four behavioral defects and a presentation-classification limitation. They are defect observations, not passing release acceptance tests. No real-world discrepancy rate, new renderer performance figure, or complete screenshot comparison is claimed.

## What is connected

| Stage | Existing owners | Consequence for the repair |
|---|---|---|
| Geographic data | `world/osm-loader.js`, `world/shortbread-source.js` | OSM and generalized tiles provide different detail. Preserve provenance, units, side tags, topology, and polygon holes. |
| Selection and budgets | `world/load-budgeting.js`, `world/load-style.js` | Roads, footways, buildings, and land areas have separate budgets. Missing neighbors can change the street solution. Track omissions and budget related features together. |
| Road semantics and topology | `world/compiler/transport-source-normalizer.js`, `transport-network-model.js` | Existing source-node relationships, access rules, bridges, tunnels, and generalized-data distinctions must survive. |
| Widths and building clearance | `world/road-cross-section-profile.js`, `world/building-road-footprint.js`, `world/load-building-pass.js` | Width restrictions occur within segments. A replacement cannot recover them by checking only endpoints or overwrite them with one nominal road width. |
| Road mesh and junctions | `terrain/rebuild.js`, `terrain/road-surface-geometry.js`, `terrain/road-junctions.js` | Individual road surfaces and compact junction caps do not define complete pedestrian corners, islands, or frontage areas. |
| Footpath presentation | `world/linear-feature-presentation.js`, `world/load-style.js` | Mapped sidewalk ways become width-based ribbons. This is a direct cause of the strip appearance. |
| Land cover and mapped paving | `surface-rules.js`, `world/surface-contract.js`, `world/load-landuse-pass.js` | Explicit paving and broad terrain cover have different owners. Neither currently supplies a complete street-space partition. |
| Terrain and vertical profiles | `terrain.js`, `terrain/rebuild.js`, `terrain/reprojection.js`, `structure-semantics.js` | Accepted ground, fallback elevation, terrain corridors, structures, and building bases must agree with final street heights. |
| Walking and driving contact | `ground.js`, traversal and vehicle consumers | `roadMeshY`, `urbanSurfaceMeshY`, and walking/driving surface selection must query the same accepted surface revision that is visible. |
| Pedestrians and traffic | `world/traversal.js`, `living-world/navigation-graphs.js`, `living-world/runtime.js` | Routes, road widths, direction, and height sampling must migrate with geometry. Footpath ribbons alone do not fix navigation. |
| Building edits and entrances | `editable-world/runtime.js`, building collision and entry data | Edits already invalidate traversal. A frontage solution needs spatial invalidation too, including changed footprints and entrance thresholds. |
| Vegetation and street furniture | `world/vegetation.js`, `world/furniture.js` | Placement must reserve actual paving, crossings, door approaches, and clear walking space. Existing roadside offsets are insufficient as a final placement authority. |
| Publication and reset | `world/load-support.js`, `world/load-reset.js`, `terrain/rebuild.js` | Publish terrain and surface dependencies coherently; handle cancellation, failure, reload, disposal, and stale work. |

The present finalization order publishes terrain, compiles transport, refreshes terrain surface profiles, then builds traversal and spawns the player. Editable-world presentation follows. This is an important lifecycle contract. Adding sidewalks after those steps without updating their consumers would leave stale contact, routes, or frontage geometry.

## Why the current result looks wrong

### 1. A mapped walking line becomes a strip

`linear-feature-presentation.js` builds ribbon edges using half the feature width. `load-style.js:222` supplies subtype defaults, including 1.8 for a sidewalk. A centerline is useful input, but it is not the boundary of a real city sidewalk. It does not describe the full space at a corner, a building setback, a plaza, or a tree opening.

The main road-material cache does not request the optional sidewalk material. The presence of a sidewalk helper elsewhere is therefore not proof that continuous sidewalks are rendered by the main road path. Flat materials, lack of texture coordinates in the road batch builder, and disabled shadow receiving on mapped linear surfaces further reduce depth and material definition. Material work is needed after geometry is coherent.

### 2. The app has some area data but flattens its meaning

The OSM query already requests `area:highway`; Shortbread also adapts street polygons. The problem is not simply a missing query. `surface-rules.js:80` maps both roadway areas and sidewalk areas into `paved`. The final mapped-landuse record in `load-landuse-pass.js:334` retains the outer points and source ID, but not the same full tags/hole metadata available in other paths. This does not prove that mesh holes were discarded during triangulation; it means downstream consumers cannot assume a uniformly rich area record.

Broad developed land should not all become pavement. WorldCover is background land classification, not a surveyed curb or property boundary. Restoring a blanket urban paving layer would hide some grass gaps while incorrectly paving gardens, courtyards, and setbacks.

### 3. Four defects are reproducible now

| Finding | Baseline observation | Why it matters |
|---|---|---|
| Explicit width units discarded | `width=6 ft` returns `6` from linear styling; six feet is 1.8288 metres. | A legitimate provider value can produce an excessively wide path. |
| Left/right route placement | For an eastbound source way, `sidewalk=left` produces a point at positive z, which is south in this app. | The route can appear on the opposite side from the mapped sidewalk. |
| Height sampled before lateral offset | On the probe surface `y=z`, the shifted sidewalk point at z=6.2 retains y=0.08 instead of 6.28 including the same bias. | Pedestrians can disagree with the surface on cross slopes. This is a synthetic demonstration, not a measured city elevation. |
| Per-side separate mapping ignored | `sidewalk:both=separate` still produces four directed inferred edges for one road segment. | Separately mapped sidewalks can receive duplicate inferred routes. |

These observations are in `baseline-probes.json`, produced by importing the real baseline functions. The area-category probe is an additional design limitation, not a fifth movement defect.

A further dimensional risk needs a systematic migration: `config.js` defines approximately 1.11 metres per world unit, while normalized `crossSection.widthMeters` is assigned to `road.width` and used against world coordinates. Before correcting dimensions, inventory all width consumers, inferred defaults, profile arrays, camera/vehicle clearances, and existing fixtures. A local multiplier in the renderer would leave those other systems inconsistent.

### 4. Terrain integration cannot be a final vertical offset

The app already modifies terrain for transport corridors and repositions buildings. Roads carry structure profiles; bridges and tunnels require distinct vertical layers. The repaired street should use those accepted profiles and solve curb, sidewalk, frontage, and terrain transition heights together. Sampling each new pavement vertex independently from raw elevation can recreate bumps and seams or bury entrances.

The baseline rebuild disposes previous meshes before completing replacement construction (`terrain/rebuild.js:426`). A failed rebuild can therefore affect visible coverage. Replacement construction should be staged, validated, and published with its contact and routing data, then retire the old revision. Terrain mutations also need a failure strategy; staging meshes alone is insufficient.

## What established systems teach us

[CityEngine's terrain and dynamic layout tutorial](https://doc.arcgis.com/en/cityengine/latest/tutorials/tutorial-2-terrain-and-dynamic-city-layouts.htm) treats connected segments, junction nodes, and blocks as related shape generators. It separately demonstrates aligning streets to terrain and terrain to street shapes. The applicable lesson is to construct coherent areas and reconcile their elevations, rather than merely overlay lines. Its heightmap workflow is not a drop-in replacement for this app's terrain implementation.

[Esri's Street Designer introduction](https://www.esri.com/arcgis-blog/products/city-engine/3d-gis/an-introduction-to-street-designer) shows sections composed of roadbed, sidewalk, parking, and vegetation lanes, with curb/material parameters and separate node treatment. Adopt the structured section and junction concepts. This audit does not recommend buying CityEngine or copying its assets.

[OSM2World](https://osm2world.org/) is a useful open-source comparison. Its [RoadModule implementation](https://raw.githubusercontent.com/tordanik/OSM2World/master/core/src/main/java/org/osm2world/world/modules/RoadModule.java) handles road segments, road areas, junctions, crossings, and width-changing connectors separately. Those responsibilities are a useful checklist; its output is not proof that arbitrary frontage gaps can be reconstructed accurately. No external code was copied.

[OSM sidewalk documentation](https://wiki.openstreetmap.org/wiki/Sidewalk) describes both separately mapped paths and tags on the roadway. [Pedestrian navigation guidance](https://wiki.openstreetmap.org/wiki/Guidelines_for_pedestrian_navigation) distinguishes usable pedestrian areas from surface outlines: an `area:highway` polygon alone is not routing access. Our adapter must reconcile representations while retaining access and evidence.

[ESA WorldCover](https://esa-worldcover.org/en) provides broad land cover at 10 m resolution. It can support local context, but cannot determine a narrow sidewalk boundary. The geometry between a curb and a building needs more specific evidence or an explicitly inferred fallback.

## The replacement design

Use one street-surface compilation pipeline for every supported Earth location. Inputs are source topology, road sections, mapped walking lines and areas, buildings, entrances, barriers, land/water exclusions, and accepted elevation profiles. Outputs are classified surface areas with boundaries, vertical constraints, source provenance, and a revision identifier. Rendering, contact queries, routes, and placement reservations derive from those outputs.

For urban frontage, first use mapped pavement boundaries. Where only centerlines exist, use evidence from adjoining buildings and the local street/block layout to infer plausible pavement. A continuous close building front can bound an expanded sidewalk; a distant building across a lawn must not attract an automatic concrete connection. Courtyards, planted strips, private space, water, and inaccessible areas remain exclusions. Unknown is different from absent. Record which boundaries were inferred and expose uncertain cases in diagnostics.

A sidewalk can therefore reach the building front where the available evidence supports that layout. It will not have one worldwide fixed width, and building distance alone will not decide it. When data cannot justify a detailed frontage, use a conservative continuous pedestrian surface with an explicit inference record. Do not represent that fallback as surveyed geometry.

At intersections, construct connected road and pedestrian areas with actual corner boundaries, islands, crossings, and curb transitions. Match sections where widths change. Carry source direction consistently through side semantics. Use a geometry kernel with explicit tolerances, hole support, robust intersections, and deterministic outputs; evaluate it on degenerate and overlapping inputs before integrating it.

For elevation, preserve existing bridge/tunnel separation and constrained road profiles. Fit at-grade pavement to a shared engineered profile, connect to terrain at its outer boundary, and account for entrance thresholds. Where constraints conflict, report the conflict and retain a valid prior/fallback surface; do not solve it by piling up arbitrary height biases.

For appearance, add physically scaled surface coordinates, restrained asphalt/paving variation, visible curb faces, corner continuity, and consistent markings. Keep furniture and vegetation within reserved zones. Texture detail must not conceal overlaps or substitute for missing surfaces.

## Implementation order and completion gates

| Milestone | Deliverable | Required evidence before expanding |
|---|---|---|
| 1. Source and unit contract | Lossless street records, per-side semantics, unit conversion boundary, provider capability and omission diagnostics; fixes for reproduced defects. | Actual-function regression tests for units, source reversal, separate mapping, holes, and generalized data. Inventory all affected width consumers before migration. |
| 2. Connected area compiler | Roadway, sidewalk, corner, crossing, and frontage polygons with exclusions and provenance. | Deterministic geometry tests: no same-layer interior overlap, no building/water intrusion, no invalid triangles, and connected accessible areas where source topology requires them. |
| 3. Terrain and consumer integration | Shared vertical solution and accepted revision used by meshes, walking, driving, routes, entrances, and placement. | Samples agree with rendered triangles; slopes and thresholds behave correctly; bridge/tunnel levels remain distinct; failure and cancellation preserve coverage. |
| 4. Full-location publication | Bounded spatial chunks with neighbor context and shared boundary constraints across the loaded location. | Identical seam positions/heights regardless of load order; reloading and building edits invalidate the correct neighborhood; bounded queues and disposal. No special city coordinate box. |
| 5. Visual finish and release evidence | Curb/pavement materials, markings, furnished street space, real-world comparisons. | Walk/drive recordings and overhead/eye-level images for the case matrix below, plus frame-time, memory, draw-call, triangle, and loading measurements against baseline. |

The current app loads bounded geographic locations; this plan does not silently introduce continuous planet-wide streaming. The algorithm must apply to arbitrary supported locations and operate within the existing coverage and performance model. Chunk size and geometry tolerances require measurement; the previous small prototype's bounds are not production requirements.

## Acceptance matrix

Use repeated street types across different regions and mapping completeness, rather than one attractive block. Real-location captures must store coordinates, source timestamp/hash, provider, terrain revision, quality settings, camera positions, and diagnostics. Synthetic fixtures isolate failures; real data establishes integration quality.

| Case | What must be demonstrated |
|---|---|
| Dense downtown building fronts | Connected curb-to-frontage paving, sensible corners, no strips overlapping the roadway. |
| Residential streets with lawns | Preserve setbacks, planting strips, driveways, and mapped path separations. |
| Hills and cross slopes | Road, sidewalk, ground contact, and door approaches stay aligned without terrain poking through. |
| Irregular intersections and varying widths | Clean joins, islands, markings, crossings, and retained building clearances. |
| Plazas, holes, courtyards, and pedestrian streets | Respect area outlines and access; preserve holes; avoid duplicate line/area surfaces. |
| Bridges, tunnels, ramps, and stacked ways | No false at-grade joins or terrain flattening across structures. |
| Sparse rural data and generalized tiles | Conservative contextual defaults, no invented urban frontage, explicit omissions. |
| Chunk edges and supported geographic extremes | Shared seams, stable direction/units, consistent results across load order and projection handling. |
| Changed buildings and location reloads | Updated frontage, contact, routes, and reservations; no stale meshes or retained resources. |
| Low and higher quality settings | Reduce detail while keeping the same surface ownership and connectivity. |

The default current-contract test list is selective. The two road/terrain suites run here are not included in that list, while the Earth traversal suite is included. The omitted suites must be deliberately integrated into the appropriate future gate. Existing tests should be retained, but source-string checks and small function fixtures cannot establish visual street quality. Each milestone needs its own behavioral checks and the assembled-world evidence relevant to its claim.

The next development milestone is the source/unit contract and the reproduced defects, followed by the connected area compiler. The app's visible street repair remains unfinished. This audit provides the system boundaries and evidence required to implement it without repeating the isolated-ribbon approach.
