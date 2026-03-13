# Data Sources

Last reviewed: 2026-03-13

This file summarizes runtime data dependencies used by World Explorer 3D.

## Primary Geospatial Source (OSM Ecosystem)

| Source | Usage in World Explorer 3D | Endpoint/Path | License / Terms |
| --- | --- | --- | --- |
| OpenStreetMap contributors | Roads, buildings, land-use, POIs, water context for Earth scenes | Overpass API requests in `app/js/world.js` | ODbL 1.0 |
| OpenStreetMap tiles | Minimap / large-map basemap tiles | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | ODbL attribution + tile usage policy |
| OSM vector water tiles | Water polygon/line overlays | `https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt` | OSM ecosystem terms |
| Nominatim (OSM geocoding) | Location search / place lookup | `https://nominatim.openstreetmap.org/search` | OSMF Nominatim usage policy |

Required attribution used by this project:

- `© OpenStreetMap contributors`

## Additional Geospatial/Elevation Inputs

| Source | Usage | Endpoint/Path | License / Terms |
| --- | --- | --- | --- |
| Terrarium elevation tiles | Terrain mesh elevation sampling | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Upstream provider terms |
| OpenTopodata (GEBCO 2020 dataset) | Ocean-mode bathymetry seed grid (`app/data/ocean-bathymetry-great-barrier-reef.json`) | Data generation metadata embedded in JSON | CC-BY 4.0 (GEBCO Compilation Group) |
| Esri World Imagery (optional toggle) | Satellite basemap view | ArcGIS Online tile endpoint in `app/js/map.js` | Esri terms |

## Optional App-Configured Service APIs

When configured, this app can call additional provider APIs (for example property-data services). These are optional and governed by their own provider contracts.

## Operational Notes

- Data quality and latency depend on upstream providers and network conditions.
- Overpass/Nominatim availability can vary by region and load.
- Runtime includes fallback behavior for partial/missing world data in some flows.

## Related Docs

- [ATTRIBUTION.md](ATTRIBUTION.md)
- [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)
- [LIMITATIONS.md](LIMITATIONS.md)
