# Living World and Editable World Architecture/R&D Report

Status: implemented local test candidate; final Stage H release verification in progress
Audit date: 2026-08-16  
Audited branch/commit: `stable` / `74f1a47`  
Product version at audit: `4.2.1`

## 1. Decision

The expansion is feasible without replacing the fixed-world architecture and without reintroducing continuous-world streaming.

The implementation should proceed as a sequence of small publications derived from one already-published Earth world:

```text
Immutable WorldSnapshot
        +
Derived LivingWorldPublication (entrances, pedestrian graph, traffic graph, NPC state)
        +
Scoped WorldModificationSet (local or room deltas)
        =
Rendered and interactive world
```

The geographic base remains immutable. NPCs, facade inference, suppressions, and player-built structures must never write into OSM, Overture, provider responses, the accepted-ground catalog, or `WorldSnapshot` records.

This is a conditional **GO** with these hard gates:

1. No provider request may be triggered by player or NPC movement.
2. Every derived publication must be bound to the active `WorldLoadRequest` sequence and disposed when that sequence changes.
3. Traffic must sample the compiled transport graph and shared transport surface; it must not maintain a competing road-height model.
4. Pedestrian data acquisition must be a bounded one-shot fixed-world request, cancellable with the world load, or a conservative inference from already-loaded records.
5. Local and room edits must be deltas over stable source identities. They must not alter public geographic overlays by default.
6. Final population limits must come from the requested Manhattan, Baltimore, Monaco, suburban, rural, and mobile experiments. The limits in this report are safe starting ceilings, not final promises.
7. Production deployment remains blocked until Stage H passes.

## 2. Current architecture found in the repository

### 2.1 Fixed Earth world lifecycle

The current implementation already has the correct base for this work.

| Concern | Current owner | Audit result |
| --- | --- | --- |
| Immutable load identity | `app/js/earth-core/world-load-request.js` | Frozen request with sequence, location, and stable request ID. Active-work checks reject stale location/sequence work. |
| Load lifecycle | `app/js/earth-core/world-load-session.js` | Explicit requested/fetching/compiling/published/superseded/failed/disposed states, abort handling, and provider-work accounting. |
| Immutable publication | `app/js/earth-core/world-snapshot.js` | Versioned immutable snapshot with terrain, hydrology, transport, buildings, land use, and places. Each populated layer has one authority. |
| Staging and publication | `app/js/world/load-runtime-session.js` | Clears old staged state, scopes provider work to the request, compiles layer products, atomically publishes the Earth scene, and releases provider staging caches. |
| Supersession | `app/js/world/world-load-coordinator.js` | Deduplicates identical requests and drains/cancels old work before a replacement load. |
| Visible ownership | `app/js/world/publication.js`, `app/js/world/collection-registry.js` | A fixed set of Earth scene collections is published or hidden by environment. This is visibility control, not data streaming. |
| Teardown | `app/js/world/load-reset.js` | Disposes meshes/materials, clears collections, transport publication, traversal caches, colliders, furniture, vegetation, and the Earth scene root. |

The load request sequence is a transient publication identity. It must not be used as a persistence key. Local and multiplayer persistence need a stable world identity based on normalized world kind, selected location coordinates/location key, and schema version.

### 2.2 Provider and source boundaries

The current provider fabric has separate bounded passes and source provenance:

- OSM/Overpass supplies detailed roads, land use, water, structured pedestrian ways, trees, and building publication/metadata where available.
- Shortbread vector tiles supply regional generalized roads, land, sites, and far buildings.
- Overture is a building fallback with stable `overture:*` feature IDs and explicit geometry/metadata provenance.
- Accepted ground/elevation is selected once and exposed through shared surface contracts.

The current OSM primary query intentionally does **not** load all ordinary footways, sidewalk ways, crossings, entrance nodes, or generic shop/amenity/tourism nodes. Pedestrian-like ways are currently requested only when they have structure or indoor-related tags such as bridge, layer, level, covered, indoor, or min-height. This was a sensible load-control decision, but it means a complete pedestrian graph cannot be honestly derived from current records alone.

Any new pedestrian semantic request must therefore:

- run at most once for the selected fixed location;
- use the existing request/session cancellation and provider deadline;
- use a smaller detail radius than regional roads/buildings;
- cap features by tile/density budget;
- preserve mapped versus inferred provenance;
- fail soft, leaving conservative inferred sidewalks available;
- never run because an NPC or player approached an edge.

### 2.3 Surface and transport authority

The transport system is substantially reusable.

`app/js/world/compiler/transport-source-normalizer.js` preserves source tags for road class, service, bridge, tunnel, layer, lanes, placement, width, surface, access, motor/foot access, junction, one-way, sidewalk, lighting, and related structure semantics. It distinguishes mapped values from inferred lane and width values.

`app/js/world/compiler/transport-network-model.js` compiles stable road features, source topology nodes, compatible joins, direction, driveability/walkability, route state, and structure-aware connections.

`app/js/world/compiler/transport-surface-model.js` is the single accepted road-height and cross-section authority for at-grade, elevated, bridge, ramp, and subgrade/tunnel transport. Visual roads, driving, collision, structures, and traversal must continue to sample it.

`app/js/world/traversal.js` already derives lazy drive and walk adjacency graphs from compiled feature stations. The drive graph respects one-way direction and retains source feature/segment references. This is an important seed, but it is a player-routing graph rather than a traffic simulation graph: it lacks explicit lanes, turn edges, intersection controls, occupancy, and traffic-specific costs.

The correct approach is to derive a read-only `TrafficGraph` from the compiled transport network. It should reference transport feature/station intervals and sample the existing surface publication. It must not reload roads or build approximate splines independent of the compiler.

### 2.4 Pedestrian surfaces

Current pedestrian support is partial:

- Normal roads can be marked walkable.
- Structured footways can be represented, but general linear features are disabled by default.
- Forced connectors exist for structured crossings.
- Overlay edits can add footways, crossings, and entrances and can invalidate traversal networks.
- Building entry logic can infer an exterior anchor from a building footprint.
- Mapped indoor and entrance data can be fetched on demand for the player interior flow.

What is missing is a canonical exterior pedestrian publication containing ordinary sidewalks, paths, crossings, plazas, entrance anchors, access restrictions, and provenance. The current walk graph must not simply be scaled into population AI because it can place walkers on road centerlines and does not model safe crossings.

### 2.5 Buildings and facade depth

The building pipeline already preserves the information needed for deterministic facade inference:

- stable source building IDs;
- OSM versus Overture geometry provenance;
- mapped versus inferred height and level values;
- building type and deterministic seed;
- footprint geometry and dimensions;
- facade material/color and roof tags;
- colliders, roof details, and building spatial indexing.

`app/js/engine/building-facade-materials.js` already supplies pooled texture-atlas facade families such as curtain wall, office grid, hotel vertical, apartment balcony, historic punched openings, townhouse, and industrial panel. This is efficient appearance depth, but it does not create semantic doors, entrances, storefront bays, or physical glass/frontage geometry.

`app/js/world/building-entry.js` is reusable as the seed for a canonical entrance catalog. Mapped entrances from the bounded exterior semantic pass should take precedence. Where no mapped entrance exists, a deterministic inferred entrance may be placed on an accessible footprint edge facing the nearest valid pedestrian route. Its provenance must remain `inferred`.

Facade geometry must use shared atlases, geometry pools, instancing, or per-building merged buffers. Creating unique materials and meshes for every window or door would exceed draw-call and heap budgets in dense cities.

### 2.6 Street furniture, signals, and POIs

`app/js/world/furniture.js` generates bounded street signs, lamps, trash cans, and instanced vegetation. Budgets already vary by the dynamic quality tier. Lamps use mapped `lit` where present and conservative urban inference otherwise.

There is no traffic-signal simulation model. Current transport records preserve junction semantics, but the base query does not collect a complete set of signal/stop/crossing control nodes. Stage C therefore needs a bounded control-node input plus conservative uncontrolled/priority rules when controls are absent. Inference must not be presented as mapped fact.

The POI geometry pass can consume classified nodes, but the current primary OSM query does not fetch a general catalog of shop, amenity, and tourism nodes. Shortbread supplies some site categories. Population-attractor logic must work with available land use/building semantics and degrade gracefully; a bounded POI semantic slice can be added only after load/performance experiments prove it safe.

Street furniture currently uses `Math.random()` for trash placement. New Living World and facade systems must use a seeded generator tied to stable world identity so tests and room participants receive deterministic layouts.

### 2.7 Runtime and gameplay ownership

`app/js/runtime/kernel.js` provides ordered input, simulation, world, camera, presentation, and render phases; a 1/60 fixed step; capped delta; at most five catch-up steps; stable system IDs; failure isolation; owner-based unregistration; and deterministic manual advancement.

`app/js/runtime/lifecycle-scope.js` tracks timers, listeners, animation frames, and resources and disposes them by owner.

Only one gameplay plugin is active at a time. Living World cannot be a game plugin because ambient traffic and pedestrians must coexist with free exploration, Live GPS, DeFlock, and other game modes. It should be a world-owned runtime service:

- graph compilation after a fixed world publication;
- fixed-step population simulation under a `living-world:<requestId>` owner;
- interpolation/visibility in presentation;
- renderer updates after simulation;
- lifecycle disposal on world supersession, environment change, or explicit disable.

NPC vehicles should be lightweight kinematic agents. Reusing full player vehicle physics for every car would be unnecessarily expensive and risks physics instability. NPCs must still sample the same transport surface and use simple swept/proximity collision against the player and local obstacles.

The current player character is a 26-mesh procedural four-limb actor with seven materials. It is suitable for one hero, not dozens of NPC clones. Pedestrians need shared geometry/material pools and distance tiers.

The improved player plane, boat, and spacecraft already have explicit visual-budget tests. Their models can inspire a coherent visual language, but they should not become NPC assets or dependencies.

### 2.8 Quality and performance controls

The current target frame is 16.7 ms. Cooperative main-thread work is budgeted around 8 ms, first play around 25 seconds, background work begins after first play, and inactive auxiliary renderers should consume zero frames. Dynamic budgets already expose performance, balanced, and quality tiers. Mobile caps normal world budget scale at roughly 0.52 and LOD scale at roughly 0.78.

The fixed world is already large. Existing documentation records a post-GC New York target in the approximate 644–712 MB range with an 850 MB guard. This makes object count and per-agent allocations as important as triangle count.

Living World must integrate with the existing dynamic budget state instead of creating a separate quality selector.

### 2.9 Existing editing and local persistence

The block builder currently provides four shapes, eight materials, four rotations, half-unit vertical snapping, a 200-block per-location cap, local primary/backup storage, and optimistic room sync with rollback.

The overlay editor already has:

- stable feature IDs and 0.06-degree area keys;
- point, line, and polygon geometry;
- building/road/POI presets;
- `additive`, `render_override`, and `local_replace` merge modes;
- stable `baseFeatureRef` source/type/ID identity;
- height, levels, min-height, roof, entrances, and relationship metadata;
- local drafts with primary/backup persistence;
- a bounded 80-operation undo/redo history;
- base-feature selection;
- public overlay rendering;
- stable-ID base building/road suppression;
- dynamic colliders and traversal invalidation.

The public overlay is a moderated correction/publication path. Local fictional edits and multiplayer alternate-world edits must not be stored there. The rendering, schema normalization, selection, history, suppression, and collider techniques should be generalized behind a scoped composition service while retaining the public overlay workflow unchanged.

### 2.10 Multiplayer, persistence, and security

Rooms are bounded Firestore worlds with player presence and subcollections for blocks, artifacts, activities, game state, paint, DeFlock state, chat, and related state. Existing roles are `owner`, `mod`, and `member`. Shared blocks use coordinate-derived IDs and validated bounded shape/material values.

Security rules currently allow room members to create blocks, owners/moderators to manage more room state, and only trusted Cloud Functions to publish geographic overlays. `functions/overlay.js` already demonstrates sanitization, transactional revisions, history, and moderation patterns.

The requested editable-world roles (`owner`, `moderator`, `builder`, `player`, `visitor`) do not exist. They require an explicit migration and compatibility mapping; existing owner/mod/member documents cannot silently become invalid.

Room edits should be committed operations, not writes on every pointer move. The safest design is a trusted function transaction that validates permission, world identity, base identity, geometry limits, coordinate range, catalog item, object count, payload size, and expected revision before changing a room modification. Clients listen to the bounded committed-delta collection and keep the last good publication if a listener fails.

### 2.11 Analytics

The app has centralized, lazy analytics that starts after runtime initialization and tracks session/mode/environment state on a two-second cadence. Its public module currently exports session start/stop/snapshot, not a general feature-event API. The implementation should add one sanitized central event function rather than importing Firebase analytics directly into NPC/editor modules.

No exact private room geometry or edit payload should be logged. Only aggregated feature events from the brief should be emitted.

### 2.12 Current NPC/AI state

No general ambient pedestrian or traffic population system exists. Current actor logic is player-focused, with specialized police/game behaviors rather than a reusable ambient simulation. The Living World layer is therefore a new capability, but it can reuse transport, surface, spatial, quality, lifecycle, rendering, and persistence infrastructure.

## 3. Reuse, generalize, and create

| Area | Reuse unchanged | Generalize | New capability |
| --- | --- | --- | --- |
| World lifecycle | Request/session/snapshot/publication/cancellation | Add derived-publication owner hook | LivingWorldPublication |
| Roads | Transport records, joins, direction, structure surface | Traversal compiler utilities | Traffic graph, lanes, turn edges, controls |
| Walking | Structured paths, walkability, entry anchor, surface query | Traversal invalidation and path projection | Exterior pedestrian graph and crossing policy |
| Buildings | Source identity, provenance, footprint, facade atlas, colliders | Entrance catalog and facade compiler | Batched doors/storefront/glass/night-window detail |
| Rendering | THREE pools, instancing, shadow policy, dynamic tiers | Shared NPC catalogs | Vehicle/pedestrian render pools and LOD |
| Simulation | Runtime kernel and lifecycle scopes | Spatial indexing/occupancy | Traffic and pedestrian agents |
| Local edits | Overlay schema, selection, history, backup storage, block collision | Scoped composition and semantic catalog | Persistent local WorldModificationSet |
| Room edits | Room identity, listeners, block sync, rules patterns | Roles and trusted revision writes | Room modification revisions/history |
| Public overlay | Existing moderated workflow | Only shared rendering primitives | No semantic change |
| Analytics | Lazy central architecture | Export sanitized event API | New aggregate events |
| Testing | Existing source/runtime/browser/release harnesses | World-matrix fixtures | Deterministic NPC/edit experiments |

## 4. Proposed contracts

Names below describe responsibilities. Final filenames should follow repository conventions during implementation rather than being treated as pre-created commitments.

### 4.1 Stable world identity

```js
WorldIdentity = {
  schemaVersion,
  worldKind,             // earth, moon, space; editable Earth first
  locationKey,
  latitudeE7,
  longitudeE7,
  baseDataProfile,
  deterministicSeed
}
```

`requestId` and load sequence belong only to a live publication. Persistence uses `WorldIdentity`. A stored delta whose world identity does not match the selected world must not be applied.

### 4.2 Living world publication

```js
LivingWorldPublication = {
  schemaVersion,
  requestId,
  loadSequence,
  worldIdentity,
  entranceCatalog,
  pedestrianGraph,
  trafficGraph,
  semanticDensity,
  provenanceSummary,
  diagnostics
}
```

It is derived, read-only, disposable, and never serialized as source truth. Expensive graph products may be lazily created after first play, but only once per active world/configuration revision.

### 4.3 Entrance record

```js
EntranceRecord = {
  id,
  buildingSourceId,
  position,
  outwardNormal,
  access,
  kind,
  provenance: 'mapped' | 'inferred' | 'player',
  sourceFeatureId,
  pedestrianNodeId,
  active
}
```

The same record drives facade rendering, player interaction, pedestrian destinations, and edit invalidation. There must not be four independent entrance guesses.

### 4.4 Pedestrian graph

Nodes represent mapped/inferred sidewalk stations, paths, crossing endpoints, plazas, and entrances. Edges carry width, access, structure state, crossing type, surface reference, source identity, provenance, and cost. Inferred sidewalk edges offset road edges outside the drive surface and are rejected when they intersect water, blocked access, or building footprints.

Mapped path/sidewalk/crossing data wins. Inference is deterministic, conservative, separately countable, and visually/diagnostically identifiable.

### 4.5 Traffic graph

Traffic edges reference compiled transport feature/station intervals and include direction, class, mapped/inferred lane index/count, target speed band, bridge/tunnel/ramp state, and shared surface samples. Junction turn edges are created only between compatible compiled joins and carry turn angle, priority/control state, and conflict-zone IDs.

Lane inference rules should initially be simple:

- honor mapped one-way before every other rule;
- use mapped lane count when valid;
- otherwise infer one lane per permitted direction for ordinary two-way roads;
- avoid spawning on tiny service roads unless urban semantics justify it;
- never infer access through non-driveable or disconnected structure records;
- record every inferred field as inferred.

### 4.6 World modifications

```js
WorldModificationSet = {
  schemaVersion,
  scope: 'local' | 'room',
  scopeId,
  worldIdentity,
  revision,
  suppressions: [{ id, baseFeatureRef, createdBy, createdAt }],
  objects: [{ id, catalogId, transform, materialId, properties, revision }],
  updatedAt
}
```

Composition order is fixed:

1. publish immutable base world;
2. apply stable-ID suppressions to visibility, collision, entry, and navigation views;
3. add custom semantic objects and their colliders/navigation effects;
4. derive affected entrance and navigation patches;
5. render NPCs against the composed query view.

“Demolition” is therefore virtual suppression. Reset removes the delta and reveals the untouched base feature.

### 4.7 Room persistence

Use a bounded current-state collection plus append-only bounded revision events. Each trusted mutation carries `expectedRevision` and is committed transactionally. A stale client receives a conflict, refreshes current state, and retries only after user-visible reconciliation.

Suggested compatibility mapping:

| Existing role | Effective editable role during migration |
| --- | --- |
| owner | owner |
| mod | moderator |
| member | player unless explicitly granted builder |

Visitors can read a public room but cannot commit. Players participate but cannot edit. Builders can commit catalog-limited changes. Moderators can revert/remove room edits. Owners control permissions and reset.

## 5. Simulation and rendering design

### 5.1 Traffic

Compile the graph off the frame-critical path after first play. Spawn from eligible edges outside the immediate camera focus, with deterministic category/color selection. Maintain a lightweight edge occupancy structure and conflict-zone reservations. Agents use kinematic acceleration/braking, a minimum headway, junction reservations, and a bounded local player-avoidance check.

Do not use per-NPC raycasts across the complete scene. Query the traffic graph, shared surface, a small spatial hash, and nearby dynamic modification colliders.

Vehicles in tunnels and on bridges remain on the same compiled feature surface. Despawn only at valid distant graph points, never mid-view because a provider tile was unloaded; there are no movement-driven provider tiles.

### 5.2 Pedestrians

Prove one deterministic agent before adding population. Route between compatible entrance/plaza/path attractors, wait at crossings, and reject water/building intersections. Use simple capsule-like spatial separation and local avoidance rather than full rigidbody physics.

Near pedestrians can use a small articulated procedural rig with shared geometry/materials. Medium/far pedestrians should be instanced simplified silhouettes with vertex or coarse phase animation. Do not clone the 26-mesh hero actor.

### 5.3 Facades

Compile street-facing facade bays deterministically from footprint edges, building use/type, levels, width, and entrance catalog. Mapped values win; inference uses documented rules.

Rendering tiers:

- near: batched shallow door/storefront/window frames and glass planes;
- medium: atlas and a limited merged ground-floor strip;
- far: current atlas/massing only;
- night: emissive atlas masks with per-building/instance phase, not point lights per window.

Glass uses the minimum practical transparent surfaces. Prefer opaque/alpha-test reflection approximations for most windows to avoid sorting and overdraw. No unique canvas texture per building.

### 5.4 Modification-aware navigation

Do not rebuild entire graphs on every edit. Maintain a modification spatial index and dirty cells. A committed suppression invalidates the referenced building entrance nodes and local pedestrian cells. A custom object adds bounded obstacles or walkable surfaces based on catalog semantics. Road edits are limited to safe supported catalog operations until a robust local graph patch compiler exists.

NPCs with invalid routes must stop, replan once, and despawn safely if no valid path remains. They must not walk through suppressed/replacement states or newly built walls.

## 6. Initial R&D ceilings

These are deliberately conservative experiment ceilings, not final shipping values.

| Tier | Active traffic | Active pedestrians | Near articulated pedestrians | NPC shadow casters | Simulation cadence |
| --- | ---: | ---: | ---: | ---: | --- |
| Mobile/low | 6 | 8 | 2 | 0 | near 10 Hz, medium 4 Hz, far 1 Hz |
| Performance desktop | 12 | 18 | 6 | 2 | near 15 Hz, medium 5 Hz, far 1 Hz |
| Balanced desktop | 24 | 36 | 12 | 4 | near 20 Hz, medium 8 Hz, far 2 Hz |
| Quality desktop | 40 | 60 | 20 | 8 | near 20 Hz, medium 10 Hz, far 2 Hz |

Rendering interpolates between simulation samples. Hidden/virtualized agents perform no animation work. Population reduces immediately when measured frame pressure persists and recovers slowly with hysteresis.

Initial release thresholds for the experiment harness:

- zero movement-triggered provider requests;
- no recurring long task above 50 ms attributable to Living World;
- no more than 10% warm-frame p95 regression versus the same location/features with Living World disabled;
- no more than 10% fixed-world load-time regression when facade/pedestrian semantics are enabled;
- derived heap target of at most +80 MB on desktop and +35 MB on mobile over the same fixed-world baseline;
- no listener/timer/runtime-system growth after five world changes;
- zero active NPC renderers and simulation systems in Moon, Mars, Ocean, Space, title, and inactive Earth publications;
- draw calls from facade detail and NPCs capped by pooled batches, with counts asserted by tier rather than allowed to scale per object.

If Manhattan cannot meet these limits at the listed counts, counts go down. The fixed-world and player-control budgets take precedence over ambient density.

## 7. R&D matrix

The permanent experiment runner should use deterministic seeds and capture before/after data for:

| World | Purpose |
| --- | --- |
| Manhattan | Dense buildings, roads, entrances, draw calls, heap |
| Baltimore | Typical dense grid, water/bridges, DeFlock regression |
| Monaco | Grade, ramps, tunnels, stacked roads, constrained sidewalks |
| Suburban fixture | Sparse intersections, inferred sidewalks, lower density |
| Rural fixture | No false urban population, long roads, graceful zero/low density |

For each world run: base only; facade only; traffic only; pedestrians only; traffic plus pedestrians; all plus local edits; all plus room edits. Record load time, first play, frame median/p95/p99, long tasks, draw calls, triangles, renderer programs/textures/geometries, JS heap where available, active/visible/virtual NPCs, graph size/compile time, and provider request count after publication.

Mobile tests require actual touch interaction and at least one constrained viewport/device profile; desktop emulation alone is not enough for final approval.

## 8. Controlled implementation order

The requested order is sound with one dependency refinement: Stage A begins by formalizing the shared entrance catalog because facades and pedestrians both depend on it.

### Stage 0 — Contracts and baseline instrumentation

- Add stable world identity and derived-publication lifecycle contracts.
- Add deterministic random utility and Living World diagnostics.
- Add experiment switches with Living World disabled by default.
- Lock regression baselines and provider-request counting.

Exit: no visible behavior change; existing release contracts pass.

### Stage A — Building depth and entrance catalog

- Compile mapped/inferred entrance records.
- Add batched near-facade doors, storefronts, window frames, restrained glass, commercial ground floors, roof depth, and night emissive masks.
- Preserve current far facade atlas.
- Test provenance, determinism, batch limits, collision, and nighttime appearance.

Exit: visible depth in representative cities without per-window/per-building draw-call explosion.

### Stage B — Pedestrian navigation

- Add bounded exterior semantic acquisition.
- Compile mapped paths/sidewalks/crossings/entrances plus conservative inferred sidewalk edges.
- Prove one deterministic agent, then crossing behavior, entry/exit, pooling, LOD, and adaptive density.

Exit: pedestrians never use water/building interiors unintentionally and mapped/inferred totals are inspectable.

### Stage C — Traffic

- Derive traffic graph from compiled transport.
- Prove one vehicle on ordinary, one-way, bridge, ramp, elevated, and tunnel fixtures.
- Add junction turns, conflict reservations, spacing, catalog variety, pooling, virtualization, and adaptive density.

Exit: no competing road/surface model and no visible overlap under deterministic tests.

### Stage D — Local editable worlds

- Generalize composition/suppression behind a local scope.
- Add semantic structure catalog, transform tools, collision, undo/redo, primary/backup persistence, export/reset.
- Migrate old local blocks without loss.

Exit: suppress, replace, reload, restore-base journey passes without changing public overlays.

### Stage E — Multiplayer editable rooms

- Add backward-compatible roles and explicit edit grants.
- Add trusted transactional modification writes, expected revisions, bounded history, late-join publication, revert/reset, and security rules.
- Migrate old shared blocks and keep unrelated rooms isolated.

Exit: two-client create/edit/revert/rejoin/conflict/offline tests and rules tests pass.

### Stage F — Integration

- Patch entrance/pedestrian/traffic query views after committed edits.
- Connect population density to semantic land use/roads/buildings without claiming live observations.
- Verify Live GPS and DeFlock coexistence and every non-Earth environment teardown.

### Stage G — Optimization

- Run the full R&D matrix.
- Tune final counts, cadences, LOD distances, graph caps, facade batch budgets, heap release, and mobile UI.
- Remove experimental flags only after evidence selects safe defaults.

### Stage H — Final verification

- Full existing regression suite.
- New deterministic unit/contract/security tests.
- Representative browser journeys and visual review at day/night.
- Five repeated world changes and room joins for lifecycle leaks.
- Production artifact/release verification.
- Production deployment only after explicit user approval.

## 9. Permanent test plan

### Architecture and lifecycle

- WorldSnapshot remains immutable before/after all simulations and edits.
- Derived publications reject stale request sequences.
- No movement-triggered fetch after world publication.
- All systems, pools, listeners, timers, graphs, and meshes dispose on world change.
- Moon/Mars/Ocean/Space/title own no Earth Living World workload.

### Traffic

- Graph generation and stable identity.
- Mapped one-way compliance and inferred-lane labeling.
- Connected junction turns; disconnected stacked crossings rejected.
- Bridge, ramp, elevated, tunnel, and underpass surface parity.
- Speed/headway, overlap avoidance, player safety, pool reuse, despawn/respawn.
- Current car, plane, boat, spacecraft, walking, and travel controls unchanged.

### Pedestrians

- Mapped path priority and deterministic inference.
- Sidewalk offset avoids drive surface/buildings/water.
- Crossings connect only valid sides and respect control policy.
- Entrance approach/entry/exit and invalidation after suppression.
- Separation, pooling, animation LOD, zero-density rural behavior.

### Facades

- Deterministic facade output for the same source identity.
- Mapped versus inferred entrance provenance.
- Storefront eligibility and commercial-ground-floor constraints.
- Glass/transparent-material and draw-call ceilings.
- Day/night visual snapshots and roof-detail budgets.

### Local edits

- Base selection by stable source ID.
- Suppression affects render, collision, entrance, and navigation views but not base records.
- Rich object placement, snapping, transform, collision, undo/redo.
- Primary/backup recovery, schema migrations, per-world isolation, reset-to-real-world.

### Multiplayer edits

- Role/permission matrix and legacy-role migration.
- Trusted payload limits and invalid-catalog/coordinate/source rejection.
- Expected-revision conflicts, atomic commits, bounded history, revert.
- Two-client convergence, late join, reconnect, listener failure, room isolation.
- Existing blocks, artifacts, chat, activities, DeFlock state, and room deletion cleanup.

### Product regression

- Baltimore DeFlock camera discovery/toppling and room sync.
- Live GPS start/stop/location lifecycle.
- Walking, car, plane, boat, spacecraft, Moon, Mars, Ocean, Space.
- Bridges, ramps, elevated roads, and tunnels, especially Monaco.
- Mobile HUD/editor controls, orientation change, touch selection, memory pressure.
- Release artifact, security rules, functions runtime, module versions, maintainability, and repository cleanliness.

## 10. Principal risks and mitigations

| Risk | Consequence | Mitigation/gate |
| --- | --- | --- |
| General footway/entrance query is too broad | Slow or failed city loads | Tight detail radius, bounded feature budget, cancellation, post-first-play optional compilation, cache, fail-soft inference |
| A second road-height model appears | Cars float/fall at bridges/tunnels/ramps | Traffic edges reference transport intervals and shared surface only; contract test forbids alternate owner |
| Per-window/per-agent object explosion | Draw calls, heap, GC stutter | Atlas, instancing, merged buffers, pools, fixed tier caps, no per-agent allocation in update |
| Hero models cloned for crowds | Hundreds of meshes/materials | Dedicated shared pedestrian and NPC vehicle catalogs |
| Edit scope conflated with public overlay | Fictional changes leak into public geography | Explicit local/room scope and composition service; public overlay workflow unchanged |
| Transient IDs used for persistence | Suppressions fail after reload/provider fallback | Stable OSM/Overture/source IDs plus deterministic identity tests; no mesh UUIDs |
| OSM/Overture identity changes between sources | Replacement ambiguity | Persist source, type, ID, location identity, and optional footprint signature; surface conflict to user rather than approximate destructive match |
| Full graph rebuild on drag | Repeating frame stalls | Preview is local visual only; commit patches bounded dirty cells |
| Room write on every pointer move | Cost, conflicts, jitter | Debounced/explicit commit through trusted transaction |
| Old room roles/data break | Existing users lose access or data | Additive schema/version migration and compatibility mapping |
| NPC physics destabilizes player | Jumpiness and collisions | Kinematic agents, occupancy/conflict reservations, bounded player avoidance, no full rigidbody fleet |
| Analytics leaks private edits | Privacy breach | Aggregate event names only; no room geometry/content |
| Population presented as real data | Misleading product claims | UI/docs label it procedural simulated traffic/population; provenance diagnostics |

## 11. Documentation ownership

During implementation, update `docs/SYSTEM_INVENTORY.md` and focused subsystem documentation after each stage. Documentation must explicitly distinguish:

- mapped source facts;
- deterministic inference;
- procedural simulation;
- local fictional modifications;
- room-scoped fictional modifications;
- moderated public geographic overlays.

The final public wording should say that traffic and pedestrian populations are simulated unless a future explicitly identified live-data provider is integrated.

## 12. Audit baseline and unresolved checks

The worktree was clean at audit start. No feature code, deployment, push, or production state was changed.

Completed green targeted baselines:

- World publication snapshot contract;
- transport surface contract, including bridge/tunnel/ramp/stacked-surface fixtures;
- runtime kernel contract;
- building geometry quality contract;
- block-builder contract, including legacy shape default and ramp driveability.

`test:editor-multiplayer` began and then remained idle without further output. It was terminated rather than left consuming resources. This is an unresolved test-harness baseline item and must be rerun/diagnosed before editing the shared editor or multiplayer paths. The remaining multiplayer and rules commands in that chained invocation did not run and are not claimed as passing here.

## 13. Architecture gate checklist

Implementation may start only from these decisions:

- fixed-world invariant retained;
- base snapshot immutable;
- Living World is a derived world service, not a game plugin;
- traffic graph derives from compiled transport and shared surface;
- pedestrian semantics use one bounded fixed-world acquisition/inference pass;
- entrance catalog is shared by facade, interaction, and pedestrians;
- local/room deltas are separate from public overlays;
- stable source identity is mandatory for suppression;
- room writes use permissioned, versioned commits;
- pools/instancing and adaptive budgets are mandatory;
- release counts are selected by measured R&D;
- production remains undeployed until Stage H and explicit approval.

This report completes the requested pre-implementation architecture gate. It does not authorize skipping any stage-level tests or the final release verification.

## 14. Implemented result and measured limits

Stages 0–G are implemented on the local `steven/living-editable-world` branch. The fixed-world invariant remains intact: Living World derives immutable entrances, pedestrian/traffic graphs, façade presentation, and pooled agents only after an accepted `WorldSnapshot` publishes. Ordinary movement performs no provider query and no whole-road scan. Reload disposes the derived runtime before the next world owns the scene.

The local editable layer persists compact, schema-versioned deltas keyed by fixed geographic identity. Building suppression uses stable OSM/Overture source identity during normal building compilation and never mutates provider records. A single suppression Set is compiled per load. Primary/backup recovery, optimistic revision checks, bounded history, restore-by-ID after page reload, and Restore Base World are implemented. Room-scoped modifications use Firestore transactions, manager-only base suppression/reset, member-owned safe objects, bounded transforms/catalogs/history, and listener convergence. Public moderated overlays remain a separate system.

The accepted balanced-tier Baltimore measurement publishes 112 inferred entrances, 164 entrance links, 24 pedestrians, and 14 vehicles at a 10 Hz simulation rate. Presentation adds eight draw calls and 9,072 triangles with no per-window transparency. The adaptive performance tier uses 56 entrances, 12 pedestrians, and 8 vehicles. The five-location Manhattan/Baltimore/Monaco/suburban/rural run held a 16.7 ms median frame time and drained every provider before gameplay sampling.

The deterministic v4.2.0 comparison primes provider caches once and gives both revisions the same inputs. The candidate measured 2.0% faster cold and 6.2% slower warm, inside the 10% load budget; bootstrapping was faster in both samples. Warm heap was 6.2% above the reference. Raw dense-city Chrome heap samples ranged roughly 0.8–1.82 GB across sequential real-provider loads, so total process memory must not be attributed to the eight-call Living World layer without a post-GC/component-isolated measurement.

Current intentional limits: populations are procedural simulations, not live observations; mapped entrance coverage is used when present but current sampled cities relied on labeled deterministic inference; pedestrian animation is lightweight; traffic follows bounded compiled lanes with conservative junction behavior rather than a city-scale traffic solver; local rich architectural objects use the safe semantic catalog while legacy blocks retain their compatible persistence path. Final Stage H still requires the complete production gate, immutable local candidate creation, and explicit user approval before any deployment.
