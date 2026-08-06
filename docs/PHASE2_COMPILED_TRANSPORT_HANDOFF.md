# Phase 2 Compiled Transport Handoff

**Status:** complete
**Date:** 2026-07-29
**Phase 1 rollback point:** `f867078`
**Commit boundary:** `feat: make compiled transport the sole road authority`

## Result

WorldExplorer3D now publishes one immutable transport graph and one compiled
transport surface as the authority for road topology, alignment, rendering,
surface collision queries and navigation. Phase 3 may specialize structures,
but it must consume these products rather than build another graph or height
model.

## Public source policy

- OSM/Overpass is the primary, lossless transport source.
- OSM Shortbread vector tiles are the public generalized fallback.
- No source that requires additional permission is used.
- The normalized record retains stable source identity, completeness
  classification and all 33 selected raw OSM fields.
- Explicit width, lanes and placement remain explicit. Derived values carry
  fallback provenance.
- Shortbread does not invent `layer` values from bridge/tunnel flags.
  Generalized grade-separated routes are marked uncertain and non-drivable
  until lossless semantics are available.

## Authority and ownership

| Consumer | Sole authority |
|---|---|
| topology and joins | `compiled_transport_network` |
| direction and route state | normalized source record + compiled graph |
| vertical profile and cross-section | `compiled_transport_surface` |
| road ribbons and lane markings | compiled surface samples |
| walk/drive surface queries | compiled surface publication |
| walk/drive navigation | compiled graph stations and directed edges |

The graph joins endpoint-to-endpoint and endpoint-to-interior fragments within
a 0.75 m default tolerance, preserves source-node joins, and distinguishes
actual merges from planar or vertically separated crossings. Each join records
method and confidence. Duplicate source fragments retain one source identity
but receive deterministic fragment identities.

Navigation anchors now consider the small set of equally valid nearby graph
segments. This prevents a coincident road from hiding a mapped footpath and
prevents connector edges from bypassing one-way direction.

## Alignment and corridor contract

- At-grade profiles use a bounded signed cut/fill fit across the center and
  corridor edges; the default maximum cut/fill is 4 m.
- Vertical smoothing limits grade without draping every terrain sample.
- Bridges, tunnels, ramps and stacked elevations retain structure-independent
  vertical behavior for Phase 3 specialization.
- Width, lane count and placement determine the compiled cross-section and
  marking offsets.
- Corners use bounded miter joins, avoiding unbounded spikes and circular
  triangle fans.
- Terrain rebuild code publishes the compiled result but no longer mutates road
  clearance as a second height owner.

## Verification evidence

The complete `npm test` chain passed, including:

- source normalization, access, direction, width/lane/placement provenance;
- sub-meter drift, endpoint-interior, source-node and crossing topology;
- duplicate fragment identity and one-way graph edges;
- signed cut/fill across flat, rolling, mountain, below-sea, polar and logical
  tile-edge fixtures;
- render/collision/navigation parity and ownership guards;
- Firestore security rules (45/45);
- full browser runtime and public OSM smoke tests.

Measured focused budgets:

| Metric | Result | Budget |
|---|---:|---:|
| 600-feature graph compilation | 3.3 ms | < 100 ms |
| cached surface query p95 | 0.0068 ms | ≤ 0.25 ms |
| spatial query p95 | 0.0341 ms | ≤ 0.5 ms |

The final browser runtime loaded 3,522 roads and 25,362 buildings, published
13,822 walk and 12,881 drive segments, resolved the sampled footpath route,
reported exact surface parity, and produced no console errors. A separate run
loaded 5,115 roads and 1,225 buildings with the same authority and parity
checks.

Public-source smoke coverage loaded:

- Monaco: 1,322 roads;
- Svalbard: 87 roads;
- Antarctica: 139 roads;
- Dubai desert: 216 roads;
- restored Baltimore: 5,115 roads.

Unsupported Sydney published zero transport and
`no-accepted-ground-artifact-for-location`, which is the required fail-closed
behavior.

The targeted cross-phase world-matrix attempt loaded 1,763 Monaco roads and its
drone image was inspected. That aggregate command did not pass because it also
enforces Phase 1 coverage for unsupported presets and Phase 3 building-massing
requirements. Those failures are not represented as Phase 2 transport passes.
The complete public-source smoke gate and Phase 2 transport/geography matrix
are the applicable evidence.

Hosting preparation also passed:

- `npm run build:hosting`
- `npm run verify:hosting`
- `npm run audit:reachability` — 414/414 reportable files reachable, zero
  orphans.

Browser automation used SwiftShader, so these are functional and deterministic
budgets only. Hardware-eligible frame-time, draw-call and sustained-play
evidence remains part of the final release gate.

## Phase 3 entry contract

Phase 3 may add bridge decks, supports, barriers, tunnel portals, masks, walls,
ceilings, lighting and structure-specific collision. It must:

1. use the compiled graph identity and stations;
2. use the compiled transport surface for deck/path height and width;
3. preserve normalized source identity, raw semantics and incomplete-route
   state;
4. never create a second topology, road-height or direction owner;
5. never span a valid drive path with a terminal barrier;
6. treat generalized uncertain structure fragments as non-drivable until their
   topology and vertical semantics are proven.
