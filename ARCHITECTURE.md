
---

# 2️⃣ `ARCHITECTURE.md`  
*(Understanding: how it works, why it’s built this way)*

```md
# World Explorer – Architecture Overview

This document describes the internal structure, design decisions, and conceptual model of the World Explorer engine.

---

## Core Design Philosophy

World Explorer is built as:
- A **single-file, self-contained browser engine**
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

### 1. Simulation Layer
- Vehicle physics (speed, grip, drift, braking)
- Drone movement and camera control
- Collision and boundary awareness (on-road vs off-road)

### 2. World Geometry Layer
- Road meshes derived from real-world data
- Procedural or placeholder buildings
- Markers (checkpoints, destinations)

### 3. Rendering Layer
- Three.js scene, camera, lighting, and fog
- Defensive WebGL initialization for broad compatibility
- Optional HDR environment with fallback

### 4. UI Layer
- HUD (speed, mode indicators)
- Floating menu for global actions
- Minimap and large map canvases
- Mode overlays (pause, results, alerts)

### 5. Map Layer
- 2D map rendering via canvas
- Zoomable large map
- Layer toggles (satellite / roads)
- Designed independently from the 3D driving plane

---

## Single-File Architecture (Intentional)

The engine is delivered as a single HTML file to:
- Reduce setup friction
- Make the project portable and inspectable
- Allow easy freezing and archiving of milestones

This is intentional and not a limitation.

---

## Extensibility

The architecture assumes additional layers can be added:
- Satellite imagery aligned to world geometry
- Real estate listings or parcel overlays
- POIs, analytics, or simulation data

These are treated as **optional layers**, not core dependencies.

---

## Project Freeze Philosophy

The project is frozen once:
- Spatial alignment is stable
- Controls and modes function consistently
- Core interactions are reliable

Future work is considered additive, not corrective.
