# Data Sources

Last reviewed: 2026-09-06 for World Explorer 3D 5.2.0.

## Functional POI research note (2026-09-05)

The functional POI foundation currently consumes the mapped POI records already
published by the Shortbread and exact OpenStreetMap/Overpass loaders. Shortbread
is a deliberately lean vector-tile schema, so it is not assumed to cover every
functional category or every OSM tag. Overture Places is being evaluated as a
future normalized input for stable place identity, taxonomy, provenance,
operating status, and confidence. No Overture Places runtime dependency has
been added, and no generated gameplay inventory, service, interior, price, or
opening state is described as provider data.

See [FUNCTIONAL_POI_SYSTEM.md](FUNCTIONAL_POI_SYSTEM.md) for the provider
reconciliation and truth-boundary rules.

World Explorer keeps source identity and truth type with its data. Observations,
forecasts and models, predictions, mapped features, and visual fallbacks are not
interchangeable.

## Community Reality Capture

Reality Capture uses photos deliberately contributed by an authenticated user
for a stable mapped building. The mapped provider remains the identity and
geographic authority; the photographs are user-contributed observations, and
the reconstructed GLB is a modeled presentation derivative. Neither establishes
ownership, legal access, an official floor plan, a current business condition,
or any other provider fact.

Client normalization removes EXIF metadata, including embedded GPS, before the
write-once private upload. The backend preserves contributor, target, pipeline,
quality, review, and publication provenance. New interior contributions remain
private and owner-only independently of any public exterior contribution.
Unapproved photos and private processed assets are not public data sources and
must only be delivered through the authorized short-lived asset broker.

See [COMMUNITY_REALITY_CAPTURE_RND.md](COMMUNITY_REALITY_CAPTURE_RND.md) and
[COMMUNITY_REALITY_CAPTURE_V1.md](COMMUNITY_REALITY_CAPTURE_V1.md).

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

## Maryland Parcel Context

| Source | Runtime use | Data class | License / terms |
| --- | --- | --- | --- |
| Maryland Parcel Boundaries, MD iMAP item `b33e5f03d50844b8819a4046ecfe0d97` | On-demand parcel geometry, stable public polygon reference, jurisdiction, site address, acreage, land use, zoning, public utility indicators, source dates, and a public assessment input for the existing virtual-property estimate | Authoritative statewide cadastral/reference layer assembled by Maryland Department of Planning with SDAT and local-source data | Public item states that the spatial data may be freely distributed if metadata is retained and derived data acknowledges the State of Maryland; data is provided as-is. Runtime attribution: `MD iMAP, MDP, SDAT`. |

The parcel client never requests assessment account IDs, owner names, owner
mailing addresses, deed parties, liber/folio details, or resident/unit data.
Parcel facts remain visibly distinct from World Explorer ownership, prices,
interiors, inventory, access, and Quick Build content. Requests occur only when
Real Estate is opened in the Maryland service extent; they are spatially bounded,
paginated to a fixed ceiling, simplified, timed out, cancelled on superseding
work, and cached in memory for six hours. Outside Maryland or during provider
failure, the existing mapped-building property system remains authoritative.

See [MARYLAND_PARCEL_SOURCES.md](docs/MARYLAND_PARCEL_SOURCES.md) for the
field allowlist, coverage evidence, dates, CRS, and provider limitations.

## Regional Ecology

The regional ecology registry uses the GBIF Backbone Taxonomy for stable taxon
identity. Government and public-agency references support regional
plausibility review. The packs do not include occurrence points or abundance
estimates and do not claim that a real organism is present at a player
location.

| Source | Runtime use | Data class | License / terms |
| --- | --- | --- | --- |
| GBIF Backbone Taxonomy (2023 pinned compatibility taxonomy) | Stable taxonomy identity for regional packs | Taxonomic reference | CC BY 4.0; GBIF Secretariat DOI 10.15468/39omei |
| Maryland Department of Natural Resources wildlife and native-plant lists | Factual regional plausibility review | Government reference | Reference only; no copied prose or media |
| Chesapeake Bay Program Field Guide | Factual estuary and fish plausibility review | Government-program reference | Reference only; photography excluded unless separately permitted |
| New York DEC, Illinois DNR, Florida FWC, California CDFW, Washington WDFW, and Clark County Desert Conservation Program | Factual state or county ecology review for candidate United States packs | Government reference | Reference only; copied prose, media, occurrence points, and abundance claims excluded |
| European Environment Agency EUNIS and Monaco Direction de l’Environnement | Factual habitat and regional review for candidate European and Mediterranean packs | Public-agency reference | EEA material used under CC BY 4.0; Monaco material reference only |
| Biodiversity Center of Japan and Dubai Municipality Protected Areas | Factual regional review for candidate Tokyo–Kanto and Dubai packs | Government reference | Reference only; copied prose, media, occurrence points, and abundance claims excluded |

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

## Curated Visual Assets

Curated GLBs are presentation assets, not world-data or gameplay authorities. They are bundled locally, selected through `app/js/assets/model-asset-catalog.js`, and retain the existing collision and controller envelopes. The BMW E34 source is CC BY 4.0. The Field Explorer and City Explorer come from Quaternius' CC0 Ultimate Modular Men pack. File-level credits, hashes, processing notes, and source links are recorded in `app/assets/models/ATTRIBUTION.md`.

The Pirate Interception's Insurgent raider, Solis Reach, and Pathfinder are all
drawn from Quaternius' CC0 Ultimate Spaceships Pack. The raider is an optimized
local presentation asset; Expedition encounter, damage, crew, resource, and
persistence authorities remain separate from the model.

## Provider Boundaries

- Browser clients do not receive private provider credentials.
- Panoramax, KartaView, OpenSky, and ADSB.lol requests use allowlisted same-origin server adapters.
- Provider requests use bounded caches, timeouts, in-flight deduplication, and health diagnostics.
- Production Firebase, payment, and administrative credentials are never included in this repository.

See [ATTRIBUTION.md](ATTRIBUTION.md), [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md), and [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
