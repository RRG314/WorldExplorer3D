# Systems Inventory Report (Freeze + Update)

Date: 2026-02-16  
Branch: `rdt-engine`  
Scope: Runtime feature/system inventory with moon-runtime stabilization validation summary

## 1. Executive Summary

World Explorer 3D currently ships as a browser-first ES module runtime with these major platform layers:

- Geospatial world generation (roads/buildings/landuse/POIs)
- Terrain streaming + elevation-aware geometry conformance
- Four movement contexts (driving, walking, drone, space flight)
- Persistent local user edits (memories + build blocks)
- Deep-space solar-system and galaxy interaction layer
- Performance benchmark and adaptive budget controls
- Shareable experience URL export/import
- Moon scene-isolation safeguards that prevent Earth mesh bleed during moon/space runtime

## 2. Core System Inventory

| System | Subsystem | Status | Primary Files |
| --- | --- | --- | --- |
| Runtime boot | ES module loader chain + bootstrap | Active | `index.html`, `js/bootstrap.js`, `js/modules/manifest.js`, `js/app-entry.js` |
| Runtime state | Shared module context + state containers | Active | `js/shared-context.js`, `js/state.js`, `js/config.js` |
| Rendering engine | Three.js scene/camera/material pipeline | Active | `js/engine.js`, `js/main.js` |
| Input and controls | Keyboard/mouse controls + mode switching | Active | `js/input.js`, `js/ui.js`, `js/walking.js` |
| Physics | Vehicle, walker, grounding, road proximity | Active | `js/physics.js`, `js/ground.js` |
| World loading | OSM Overpass fetch, feature budgets, mesh build | Active | `js/world.js` |
| Terrain | Terrarium tile decode + streaming ring | Active | `js/terrain.js` |
| Minimap/maps | Minimap + large map + legend filters | Active | `js/map.js`, `js/ui.js` |
| HUD/UI | Start menu, overlays, in-game panels | Active | `index.html`, `styles.css`, `js/ui.js`, `js/hud.js` |
| Real estate | Property overlays + API-backed providers | Active | `js/real-estate.js` |
| Space stack | Earth/Moon/space flight transitions | Active | `js/space.js`, `js/env.js` |
| Solar/deep-sky | Solar system, asteroid belt, Kuiper belt, galaxies | Active | `js/solar-system.js` |
| Persistence | Memory markers + block builder storage | Active | `js/memory.js`, `js/blocks.js` |
| Determinism | RDT seed/depth + deterministic random paths | Active | `js/rdt.js`, `js/world.js`, `js/engine.js` |
| Performance | Benchmark modes + snapshot export + live stats | Active | `js/perf.js`, `js/world.js`, `js/main.js`, `js/ui.js` |

## 3. Feature Inventory

### 3.1 Geospatial World

- Preset cities + custom location search
- Overpass multi-endpoint fetch with fallback strategy
- Roads with adaptive subdivision/decimation
- Buildings with deterministic facade/material variation
- Land-use and water layers (including vector-tile water attempts)
- POI extraction and in-world POI meshes with LOD behavior
- Street furniture generation

### 3.2 Movement and Camera

- Driving mode
- Walking mode (3rd-person/character + climbing support on blocks)
- Drone mode
- Space-flight mode
- Camera modes (`camMode` 0/1/2 in Earth runtime)

### 3.3 Space and Astronomy

- Earth↔Moon↔space transitions
- Solar-system model and body inspection
- Asteroid belt and Kuiper belt visualization
- Clickable galaxy catalog with info panel

### 3.4 Persistent Player Authored Content

- Memory markers
  - Types: pin/flower
  - Note length cap: 200 chars
  - Remove single marker + delete-all by location
  - Minimap + large map rendering with legend filters
- Build blocks
  - Place/stack/remove
  - Stand/climb interactions in walking mode
  - Per-location persistence
  - 100 block cap

### 3.5 Benchmark and Optimization Controls

- Mode switch: `RDT` vs `Baseline`
- Snapshot export JSON
- Optional in-game benchmark overlay
- Overpass source telemetry (`network` vs `memory-cache`)
- Phase timing telemetry (`lastLoad.phases`)
- Frame spike metrics (`>16.7`, `>33.3`, `>50`, `>100`, `p95`, `p99`)

### 3.6 New Additions (Verified in this pass)

- Auto quality manager in `perf.js`
  - Runtime tiering: `performance` / `balanced` / `quality`
  - Inputs: FPS, frame-time EMA, spike ratios, max frame spikes
  - Hysteresis and cooldown to avoid oscillation
- Dynamic budget scaling in `world.js`
  - Scales adaptive load profile budgets at runtime
  - Scales LOD thresholds at runtime
  - Persists active dynamic budget state into load metrics (`lastLoad.dynamicBudget`)
- Shareable experience links in `ui.js`
  - Export from Settings: `Copy Experience Link`
  - Parse URL params on load (location/mode/perf/seed/camera/pose)
  - Apply runtime mode/camera/pose after world start
  - Supports custom location payloads (`lat/lon/lname`)

### 3.7 Moon Runtime Stabilization Update (2026-02-16)

- Transition hardening in `js/sky.js`
  - Earth mesh arrays (roads/buildings/landuse/POIs/street furniture) are force-hidden/removed on moon arrival.
  - Prevents desktop moon sessions from showing stale Earth geometry after asynchronous world-load completion.
- Load-race mitigation in `js/world.js`
  - World-load pass now detects non-Earth env during/after Overpass fetch and exits as partial recovery without reattaching Earth meshes.
  - `updateWorldLod()` now enforces Earth-only visibility and suppresses Earth meshes during moon/space contexts.
- Lunar drive physics parity in `js/physics.js`
  - Moon surface matrix update is forced before raycast sampling.
  - Crest/drop launch thresholds and impulse blending adjusted for consistent low-gravity airborne behavior on desktop.
- Lunar terrain readability improvements in `js/sky.js`
  - Added local relief variation near Apollo spawn area.
  - Kept slope-aware shading and dense rock cues for better perceived motion/depth.

## 4. URL Payload Contract (Share Links)

Supported params:

- `loc` or `loc=custom` + `lat` + `lon` + optional `lname`
- `launch` (`earth|moon|space`)
- `gm` (`free|trial|checkpoint`)
- `pm` (`rdt|baseline`)
- `seed` (deterministic override)
- `mode` (`driving|walking|drone|rocket`)
- `camMode` (`0|1|2`)
- `rx`, `ry`, `rz`, `yaw`, optional `pitch`

## 5. Persistence and Storage Inventory

| Feature | Storage Key | Scope | Notes |
| --- | --- | --- | --- |
| Memory markers | `worldExplorer3D.memories.v1` | Per rounded location key | 200-char notes, remove single, delete-all |
| Build blocks | `worldExplorer3D.buildBlocks.v1` | Per rounded location key | 100-block cap |
| Perf mode | `worldExplorerPerfMode` | Browser profile | `rdt` or `baseline` |
| Perf overlay toggle | `worldExplorerPerfOverlay` | Browser profile | Forced OFF on each fresh session start |
| Auto quality toggle | `worldExplorerPerfAutoQuality` | Browser profile | Enabled by default unless explicitly disabled |
| Real estate toggle | `realEstateEnabled` | Browser profile | UI preference |
| API keys | `estatedApiKey`, `attomApiKey`, `rentcastApiKey` | Browser profile | Client-side storage (user-provided) |

## 6. Performance Summary (Current Documented Baseline)

Captured Baltimore benchmark references (2026-02-14):

| Scenario | loadMs | fetchOverpass | fps | frameMs | draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline (network) | 5551 | 4267 | 60.00 | 16.71 | 453 |
| RDT (network) | 4669 | 3519 | 60.00 | 16.67 | 1149 |
| RDT (memory-cache repeat) | 2202-2246 | 0 | 59.99-60.00 | 16.59-16.66 | 957-1131 |

Interpretation:

- RDT startup load is faster than baseline in captured runs.
- RDT repeat loads are significantly faster when Overpass is cache-served.
- Draw-call variance remains a known tuning axis.

Moon stabilization validation snapshot (2026-02-15 desktop):

| Scenario | env | onMoon | Earth meshes attached | airborne ticks | y-range |
| --- | --- | --- | ---: | ---: | ---: |
| Moon desktop driving check | MOON | true | 0 | 33 / 34 | 1.61 |

## 7. Verification Checklist (This Update)

### 7.1 Static checks

- `node --check js/perf.js` passed
- `node --check js/world.js` passed
- `node --check js/ui.js` passed
- `node --check js/physics.js` passed
- `node --check js/sky.js` passed
- `node --check js/app-entry.js` passed
- `node --check js/bootstrap.js` passed
- `node --check js/modules/manifest.js` passed
- `node --check js/main.js` passed

### 7.2 Browser smoke checks (Playwright)

- Share-link import state load verified:
  - `loc=seattle`, `gm=trial`, `pm=baseline`, `mode=driving`, `camMode=2`, `seed=12345`
  - UI reflected loaded state in Settings and mode selection
- Snapshot export payload verified:
  - Contains `dynamicBudget` with numeric `budgetScale` and `lodScale`
- Share-link export payload verified:
  - Preserves expected `loc/gm/pm/mode/camMode/seed`
- Start-flow smoke test verified:
  - HUD displayed and title screen hid after start
  - No runtime JS exceptions observed in smoke pass
- Moon desktop runtime check verified:
  - `env=MOON`, `onMoon=true`
  - Earth mesh attachment counts on moon were all zero
  - Moon-driving airborne integration triggered repeatedly during desktop driving sample
  - Artifacts:
    - `output/playwright/moon-desktop-check-after-fix.json`
    - `output/playwright/moon-desktop-check-after-fix.png`

## 8. Known Constraints

- Runtime still uses shared global state across modules; full subsystem isolation remains iterative.
- External map/Overpass/vector endpoints remain network-dependent and may vary by availability.
- Draw-call behavior can still vary by location density and active mode.
