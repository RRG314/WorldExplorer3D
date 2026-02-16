# World Explorer 3D

World Explorer 3D is a real-time geospatial sandbox engine that turns any location on Earth into an interactive 3D world directly in the browser.

It integrates terrain, OpenStreetMap data, multi-mode navigation (drive, walk, drone), and orbital space travel into one seamless, scalable platform.

## License Status

This repository is public for code visibility and evaluation.

`World Explorer 3D` is source-available and proprietary.
All rights are reserved by the author. Reuse, redistribution, and derivative works are not permitted without written permission. See `LICENSE`.

## Quick Start

### Run locally (recommended)

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

### GitHub Pages deployment

1. Push this branch to your repository.
2. In GitHub, go to `Settings > Pages`.
3. Set source to `Deploy from a branch`.
4. Select `rdt-engine` (or your merge target branch) and `/ (root)`.
5. Save and wait for the Pages deployment to complete.

## What Makes It Different

- Real-world city generation from live OSM roads/buildings/POIs.
- Terrain-aware road and building conformance using Terrarium elevation data.
- Three movement modes sharing one world state: driving, walking, drone.
- Space layer with Earth, Moon, and solar-system transitions in the same runtime.
- Title menu launch-mode selector (Earth / Moon / Space) with one-click starts.
- Click-to-inspect deep-space objects (planets, asteroids, spacecraft, galaxies).
- Persistent memory markers (pin/flower + short note) with in-world remove and bulk delete actions.
- Minecraft-style brick block builder (place, stack, and remove blocks in-world).
- Deterministic runtime seeding and complexity logic through RDT + RGE256-based paths.
- Shareable experience links (seed/location/mode/camera context) from the Settings panel.

## Core Features

### Earth Exploration

- Preset cities plus custom location search.
- Real-time road network, buildings, land use, POI overlays.
- Real estate overlays (Estated, ATTOM, RentCast, and fallback data).
- Persistent location memories: place/remove pins or flowers with 200-char messages.
- Minimap + full map with teleport and layer toggles.
- POIs render on minimap/large map according to legend category filters.
- Memory pins/flowers render on minimap/large map for location recall.
- Legend includes independent memory-layer toggles for `📍 Pin` and `🌸 Flower`.
- Brick block build mode supports click-to-place stacking, shift-click removal, walk-mode climbing, and per-location persistence.
- Time-of-day lighting and sky/constellation systems.

### Gameplay

- Free roam, time trial, checkpoints.
- Police pursuit mode.
- Track recording.

### Space Layer

- Earth to space flight transitions.
- Start directly in Earth, Moon, or Space from the title menu.
- Solar-system visualization and navigation.
- Main asteroid belt and Kuiper belt visual layers.
- Clickable deep-sky galaxy catalog (RA/Dec-positioned) with info panel.
- Moon landing / return flows.
- Moon-only terrain airborne vehicle behavior for crater/hill transitions (Earth driving remains grounded).

## Controls (Default)

| Area | Key | Action |
| --- | --- | --- |
| Movement | `WASD` / `Arrow Keys` | Drive / steer |
| Movement | `Space` | Brake / handbrake |
| Movement | `Ctrl` | Boost |
| Movement | `Shift` | Sprint in walking mode |
| Modes | `F` | Toggle walking mode |
| Modes | `6` | Toggle drone mode |
| Camera | `C` | Cycle camera views |
| Map | `M` | Toggle large map |
| Utility | `N` | Next city |
| Utility | `B` | Toggle block build mode |
| Utility | `R` | Track recording |
| Utility | `` ` `` | Debug overlay |
| Utility | `Esc` | Pause |

Memory marker actions:

- `🌸` memory button (above controls) -> open composer
- Click marker in-world -> `Remove Marker`
- Memory composer -> `Delete All`

Block builder actions:

- `B` -> toggle build mode
- `Click` (build mode on) -> place brick block
- `Shift+Click` (build mode on) -> remove targeted block
- `🎮 Game Mode` menu -> `🧱 Build Mode` and `🧹 Clear Blocks`

Mobile touch controls (auto-enabled on touch-first clients):

- Driving: left stack = `Accelerate` / `Brake` / `Decelerate`; right pad = steering
- Walking: left pad = camera look, right pad = movement, action stack = `Jump` / `Run`
- Drone: left pad = camera look, right pad = movement, action stack = `Ascend` / `Descend`
- Rocket: left stack = `Accelerate` / `Decelerate`, right pad = steer/pitch

## Performance Mode Switch (RDT vs Baseline)

Use the built-in benchmark controls from the title screen:

1. Open `Settings` tab.
2. In `⚡ Performance Benchmark`, pick `RDT Optimized` or `Baseline (No RDT Budgeting)`.
3. Optional: enable `Show live benchmark overlay in-game` (default is OFF each session).
4. Click `Apply + Reload World`.
5. Click `Copy Snapshot` to copy a JSON benchmark payload.
6. Auto quality manager runs by default and adjusts runtime budget tier (`performance`, `balanced`, `quality`) from live FPS/frame-time pressure.

In-game overlay placement:

- Debug overlay (`\``) is centered between the speed HUD and mode HUD.
- Benchmark overlay is centered between the mode HUD and `Main Menu`.
- Both overlays auto-reposition on resize and when toggled so controls stay unobstructed.

Snapshot fields to compare:

- `lastLoad.loadMs`
- `lastLoad.phases.fetchOverpass`
- `renderer.calls`
- `renderer.triangles`
- `fps` and `frameMs`
- `lastLoad.overpassSource` (`network` or `memory-cache`)
- `dynamicBudget.*` (top-level snapshot quality/budget state)
- `lastLoad.dynamicBudget.*` (quality/budget state used during that load)

## Shareable Experience Links

Share actions are available in both title and in-game UI:

1. Title screen footer: use circular `Copy`, `Share`, `Facebook`, `X`, `Instagram`, or `Text` icons.
2. In-game: use the blue share arrow above the flower button for the same quick actions.
3. Tap/click the live coordinate readout to copy your current experience link directly.

The URL payload supports:

- location (`loc`, or custom `lat/lon` + `lname`)
- game mode (`gm`)
- performance mode (`pm`)
- deterministic seed (`seed`)
- movement mode (`mode`)
- camera mode (`camMode`)
- runtime pose (`rx`, `ry`, `rz`, `yaw`, optional `pitch`)

When a shared URL is opened:

- title-screen state is prefilled from params
- a status note confirms payload load
- mode/camera/pose state is applied after `Explore` starts

## Supporting Benchmark Stats (Baltimore, 2026-02-14)

Measured from in-app snapshot exports:

| Scenario | overpassSource | loadMs | fetchOverpass | fps | frameMs | draw calls | triangles |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline (network) | `network` | `5551` | `4267` | `60.00` | `16.71` | `453` | `2,888,718` |
| RDT (network) | `network` | `4669` | `3519` | `60.00` | `16.67` | `1149` | `2,174,223` |
| RDT (repeat load) | `memory-cache` | `2202-2246` | `0` | `59.99-60.00` | `16.59-16.66` | `957-1131` | `2,250,431-2,259,359` |

Interpretation:

- RDT startup is faster than baseline in the captured run.
- Repeat RDT loads are substantially faster due to memory-cached Overpass responses.
- Draw calls in RDT are still higher than baseline and remain an active tuning area.

## Persistent Memory Markers

- Marker types: `Pin` and `Flower`
- Message length: up to `200` characters
- Storage: browser `localStorage` (`worldExplorer3D.memories.v1`)
- Scope: Earth-mode, per location center key (`LOC` rounded to 5 decimals)
- Limits: `300` per location, `1500` total, ~`1500KB` max payload
- Persistence guard: placement is disabled if browser storage round-trip check fails
- Removal: click marker and choose `Remove Marker`
- Bulk removal: `Delete All` button in memory composer (with confirmation)
- Map visibility: memory markers are shown on minimap and large map
- Surface snap: markers render on top of the highest local surface (build blocks, building roofs, then ground)
- Legend filters: `📍 Pin` and `🌸 Flower` checkboxes control visibility independently
- Verification: run `getMemoryPersistenceStatus()` in browser console

## Persistent Build Blocks

- Storage: browser `localStorage` (`worldExplorer3D.buildBlocks.v1`)
- Scope: per location center key (`LOC` rounded to 5 decimals)
- In-world behavior: place/stack/remove blocks and stand or climb on them in walking mode
- Build limit: `100` max blocks for now
- Clear behavior: `🧹 Clear Blocks` removes rendered and saved blocks for the current location
- Verification: run `getBuildPersistenceStatus()` in browser console

## Security and Storage Notice

- Memory notes are stored locally in this browser profile, not encrypted, and not auto-synced to other devices.
- Anyone with access to this browser profile can read local memory notes.
- Clearing site data or browser storage will remove saved memories.
- Do not store secrets, credentials, or sensitive personal information in memory notes.
- Browser storage can be blocked by privacy mode/extensions; when blocked, memory placement is disabled.
- Dynamic map/property/historic text is escaped before being inserted into HTML templates.
- Recommended deployment headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a restrictive `Permissions-Policy`.

## Architecture Status (Current)

- Runtime is split into multiple JS files (`js/*.js`) with no build step.
- Shared/global runtime state is still used across core systems.
- ES module boot and loading (`js/bootstrap.js`, `js/app-entry.js`, `js/modules/*`) is active.
- Cache-bust version alignment across loader chain is currently `v=54`.
- Full subsystem encapsulation is in progress; migration is iterative to avoid regressions.

## Freeze Snapshot (2026-02-14)

- Restored main-branch title menu behavior for location selection with working custom/suggested interactions.
- Added title launch selectors: `Earth`, `Moon`, `Space`.
- Added Kuiper belt and improved belt visibility (particle + band layers).
- Added clickable galaxy background objects with distance/sky-position metadata in the inspector.
- Updated start-menu Controls tab to include space-flight controls.
- Added persistent memory markers (pin/flower), 200-char notes, and marker removal flow.
- Added memory `Delete All` action in composer with confirmation.
- Added memory pin/flower visibility on minimap and large map.
- Added separate legend checkboxes for memory `Pin` and `Flower` overlays (larger marker labels/icons).
- Restored POI marker rendering on minimap and large map by legend category filters.
- Added Minecraft-style brick block builder with stacking/removal controls.
- Added persistent per-location block storage and walk-mode climbing support on placed blocks.
- Added runtime performance benchmark mode switch (`RDT` vs `Baseline`) with in-game snapshot export.
- Added FPS/frame-time auto quality manager (`perf.js`) with dynamic budget/LOD scaling consumed by `world.js`.
- Added shareable experience link export/import for seed/location/mode/camera runtime context.
- Added mobile-first touch navigation profiles for driving, walking, drone, and rocket modes.
- Added title-footer social share icon rail plus in-game share arrow quick menu.
- Added clickable coordinate readout share-copy shortcut.
- Added moon-only terrain airborne/float vehicle behavior for hills/crater transitions.
- Hardened moon environment isolation so Earth meshes cannot leak into moon view on desktop after async world loads.
- Tuned desktop lunar-driving airborne triggers and improved moon terrain readability (local relief + stronger shading + additional rock cues).
- Added Overpass endpoint preference plus memory-cache reuse for faster repeat city loads.

## Repository Structure

```text
index.html
styles.css
.nojekyll
js/
  bootstrap.js
  app-entry.js
  modules/
    manifest.js
    script-loader.js
  config.js
  state.js
  env.js
  rdt.js
  world.js
  terrain.js
  ground.js
  engine.js
  physics.js
  walking.js
  sky.js
  solar-system.js
  space.js
  game.js
  input.js
  hud.js
  map.js
  memory.js
  blocks.js
  ui.js
  main.js
```

## Deterministic Systems (RDT + RGE)

The deterministic layer is based on first-party research by Steven Reid and implemented in `js/rdt.js`.

- Reid, S. (2025). *Recursive Division Tree: A Log-Log Algorithm for Integer Depth*. DOI: https://doi.org/10.5281/zenodo.18012166
- Reid, S. (2025). *RGE-256: A New ARX-Based Pseudorandom Number Generator With Structured Entropy and Empirical Validation*. DOI: https://doi.org/10.5281/zenodo.17982804
- RGE-256 core repository: https://github.com/RRG314/rge256
- RGE-256 demo application: https://github.com/RRG314/RGE-256-app

Current direction:

- Keep deterministic behavior stable across reloads/cities.
- Continue replacing remaining `Math.random` paths with deterministic subsystem streams where reproducibility matters.

## Documentation

- `DOCUMENTATION_INDEX.md` - full docs map
- `QUICKSTART.md` - run + first 60 seconds
- `USER_GUIDE.md` - feature usage guide
- `TECHNICAL_DOCS.md` - engineering details
- `ARCHITECTURE.md` - system architecture
- `KNOWN_ISSUES.md` - active gaps and contributor targets
- `CONTRIBUTING.md` - contribution workflow
- `CHANGELOG.md` - release history
- `SECURITY_STORAGE_NOTICE.md` - persistent-memory storage and security disclaimer boilerplate

## Known Issues / Help Wanted

See `KNOWN_ISSUES.md` for prioritized problem areas and contribution targets.

## Legal and Attribution

- OSM data is used under ODbL (`© OpenStreetMap contributors`).
- Three.js is used under MIT.
- Other APIs/datasets remain under their respective licenses.

## License

`All Rights Reserved` (source-available, proprietary).
See `LICENSE` for terms.

## Development Notes

This project was developed with the assistance of modern AI development tools (e.g., code suggestion and refactoring assistants).
All architectural design, system integration, and implementation decisions were directed and validated by the author.
