# OSM Ecosystem Metadata Pack

Last reviewed: 2026-03-13

Prepared metadata for OpenStreetMap ecosystem discovery and software-entry drafting.

## 1) Short Description (1 sentence)

World Explorer 3D is a browser-based 3D geospatial exploration app that uses OpenStreetMap-derived world data for interactive place exploration across Earth and additional destination modes.

## 2) Medium Description (1 paragraph)

World Explorer 3D is a WebGL browser application for immersive exploration of real-world places. It uses OpenStreetMap ecosystem data for roads, buildings, land-use, water, and place context, then renders this in an interactive 3D runtime with driving, walking, and drone traversal. The app also includes destination experiences (Moon, Space, Ocean), geolocation launch support, and map overlays. The project is active and experimental, with documented attribution, reproducibility commands, and known limitations.

## 3) Long Description (OSM Wiki Body Candidate)

World Explorer 3D is an interactive browser-based 3D geospatial exploration platform. On Earth scenes, it uses OpenStreetMap-derived map features and services (including Overpass, OSM tiles, and OSM geocoding paths) to generate and render roads, buildings, land-use, and water context in a real-time WebGL environment. Users can launch from preset or custom coordinates, including geolocation, then explore with multiple movement modes (driving, walking, drone). The project also includes non-Earth destination modes (Moon, Space, Ocean) for extended exploration workflows. It is intended as an exploratory visualization/runtime project rather than a replacement for traditional 2D map editors, navigation software, or GIS analysis suites. Attribution and data-source documentation are included in the repository.

## 4) Category Suggestions

Recommended OSM-facing categories:

- 3D map visualization
- Web mapping application
- Geospatial exploration
- Experimental mapping tools

## 5) Suggested GitHub Topics

- `openstreetmap`
- `osm`
- `geospatial`
- `mapping`
- `3d`
- `webgl`
- `threejs`
- `javascript`
- `browser-app`
- `geospatial-visualization`
- `map-data`
- `interactive-map`
- `world-exploration`

## 6) Suggested Repository Short Description

Browser-based 3D geospatial exploration app using OpenStreetMap-derived data for interactive Earth, Moon, Space, and Ocean destination modes.

## 7) Suggested Homepage Text

World Explorer 3D is an OSM-informed browser app for interactive 3D place exploration and destination-mode visualization.

## 8) Suggested Screenshot Set for Public Listings

1. Title and launch selector (Earth/Moon/Space/Ocean + geolocation button).
2. Earth city traversal with map overlays visible.
3. Ocean mode with HUD and depth controls.
4. Moon or Space destination view for mode differentiation.

Suggested caption style:

- "World Explorer 3D title and destination selector"
- "Earth mode with OSM-derived urban context"
- "Ocean mode (experimental) with submarine controls"
- "Moon/Space destination mode"

## 9) Suggested OSM-Wiki Listing Notes

- Clearly state that OSM data is used with attribution.
- Clearly state this is an exploration/visualization app.
- Keep claims bounded to tested behavior and documented limitations.
- Link to `DATA_SOURCES.md`, `ATTRIBUTION.md`, and `LIMITATIONS.md`.
