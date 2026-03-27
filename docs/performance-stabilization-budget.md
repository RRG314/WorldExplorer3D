# Performance Stabilization Budget

This pass treats performance as a measured runtime concern, not a cleanup goal.

## Current Audit Baseline

Measured in a real browser Earth boot on the current branch before this optimization pass:

- `domcontentloaded`: about `717ms`
- first controllable Earth runtime: about `44.8s`
- `world-load` reported by runtime: about `34.6s`
- steady-state frame time after boot: about `47.8ms`
- steady-state FPS after boot: about `15.5`
- draw calls: about `2689`
- triangles: about `4.19M`
- geometries: about `1333`
- textures: about `678`
- loaded content at idle:
  - roads: `5848`
  - building colliders: `27423`
  - building meshes: `1095`
  - POI meshes: `744`
  - landuse meshes: `31`
  - structure visual meshes: `45`
  - waterways: `447`

## Budgets

These are staged runtime budgets for the current platform, not final console-grade targets.

### Startup

- DOM ready target: `<= 1500ms`
- DOM ready warn: `> 2500ms`
- DOM ready fail: `> 5000ms`

- First controllable world target: `<= 12000ms`
- First controllable world warn: `> 20000ms`
- First controllable world fail: `> 60000ms`

- Runtime-reported world load target: `<= 9000ms`
- Runtime-reported world load warn: `> 15000ms`
- Runtime-reported world load fail: `> 45000ms`

### Frame Stability

- Average frame time target: `<= 22ms`
- Average frame time warn: `> 33ms`
- Average frame time fail: `> 55ms`

- Streaming hitch target: `<= 35ms` for the last terrain/road surface sync
- Streaming hitch warn: `> 60ms`
- Streaming hitch fail: `> 120ms`

### Render Pressure

- Draw calls target: `<= 1400`
- Draw calls warn: `> 1900`
- Draw calls fail: `> 3200`

- Triangles target: `<= 3.5M`
- Triangles warn: `> 4.5M`
- Triangles fail: `> 6.5M`

- Geometries target: `<= 1200`
- Geometries warn: `> 1600`
- Geometries fail: `> 2500`

- Textures target: `<= 550`
- Textures warn: `> 700`
- Textures fail: `> 1200`

### Memory

- JS heap used target: `<= 500MB` where browser memory APIs are available
- JS heap used warn: `> 750MB`
- JS heap used fail: `> 1300MB`

Note: GPU memory is not fully observable from the browser. Geometry/texture counts are used as proxy budget signals.

## Instrumentation Requirements

The runtime should surface:

- startup milestones
- last load phases and duration
- frame time and spike distribution
- renderer calls/triangles/geometries/textures
- JS heap when available
- terrain tile counts and cache state
- terrain/road surface sync timing
- active region and feature-region counts
- continuous-world stream coverage/load counts

## RDT Scope For Performance

RDT should not be treated as the core fix for startup or full-world load generation.

Current practical recommendation:

- good candidate later for narrow relevance queries and locality filtering
- not the primary answer for:
  - world boot time
  - geometry construction time
  - renderer pressure
  - terrain/road rebuild hitches

The current runtime bottlenecks are dominated by:

- world fetch/build breadth
- geometry generation volume
- render pressure
- surface rebuild timing
- optional systems staying resident too early
