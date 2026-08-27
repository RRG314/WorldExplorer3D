# Data Sources

Last reviewed: 2026-08-26 for World Explorer 3D 5.0.0.

World Explorer keeps source identity and truth type with its data. Observations,
forecasts and models, predictions, mapped features, and visual fallbacks are not
interchangeable.

## Earth Geometry And Surfaces

| Source | Runtime use | Data class | License / terms |
| --- | --- | --- | --- |
| OpenStreetMap contributors | Detailed location roads, buildings, land use, water, paths, bridges, tunnels, place context, and mapped surveillance objectives through Overpass | Community-mapped | ODbL 1.0 |
| OSM Shortbread vector tiles | Bounded building and water fallback geometry | Community-mapped | ODbL 1.0 and OSM service terms |
| OSM raster tiles | Minimap and map context | Community-mapped | ODbL 1.0 and tile usage policy |
| Nominatim | Forward and reverse place lookup | Community-mapped service | OSMF Nominatim policy |
| Overture Maps Foundation | Bounded building-massing fallback when selected-location OSM building coverage is unavailable | Compiled mapped data | Overture source licenses and attribution |
| ESA WorldCover 2021 | Global semantic surface classification and land-cover fallback | Remote-sensing classification | CC BY 4.0; contains modified Copernicus Sentinel data |
| USGS 3DEP accepted-ground data | Baltimore bare-earth terrain height and collision | Government elevation model normalized to EGM2008 | Public USGS data |
| Copernicus DEM GLO-30 classified-ground data | Accepted terrain for documented locations | Public DEM-derived, correction-attested ground normalized to EGM2008 | Public free use with required attribution |
| Mapzen Terrarium elevation tiles | Legacy visual fallback only; never accepted-ground authority | Elevation model | Provider/source terms |
| GEBCO 2020 via OpenTopodata | Bundled Great Barrier Reef bathymetry seed | Bathymetric model | CC BY 4.0 |

Required map attribution: `© OpenStreetMap contributors`.

## Regional Ecology

The Baltimore–Chesapeake ecology pack uses the GBIF Backbone Taxonomy for
stable taxon identity and Maryland Department of Natural Resources and
Chesapeake Bay Program references for regional plausibility review. It does not
include occurrence points or abundance estimates and does not claim that a real
organism is present at a player location.

| Source | Runtime use | Data class | License / terms |
| --- | --- | --- | --- |
| GBIF Backbone Taxonomy (2023 pinned compatibility taxonomy) | Stable taxonomy identity for the 60-taxon regional pack | Taxonomic reference | CC BY 4.0; GBIF Secretariat DOI 10.15468/39omei |
| Maryland Department of Natural Resources wildlife and native-plant lists | Factual regional plausibility review | Government reference | Reference only; no copied prose or media |
| Chesapeake Bay Program Field Guide | Factual estuary and fish plausibility review | Government-program reference | Reference only; photography excluded unless separately permitted |

OpenStreetMap and ESA WorldCover can provide mapped habitat or land-cover
context. Neither is used to infer species presence or abundance.

## Surveillance Mapping

DeFlock Hunt queries OpenStreetMap nodes tagged `man_made=surveillance` through
bounded Overpass requests. A dated Baltimore last-good snapshot is bundled only
as a labeled outage fallback and retains its OSM source IDs, timestamps, and
ODbL provenance. The mode does not consume license-plate scans, photographs,
live reader results, or a private surveillance-provider feed.

The game concept is inspired by the independent
[DeFlock project](https://deflock.org/), whose public tools help contributors
map surveillance devices into OpenStreetMap. World Explorer 3D is unaffiliated
with DeFlock and uses no DeFlock application code or DeFlock-owned data feed.

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
