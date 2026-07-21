# Data Sources

Last reviewed: 2026-07-20 for version 3.1.0.

World Explorer keeps source identity and truth type in its runtime contracts. Observations, forecasts/models, predictions, mapped features, and visual fallbacks are not interchangeable.

## Earth Geometry And Surfaces

| Source | Runtime use | Data class | License / terms |
| --- | --- | --- | --- |
| OpenStreetMap contributors | Detailed location roads, buildings, land use, water, paths, bridges, tunnels, and place context through Overpass | Community-mapped | ODbL 1.0 |
| OSM Shortbread vector tiles | Bounded building and water fallback geometry | Community-mapped | ODbL 1.0 and OSM service terms |
| OSM raster tiles | Minimap and map context | Community-mapped | ODbL 1.0 and tile usage policy |
| Nominatim | Forward and reverse place lookup | Community-mapped service | OSMF Nominatim policy |
| Overture Maps Foundation | Tiled transportation, buildings, land cover, and water for optional continuous Earth streaming | Compiled mapped data | Overture source licenses and attribution |
| ESA WorldCover 2021 | Global semantic surface classification and land-cover fallback | Remote-sensing classification | CC BY 4.0; contains modified Copernicus Sentinel data |
| Mapzen Terrarium elevation tiles | Earth terrain height sampling | Elevation model | Provider/source terms |
| GEBCO 2020 via OpenTopodata | Bundled Great Barrier Reef bathymetry seed | Bathymetric model | CC BY 4.0 |

Required map attribution: `© OpenStreetMap contributors`.

## Operational Earth Feeds

| Source | Runtime use | Truth class | Notes |
| --- | --- | --- | --- |
| CelesTrak GP data | Satellite positions propagated from current orbital elements | Observed orbital elements / propagated position | Two-hour shared cache; partial groups can degrade independently |
| USGS GeoJSON earthquake feed | Recent earthquake locations and magnitudes | Observed events | Five-minute shared cache |
| OpenSky Network | Aircraft state vectors near the selected location | Observed state vectors | Same-origin server adapter; hosting egress and provider terms apply |
| ADSB.lol | Fallback aircraft observations when OpenSky is unavailable | Observed ADS-B state vectors | Same-origin server adapter; ODbL 1.0; provider availability and rate limits apply |
| Open-Meteo Forecast API | Current weather samples | Modeled current conditions | Ten-minute shared cache |
| Open-Meteo Marine API | Wave, current, temperature, and sea-level guidance | Modeled marine guidance | Fifteen-minute shared cache |
| NOAA CO-OPS | Water-level station metadata and observations | Observed station data | Coverage is station-dependent; datum and quality are retained |
| NOAA CO-OPS | High/low tide times and levels | Predicted tides | Kept separate from observations |
| Panoramax | Nearby community street imagery and official viewer links | Community observations | CC BY-SA 4.0; coverage varies |
| KartaView | Nearby community street imagery and official viewer links | Community observations | CC BY-SA 4.0; coverage varies |

Marine traffic is currently a labeled reference layer, not observed AIS. No synthetic route is presented as a live vessel position.

## Astronomy And Planetary Data

| Source | Runtime use | Notes |
| --- | --- | --- |
| ESA Gaia DR3 sample | Bundled bright/nearby star positions and magnitudes | Display color is a documented BP-RP approximation |
| NASA/JPL and USGS Astrogeology | Planet textures and planetary reference data | Individual asset provenance is listed in `app/assets/textures/ATTRIBUTION.md` |
| LROC NAC / LOLA | Apollo 11 local terrain and orthophoto | Browser-sized derivatives retain source attribution |
| MGS MOLA / Viking MDIM | Olympus Mons terrain and Mars surface imagery | Browser-sized derivatives retain source attribution |
| Published orbital elements and catalog coordinates | Solar-system bodies, named asteroids, spacecraft, galaxies, nebulae, and black-hole destinations | Visual scaling is documented; it is not a navigation ephemeris |

## Runtime Fallbacks

When authoritative coverage is missing or a provider is unavailable, the app may use procedural materials, inferred building massing, generated interiors, vegetation placement, modeled routes, or cached data. These paths are bounded and labeled where surfaced to the user; they are not claims of observation or survey accuracy.

## Provider Boundaries

- Browser clients do not receive private provider credentials.
- Panoramax, KartaView, OpenSky, and ADSB.lol requests use allowlisted same-origin server adapters.
- Provider requests use bounded caches, timeouts, in-flight deduplication, and health diagnostics.
- Production Firebase, payment, and administrative credentials are never included in this repository.

See [ATTRIBUTION.md](ATTRIBUTION.md), [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md), and [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
