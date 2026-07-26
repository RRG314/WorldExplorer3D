# World Runtime Authority Audit

Status: **4.1 release blocker**
Scope: selected-location Earth runtime
Decision date: 2026-07-26

Implementation sequencing now follows
[`RELEASE_4_1_REBASE_PLAN.md`](RELEASE_4_1_REBASE_PLAN.md). The owner findings
and deletion ledger in this audit remain mandatory.

## Decision

Locations are validation fixtures, not implementation units.

The release cannot be repaired by tuning Baltimore, Sydney, London, Tokyo, or
any other coordinate. Those places exercise different source and terrain
conditions, but they must all pass through the same compiler, store, surface
query, scene publication, and traveler contracts.

The selected-location runtime will converge on one authoritative product:

```text
immutable provider records
  -> normalized district source
  -> compiled district ground field
  -> transport and structure graph
  -> hydrology and occupied-volume composition
  -> immutable CompiledWorldDistrict
  -> atomic WorldStore + WorldScene publication
  -> read-only WorldSurfaceQuery
  -> traveler, camera, navigation, collision, placement, and UI consumers
```

No renderer or gameplay controller may repair, rebuild, or reinterpret the
committed world.

## Evidence from the current runtime

The repository-wide audit found:

- 406 application modules in an acyclic static import graph;
- 148 modules still import `shared-context.js`;
- the selected-location stage swaps 23 global collection arrays rather than
  publishing one canonical world value;
- 20 modules call raw `elevationWorldYAtWorldXZ` through shared context;
- 14 modules call `terrainMeshHeightAt` through shared context;
- 22 modules use `SurfaceQuery` through shared context;
- road geometry has two owners:
  `world/load-road-pass.js` creates it and `terrain/rebuild.js` destroys and
  recreates it;
- at least four runtime paths request post-build surface synchronization:
  terrain streaming, walking, deferred building completion, and landmark
  bridge completion;
- terrain streaming can request a road/building rebuild after new terrain
  meshes attach;
- the load stage can commit before the load transaction commits, and optional
  detail work can continue after that stage commit.

The existing cycle, lifecycle, transaction, stage, and surface tests pass.
That result is useful but insufficient: those tests prove each local mechanism
works as written, not that the mechanisms have one authority.

## Actual authority graph

| Concern | Nominal owner | Actual writers or alternative authorities | Result |
|---|---|---|---|
| Location selection | `location-session.js` | load runtime writes `LOC`; multiplayer and UI can call `loadRoads` | Selection is mostly centralized; load entry remains broadly callable |
| Load cancellation | `world/load-transaction.js` | one active token and rollback hooks | Keep; incorporate into the compiler coordinator |
| Staging | `world/load-stage.js` | swaps 23 `appCtx` arrays and a terrain group | Transitional mechanism, not an immutable world store |
| Raw elevation | `terrain/tiles.js` | mesh sampling and tile fallback paths | Raw DEM is not separated from corrected ground |
| Terrain lifecycle | `terrain/streaming.js` | attaches/removes meshes and triggers surface rebuild | Renderer lifecycle is also a world compiler |
| Ground selection | `ground.js` / `world/surface-contract.js` | mutable roads, meshes, linear features, water, and raw terrain | Query facade exists, but it reads mutable renderer/runtime state |
| Road geometry | `world/load-road-pass.js` | `terrain/rebuild.js` recreates it after load | Duplicate geometry authority |
| Building geometry | `world/load-building-pass.js` | terrain reprojection and deferred building load mutate it | Geometry is not sealed at commit |
| Structures | `world/structure-aware.js` | road/terrain rebuild and landmark paths refresh profiles | Structure semantics are resolved too late |
| Traversal | traversal network builders | rebuilt during finalization and after feature additions | Navigation can describe a different generation than rendering |
| Spawn | world spawn services | finalization plus later revalidation | Spawn compensates for changing world state |
| Collision/camera | gameplay services | some use `SurfaceQuery`; other modules use raw height fallbacks | Consumers do not share one committed surface generation |
| Scene objects | Earth scene stage plus feature modules | feature modules create/attach/dispose their own meshes | `WorldScene` is not the sole publication owner |
| Optional detail | deferred loaders | buildings, POIs, landmarks, linear features | “Committed” world remains structurally mutable |

## Root causes

### 1. A query facade is being mistaken for a data authority

`SurfaceQuery` currently delegates to `GroundHeight`, which reads live terrain
meshes, road meshes, feature arrays, water state, and spatial indexes from
shared context. It unifies call syntax but does not own a stable world model.
Two consumers can receive different answers as asynchronous terrain or detail
work mutates those inputs.

### 2. Terrain streaming is also a geometry compiler

When terrain tiles attach or retire, terrain streaming schedules
`rebuildRoadsWithTerrain`. That function destroys and recreates road and urban
surface meshes, refreshes structure profiles, repositions buildings, and
reconciles actors. This makes movement through the world capable of changing
the meaning and geometry of already committed OSM features.

### 3. Source readiness occurs after geometry decisions begin

The loader waits for partial terrain coverage, then immediately builds roads,
buildings, land use, and linear features. It does not first compile a
seam-stable district ground field. In a contaminated urban DEM, every later
layer can consistently agree on the same wrong rooftop-scale height. Sydney is
the proof fixture for this failure, not a special case.

### 4. The commit boundary does not seal the world

The scene stage commits during finalization. Deferred feature loads and terrain
streaming may then add features or rebuild geometry. The transaction can report
success even though rendering, traversal, collision, and surface queries have
not converged on an immutable generation.

### 5. Raw-height fallback chains bypass composition

Several modules use:

```text
SurfaceQuery -> terrainMeshHeightAt -> elevationWorldYAtWorldXZ
```

and others call the last two entries directly. These fallbacks discard
structure, water, ground-confidence, correction, and generation semantics.
They make floating trees, submerged buildings, invalid foundations, and camera
or spawn disagreements possible even when a nearby subsystem uses the proper
query.

## Required target contracts

### `DistrictSource`

- immutable normalized OSM, DEM, land-cover, and optional enrichment records;
- stable source IDs and provenance;
- one local-metre coordinate frame;
- explicit completeness and failure state;
- no Three.js objects and no shared-context access.

### `DistrictGroundField`

- immutable, seam-stable sampled ground surface for the complete active
  district;
- raw DEM preserved separately;
- datum, resolution, confidence, source coverage, and correction reason stored
  per cell or region;
- urban positive-residual correction constrained by OSM developed-area,
  at-grade transport, building-free ground anchors, hydrology, and broad-relief
  preservation;
- no per-road or per-building smoothing;
- rejected when confidence is insufficient rather than silently flattened.

### `TransportStructureGraph`

- roads, paths, rail, bridges, tunnels, portals, ramps, and grade separation
  compiled before render geometry;
- one longitudinal/cross-profile per feature;
- junction topology and structure ownership reconciled across source fragments;
- renderer, navigation, spawn, and collision consume the same records.

### `CompiledWorldDistrict`

- one immutable generation containing source provenance, ground, transport,
  structures, hydrology, buildings, occupancy, traversal, labels, and
  diagnostics;
- no renderer objects;
- internally reconciled counts and IDs;
- valid only after all release-critical layers finish;
- optional visual enrichment must be a separate, non-structural generation or
  be included before commit.

### `WorldStore`

- one active immutable district generation;
- atomic compare-and-swap publication by transaction generation;
- no direct array replacement outside the store;
- old generation retained until the new scene and indexes are ready;
- rollback restores the prior generation without reconstructing it.

### `WorldScene`

- sole creator, attacher, retirer, and disposer of world render objects;
- builds from one `CompiledWorldDistrict`;
- publication is generation-tagged and atomic;
- terrain LOD changes mesh representation only, never logical ground or feature
  profiles;
- no renderer calls a compiler or mutates world records.

### `WorldSurfaceQuery`

- constructed from one committed `CompiledWorldDistrict`;
- returns generation ID, surface kind, provenance, confidence, structure layer,
  and traversal permissions with every sample;
- is the only Earth height/surface API exposed to gameplay;
- raw DEM access remains private to compilation and diagnostics.

## Migration and deletion order

This order is mandatory because reversing it would preserve duplicate owners.

| Step | Replacement | Delete or disable in the same step | Exit evidence |
|---|---|---|---|
| A | Pure `DistrictSource` schema and source adapter output | Direct provider records entering render builders | Reconciled source IDs/counts; no Three.js/shared context |
| B | `DistrictGroundField` compiler and diagnostics | Raw DEM use by road/building/vegetation geometry | Synthetic DEM contracts plus Sydney, mountain, coast, and below-sea-level probes |
| C | Pure `TransportStructureGraph` compiler | Late structure refresh and road-profile reinterpretation | Topology, portal, junction, grade-separation contracts |
| D | Pure building/hydrology/occupancy compilation | Geometry-time road overlap and terrain-placement corrections | No unsupported occupied volume; provenance on rejection |
| E | Immutable `CompiledWorldDistrict` and `WorldStore` | Direct replacement of the 23 world collection arrays | One generation and reconciled products |
| F | Generation-owned `WorldScene` publication | Feature modules attaching/disposing scene objects | Repeated loads plateau; exact retirement/disposal |
| G | District-backed `WorldSurfaceQuery` | Gameplay raw-height fallbacks and live renderer raycast authority | Spawn/collision/navigation/camera agree on generation |
| H | Remove post-commit structural mutation | `rebuildRoadsWithTerrain`, actor reconciliation caused by terrain tiles, structural deferred loads | Committed IDs and profiles never change during travel |
| I | Release certification | Coordinate-specific correction logic | Fixed geography classes and human hardware review |

## Immediate implementation boundary

The next code change is Step A/B, not another road renderer change:

1. define immutable `DistrictSource` and `DistrictGroundField` records in a
   shared-context-free compiler directory;
2. adapt the current selected-location source selection into `DistrictSource`;
3. compile the complete active district ground field before
   `buildRoadGeometryPass`, `buildBuildingGeometryPass`, or land-use geometry;
4. route those three critical builders through the field;
5. keep the old terrain mesh renderer temporarily, but make it render the
   compiled field for the committed district;
6. delete raw-height fallback from each migrated builder;
7. only then remove post-load road/building rebuild ownership.

Until those steps pass, 4.1 remains blocked and production remains on 4.0.

## Validation model

Tests are organized by authority, not by place:

- pure compiler contracts cover datum, seams, confidence, topology, occupancy,
  and deterministic output;
- integration tests reconcile source IDs through compiled records, scene
  products, traversal, and queries;
- browser journeys prove lifecycle, cancellation, disposal, movement, and
  frame pacing;
- geographic fixtures supply distinct source/terrain classes only;
- hardware screenshots remain a human release gate and cannot be replaced by
  numeric agreement.

The initial fixture classes are dense urban, ordinary urban, rural, mountain,
coast, bridge, tunnel, water-only, below sea level, high latitude, and provider
degradation. Sydney is the positive urban DEM contamination fixture; Baltimore
is a control, not the template for other locations.
