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

## Controls (Default)

| Area | Key | Action |
| --- | --- | --- |
| Movement | `WASD` / `Arrow Keys` | Drive / steer |
| Movement | `Space` | Handbrake / drift |
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
- `🎮 Game Mode` menu -> `🧱 Build Mode`, `🧹 Clear Blocks`, `💥 Delete All Blocks`

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
- Legend filters: `📍 Pin` and `🌸 Flower` checkboxes control visibility independently
- Verification: run `getMemoryPersistenceStatus()` in browser console

## Persistent Build Blocks

- Storage: browser `localStorage` (`worldExplorer3D.buildBlocks.v1`)
- Scope: per location center key (`LOC` rounded to 5 decimals)
- In-world behavior: place/stack/remove blocks and stand or climb on them in walking mode
- Build limit: `100` max blocks for now
- Clear behavior: `🧹 Clear Blocks` removes rendered and saved blocks for the current location
- Global reset: `💥 Delete All Blocks` removes all saved blocks from this browser across all locations
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
- Cache-bust version alignment across loader chain is currently `v=31`.
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
