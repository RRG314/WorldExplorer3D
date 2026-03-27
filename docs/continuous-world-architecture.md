# Continuous-World Architecture

This document defines the intended production architecture for a full continuous-world Earth model on the `steven/continuous-world-full-rnd` branch.

## Goals

- no hard city/location reset during travel
- stable long-distance traversal
- chunked terrain/road/building/water/vegetation ownership
- precision-safe runtime through floating origin / rebasing
- compatibility with current traversal, structures, and world overlays

## Current Baseline

The current runtime is still anchored to one mutable active location:

- `app/js/config.js`
- `app/js/world.js`
- `app/js/terrain.js`

The actor moves inside a local frame derived from `LOC`, and location switching performs a full world teardown + reload.

## Target Model

### 1. Dual Coordinate System

- Canonical global coordinate state
  - geographic truth for actor, chunk ownership, map/minimap, multiplayer locality
  - stored as lat/lon plus an optional future ECEF/ENU conversion layer
- Local simulation coordinate frame
  - used for render, physics, and short-range runtime systems
  - periodically rebased around the active actor or convoy center

The local frame should be disposable. The global position is the source of truth.

### 2. Region / Chunk Ownership

Introduce a runtime region manager responsible for:

- region key generation
- active near/mid/far rings
- load, activate, deactivate, unload lifecycle
- seam ownership and cross-boundary dependency tracking

Target region bands:

- near: simulation-critical chunks
- mid: visible approach chunks
- far: low-detail context / prefetch candidates

### 3. Data Partitioning

All world features must become region-owned:

- terrain tiles
- roads
- road seam metadata
- bridges / ramps / tunnels
- buildings
- water / coastlines
- vegetation

Chunk boundaries must not split logical ownership blindly. Cross-boundary features need seam records and neighbor references.

### 4. Traversal Surface Ownership

Continuous traversal needs one authoritative surface owner near the actor:

- terrain at grade
- elevated deck surface
- tunnel / subgrade surface
- water surface

The continuous-world migration should reduce conflicts between:

- road profile logic
- terrain surface fallback
- mesh-hit sampling

### 5. Streaming / Memory Model

The runtime should load by budget, not by location reset:

- max active chunk counts per band
- budgeted mesh generation
- budgeted terrain decode
- bounded rebuild work per frame
- queued seam reconciliation

### 6. Rebase Strategy

Suggested initial threshold:

- recommend rebase when local actor drift exceeds `~800` world units

Rebasing must:

- preserve global actor coordinates
- preserve chunk ownership
- shift local transforms without reloading the entire world

## Recommended Implementation Order

1. Passive global position + region runtime
2. Chunk lifecycle manager
3. Terrain ownership migration
4. Road ownership migration
5. Structure seam ownership
6. Building / water / vegetation ownership
7. Integration with minimap, overlays, multiplayer locality

## Go / No-Go Gates

Do not move forward unless:

- continuous-world diagnostics stay valid
- no new hard reset is required for long travel
- terrain seam regression stays green
- drive surface stability stops regressing
- elevated structure continuity improves instead of broadening failures
