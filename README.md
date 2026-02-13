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
- Deterministic runtime seeding and complexity logic through RDT + RGE256-based paths.

## Core Features

### Earth Exploration

- Preset cities plus custom location search.
- Real-time road network, buildings, land use, POI overlays.
- Real estate overlays (Estated, ATTOM, RentCast, and fallback data).
- Minimap + full map with teleport and layer toggles.
- Time-of-day lighting and sky/constellation systems.

### Gameplay

- Free roam, time trial, checkpoints.
- Police pursuit mode.
- Track recording.

### Space Layer

- Earth to space flight transitions.
- Solar-system visualization and navigation.
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
| Utility | `R` | Track recording |
| Utility | `` ` `` | Debug overlay |
| Utility | `Esc` | Pause |

## Architecture Status (Current)

- Runtime is split into multiple JS files (`js/*.js`) with no build step.
- Shared/global runtime state is still used across core systems.
- ES module boot and loading (`js/bootstrap.js`, `js/app-entry.js`, `js/modules/*`) is active.
- Full subsystem encapsulation is in progress; migration is iterative to avoid regressions.

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
