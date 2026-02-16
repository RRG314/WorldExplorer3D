# World Explorer -- Architecture Overview

This document describes the internal structure, design decisions, and conceptual model of the World Explorer engine.

---

## Core Design Philosophy

World Explorer is built as:
- A **self-contained static site (HTML/CSS/JS), no bundler required** -- browser-native engine that runs from a single directory with no build step
- A **real-world spatial sandbox**, not a static visualization
- A **layered system**, where data and behavior can be added without rewriting the core

The emphasis is on spatial consistency and interaction rather than photorealism or completeness.

---

## Coordinate System & Spatial Model

### Geographic Input
- Real-world latitude and longitude are used as the source of truth.
- Each city/location has a defined geographic center (`LOC`).

### World Space
- The 3D world uses a local tangent-plane approximation.
- Latitude/longitude deltas are converted into X/Z world coordinates.
- Longitude deltas are corrected using cosine(latitude) to maintain scale.

This ensures:
- Roads, markers, vehicles, and map overlays all share the same spatial reference.
- Visual position matches logical position.

---

## Engine Layers

### 1. Movement & Control Layer
- Car input processing (acceleration, steering, braking, boost)
- Drone flight controls (pitch, yaw, altitude)
- Walking/first-person traversal controls
- Camera mode switching and follow logic
- Space flight rocket controls (pitch, yaw, thrust)

**Files:** `input.js`, `walking.js`, `hud.js` (camera system), `space.js` (space flight controls)

### 2. Physics & Constraints Layer
- Vehicle traction model (grip, drift, off-road friction)
- Building collision detection and pushback
- Unified ground height service (terrain sampling, road surface offsets, surface normals)
- On-road vs off-road boundary enforcement
- Drone boundary clamping
- RDT complexity-aware road proximity throttling with safety overrides and cache invalidation

**Files:** `physics.js`, `terrain.js`, `ground.js`

### 3. World Geometry Layer
- Road meshes derived from real-world OpenStreetMap data
- Procedural buildings with RDT-seeded deterministic window textures and height/color variation
- Land use ground planes (parks, water, residential, industrial)
- POI markers with category icons
- Terrain elevation meshes from Terrarium tiles

**Files:** `world.js`, `terrain.js`, `engine.js` (textures, car mesh)

### 4. Gameplay & Rules Layer
- Game mode logic (free roam, time trial, checkpoint collection)
- Police chase AI and pursuit mechanics
- Navigation routing and waypoint display
- Real estate property overlays
- Historic site discovery
- Persistent memory marker notes (pin/flower placement + removal)

**Files:** `game.js`, `real-estate.js`

### 5. Rendering & Environment Layer
- Three.js scene, camera, lighting, and fog
- Defensive WebGL initialization with multiple fallback paths
- Optional HDR environment mapping with procedural fallback
- Shadow mapping (PCFSoft with Basic fallback)
- Time-of-day lighting transitions (day, sunset, night, sunrise)
- Starfield and constellation rendering from astronomical catalog data
- Cloud layer with visibility toggle
- Moon surface generation and lunar exploration
- Solar system planet rendering with JPL orbital mechanics
- Main asteroid belt and Kuiper belt visualization layers
- Deep-sky galaxy rendering (RA/Dec sky positioning) with click inspection
- Space flight transition sequence (rocket launch, heliocentric flight, landing)
- Centralized environment state machine (Earth / Space Flight / Moon)

**Files:** `engine.js`, `sky.js`, `main.js`, `env.js`, `solar-system.js`, `space.js`

### 6. UI & Map Layer
- HUD (speedometer, compass, mode indicators, boost bar)
- Title menu launch-mode selectors (Earth / Moon / Space)
- Title `Settings` benchmark controls (RDT/Baseline selector, overlay toggle, snapshot copy)
- Floating menu for global actions
- Minimap and full-screen interactive map via canvas
- Zoomable large map with layer toggles (satellite, roads, landuse, POIs)
- Pause, results, and alert overlays
- Start-menu controls tab (driving/walking/drone/space-flight mappings)
- Memory composer/info overlays for persistent marker placement and removal
- Property panels, historic site cards, modal system

**Files:** `hud.js`, `map.js`, `ui.js`

---

## World Lifecycle / Loading Pipeline

The world initialization follows this sequence:

1. **Choose location + launch mode** -- user selects preset/custom Earth location or chooses Moon/Space launch mode
2. **Set origin** -- `LOC` is set to the geographic center; `geoToWorld()` maps all coordinates relative to this point
3. **Fetch OSM data** -- Overpass API query retrieves roads, buildings, land use, and POIs within a bounding box using multi-endpoint racing, preferred-endpoint reuse, and short-lived in-memory cache reuse for repeat loads
4. **Generate road meshes** -- road segments are created with width based on highway type and speed limits from tags
5. **Generate building meshes** -- extruded polygons with procedural heights, window textures, and rooftops
6. **Generate land use ground planes** -- colored ground patches for parks, water, residential, etc.
7. **Fetch terrain tiles** -- Terrarium PNG tiles loaded from AWS elevation tile service
8. **Build terrain mesh** -- elevation data decoded (R*256 + G + B/256 - 32768) and applied to a subdivided plane
9. **Align roads and buildings to terrain** -- road vertices and building bases repositioned to match elevation
10. **Spawn car on nearest road** -- vehicle placed at a valid road point with correct orientation
11. **Hydrate persistent markers** -- memory markers for current location are rebuilt from browser storage
12. **Start main loop** -- `renderLoop()` begins the update/render cycle

Location switching (`nextCity()`, `searchLocation()`) re-runs steps 1--12, clearing all existing meshes first. Custom location search uses the Nominatim geocoding API (via a CORS proxy) to resolve place names to coordinates.

---

## State Management

`state.js` defines the shared state container for the application. All subsystems read and update state through known global variables.

Key state groups:
- **Location state** -- `LOC`, `customLoc`, `selLoc` (current geographic origin)
- **Title launch state** -- `loadingScreenMode`, launch toggles (`earth` / `moon` / `space`)
- **Vehicle state** -- `car` object (position, velocity, angle, grip, boost)
- **Input state** -- `keys` object (currently pressed keys)
- **World data** -- `roads[]`, `buildings[]`, `landuses[]`, `pois[]` (loaded geometry)
- **Scene objects** -- `scene`, `camera`, `renderer`, mesh arrays
- **Game state** -- `gameMode`, `gameTimer`, `paused`, police/checkpoint/trial state
- **Drone state** -- `drone` object (position, pitch, yaw, speed)
- **Environment state** -- `ENV` (EARTH, SPACE_FLIGHT, MOON), managed by `env.js` state machine
- **Terrain state** -- `terrainTileCache`, `terrainGroup`, elevation flags
- **Performance benchmark state** -- `perfMode`, `perfOverlayEnabled`, `perfStats`, and `lastLoad` snapshot metrics
- **Persistent memory state** -- marker entries, localStorage capability status, marker hitboxes
- **Space flight state** -- `spaceFlight` object (rocket, velocity, mode, scene/camera/renderer)
- **Astronomical data** -- `BRIGHT_STARS`, `CONSTELLATION_LINES`, `SOLAR_SYSTEM_PLANETS`, asteroid/Kuiper belt config, deep-sky `GALAXIES` catalog

State is currently unencapsulated (global mutable variables). This is the primary area for future architectural improvement -- introducing accessor patterns or a state manager would reduce coupling between subsystems.

---

## Modular File Architecture

The engine is organized into modular files for maintainability:

### Root Files
- `index.html` -- HTML markup (~900 lines), loads external CSS and JS
- `styles.css` -- All CSS styles (~300 lines)
- `.nojekyll` -- GitHub Pages configuration (disables Jekyll processing)

### JavaScript Modules (`js/` directory)

Runtime boot uses ES modules (`index.html` → `js/bootstrap.js` → `js/modules/manifest.js` → `js/app-entry.js`) while preserving shared globals across subsystems. Load order still matters because systems intentionally interoperate through global state; migration remains incremental to avoid regressions.

| File | Lines | Purpose |
|------|-------|---------|
| `config.js` | ~100 | Locations, scale, terrain settings, landuse/POI types |
| `rdt.js` | ~90 | Recursive Division Tree depth metric, geo hashing, seeded RNG, self-tests |
| `state.js` | ~630 | All state variables, star catalog data, constellation lines |
| `env.js` | ~110 | Centralized environment state machine (Earth/Space Flight/Moon) |
| `real-estate.js` | ~315 | Property API layer (Estated, ATTOM, RentCast) and demo data |
| `ground.js` | ~136 | Unified ground height service (terrain, road surface, normals) |
| `terrain.js` | ~524 | Terrain elevation system (Terrarium tiles, mesh generation) |
| `engine.js` | ~670 | Three.js init, renderer, scene, lighting, textures, car mesh |
| `physics.js` | ~650 | Car physics, building collision, drone movement, adaptive road-query throttling |
| `walking.js` | ~507 | First-person walking/exploration module |
| `world.js` | ~990 | OSM data loading (roads, buildings, landuse, POIs) |
| `sky.js` | ~1414 | Time of day, starfield, constellations, cloud layer |
| `solar-system.js` | ~1066 | Solar system planet rendering (JPL orbital mechanics) |
| `space.js` | ~1018 | Space flight transition (rocket launch, heliocentric flight, landing) |
| `game.js` | ~1182 | Game modes, police, POI, real estate UI, historic sites, navigation |
| `input.js` | ~408 | Keyboard handling, track recording, city/location search |
| `hud.js` | ~299 | HUD updates, camera system, sky positioning |
| `map.js` | ~723 | Minimap and large map rendering |
| `memory.js` | ~535 | Persistent marker subsystem (pin/flower + note + remove flow) |
| `main.js` | ~82 | Main render loop and environment dispatch |
| `ui.js` | ~618 | UI setup, event binding, entry point (`init()` call) |

---
## Deterministic RDT Layer

The RDT (Recursive Division Tree) utility layer is loaded early and provides deterministic behavior keyed to location:

- `hashGeoToInt(lat, lon, extra)` derives a stable 32-bit seed from quantized coordinates
- `rdtDepth(n, alpha=1.5)` computes a bounded complexity index used by multiple systems
- `seededRandom(seed)` provides deterministic pseudo-random sequences for procedural assets
- A small startup self-test verifies canonical `rdtDepth` vectors and logs on mismatch

Current integrations:
- **Adaptive OSM query strategy** in `world.js` tunes search radius/timeouts from `rdtComplexity`
- **Deterministic procedural content** in `engine.js`/`world.js` keeps per-location visuals stable across reloads
- **Adaptive physics throttling** in `physics.js` reduces dense-area CPU pressure while forcing immediate checks during steering, high-speed driving, or off-road recovery

RDT/RGE research provenance and implementation notes:
- `js/rdt.js` includes RDT depth utilities and an RGE256ctr-based deterministic PRNG path.
- RDT citation: Reid, S. (2025). *Recursive Division Tree: A Log-Log Algorithm for Integer Depth*. DOI: https://doi.org/10.5281/zenodo.18012166
- RGE-256 citation: Reid, S. (2025). *RGE-256: A New ARX-Based Pseudorandom Number Generator With Structured Entropy and Empirical Validation*. DOI: https://doi.org/10.5281/zenodo.17982804
- Current deterministic migration direction is to continue replacing remaining `Math.random` paths with deterministic subsystem streams.

## Benchmark Architecture (RDT vs Baseline)

Benchmark switching is a first-class runtime path, not a separate build.

- `js/perf.js` owns mode state (`rdt`/`baseline`), overlay state, and snapshot capture/export.
- `js/ui.js` binds title-screen controls (`#perfModeSelect`, `#perfOverlayToggle`, `#perfApplyReload`, `#perfCopySnapshot`).
- `js/world.js` consumes mode selection to apply adaptive (RDT) or baseline budgets and records per-load diagnostics.
- `js/main.js` exposes `positionTopOverlays()` to anchor debug/perf overlays between top HUD widgets.

Snapshot payloads include:

- renderer stats (`calls`, `triangles`, `geometries`, `textures`, `programs`)
- load summary (`loadMs`, per-phase timings, selected/requested feature counts)
- Overpass source metadata (`network` vs `memory-cache`)

Reference measured runs (Baltimore, 2026-02-14):

- Baseline network: `loadMs 5551`, `calls 453`
- RDT network: `loadMs 4669`, `calls 1149`
- RDT memory-cache repeat: `loadMs 2202-2246`, `fetchOverpass 0`

## Known Hard Problems / Constraints

- **OSM geometry inconsistencies** -- OpenStreetMap data varies widely in quality; buildings may lack height tags, roads may have missing or conflicting metadata, and some geometries contain self-intersecting polygons
- **Terrain tile resolution limits** -- Terrarium tiles at zoom 13 provide ~19m/pixel resolution; this creates visible stairstepping on steep terrain and blending seams at tile boundaries
- **Floating-point precision** -- large world coordinates (SCALE = 100000) can cause jitter at extreme distances from the origin; deep-space camera clipping (0.5 to 450000 in space mode) is tuned for distant belts/galaxies but still carries precision and z-order tradeoffs
- **Scene rebuild cost** -- switching locations requires clearing and regenerating all meshes (roads, buildings, terrain, land use, POIs); there is no incremental chunk loading, so location switches are blocking operations
- **Browser performance constraints** -- garbage collection pauses, draw call limits, and texture memory budgets are all hard constraints; the engine uses reduced texture sizes, simplified geometry, and throttled updates to stay within budget
- **Elevation alignment timing** -- terrain tiles load asynchronously; roads and buildings may briefly float or clip until tile data arrives and `rebuildRoadsWithTerrain()` / `repositionBuildingsWithTerrain()` complete
- **Persistence scope constraints** -- memory markers persist per browser profile via localStorage and are not automatically synced across devices/browsers

---

## Extensibility

The architecture assumes additional layers can be added:
- Satellite imagery aligned to world geometry
- Traffic and multi-agent simulation
- Weather and atmospheric effects
- Additional planetary surfaces and celestial bodies

Real estate overlays, POI visualization, historic site discovery, space travel, and solar system exploration are already implemented as optional layers.

These are treated as **optional layers**, not core dependencies.

---

## Stability Philosophy

After core spatial alignment and controls are stable, changes prioritize additive features. Corrective work is limited to regressions and stability issues.

Stability criteria:
- Spatial alignment is consistent across locations
- Controls and traversal modes function reliably
- Core interactions (collision, navigation, map) are dependable
- Cross-browser WebGL compatibility is maintained
