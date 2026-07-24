# World Explorer 3D Production Roadmap

Last reviewed: 2026-07-23.

This is the repository's governing technical roadmap after version 4.0.0. It
defines release order, architectural decisions, and completion gates. It is not
a promise that every phase will ship on a particular date.

## Release Policy

- Production remains on the last certified release until the next candidate
  passes its complete gate.
- Work proceeds in the order below. A later phase may be researched, but it
  cannot bypass an unfinished release gate.
- A feature is not complete because its automated tests pass. Required visual
  captures, sustained traversal, performance measurements, lifecycle checks,
  and asset-license records must also pass.
- Fixes must apply to a world-system contract or data pipeline. Location-name
  exceptions and visual covers are not accepted as general repairs.
- Superseded runtime paths are removed after migration and parity validation.
  New implementations must not remain as permanent layers over obsolete ones.
- Pull requests implementing roadmap work must identify the phase, affected
  system owner, benchmark scenarios, performance impact, and rollback path.
- `KNOWN_ISSUES.md` records confirmed limitations honestly. It is not a place to
  normalize defects that violate a release gate.

## Architectural Decision: One Earth, One Tile Pipeline

Version 4.0 has three distinct concepts that must remain separate:

1. **Location selection** chooses the initial Earth coordinate and spawn intent.
2. **World streaming** loads and retires geographic cells around the active
   player.
3. **Multiplayer/MMO authority** synchronizes players and persistent room
   patches within relevant world cells.

These concepts are necessary for a global world. The problem is not their
existence. The current Earth renderer has both an initial location/OSM build
path and a continuous Overture-tile build path. They use different geometry,
batching, vegetation, and detail rules. That duplication creates avoidable
seams and inconsistent results after the player travels away from the starting
area.

The target architecture is:

```text
WorldAddress
    |
    v
WorldSession
    |
    v
WorldTileScheduler ---- movement prediction and interest radius
    |
    v
WorldTilePipeline ----- acquire -> normalize -> compose -> validate -> commit
    |                                            |
    |                                            +-- SurfaceQuery
    |                                            +-- collision/navigation
    v
Scene cells + MMO room patches + transient actors
```

The initial location becomes a scheduling policy:

- prioritize the spawn cell;
- warm the immediate walking/driving ring;
- prepare a wider aerial ring when required;
- enter play after the spawn safety contract is ready;
- continue using the same loaders and builders while the player travels.

It must not create a different kind of Earth that later gets replaced by a
second renderer.

OpenStreetMap is the canonical Earth vector source. OSM Shortbread vector tiles
provide global streamed coverage; bounded Overpass requests may add OSM tags or
detail around the active area when the provider is healthy. Both paths must
produce the same normalized OSM feature contracts and pass through the same
geometry, surface, provenance, and validation stages.

Overture is not a second canonical world and must not remain a parallel
transportation/building/land/water renderer. Before removing it, an inventory
must identify any exact feature class that cannot be supplied acceptably by the
OSM pipeline. Overture may survive only as a disabled, feature-specific fallback
when all of the following are documented:

- the missing OSM capability and affected coverage;
- why a curated or generated neutral fallback is insufficient;
- the precise Overture theme and fields used;
- identity/deduplication behavior against OSM;
- license, attribution, size, latency, and reliability;
- benchmark evidence that it does not create geometry or visual inconsistency.

Without that evidence, the Overture runtime path, configuration, tests, and
source-specific compatibility fields are removed after the OSM streaming path
passes parity.

## Architectural Decision: Multiplayer Remains an Overlay

The authoritative multiplayer service remains separate from base-world
generation:

```text
immutable geographic base
        +
versioned room patches
        +
authoritative nearby actors
        =
multiplayer presentation
```

Multiplayer does not choose terrain heights, construct bridges, place generated
vegetation, or control the local chase camera. It therefore is not the root
cause of floating world geometry or camera flips.

The server's interest cells should align with the same `WorldAddress` and
coordinate/cell definitions used by rendering, but server authority and client
render streaming remain separate responsibilities. See `MMO_ARCHITECTURE.md`.

## Phase 1 — Rendering and Traversal Foundation

This phase blocks the next production deployment.

### 1.1 Shadow system

Replace scattered directional-shadow settings with one `ShadowManager`.

- Use fitted cascaded shadow ranges on capable desktop hardware.
- Use two bounded ranges at medium quality instead of hard-edged
  `BasicShadowMap`.
- Use one tightly fitted local range or disable dynamic shadows on constrained
  hardware according to measured frame time.
- Stabilize every range to shadow texels.
- Classify and budget shadow casters by importance and distance.
- Apply the same policy to Earth, Moon, Mars, and Ocean where relevant.
- Remove superseded per-environment shadow tuning after parity.

Acceptance:

- no obvious stair-stepped vehicle/building shadows at the normal camera range;
- no continuous shadow crawling during slow camera movement;
- no meaningful frame-time regression against the 4.0 benchmark matrix;
- dawn, noon, dusk, walking, driving, and aerial captures pass review.

### 1.2 Unified corridor and surface composition

Replace independent road, sidewalk, footpath, and terrain draping with one
`CorridorSurface` contract.

Every corridor supplies:

- adaptive centerline stations based on curvature and terrain gradient;
- a stable lateral frame and cross-section;
- terrain-following, graded, elevated, bridge, tunnel, and steps modes;
- longitudinal grade and cross-slope limits;
- cut/fill shoulders and transition lengths;
- a terrain ownership mask;
- one rendered, collision, navigation, and spawn surface profile.

Ordinary footways must create geometry. Terrain composition must reserve the
corridor before terrain mesh generation so terrain cannot consume sidewalks or
paths. Polygon offset may remain only as a rasterization safeguard.

Acceptance includes mountain paths, switchbacks, steep city streets, bridge
approaches, tunnel portals, stairs, tile seams, and road/sidewalk transitions.

### 1.3 Stateful camera obstruction solver

Replace frame-by-frame candidate switching with a persistent camera rig.

- Sweep a camera sphere from actor to desired camera position.
- Track the previous shoulder/side and obstruction state.
- Use entry/exit hysteresis before changing camera mode.
- Move with a critically damped spring and bounded angular velocity.
- Prefer shortening the camera arm before changing sides.
- Use stable overhead or first-person recovery only when no chase solution
  exists.
- Include terrain, buildings, bridge decks, tunnel walls, and authored
  collision volumes in one query contract.
- Never alternate left/right solutions because of small numerical differences.

Acceptance includes driving beside walls, beneath bridges, through curved
tunnels, between dense Shinjuku buildings, near trees, and along steep terrain.

### 1.4 Post-fix production audit

After the three foundation changes, run a fresh audit covering:

- fixed visual benchmarks;
- long-distance driving and flight;
- world-cell seam crossings;
- collision, surface, and camera clearance;
- loading cancellation and stale commits;
- resource disposal and retained memory;
- provider failures and degraded data;
- Earth/Space/Ocean/Moon/Mars lifecycle transitions;
- desktop and mobile input;
- console, network, WebGL, and fatal client errors.

No deployment occurs until the audit passes.

## Phase 2 — Global Consistency and Streaming Convergence

### 2.1 OSM-only source convergence

Migrate continuous Earth streaming from Overture PMTiles to OSM Shortbread.

- Use one OSM tile acquisition/cache owner for initial warm-up and travel.
- Normalize Shortbread and Overpass data into the same road, corridor,
  structure, building, land-cover, water, and provenance contracts.
- Preserve stable OSM source identity across tile fragments where the upstream
  tile schema permits it; otherwise use a documented deterministic fragment
  identity and stitch compatible boundaries before geometry creation.
- Use Overpass only for bounded OSM enrichment, not as a requirement for
  entering a large city.
- Prefer an honest neutral fallback over mixing a second source into the same
  feature class.
- Compare OSM coverage in dense urban, sparse rural, mountain, water, and
  infrastructure benchmarks before deleting Overture.
- Remove `overture-streaming-source`, Overture building fallback, PMTiles
  configuration, release-gate assumptions, and source-specific patch IDs after
  parity and migration checks pass.
- Keep legacy Overture room-patch identifiers readable through a compatibility
  adapter so existing user content is not orphaned.

Acceptance:

- Los Angeles, Shinjuku, Baltimore, rural, mountain, and water benchmarks load
  and stream through OSM without an Overture request;
- initial and traveled-to cells use the same feature builders;
- no duplicate OSM features appear at tile or Overpass/Shortbread boundaries;
- load time, frame time, memory, and visible coverage meet the release budgets;
- forced Overture network failure has no effect because the normal Earth path
  no longer calls it.

### 2.2 World tile lifecycle

Introduce an explicit state machine for every Earth cell:

```text
absent
  -> requested
  -> acquired
  -> normalized
  -> composed
  -> validated
  -> committed
  -> retiring
  -> disposed
```

Rules:

- asynchronous work carries session, generation, source, and cell identity;
- only validated current-generation cells may commit;
- replacement content is ready before the visible predecessor retires;
- all owners retire atomically: meshes, surfaces, collision, navigation,
  vegetation, water, provenance, and room-patch presentation;
- cell failure keeps the previous valid representation or a documented fallback;
- loading and disposal work is time-sliced and measured.

### 2.3 Structure graph before geometry

Bridges, viaducts, elevated roads, railways, skywalks, ramps, and tunnels are
resolved as complete logical features before tile-local geometry is generated.

- Join source fragments across tile boundaries by stable source identity and
  compatible endpoints.
- Resolve layer ordering, crossings, water spans, portals, approaches, and
  connected ramps on the logical feature.
- Build a continuous vertical profile for the whole structure.
- Clip the resulting profile into render cells afterward.
- Reject unsupported or contradictory geometry into a diagnostics queue rather
  than inventing an unsafe structure.

This prevents each tile fragment from independently deciding the height and
grade of the same bridge.

### 2.4 Spatial exclusion and occupancy

Create one spatial-exclusion service used by initial and streamed content.

It prevents:

- trees inside water, buildings, roads, structures, and tunnels;
- buildings whose footprints are predominantly water without an explicit
  pier/platform/houseboat semantic;
- grass and land-cover meshes rendering over water, roads, or developed
  surfaces;
- props occupying travel or camera-clearance volumes.

Every generated placement records its source, exclusion checks, sampled
surface, confidence, and owning cell.

### 2.5 LOD continuity

Replace abrupt whole-cell vegetation and surface changes with layered LOD and
hysteresis.

- Near detail cannot disappear before its replacement is committed.
- Vegetation uses deterministic identities across LOD levels.
- Cell borders share overlap bands or skirts appropriate to the layer.
- Fade/dither transitions are allowed for vegetation and ground detail, but
  never to conceal missing geometry.
- A protected radius follows the active actor at a mode-appropriate distance.
- LOD decisions are time-stable and cannot oscillate while the player is
  stationary.

This phase addresses grass or trees disappearing beside a moving vehicle.

## Phase 3 — Ground, Facades, and Building Diversity

### 3.1 Terrain material compositor

- Blend materials from land cover, slope, elevation, moisture, and climate.
- Use triplanar rock on steep surfaces.
- Add macro variation and close-range micro normals without visible tiling.
- Share compressed KTX2/Basis texture arrays across cells.
- Keep title-screen and unrelated destination downloads unchanged.

### 3.2 Building appearance profiles

Separate:

- footprint and massing;
- facade grammar;
- physical wall material;
- roof grammar and material;
- windows, doors, balconies, bays, and trim;
- regional and historical typology;
- evidence/confidence;
- near, middle, and far LOD.

Material families include brick, limestone, sandstone, marble or stone panels,
stucco/render, timber, concrete, curtain glass, metal cladding, and siding.
Stone must never be silently rendered as brick.

Source precedence is explicit mapped/curated data, verified metadata, regional
typology inference, then a neutral unknown treatment. Inferred appearance is
not presented as documented fact.

## Phase 4 — Water and Real Vessels

Create one `WaveField` shared by displacement, normals, buoyancy, wakes, foam,
audio, and camera response.

- Directional Gerstner waves are the default scalable solution.
- Depth, shoreline, wind, and water-body type configure the spectrum.
- Reflections, refraction, absorption, and foam have measured quality tiers.
- Earth surface water and Ocean mode share water-body identity and state.
- Local water clipmaps follow the player without changing mapped boundaries.

Ship three authored, optimized vessels:

- small motorboat;
- sailboat;
- workboat.

Each vessel defines dimensions, displacement samples, mass/inertia, propulsion,
steering, draft, cameras, wake emitters, interaction points, collision, and
LODs. Remove the procedural placeholder boat after parity.

## Phase 5 — Explorer Hub and Spacecraft

Replace accumulated destination toggles with three top-level domains:

- **Earth:** Modern Earth and Ocean
- **Time:** Historical Cities and Prehistoric Earth
- **Space:** Moon, Mars, Solar System, and Deep Space

Use contextual navigation rather than showing every subsystem simultaneously.
Desktop uses a restrained domain drawer; mobile uses a bottom sheet.

The first complete spacecraft is an original, realistic exploration craft with:

- authored exterior and cockpit;
- main engine and RCS;
- fuel, power, and thermal state;
- navigation computer and instrumentation;
- landing gear and surface landing;
- docking port and docking sequence;
- cargo, airlock, and EVA;
- assisted and orbital flight;
- first-person and external cameras.

Orbital mode uses deterministic fixed-step two-body/patched-conic mechanics,
sphere-of-influence transitions, and on-rails time acceleration. Local orbital
flight and interstellar presentation do not pretend to use one continuous
physical scale.

The vertical slice is complete only when a player can enter, launch, establish
orbit, rendezvous, dock, interact/refuel, undock, land, and exit. The primitive
rocket is then removed.

Stations, missions, asteroid operations, comets, science mode, discovery, and
photography follow. Deep-sky and cosmic-web expansion follows complete travel
gameplay. Alien content is outside this roadmap.

## Phase 6 — Historical Runtime and Pompeii

Add `HISTORICAL_EARTH` as an isolated environment with a
`HistoricalWorldSession`. It owns its scene root, registries, assets, caches,
navigation, surfaces, evidence, and disposal. It may reuse renderer, camera,
input, and movement interfaces, but it does not run modern Earth streaming or
reuse modern world collections.

Introduce a versioned `WorldAddress` for sessions, share links, rooms, saves,
memories, and screenshots. Existing links migrate through an adapter.

Every historical destination declares:

- stable ID and reconstruction version;
- represented date/range;
- completeness tier;
- source checksums, licenses, attribution, and bibliography;
- known, inferred, disputed, and omitted features;
- prepared asset manifest;
- multiplayer and persistence identity.

Pompeii around 79 CE is the first vertical slice, subject to explicit
redistribution clearance for every bundled dataset. It must reach the defined
Tier B reconstruction standard before another city enters production work.

## Phase 7 — Paris and London

Prepare:

- Paris around 1380 using license-cleared ALPAGE and supporting sources;
- London around 1746 using license-cleared Locating London's Past/Rocque
  derivatives and supporting sources.

Public viewing or download access is not treated as redistribution permission.
Each selected layer requires a recorded license decision. If London cannot be
cleared, replace it before implementation with a city in a third country whose
source package can be redistributed.

## Phase 8 — Prehistoric Earth

Prepare offline, versioned snapshots for:

- Last Glacial Maximum, 21 ka;
- Late Cretaceous, 70 Ma;
- Late Jurassic, 150 Ma;
- Late Triassic, 220 Ma;
- Late Permian, 260 Ma;
- Carboniferous, 310 Ma;
- Devonian, 380 Ma;
- Cambrian, 515 Ma;
- at least one Precambrian period.

The browser loads prepared coastlines, plates, terrain classes, climate, biomes,
and evidence summaries. It does not run GPlates or scientific ingestion at
runtime.

Animals and vegetation use evidence-based ranges with time, paleolocation,
geographic precision, environment, source, and confidence. They are not random
decorations assigned only from biome names.

## Performance and Size Governance

The 4.0 measurements remain the starting no-regression baseline:

- complete generated artifact: 53.13 MB;
- raw cold title route: 7.79 MB;
- cold title requests: 392;
- general-file ceiling: 4 MiB;
- complete artifact ceiling: 64 MiB;
- cold-title ceiling: 8.5 MiB and 410 requests;
- the existing Mars rover remains the single documented 12 MiB exception.

Future destinations and material libraries are lazy packages. They do not enter
the title route or unrelated environments.

Each pull request adding assets records:

- transferred/compressed bytes;
- decoded CPU/GPU bytes;
- texture dimensions, format, mip policy, and quality tiers;
- geometry vertices/triangles and LODs;
- runtime owner and disposal behavior;
- provenance and license.

Desktop high targets a stable 60 Hz presentation where the existing benchmark
hardware supports it. Supported mobile targets a stable 30 Hz presentation.
Acceptance uses p95 frame time, long-frame counts, memory/resource ownership,
and sustained traversal rather than an average FPS screenshot.

## Global Consistency Certification

Scripted checks operate on representative cells selected by feature
characteristics, not only famous locations:

- dense urban;
- suburban;
- mountain and canyon;
- desert;
- rainforest;
- coast, lake, river, and open ocean;
- bridge, viaduct, elevated road, tunnel, and complex interchange;
- low and high source coverage;
- adjacent cell seams;
- provider failure and fallback;
- walking, driving, boat, drone, and plane speeds.

For each route, certification records:

- cell lifecycle and source identity;
- invalid geometry counts;
- surface/render/collision agreement;
- floating or submerged object violations;
- LOD replacement gaps;
- camera obstruction-mode changes;
- frame times and long tasks;
- reachable geometry/material/texture counts;
- disposal backlog and final retained memory;
- screenshots at start, seam crossings, structures, and route end.

Random exploratory reports remain valuable, but releases are approved through
repeatable coverage sampling and invariant checks so quality is not limited to
hand-corrected showcase locations.

## Definition of Done

A phase is complete only when:

- its architectural owner is singular and documented;
- old paths are removed or have an approved, time-bounded migration;
- unit, integration, browser, visual, performance, and lifecycle checks pass;
- representative real-world routes pass sustained traversal;
- accessibility and mobile behavior pass;
- licenses and attribution are complete;
- release notes and known issues are current;
- the exact clean artifact passes the release runbook;
- rollback is prepared;
- production promotion receives explicit approval.
