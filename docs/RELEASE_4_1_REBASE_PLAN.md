# World Explorer 3D 4.1 Runtime Rebase Plan

Status: governing recovery plan
Production baseline: `v3.1.0`
Required live build: `3.1.0+0354194baf2f.774a91ee84b96fd6.production`
Decision date: 2026-07-26

## Outcome

Build a new 4.1 release that:

- retains the current 4.1 interface and approved product capabilities;
- uses selected-location Earth only;
- contains no Continuous World setting, source path, loader, cache, or runtime
  branch;
- renders globally consistent terrain, roads, paths, structures, buildings,
  water, vegetation, spawn, collision, navigation, and camera behavior through
  one compiled world authority;
- is at least as visually coherent as the accepted 3.0/3.1 reference scenes;
- is measured on production hardware and rejected when a human-visible frame
  is broken;
- is delivered through a protected, contributor-ready repository and an
  immutable, reversible release process.

This plan does not promote the current 4.1 implementation. Current 4.1 is a
product-parity and failure-evidence source.

## Baselines and their roles

| Reference | Role | What may be retained |
| --- | --- | --- |
| `v3.0.0` | Visual terrain reference | Terrain material, relief readability, scale, and scene-composition evidence only |
| `v3.1.0` / `0354194baf2f` | Clean live and code rebase baseline | Working product behavior, source assets, persistence compatibility, and last trusted release artifact |
| verified 4.0 / `7c7e95e269af` | Intermediate behavior reference | UI/product improvements and measured fixes that pass an owner-level review |
| current 4.1 branches | Evidence, not merge input | UI parity inventory, tests with valid outcomes, lifecycle findings, compiler experiments, known regressions, and deletion lists |

No phase may merge a historical version wholesale. Every retained behavior gets
an owner, contract, and parity row.

## Why the previous line drifted

The comparison is quantitative:

| Metric | 3.1.0 | verified 4.0 | current 4.1 |
| --- | ---: | ---: | ---: |
| Application JavaScript modules | 384 | 407 | 408 |
| Application JavaScript lines | 102,386 | 108,264 | 106,303 |
| Shared-context importers | 160 | 155 | 148 |
| Raw elevation users | 21 | 21 | 20 |
| Terrain-mesh height users | 12 | 15 | 14 |
| Surface-query users | 17 | 22 | 22 |
| Road-rebuild owners/callers | 4 | 4 | 4 |
| Test scripts | 28 | 60 | 67 |

3.1 to verified 4.0 changed 363 files, adding about 33,000 lines. Verified
4.0 to current 4.1 changed another 231 files. The number of tests more than
doubled, while raw terrain and road-rebuild ownership barely changed.

The recurring defects therefore come from ownership and publication order, not
from insufficient coordinate coverage:

1. renderer meshes and mutable arrays are used as world truth;
2. raw elevation, terrain mesh height, and surface queries coexist;
3. terrain arrival can rebuild roads, reposition buildings, and move actors;
4. optional/deferred work can modify a world after its transaction commits;
5. structure semantics are resolved after some geometry already exists;
6. tests can prove two consumers agree with the same wrong input;
7. large cross-cutting batches made visual regressions hard to attribute.

Continuous Earth increased the number of lifecycle, source, LOD, and retirement
paths, but it was not the sole cause. Its foundation predates 3.0. The selected
location runtime already had duplicate surface authorities in 3.1.

## Repository and branch decision

Do not force-push or rewrite the current `main` history.

1. Preserve the current 4.1 line as historical evidence.
2. Create `stable` at annotated release tag `v3.1.0`.
3. Protect `stable` and make it the contributor/default branch after its
   workflow and documentation references are updated.
4. Create `steven/4.1-runtime-rebase` from `stable`.
5. Deliver one owner-level phase per pull request into `stable`.
6. Tag and deploy only exact clean commits from `stable`.
7. Keep production on 3.1 until the complete 4.1 candidate passes.

This avoids an unreviewable reverse merge and makes the repository's default
branch match the trusted baseline.

## Non-negotiable architecture

```text
AppRuntime
  -> DestinationSession
       -> EarthSession
            -> WorldLoadTransaction
                 -> SourceAdapters
                 -> DistrictSource
                 -> DistrictGroundModel
                 -> TransportStructureGraph
                 -> HydrologyAndOccupancy
                 -> CompiledWorldDistrict
                 -> WorldStore
                 -> WorldScene
                 -> WorldSurfaceQuery
                 -> Traveler
  -> ProductShell
  -> PersistencePorts
  -> MultiplayerPorts
```

Rules:

- domain/compiler modules do not import shared context, Three.js, DOM,
  Firebase, or network APIs;
- provider data is immutable after normalization;
- raw elevation and corrected ground are different named products;
- render geometry never becomes source data;
- one generation publishes rendering, collision, traversal, labels, spawn,
  placement, and camera queries atomically;
- terrain LOD changes representation, never logical heights;
- post-commit structural mutation is forbidden;
- losing owners are deleted in the same phase that certifies replacements;
- a rejected or low-confidence district reports a recoverable load failure
  instead of inventing flat terrain.

## Phase 0 — Freeze and inventory

Work:

1. Keep production on the exact 3.1 artifact.
2. Preserve v3.0, v3.1, verified 4.0, and current 4.1 references.
3. Produce a parity ledger for every retained UI and feature.
4. Classify existing tests as:
   - invariant contract;
   - product journey;
   - performance/resource;
   - visual evidence;
   - infrastructure/security;
   - legacy-implementation test to delete.
5. Record current Firebase schemas and migrations without changing production.
6. Establish protected `stable` and the recovery branch.

Exit:

- every historical change has a disposition;
- no unclassified test is in a required workflow;
- no development deployment targets production;
- the recovery branch builds the exact 3.1 behavior before replacement work.

## Phase 1 — Prove terrain source correctness

No filtering, smoothing, road rebuilding, or screenshot tuning occurs first.

Work:

1. Verify Web Mercator tile addressing, XYZ Y direction, antimeridian and
   latitude bounds.
2. Verify Terrarium decoding independently:
   `R * 256 + G + B / 256 - 32768`.
3. Record the source horizontal resolution, vertical datum, void/failure
   values, coverage, attribution, and whether it represents terrain or surface.
4. Verify WGS84 geographic coordinates to local east/north/up metres and back.
5. Make default physical terrain exaggeration exactly `1.0`; any artistic
   exaggeration is presentation-only and cannot affect physics.
6. Compare raw provider samples with independent authoritative elevation
   controls across flat urban, steep urban, rural, mountain, coast, below sea
   level, high latitude, and tile-edge classes.
7. Diagnose Sydney from raw bytes through decoded metres, local coordinates,
   mesh vertices, and displayed pixels.
8. Approve or replace the elevation provider through a source decision record.

Exit:

- transform round trips and adjacent-tile edges meet metre-based tolerances
  derived from source resolution;
- raw control-point errors are recorded, not hidden;
- the source is classified as acceptable ground data, correctable surface
  data, or rejected;
- Sydney's error is attributed to provider content, decode, transform, datum,
  scaling, or later composition.

## Phase 2 — One district compiler

Work:

1. Normalize one selected-location OSM dataset into immutable
   `DistrictSource`.
2. Compile a seam-stable `DistrictGroundModel` before geometry.
3. If Phase 1 proves positive surface contamination, apply an approved
   ground-classification method with confidence and rejection output.
4. Compile roads, paths, rail, bridges, tunnels, portals, ramps, and
   intersections into one `TransportStructureGraph`.
5. Compile hydrology, building occupied volumes, foundations, and spatial
   exclusions after transport structure semantics.
6. Publish one immutable `CompiledWorldDistrict`.
7. Delete Overture and Continuous World ordinary-vector paths.

Exit:

- source IDs reconcile through every compiled product;
- one at-grade surface is shared across adjacent features;
- grade-separated overlap is explicit;
- no coordinate-specific correction code exists;
- compiler output is deterministic under feature-order changes;
- rejected source or ground confidence blocks publication.

## Phase 3 — Atomic store and scene publication

Work:

1. Make `WorldStore` the only active district owner.
2. Make `WorldScene` the only world mesh/resource owner.
3. Build render, collision, traversal, label, and query indexes off-scene.
4. Atomically publish a complete generation.
5. Retire the prior generation only after successful publication.
6. Cancel stale requests and dispose exact generation-owned resources.
7. Delete direct replacement of global world arrays.
8. Delete deferred structural additions after commit.

Exit:

- load, replacement, cancellation, retry, and rollback are deterministic;
- a committed generation never changes feature identity or height;
- three location cycles plateau in heap, geometry, material, texture, listener,
  worker, request, and frame-owner counts.

## Phase 4 — Terrain, transport, and structure rendering

Work:

1. Render terrain from the compiled ground model with shared edge samples,
   skirts/stitching, stable normals, and bounded near/mid/far meshes.
2. Render at-grade roads and paths from compiled cross/longitudinal profiles.
3. Triangulate intersections from graph topology rather than overlapping
   ribbons.
4. Render bridge decks, approaches, tunnel interiors, and portals from
   structure records.
5. Use physical road widths and surface tags with documented fallbacks.
6. Keep materials independent from geometry correctness.
7. Port accepted 3.0 terrain readability and current 4.1 road/UI presentation
   only after geometry passes.
8. Delete `rebuildRoadsWithTerrain` and terrain-triggered building/actor
   reprojection.

Exit:

- roads cannot disappear under the surface or float above it;
- intersections have no holes or overlapping slabs;
- paths remain usable on slopes;
- bridges and tunnels preserve clearance and terrain ownership;
- LOD transitions cannot change logical surface height.

## Phase 5 — Buildings, vegetation, water, and camera

Work:

1. Derive building base/foundation from the compiled occupied surface.
2. Preserve mapped height, levels, material, facade, roof, and structure tags.
3. Reject ordinary solid building volumes in road cores or water.
4. Place vegetation/props through the shared occupancy index.
5. Render water from hydrology records with shoreline and seabed ownership.
6. Bind spawn, collision, navigation, placement, and all camera modes to
   `WorldSurfaceQuery`.
7. Use one stateful obstruction solver per traveler family.

Exit:

- no floating trees, submerged ordinary buildings, road-core buildings,
  disappearing near-field grass, camera flipping, penetration, or oscillation;
- every surface sample reports generation, kind, layer, provenance,
  confidence, and traversal permissions.

## Phase 6 — 4.1 UI and feature parity

Port product behavior through adapters; do not let product modules mutate the
world.

Required parity rows:

- current title screen and north-up globe selector;
- selected-location search, presets, saved places, maps, navigation, sharing,
  weather, time, environment, controls, and accessibility;
- walk, drive, drone, plane, boat/ocean, interiors, and block building;
- Moon, Mars, Space, universe map, and destination return;
- accounts, persistence, activities/editors, creator tools, and challenges;
- multiplayer rooms, presence, chat, shared activities, and authoritative MMO
  compatibility;
- desktop, phone portrait/landscape, tablet, keyboard, touch, and gamepad.

Each row records:

- reference commit and screenshot/journey;
- owning adapter and domain port;
- persistence/schema compatibility;
- contract, browser journey, and visual result;
- explicit omissions or deferred work.

Continuous World has no parity row and must remain absent.

## Phase 7 — Tests that measure the product

### Pull-request gate

- compiler and ownership contracts;
- source/transform/datum tests;
- deterministic and property-based world generation;
- affected product journey;
- architecture dependency and losing-owner checks;
- security, secrets, licenses, and build identity.

### Nightly gate

- generated terrain classes, random locations, feature-order permutations,
  adjacent districts, provider failures, and cancellation races;
- sustained movement and LOD transitions;
- resource plateaus;
- mobile and destination cycles.

### Release-candidate gate

- clean installed-Chrome hardware run;
- fixed geography classes, not coordinate fixes;
- cold/warm load, frame-time distribution, memory, GPU resources, WebGL loss,
  request/cache behavior, and scene counts;
- inspected daylight, dusk, rain, walk, drive, aerial, bridge, tunnel,
  mountain, coast, water, dense urban, rural, and failure-state screenshots;
- exact artifact, preview, rollback rehearsal, and public smoke.

### Test-quality rules

- thresholds come from source resolution, physical constraints, measured
  baseline distributions, or explicit product budgets;
- no test passes solely because road and terrain agree with each other;
- no screenshot is approved by software WebGL when it captures the wrong
  canvas;
- locations are fixtures for data classes only;
- a regression adds an owner-level invariant, never a coordinate exception;
- tests for deleted implementations are deleted;
- the full suite runs once per candidate, not after every small edit.

## Phase 8 — Governance and release

Repository requirements:

- Discussions and Issues enabled;
- bug and feature forms, PR template, CODEOWNERS, contributing, conduct,
  security, license, attribution, and support routing retained;
- protected `stable` branch;
- PR required with zero approvals while there is one maintainer;
- required up-to-date `verify` and `gitleaks` checks;
- conversation resolution and linear history required;
- force pushes and branch deletion blocked;
- squash merge only and automatic source-branch deletion;
- DCO sign-off required now; cryptographic signed-commit enforcement only
  after the maintainer signing path is tested;
- production deploys only immutable production-configured artifacts with
  explicit approval and rollback snapshot.

Release exit:

- all parity rows pass;
- no critical advisory and every high advisory has an explicit disposition;
- exact clean commit and artifact are reproducible;
- staging promotion and rollback rehearsal pass;
- public manifest, release notes, changelog, known issues, and GitHub Release
  agree;
- production remains recoverable to 3.1 until post-release smoke passes.

## 5.0 continuation

4.1 establishes the platform boundary. 5.0 may then add facade systems,
advanced water/vessels, spacecraft/orbital gameplay, historical Earth, and
prehistoric Earth only as compiler products or destination sessions. No 5.0
feature may reintroduce a second Earth source, surface, scene, traveler, or
frame owner.

The 5.0 roadmap is gated by:

1. 4.1 Earth runtime certification;
2. stable extension APIs and documented content schemas;
3. per-feature performance and data provenance budgets;
4. no regression to selected-location global consistency.
