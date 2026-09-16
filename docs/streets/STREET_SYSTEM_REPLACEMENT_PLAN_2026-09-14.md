# Roads, sidewalks, terrain, and RDT: complete repair plan

Status: implementation in progress; not release accepted. The plan below records the approved architecture. Current evidence and unfinished gates are tracked in `STREET_REPLACEMENT_IMPLEMENTATION_STATUS.md`. Work stays in `steven/street-system-rd`; research, main, and production are outside this change.

## Outcome and scope

Every loaded location must use the same street construction rules. Roads, intersections, sidewalks, surrounding ground, building interfaces, and movement contact must agree. The system must represent the selected location across its supported extent without silently dropping mapped streets to meet a feature count. Nearby detail can be streamed and distant detail simplified; neither operation may change street connectivity or replace a missing-data problem with an invented plaza.

This is a replacement of conflicting surface ownership, not a replacement of the whole app. Retain source identities, useful normalization, polygon operations, spatial indexes, and proven structure handling. Finish the common pipeline before cosmetic polish. A few attractive blocks cannot constitute acceptance.

Global rules do not imply surveyed accuracy everywhere. Incomplete elevation and map data need recorded confidence, conservative fallback behavior, and visible evidence of what was unavailable. A source limitation must be distinguished from an implementation defect.

## RDT assessment

The name currently groups several different mechanisms. This assessment concerns their use in this app, not the mathematical merits of the underlying research.

| Mechanism | Source evidence | Assessment and decision |
| --- | --- | --- |
| Stable procedural identity | `app/js/rdt.js` contains geographic hashing and xorshift32 helpers used by appearance and living-world code. | Retain exact outputs initially. These are useful deterministic utilities, not evidence that RDT improves rendering. Extract behind a stable identity interface without changing existing appearances. |
| Location-derived workload policy | `world/load-runtime-session.js` takes RDT depth of a geographic hash. `world/budgets.js` uses tile depth to reduce caps; `world/load-style.js` changes centerline simplification. | This does not measure road density, curvature, terrain difficulty, memory, or frame cost. It can reduce content or detail for reasons unrelated to need. Retire from production decisions; preserve in an isolated experimental comparison only. |
| Experimental noise | `rdt.js` defaults noise to false; the road-edge sampler returns zero while disabled. Repository search found no external call to the exported road-edge/field samplers in current app code. Import-time self-tests still execute. | No evidence that this is causing the photographed deformation. Keep out of production geometry; lazy-load the experiment if retained. Do not spend time replacing inactive noise with another noise algorithm to repair streets. |
| Nearest-road query throttling | `physics.js` checks every two or three rendered frames based on complexity, with movement and height invalidation. Baseline still uses the two-frame path. | Review separately. Replace location-based cadence with elapsed time, displacement, speed, surface revision, and proximity to transitions. Preserve collision correctness under low frame rates. |
| Mode selection and defaults | `perf.js` explicitly starts baseline and overwrites the stored mode. Several helper fallbacks still choose `rdt`; diagnostic/share settings can expose alternative modes. | Consolidate to one explicit policy. Capture effective mode in each run; do not infer the user's current Chrome mode solely from defaults. |

RDT is not established as the cause of the current sidewalk failures. Its workload policy is a poor fit for authoritative world content because hash-derived integer depth is not a scene-cost measurement. It may lower resource use by doing less work, but a fair benefit claim requires equal content and equal visual error. No such comparative result is established here. Baseline also has feature caps and a broad regional load, so simply disabling RDT is not a complete solution.

Compare existing baseline, existing RDT, and the proposed measured policy using identical source snapshots, seeds, views, routes, and device settings. Record removed source IDs, connectivity changes, geometry error, load phases, frame-time percentiles, retained heap, geometry/texture bytes, and disposal. Run sequentially with teardown. A faster run that omits required roads or buildings fails the comparison.

## Target architecture

`source snapshot → normalized connected network → bounded regional surface solution → render/contact/terrain products → atomic publication → view-dependent residency`

The regional surface solution owns horizontal boundaries, heights, layers, shared edges, source IDs, confidence, and unresolved constraints. Ground observations are input; rendered terrain is an output and cannot subsequently overwrite accepted road heights. Regions have canonical shared boundaries and sufficient neighbor context, so tiling is a memory strategy rather than a source of cracks.

### 1. Establish the baseline and dependency contract

Inventory each producer and consumer in the existing architecture audit: source providers and fallback precedence; road/building/land-use selection; elevation source and correction; profiles; frontage compilation; terrain rebuild; mesh publication; contact/navigation; overview masks; cache/disposal; load cancellation and quality modes.

Record actual effective settings and source revisions. Preserve the rejected Monaco, San Francisco, and Baltimore evidence. Create a failure register linking each artifact to a suspected cause, regression, replacement component, and acceptance result. Existing uncommitted repairs are reviewed individually and retained only when compatible with the new contract.

Deliverable: dependency table, reproducible source manifests, failure register, and explicit region schema. Gate: every geometry and contact consumer has a named authoritative input; no unexplained alternate height source.

### 2. Normalize data and construct the connected street network

Use physical metres internally with one explicit render-coordinate conversion. Preserve source node identity, direction, widths, placement, sidewalks, bridges, tunnels, and levels. Merge provider overlap deterministically. Preserve intersection nodes during simplification; crossing lines at different levels must not become intersections.

Record completeness for every source cell. Replace truncation of required nearby road/building inputs with bounded retrieval and dependency-aware processing. Include enough outside-cell context for junctions, facades, and structures; resolve long features across cell boundaries. Define behavior for sparse data, high latitude, and longitude wrap.

Deliverable: connected network and completeness manifest for the whole supported location. Gate: no unintended dropped connection, duplicate provider road, double unit conversion, or fabricated grade-separated connection.

### 3. Solve roads and junctions before modifying ground

Build longitudinal profiles using ground confidence, preserved structure anchors, and road class. Constrain abrupt grade changes and excessive cut/fill without flattening legitimate steep streets to one arbitrary maximum grade. Construct explicit two-dimensional junction patches sharing exact boundary vertices with incident roads. Include width changes, crossfall, curb returns, and transitions.

Use a constrained triangulated surface or equivalent boundary-conforming mesh for these regions, rather than a square terrain grid as the sole road authority. Determine tolerances in metres from visible and movement requirements, document them, and freeze them before evaluating candidates. If constraints conflict, record the conflict and apply an explicit fallback; never average unrelated parallel streets together.

Deliverable: accepted road and junction surfaces with residual/error reports. Gate: shared boundaries agree; separate roads retain their levels; generated spikes and folds fail independent checks. Existing bridge/tunnel behavior must remain valid.

### 4. Construct continuous pavement and building interfaces

Derive connected blocks and public-space candidates from the street network. Prefer mapped pedestrian areas and explicit sidewalk geometry. Infer missing pavement using road type, urban context, facade alignment, setbacks, and excluded land uses. Classify each result as mapped, inferred, or unresolved.

Produce connected pavement polygons with explicit curb and frontage boundaries. Preserve parks, gardens, water, parking, courtyards, and intervening streets. Handle T-junctions, acute corners, cul-de-sacs, divided roads, driveways, crossings, and separate mapped footways. A nearby facade alone must not authorize filling all intervening land.

Solve curb elevations from the accepted street edge. Resolve frontage elevations against plausible building bases/entrances and source confidence. Where a continuous slope is inappropriate, create explicit retaining, stepped, or terraced transitions with matching navigation; do not stretch a sheet between incompatible levels. An unmapped entrance must not be presented as a surveyed fact.

Deliverable: pavement, curbs, crossings, and supported hillside treatments from the same regional solution. Gate: no unintended carriageway overlap, floating corner, disconnected seam, or inferred pavement through excluded land. Deliberate steps are classified and navigable, not counted as mesh damage.

### 5. Make terrain, rendering, and movement consume the solution

Grade terrain under accepted surface regions and blend only outside their ownership. Use identical clipped boundaries for visible pavement and ground modification. Respect water and grade separation. Improve ground-source selection where appropriate, but never assume finer tessellation makes coarse source elevation more accurate.

Build road, junction, pavement, curb, terrain-transition, and movement products from one revision. Publish only a complete compatible set; cancel stale work and dispose superseded products. Refresh bounds and indexes on replacement. Near geometry and far representations retain identical footprint and connectivity. Eliminate competing legacy generators only after the new path passes its gates.

Deliverable: one production construction path, including reload and location-switch lifecycle. Gate: feet/wheels agree with the visible surface; no disappearing geometry, buried pavement, mixed revisions, or stale collision during transitions.

### 6. Replace arbitrary workload decisions with measured residency

Keep lightweight regional metadata and progressively load/compile detail around the view and predicted travel. Use a spatial hierarchy, geometric/screen-space error, bounded caches, and eviction. Retain border dependencies and collision readiness ahead of the player. Reduce distant visual detail before compromising nearby mapped topology.

Replace the current broad upfront context strategy incrementally. A tile changing detail must not trigger a new global surface design. Cache compiled region products by source and policy revision; bound both persistent storage and transient working memory. Cancel duplicate or obsolete requests. Separate physics-critical updates from decorative work.

Provisional targets on the owner's 8 GiB Mac: steady route p95 frame time at most 33.3 ms, no application-attributable post-load stall over 250 ms, cached first-play within 15 seconds, and no monotonic retained-memory growth over three location changes. Target application-tab retained JS heap under 800 MiB and tracked geometry/texture estimates under 256 MiB; these are separate accounting measures, not a claim about total Chrome RAM. Measure feasibility before implementation sizing, and report a missed target rather than quietly increasing it. Cold-network timing must be reported separately from local compute.

Deliverable: effective budget report, cache accounting, disposal evidence, and equal-content RDT comparison. Gate: no freeze, unbounded cache, continuing obsolete compilation, or missing required features used to obtain the performance result.

## Verification across locations

Small regressions diagnose individual failures; they are not the release result. Use the real production loader/compiler for regional checks. Capture data once per revision and reuse it for repeatable comparisons; separately check live-provider behavior.

| Coverage | Required evidence |
| --- | --- |
| Every source cell in each selected location's supported extent | Source completeness, topology, layer separation, invalid/folded triangles, boundary mismatch, terrain penetration, grade-change residuals, and unresolved constraints. Process in bounded batches, including neighboring cells; retain a location map of failures. |
| Monaco | Entire supported regional scan plus routes through steep parallel streets, switchbacks, building-level changes, tunnels, and the rejected screenshot area. |
| San Francisco | Entire supported regional scan plus hill crests, troughs, steep intersections, dense frontage, and bridge approaches. |
| Baltimore | Entire supported regional scan plus the reported Biddle/Chase areas, empty parcels, acute corners, and continuous rowhouse pavement. |
| Additional environments | Dense flat city; rural road without sidewalks; divided highway/interchange; mountain terrain; waterfront; sparse map/elevation data. Select cases by failure mechanism, not city name alone. |
| Boundary and lifecycle journeys | Travel out and back across multiple detail cells, turn camera, change height, walk and drive, switch locations, reload, supersede an active load, and revisit evicted cells. |
| All shipped presets | Lightweight data/contract checks for each; expensive regional geometry scans scheduled sequentially. Custom-location, coordinate-transform, source-order, and tile-partition invariance cases protect common rules. |

Visual routes include street-level and overhead captures with recorded coordinates, headings, source/policy revisions, and effective quality settings. Inspect systematically selected risk points plus all previous failures. A numerical whole-region scan does not imply every street was visually inspected; report those evidence levels separately.

Release gates: zero unexplained invalid geometry, cross-layer joins, shared-edge discontinuities beyond the frozen tolerance, or critical movement failures in scanned regions; all known screenshot failures closed with fresh evidence; no silent input truncation; independent surface-quality checks pass; performance targets measured; remaining source uncertainty explicitly listed. Accessibility targets must be distinguished from reproducing existing steep streets; do not claim regulatory certification.

## Delivery sequence and change control

1. Complete baseline/dependency contract and isolate RDT policy decisions.
2. Deliver normalized network plus road/junction authority across the regional compiler.
3. Deliver pavement/frontage and hillside transitions.
4. Migrate terrain/contact/publication and remove conflicting legacy paths.
5. Complete measured streaming/residency and equal-content comparisons.
6. Finish regional scans, sequential visual journeys, and performance acceptance; only then call the street repair complete.

Each stage produces reviewable changes and failure evidence. Early integration checks are required, but no pilot block is the final deliverable. Maintain a compatibility switch during migration; rollback restores a coherent prior pipeline, not a mixture. No deployment or GitHub update is part of this planning task. Run one heavy process at a time on this Mac and reuse recorded fixtures instead of repeatedly loading worlds.

## Established references and their relevance

- [CityEngine street graphs](https://doc.arcgis.com/en/cityengine/latest/help/help-graph-layer.htm): connected street representation and explicit road/sidewalk widths.
- [Houdini Labs Road Generator](https://www.sidefx.com/docs/houdini/nodes/sop/labs--road_generator.html): roads from curves/OSM, explicit intersection construction, and road-side output useful for sidewalks.
- [OpenDRIVE elevation methods](https://publications.pages.asam.net/standards/ASAM_OpenDRIVE/ASAM_OpenDRIVE_Specification/v1.8.1/specification/10_roads/10_05_elevation.html): separate longitudinal/lateral surface descriptions; an engineering reference, not a required file format or game engine.
- [CityEngine terrain alignment](https://doc.arcgis.com/en/cityengine/latest/help/help-align-streets-terrain.htm): terrain projection is a legitimate input operation. The defect here is allowing subsequent incompatible projections to overwrite the accepted street design.
- [Cesium tileset documentation](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html): view-error-based detail and bounded tile memory. Apply the concepts to the existing renderer; this plan does not require migrating the application to Cesium.

These references support specific construction and loading techniques. They do not establish that importing a tool automatically resolves missing source data or completes this implementation.
