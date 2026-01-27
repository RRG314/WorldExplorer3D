# World Explorer 3D

World Explorer 3D is a browser-based real-world exploration engine that enables interactive navigation of city-scale environments using real geographic and astronomical data.

The platform supports driving, walking, and aerial (drone-style) traversal through real cities, combining 3D visualization, live map data, and multi-layer spatial context in a single, self-contained application.

This project is intentionally positioned as a **foundation engine** rather than a finished consumer product.

---

## Core Capabilities

### Terrestrial Exploration
- Real-world city selection via geographic coordinates
- Road-aware driving with off-road detection
- Walking and aerial (drone) traversal modes
- Vehicle physics including acceleration, braking, drift, and boost
- Procedural buildings and road geometry derived from live data

### Map & Navigation
- Integrated minimap and full-screen interactive map
- Zoomable large-map view
- Map layer toggles:
  - Road network
  - Satellite imagery (map layer)
- Teleportation and respawn tools

### Game & Interaction Modes
- Free roam exploration
- Time trial challenges
- Checkpoint-based navigation
- Floating control menu for global actions

---

## Celestial & Astronomical Layer

World Explorer 3D includes an optional **celestial visualization layer** that renders stars and large-scale astronomical context alongside the terrestrial world.

This layer is designed to support:
- Spatial orientation and scale awareness
- Educational astronomy visualization
- Multi-scale navigation concepts (ground → aerial → celestial)
- Future scientific or observational data overlays

### Features
- Star field rendered using real bright-star catalog data
- Planetary and celestial reference objects
- Optional constellation and reference-line visualization
- Clickable celestial objects with metadata hooks
- Independent rendering layer that does not interfere with ground navigation

### Astronomical Data Sources
- **Yale Bright Star Catalog (BSC5)** – bright-star reference data
- **Hipparcos** – distance and astrometric reference values

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

World Explorer 3D is implemented as a single-file browser application using Three.js.

### Design Principles
- A unified geographic-to-world coordinate system shared across all layers
- Clear separation between:
  - Simulation logic
  - World geometry
  - Rendering pipeline
  - UI and map interfaces
- Layered architecture allowing new datasets and features to be added without rewriting the core engine

Detailed architectural notes are provided in `ARCHITECTURE.md`.

---

## Controls (Default)

### Movement
- **WASD / Arrow Keys** — accelerate and steer
- **Space** — handbrake / drift
- **Ctrl** — boost
- **Shift** — off-road behavior (if enabled)

### Camera & Modes
- **C / V** — cycle camera views
- **R** — record track
- **Esc** — pause
- **Drone mode** — available via floating menu

### Map
- Click minimap — open large map
- Zoom controls — available in large map
- Toggle satellite imagery and road layers in map UI

---

### Running the Project

### Recommended (Local Server)

Some browsers restrict network requests when opening files directly.

```bash
python -m http.server
Then open:

arduino
Copy code
http://localhost:8000
```


Direct File Open
The HTML file can be opened directly in a modern browser (Chrome recommended), though some features may be limited.

Project Status
This repository represents a frozen core engine milestone.

The spatial model, traversal systems, terrestrial and celestial layers, and map integration are considered stable.
Future development is expected to be additive, not corrective.

Future Directions (Exploratory)
Potential extensions include:

Modular separation of engine and demo layers

Traffic and multi-agent simulation

Pedestrian and non-vehicle navigation

Day/night cycles and weather systems

Data overlays (zoning, demographics, infrastructure)

VR and immersive display support

Multi-user synchronized exploration

These directions are exploratory and subject to change.

Legal & Attribution
OpenStreetMap
Map data © OpenStreetMap contributors
Licensed under the Open Database License (ODbL) v1.0
https://www.openstreetmap.org/copyright

This project uses OpenStreetMap data via live API queries.
No ownership of OpenStreetMap data is claimed.

Third-Party Services & Libraries
Nominatim — https://nominatim.org/

Overpass API — https://overpass-api.de/

Three.js — https://threejs.org/

Astronomical Data
Yale Bright Star Catalog (BSC5)

Hipparcos (ESA astrometric reference)

Astronomical datasets are used for visualization and reference purposes only.

Other Assets
Fonts: Google Fonts (Inter, Poppins) — SIL Open Font License

HDR Environment Maps: Poly Haven — CC0 (Public Domain)

All third-party trademarks and datasets remain the property of their respective owners.

License
All Rights Reserved

Copyright © 2026

This repository, including its source code, engine architecture, and original assets, is proprietary.
No permission is granted to use, copy, modify, or distribute this software without explicit authorization from the author.

OpenStreetMap data and other third-party datasets are used under their respective licenses and are not covered by this restriction.

Contact
For questions, feedback, or licensing inquiries, please open an issue on GitHub.
