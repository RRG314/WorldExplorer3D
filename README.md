# World Explorer 3D

World Explorer 3D is a browser-based real-world exploration engine that enables interactive navigation of city-scale environments using real geographic and astronomical data.

The platform supports driving, walking, and aerial (drone-style) traversal through real cities, combining 3D visualization, live map data, and multi-layer spatial context in a self-contained static site that requires no build step or bundler.

This project is intentionally positioned as a **foundation engine** rather than a finished consumer product.

---

## Core Capabilities

### Terrestrial Exploration
- 11 preset city locations plus custom location search (any place worldwide via Nominatim geocoding)
- Road-aware driving with off-road detection
- Walking and aerial (drone) traversal modes
- Vehicle physics including acceleration, braking, drift, and boost
- Procedural buildings and road geometry derived from live OpenStreetMap data
- Deterministic procedural visuals per location (RDT-seeded windows, building variance, and road textures)
- Adaptive world loading/query strategy based on location complexity (RDT complexity index)
- Terrain elevation from AWS Terrarium tiles with road/building alignment
- Time-of-day system (day, sunset, night, sunrise) with dynamic lighting
- Cloud layer with visibility toggle

### Map & Navigation
- Integrated minimap and full-screen interactive map
- Zoomable large-map view with clickable POI, property, and historic site markers
- Map layer toggles:
  - Road network
  - Satellite imagery (map layer)
  - Land use overlay
- Teleportation and respawn tools
- Right-click teleportation on minimap and large map

### Game & Interaction Modes
- Free roam exploration
- Time trial challenges
- Checkpoint-based navigation
- Police chase mode with pursuit AI
- Floating control menu for global actions

### Real Estate & Points of Interest
- Real estate property overlays with multi-API support (Estated, ATTOM, RentCast) and demo fallback
- Historic site discovery via OpenStreetMap data
- POI visualization across categories (schools, hospitals, restaurants, parks, etc.)
- Property filtering, sorting, and navigation routing

---

## Celestial & Space Exploration Layer

World Explorer 3D includes a **celestial visualization and space travel layer** that extends exploration from Earth's surface into the solar system.

### Sky & Stars
- Star field rendered using real bright-star catalog data (Yale BSC5 / Hipparcos)
- Constellation line patterns for all 12 zodiac and major constellations
- Clickable stars with metadata (name, magnitude, distance, constellation)
- Constellation visibility toggle
- Independent rendering layer that does not interfere with ground navigation

### Space Travel
- Rocket launch sequence from Earth's surface
- Heliocentric solar system with planets at JPL-accurate orbital positions
- Free-flight rocket controls (pitch, yaw, thrust) through the solar system
- Planet approach and landing sequences
- Moon surface exploration with lunar terrain generation
- Direct and rocket-based travel modes to the Moon
- Environment state machine managing Earth / Space Flight / Moon transitions

### Astronomical Data Sources
- **Yale Bright Star Catalog (BSC5)** -- bright-star reference data
- **Hipparcos** -- distance and astrometric reference values
- **JPL "Approximate Positions of the Planets"** -- Keplerian orbital elements (J2000 epoch)

Celestial objects are rendered for **visualization and exploratory purposes**.
They are **not intended to represent real-time ephemeris calculations or precise observational accuracy** in the current version.

---

## Intended Use and Scope

While currently presented as an exploratory driving experience, the underlying engine is designed to support broader applications, including:

- Urban visualization and digital twin experiments
- Educational geography and astronomy tools
- Simulation and navigation research
- Real estate and neighborhood exploration
- Drone path planning and aerial inspection
- Interactive data overlays for city-scale datasets

The platform prioritizes **spatial consistency**, **interactivity**, and **extensibility** over photorealism or production completeness.

---

## Architecture Overview

World Explorer 3D is a self-contained static site (HTML/CSS/JS) using Three.js, deployable directly to GitHub Pages with no build step.

### Design Principles
- A unified geographic-to-world coordinate system shared across all layers
- Clear separation between:
  - Movement and controls
  - Physics and constraints
  - World geometry
  - Gameplay rules
  - Rendering pipeline
  - UI and map interfaces
- Layered architecture allowing new datasets and features to be added without rewriting the core engine

### Project Structure

```
WorldExplorer/
  index.html            HTML markup (~900 lines)
  styles.css            All CSS styles (~300 lines)
  .nojekyll             GitHub Pages config
  js/
    config.js           Locations, constants, terrain/landuse/POI settings
    rdt.js              Recursive Division Tree complexity metric + seeded random utilities
    state.js            All global state variables, star catalog, constellation data
    env.js              Environment state machine (Earth/Space Flight/Moon)
    real-estate.js      Property API layer (Estated, ATTOM, RentCast) and demo data
    ground.js           Unified ground height service (terrain, roads, normals)
    terrain.js          Terrain elevation system (Terrarium tiles, mesh generation)
    engine.js           Three.js init, renderer, scene, lighting, car mesh
    physics.js          Car physics, collision detection, drone movement, adaptive road-query throttling
    walking.js          First-person walking module
    world.js            OSM data loading (roads, buildings, landuse, POIs)
    sky.js              Time of day, starfield, constellations, cloud layer
    solar-system.js     Solar system planet rendering (JPL orbital mechanics)
    space.js            Space flight transition (rocket, heliocentric flight, landing)
    game.js             Game modes, police, navigation, real estate UI, historic sites
    input.js            Keyboard handling, track recording, city/location search
    hud.js              HUD updates, camera system
    map.js              Minimap and large map rendering
    main.js             Main render loop and environment dispatch
    ui.js               UI setup, event binding, app entry point
```

Detailed architectural notes, the loading pipeline, state management approach, and known constraints are documented in [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Deterministic Generation & Adaptive Performance (RDT)

The engine now includes an RDT (Recursive Division Tree) utility layer that makes content generation and some runtime behavior deterministic per geographic location while still preserving natural neighborhood-to-neighborhood variation.

- `hashGeoToInt(lat, lon)` generates a stable location seed.
- `rdtDepth(seed)` computes a location complexity index.
- Seeded pseudo-random utilities are used so each location keeps consistent procedural textures/variation across reloads.
- Physics road proximity checks are adaptively throttled in dense areas, with safety overrides and cache invalidation hooks during major mode/location transitions.

---

## Controls (Default)

### Movement
- **WASD / Arrow Keys** -- accelerate and steer
- **Space** -- handbrake / drift
- **Ctrl** -- boost
- **Shift** -- sprint (walking mode)

### Camera & Modes
- **C** -- cycle camera views (driving: chase/hood/bumper; walking: first/third person)
- **F** -- toggle walking mode
- **6** -- toggle drone mode
- **R** -- record track
- **N** -- next city
- **M** -- toggle large map
- **Esc** -- pause
- **Backtick (`)** -- toggle debug overlay

### Map
- Click minimap -- open large map
- Right-click minimap or large map -- teleport to location
- **+/-** -- zoom in/out (when large map is open)
- Toggle satellite imagery, road, and land use layers in map UI

---

## Running the Project

### GitHub Pages (Recommended)
Push to a GitHub repository with Pages enabled. The `.nojekyll` file ensures proper static file serving.

### Local Server
Some browsers restrict network requests when opening files directly.

```bash
python -m http.server
```

Then open: `http://localhost:8000`

### Direct File Open
The HTML file can be opened directly in a modern browser (Chrome recommended), though some features (OSM data loading) may be limited due to CORS restrictions.

---

## Project Status

The spatial model, traversal systems, terrestrial and celestial layers, and map integration are considered stable. After core alignment and controls are stable, changes prioritize additive features; corrective work is limited to regressions and stability issues.

## Future Directions (Exploratory)

Potential extensions include:

- Traffic and multi-agent simulation
- Weather and atmospheric effects
- Data overlays (zoning, demographics, infrastructure)
- VR and immersive display support
- Multi-user synchronized exploration
- Additional planetary surfaces and celestial bodies
- ES module migration once subsystem boundaries are stable

These directions are exploratory and subject to change.

---

## Legal & Attribution

### OpenStreetMap
Map data (c) OpenStreetMap contributors
Licensed under the Open Database License (ODbL) v1.0
https://www.openstreetmap.org/copyright

This project uses OpenStreetMap data via live API queries.
No ownership of OpenStreetMap data is claimed.

### Third-Party Services & Libraries
- Nominatim geocoding -- https://nominatim.org/
- Overpass API -- https://overpass-api.de/
- Three.js (r128) -- https://threejs.org/
- allorigins.win CORS proxy -- used for Nominatim requests
- AWS Terrarium elevation tiles -- terrain height data

### Astronomical & Planetary Data
- Yale Bright Star Catalog (BSC5)
- Hipparcos (ESA astrometric reference)
- JPL "Approximate Positions of the Planets" -- Keplerian orbital elements

Astronomical and planetary datasets are used for visualization and reference purposes only.

### Other Assets
- Fonts: Google Fonts (Inter, Poppins) -- SIL Open Font License
- HDR Environment Maps: Poly Haven -- CC0 (Public Domain)

All third-party trademarks and datasets remain the property of their respective owners.

---

## License

All Rights Reserved

Copyright (c) 2026

This repository, including its source code, engine architecture, and original assets, is proprietary.
No permission is granted to use, copy, modify, or distribute this software without explicit authorization from the author.

OpenStreetMap data and other third-party datasets are used under their respective licenses and are not covered by this restriction.

---

## Contact

For questions, feedback, or licensing inquiries, please open an issue on GitHub or email at sreid1118@gmail.com
