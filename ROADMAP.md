# Roadmap

This roadmap describes the work required to move World Explorer 3D from the
current 4.3.1 release to a production-ready 5.0 release. It distinguishes
shipping foundations from partial systems and scaffolding so that a visible UI
or data model is never mistaken for a complete feature.

Priorities can move when provider availability, licensing, security, or measured
hardware limits change. A workstream is complete only when its acceptance
criteria pass in the assembled application and its user-facing limitations are
documented.

## Status definitions

- **Shipping** — available through the normal 4.3.1 product path and covered by
  a production verification gate.
- **Partial** — useful end-to-end behavior exists, but coverage, resilience, or
  verification is incomplete.
- **Scaffold** — UI, schemas, local storage, or preview behavior exists without
  the complete production workflow.
- **Planned** — no supported end-to-end product path is claimed yet.

## Product invariants

Every roadmap item must preserve these rules:

- Earth remains a fixed, bounded, selected-location experience. It will not
  become a continuously streaming world.
- Mapped identities, geometry, heights, and provenance remain authoritative
  when available. Inferred values stay labeled as inference and are never
  described as surveyed measurements.
- Each physical surface and world layer has one publication authority. New work
  must replace or extend that authority instead of adding a competing loader,
  renderer, collision surface, or gameplay-only duplicate.
- Performance work must release duplicate state, defer optional systems, batch
  compatible work, or reduce effects before reducing mapped world detail.
- A count-only test does not prove a visible feature. Completion requires the
  final assembled game with terrain, water, buildings, transport, population,
  atmosphere, HUD, collision, and player control active together.
- Provider, license, datum, freshness, coverage, and fallback state remain
  inspectable. Missing data fails honestly or uses a bounded labeled fallback.

## Current 4.3.1 baseline

The following foundations are already shipping and should be improved in place:

- One selected-location Earth loader and immutable world publication path.
- One compiled transport surface for roads, bridges, ramps, elevated roads,
  overpasses, underpasses, and tunnels.
- Provenance-aware buildings, water, terrain, mapped entrances, street-facing
  facade detail, generated interiors, and deterministic height resolution.
- Walking, driving, drone, plane, boat, underwater, rover, astronaut, and space
  traversal.
- Earth, Ocean, Moon, Mars, and Space lifecycle transitions without a page
  reload.
- Bounded multiplayer rooms with presence, chat, artifacts, shared blocks,
  room activities, and emulator-backed authorization tests.
- Discovery, field activities, companions, progression, DeFlock Hunt, fishing,
  block building, overlay editing, and activity-creation foundations.
- Immutable hosting artifacts, source checks, assembled-world checks, lifecycle
  checks, multiplayer convergence checks, and release verification.

The accepted-ground catalog currently contains 41 reviewed fixed-location
artifacts: 38 classified Copernicus artifacts and three USGS 3DEP artifacts.
Outside accepted coverage, the runtime can still use the documented legacy
terrain fallback, whose mixed vertical datum is not proven uniform. This is a
known boundary of the current terrain system, not global bare-earth completion.

## 5.0 release workstreams

### R5.1 — Terrain accuracy and bare-earth coverage

**Status: Partial**

What exists:

- Integrity-checked accepted-ground artifacts with explicit source release,
  datum, coverage, spacing, confidence, provenance, and fail-closed validation.
- USGS 3DEP and classified Copernicus provider contracts, stacked regional and
  detailed artifacts, exact rendered-triangle sampling, and one final seam
  authority.
- Worldwide fallback coverage for locations without an accepted artifact.

Work required:

1. Publish a provider and licensing decision for each intended coverage tier:
   regional ground, local high-resolution ground, Arctic, and Antarctica.
2. Expand accepted bare-earth or corrected-ground artifacts beyond the current
   reviewed locations without overlapping publication authorities.
3. Record vertical-datum normalization and correction attestations in every
   accepted artifact; do not promote a digital surface model as bare earth.
4. Add provider-outage, polar-boundary, coastline, mountain, flat-rural, and
   four-tile-corner fixtures to the artifact build and runtime gates.
5. Expose accepted, fallback, unavailable, and outside-coverage terrain states
   consistently in diagnostics and user-facing data information.

Completion evidence:

- Every supported preset resolves to one accepted artifact stack or an
  explicitly labeled fallback with no missing samples converted to zero.
- Rebuilding an artifact from the same source release produces the same content
  hash and final terrain samples.
- The assembled Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural
  Iowa, and Tokyo matrix passes terrain, transport, collision, building-height,
  and final-visibility checks under primary and documented fallback providers.
- Arctic, Antarctic, mountain, coast, desert, and flat-rural final frames are
  inspected and their source/datum state is recorded.

### R5.2 — Licensed world detail and environmental data

**Status: Partial**

What exists:

- Map-informed buildings, landmarks, facade materials, roof semantics,
  vegetation, hydrology, land use, WorldCover classification, and distant
  regional context.
- Stable feature identity and mapped-versus-inferred provenance for the core
  world publication.

Work required:

1. Create a source matrix for landmarks, facade attributes, roof attributes,
   vegetation, hydrology, and land cover that records license, attribution,
   release, coverage, freshness, identity scheme, and redistribution rules.
2. Define one ingest and deduplication contract per layer before adding another
   provider. Provider priority must not depend on response order.
3. Add automated provenance-to-final-visual checks for each layer, comparable
   to the mapped-tall-building identity check.
4. Add outage and sparse-data behavior for every provider. A richer layer may
   disappear when unavailable, but it may not erase the authoritative base
   world or rewrite unrelated features.
5. Add visual review locations for dense urban, suburban, rural, tropical,
   arid, alpine, coastal, and polar environments.

Completion evidence:

- Every published object reports its source identity, release, mapped or
  inferred status, and final scene attachment.
- Duplicate provider features resolve deterministically to one physical object.
- Provider failure changes only the affected optional layer and does not change
  mapped building height, terrain, roads, or the selected world boundary.
- Attribution and redistribution checks pass for both the source tree and the
  immutable production artifact.

### R5.3 — Complete-route performance and memory

**Status: Partial**

What exists:

- On-demand Earth, Ocean, and Space runtimes; explicit location cancellation;
  lifecycle scopes; quality settings; batched world geometry; and teardown
  diagnostics.
- Production-shaped build, reachability, asset, source-map, and lifecycle
  verification.

Work required:

1. Record 4.3.1 baselines for launch, location load, first controllable frame,
   steady-state frame time, peak browser memory, retained memory after teardown,
   network transfer, draw calls, and triangles.
2. Define desktop and mobile hardware tiers and publish numeric pass/fail budgets
   in a versioned performance-budget document.
3. Exercise complete journeys: title to Earth, repeated location replacement,
   street-to-plane travel, Earth-to-Ocean, Earth-to-Moon/Mars/Space, multiplayer
   join/leave, interior entry/exit, and return to title.
4. Remove duplicate owners, unbounded caches, unreachable assets, and retained
   listeners before changing world detail. Optional effects may scale by quality
   tier; mapped geometry and height authority may not.
5. Add sustained aerial-travel and repeated-transition soak tests on desktop and
   mobile-sized viewports, including provider delays and cancellation.

Completion evidence:

- Budgets are measured from immutable candidates on named hardware/browser
  tiers; no inferred or estimated number is presented as a measurement.
- Ten repeated location replacements and five full environment cycles finish
  without owner-count growth, stale publication, duplicate scene roots, or an
  out-of-memory failure.
- Each complete journey remains controllable and visually equivalent in mapped
  detail to the accepted 4.3.1 baseline.

### R5.4 — Ocean, shoreline, boat, underwater, and fishing

**Status: Partial**

What exists:

- Surface boat traversal, waves and sea-state controls, water selection,
  shoreline transfer, underwater travel, fish life, ocean HUD, local bathymetry
  support, and a playable fishing loop with catches and records.
- Source-aware bathymetry evidence that distinguishes measured, modeled, and
  fallback depth information.

Work required:

1. Unify inland water, coastline, ocean, boat, and underwater transitions around
   the published navigable-water surface and one shoreline boundary contract.
2. Expand reviewed bathymetry coverage beyond the current limited local data and
   define honest behavior where depth data is unavailable.
3. Validate boat hull contact, grounding, docking, wave response, chase camera,
   and exit placement in calm, rough, shallow, river, lake, and open-ocean cases.
4. Expand underwater environments and fish habitat rules without presenting
   generated encounters as observed local wildlife.
5. Add complete browser journeys for boat entry/exit, shore return, underwater
   descent/ascent, fishing catch/loss, and teardown.

Completion evidence:

- No boat, player, camera, or fishing actor crosses an unpublished water surface
  or spawns below accepted ground.
- Coast, river, lake, harbor, island, and open-ocean fixtures pass traversal,
  collision, provenance, lifecycle, and complete-frame review.
- Fishing remains playable with keyboard and touch, and generated species,
  length, weight, occurrence, and depth evidence are labeled accurately.

### R5.5 — Mapped and generated interiors

**Status: Partial runtime; scaffolded authoring**

What exists:

- Enterable eligible buildings, mapped OpenStreetMap indoor room/corridor data
  where available, a bounded generated fallback, footprint containment, and
  interior-aware multiplayer artifact anchors.
- Overlay presets and fields for rooms, corridors, stairs, elevators, served
  levels, and building references.

What is not complete:

- The mapped runtime selects a usable level, but a general multi-level traversal
  graph with stairs and elevators is not yet a supported production contract.
- Indoor editor rooms, corridors, stairs, and elevators are explicitly scaffold
  data. Their presence in the editor does not mean authored indoor navigation
  is complete.

Work required:

1. Define one indoor identity and publication schema for building, level, room,
   corridor, entrance, stair, and elevator relationships.
2. Build a level-aware navigation and collision graph shared by mapped data,
   generated interiors, authored overlays, player traversal, and multiplayer.
3. Replace generic fallback layouts with deterministic footprint-, use-, size-,
   entrance-, and level-aware layout families while retaining mapped features.
4. Finish the indoor authoring workflow through validation, moderation,
   publication, rollback, and final runtime consumption.
5. Add accessibility metadata and route checks for entrances, stairs, elevators,
   and reachable levels without inventing accessibility facts when unmapped.

Completion evidence:

- A mapped single-level building, mapped multi-level building, generated small
  building, generated large building, and authored overlay all pass entry,
  traversal, collision, exit, teardown, and multiplayer-anchor tests.
- Authored connectors affect the same navigation graph used by the player; no
  editor-only or renderer-only duplicate path remains.
- Re-entering the same building in the same world snapshot produces the same
  layout and identity.

### R5.6 — Multiplayer resilience, moderation, and shared activities

**Status: Partial**

What exists:

- Authenticated bounded rooms, private invite codes, public city discovery,
  presence, movement, chat, artifacts, blocks, shared world edits, room games,
  home bases, social data, and authorization rules.
- A production-shaped two-client emulator gate verifies room creation/joining,
  distinct users, presence, and shared artifact convergence without production
  user data.

Work required:

1. Define authoritative reconnect behavior for presence, chat, artifacts,
   builds, world edits, and active activities after offline, refresh, duplicate
   tab, token refresh, owner departure, and room deletion events.
2. Complete report, block, mute, kick/ban, content review, audit, retention, and
   appeal paths with least-privilege backend enforcement.
3. Add deterministic conflict resolution and schema migration for every shared
   object type.
4. Load-test the supported 2–32 player range and publish a recommended room size
   for each supported device tier based on measured evidence.
5. Extend integration coverage from two clients to reconnect, owner transfer or
   room closure, concurrent writes, moderation actions, and shared activity
   completion.

Completion evidence:

- Emulator tests prove allowed and denied behavior for every room role and
  moderation action.
- Reconnect restores one room identity and one copy of each shared object without
  resetting accepted activity progress or duplicating presence.
- Measured room tests meet the published latency, write-rate, memory, and player
  count budgets without using production accounts or data.

### R5.7 — Creation tools, games, progression, and accessibility

**Status: Mixed; shipping games and progression, scaffolded creator publishing**

What exists:

- Overlay editing with presets, validation, local drafts, submission and
  moderation UI; an activity creator with route, zone, dock, and collectible
  anchors; creator profiles; editable-world tools; and a 200-piece block builder.
- Discovery journals, Field Guide records, backpack items, companions, goals,
  Explorer points, DeFlock Hunt, fishing, Paint Town, flower challenge, and
  room activities.
- Touch controls and substantial labels, live regions, and keyboard/gamepad
  input foundations.

What is not complete:

- The overlay editor is presented as a beta demo, and indoor authoring remains
  scaffolded.
- Activity drafts can remain local with language that publishing will happen
  later; a complete creator-to-moderation-to-discovery production path is not
  yet established by a release gate.
- Accessibility markup exists, but there is no end-to-end accessibility gate or
  published keyboard, focus, contrast, reduced-motion, caption, and screen-reader
  acceptance matrix.

Work required:

1. Choose the supported 5.0 creator scope. Remove unsupported controls or finish
   each retained workflow through save, validation, moderation, publication,
   discovery, versioning, rollback, and deletion.
2. Make creator output consume existing world, indoor, activity, and multiplayer
   authorities instead of creating preview-only geometry.
3. Define one account-backed progression schema with deterministic offline/local
   migration, duplicate-award prevention, and explicit privacy/retention rules.
4. Audit every core journey for keyboard-only use, visible focus, semantic names,
   focus trapping/restoration, contrast, scalable text, reduced motion, touch
   target size, and screen-reader status updates.
5. Add automated accessibility checks plus manual keyboard, screen-reader,
   mobile, and controller checklists to release verification.

Completion evidence:

- A non-admin can create, validate, submit, revise, and later discover a
  moderated activity or world overlay; an admin can review it; unauthorized
  publication is rejected by backend rules.
- Published content survives reload and another authenticated client sees the
  same version; rollback removes it without mutating imported base data.
- Progress cannot be awarded twice for the same authoritative event and merges
  safely across local and account sessions.
- Title, location selection, core traversal, pause/settings, games, creator,
  multiplayer, and environment transitions pass the published accessibility
  matrix.

## 5.0 delivery order

Work should proceed one bounded authority at a time in this order:

1. **Baseline and budgets** — freeze reproducible 4.3.1 visual, data, memory,
   performance, security, and accessibility evidence.
2. **Data decisions** — finish terrain and environmental provider/license
   matrices before expanding runtime ingestion.
3. **Core world contracts** — expand accepted ground and environmental layers
   without adding duplicate authorities.
4. **Complete traversal systems** — finish ocean and multi-level interior paths
   against the same published surfaces used by rendering and collision.
5. **Complete online workflows** — harden multiplayer reconnect/moderation and
   finish creator publication end to end.
6. **Progression and accessibility** — consolidate persistence and close the
   complete-product interaction matrix.
7. **Release candidate** — run source, security, provider, assembled-world,
   actor/vehicle, environment, lifecycle, multiplayer, performance, memory,
   accessibility, and immutable-artifact checks against the exact candidate.

After each verified authority change, inspect the complete final frames, update
the regression record, and create a labeled local checkpoint before starting
the next change.

## 5.0 release definition

Version 5.0 is ready only when:

- Every R5 workstream above has satisfied its completion evidence or has been
  explicitly removed from the 5.0 product scope and public feature claims.
- No shipping screen describes a scaffold, local-only preview, or unsupported
  backend path as a complete production feature.
- Known limitations, data sources, attribution, controls, privacy, security, and
  support documentation match the immutable release artifact.
- The same release candidate passes the worldwide assembled matrix and complete
  desktop/mobile journeys without reducing mapped world detail.
- The repository commit, release tag, public site, production artifact manifest,
  changelog, and displayed version all identify the same build.

## Future exploration after 5.0

These items remain planned and are not part of the 5.0 completion definition:

- Licensed rail, bicycle, and hiking route experiences. Existing parsed route
  geometry or editor presets do not yet constitute dedicated gameplay modes.
- Additional scientifically grounded planetary surfaces and catalog-backed
  space destinations.
- Improved astronomical navigation, flight handling, encounters, and scale
  communication. Current visual scaling remains a playable presentation, not an
  orbital simulator.
- Historical or reconstructed environments only where source provenance,
  uncertainty, rights, and labeling support them.
