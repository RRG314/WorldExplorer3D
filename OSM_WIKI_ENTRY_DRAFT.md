# OpenStreetMap Wiki Entry Draft

Last reviewed: 2026-03-13

Copy-ready draft for an OSM Wiki software/app page.

## Suggested Page Title

`World Explorer 3D`

## Template Draft (Software)

```wiki
{{Software
|name=World Explorer 3D
|logo=
|screenshot=
|description=Browser-based 3D geospatial exploration app using OpenStreetMap-derived data for interactive Earth and destination-mode exploration.
|website=https://worldexplorer3d.io
|source=https://github.com/RRG314/WorldExplorer3D
|author=Steven Reid
|license=Custom source-available license (not OSI open-source) + third-party data under their own licenses
|platform=Web browser (desktop/mobile)
|programming_language=JavaScript, HTML, CSS
|framework=Three.js/WebGL
|status=Active (experimental)
|category=3D map visualization
|coverage=Global (data/provider availability dependent)
}}
```

## Draft Body Text

World Explorer 3D is a browser-based 3D geospatial exploration application. On Earth scenes it uses OpenStreetMap ecosystem data/services (including Overpass, OSM tiles, and OSM geocoding paths) to generate interactive world context such as roads, buildings, land-use, and water overlays. The app supports preset/custom coordinate launch (including geolocation), multiple traversal modes (driving, walking, drone), and additional destination modes (Moon, Space, Ocean).

The project is positioned as an exploratory visualization/runtime experience, not as a turn-by-turn navigation product or a full GIS analysis suite. OSM attribution and data-source notes are documented in the repository.

## Notes for Final Wiki Publish

- Add one clear screenshot before publishing.
- Keep OSM attribution visible in the page body.
- Link to these repository docs:
  - `DATA_SOURCES.md`
  - `ATTRIBUTION.md`
  - `LIMITATIONS.md`
