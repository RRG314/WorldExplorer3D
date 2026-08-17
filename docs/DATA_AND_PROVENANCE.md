# World Explorer 3D — Data and Provenance Inventory

Status: authoritative release-source data map for version 4.3.0, inspected 2026-08-17.

## 1. Truth vocabulary

The runtime data contract recognizes `observed`, `authoritative`, `modeled`, `derived`, `community-observed`, `predicted`, `reference`, and `inferred`. User-authored/fictional state is additionally distinguished at the product layer.

| Class | Meaning in this product | Must not be presented as |
| --- | --- | --- |
| observed | a provider reports a time/location observation | complete or guaranteed live coverage |
| authoritative | published source record or catalog used as primary reference | error-free ground truth |
| modeled | numerical/environment model output | direct measurement at the player |
| derived | classification or product computed from other observations | direct observation |
| community-observed | contributed imagery/mapping observation | official survey |
| predicted | time-dependent forecast or propagated state | current observation |
| reference | contextual route/object/model | live operational feed |
| inferred | runtime geometry/semantics produced from incomplete data | mapped or surveyed fact |
| fictional/player-authored | gameplay find, edit, build, companion or activity | alteration of the physical world/source provider |

Every provider-backed record that reaches Live Earth uses source ID/label/operator, truth type, license, observed/valid/fetched timestamps where available, accuracy/resolution where available, and inference flag.

## 2. Earth world providers

| Domain | Source/runtime path | Use | Fallback and limits |
| --- | --- | --- | --- |
| detailed mapped core | OpenStreetMap through Overpass, `world/osm-loader.js` | roads, paths, buildings, water, landuse, POIs, infrastructure tags | bounded request, timeout, cancellation, IndexedDB cache; global tag/coverage variance |
| generalized regional context | OSM Shortbread vector tiles, `world/shortbread-source.js` | one-time transport/water/structure context to 14 km | lower detail, fixed tile/feature budgets; not movement streaming |
| building gap fill | Overture Maps PMTiles, `world/overture-*` | bounded footprint coverage fallback | source identity retained; not merged as exact metadata without stable mapping |
| accepted ground | USGS 3DEP and approved Copernicus GLO-30 artifacts | physical ground authority where cataloged | explicit datum/source-release manifest required |
| candidate/corrected ground | FABDEM, classified Copernicus variants | accepted only with required attestation/correction | cannot be silently promoted |
| legacy visual terrain | Mapzen Terrarium | visual/elevation fallback | not accepted-ground truth |
| polar terrain | ArcticDEM/REMA-aware policy and procedural cryosphere | high-latitude surface | source classification and correction constraints apply |
| land cover | ESA WorldCover | derived vegetation/material/settlement semantics | cached baseline, coarse class product, not object-by-object truth |
| bathymetry | GEBCO/open topography and bundled grids | open-ocean selection and underwater seabed | regional resolution varies; underwater terrain is gameplay presentation |
| 2D base map | OpenStreetMap raster | Earth map context | attribution and service availability apply |
| optional satellite map | ArcGIS imagery | visual map layer | reference imagery, provider terms/availability apply |
| place search | Nominatim | forward search | result coverage/ranking varies |
| reverse place context | Nominatim, BigDataCloud fallback | selected-location label | label is provider context, not boundary authority |
| historic context | Wikidata/Wikipedia | selected POI/building context | optional and incomplete |
| property context | Estated, ATTOM or RentCast with user key | optional property/listing information | disabled without user-supplied credential; never legal/survey advice |

Provider work belongs to one active world-load session. It records outstanding work, cancellation and fallback state. A superseded response cannot publish. Large decoded staging payloads are released after geometry publication; HTTP/IndexedDB caches remain bounded and versioned.

## 3. Live Earth and operational data

| Layer | Source | Truth class | Freshness/coverage qualification |
| --- | --- | --- | --- |
| satellites | CelesTrak TLE + `satellite.js` propagation | authoritative elements + predicted position | position is propagated to time; element age matters |
| earthquakes | USGS GeoJSON feeds | observed | feed completeness/freshness depends on USGS product |
| weather | Open-Meteo | modeled | current/forecast model data, not an on-site sensor |
| marine weather | Open-Meteo Marine | modeled | waves/current/temperature/sea level guidance |
| water levels | NOAA CO-OPS | observed | station-specific datum, units and quality |
| tide predictions | NOAA CO-OPS | predicted | harmonic prediction, not observation |
| aircraft | OpenSky, ADSB.lol fallback via same-origin function | observed/aggregated | reception gaps, delay, provider terms and rate limits apply |
| street imagery | Panoramax, KartaView via same-origin function | community-observed | timestamped reference imagery, not a live camera |
| transport routes | World Explorer reference routes | reference | not live ADS-B or AIS |
| marine traffic | reference presentation only | reference | current source does not claim live observed AIS vessels |
| local events | configured/local provider path | provider-dependent | availability and semantics depend on configured source |

Live Earth UI must expose provider name, truth class, fetched/observed/valid time when available, provider health and fallback/cache status. A successful fetch is not proof of complete local coverage.

## 4. Planetary, ocean and astronomy data

| System | Data basis | Product transformation |
| --- | --- | --- |
| Moon surface | LROC/LOLA-derived assets and Apollo 11 catalog context | local playable terrain, textures and landing experience |
| Mars surface | MOLA/Viking-derived terrain/texture context | playable terrain and atmosphere treatment |
| solar system | JPL approximate planetary elements (J2000 elements/rates), project catalog | computed heliocentric positions transformed to visual/playable scale |
| minor bodies | project catalog and modeled belts | bounded particle belts; 3,000 asteroid and 3,600 Kuiper points with named objects |
| spacecraft | project reference catalog | contextual visual positions; not mission-operations telemetry |
| deep sky | project astronomical catalog | transformed navigation scale and generated visual presentation |
| wormhole/encounters | original gameplay | explicitly speculative/fictional |
| underwater Ocean | bundled Great Barrier Reef grid plus global bathymetry path | local seabed, reef, fish, shark and submarine experience |

Neither solar/deep-space scale nor underwater ecology/physics is a scientific simulator. The source supports learning/context, but the visible experience is transformed for playability.

## 5. Generated and inferred Earth content

Generated presentation is allowed only when labeled or structurally separated from mapped truth:

- building height/roof/facade detail inferred from mapped footprint/tags;
- bounded building footprints where mapped coverage is insufficient;
- generated interiors based on footprint and available indoor tags;
- vegetation populations derived from landuse/WorldCover;
- Living World pedestrians/vehicles derived from transport, entrances and context;
- representative landmark detail around a stable mapped/catalog anchor;
- World Discovery environment cells and encounter slots derived from the published fixed world;
- procedural geology, fictional detector finds and virtual archaeology;
- virtual wildlife encounter placement and companion presentation;
- editable-world safe semantic objects and suppressed base features;
- activity objectives generated inside bounded loaded-world surfaces.

Inference must not overwrite provider source identity. Building metadata is merged across sources only with an explicit stable feature identity or same-source mapping. Ambiguous cross-source data remains separate.

## 6. World Discovery provenance

`discovery/catalog.js` currently declares three catalog source authorities:

| ID | Use | License/truth |
| --- | --- | --- |
| `we3d-original` | tools, activities, procedural finds, modeled specimens/companions | original fictional/procedural content |
| `osm` | mapped context evidence | ODbL; mapped context only |
| `worldcover` | habitat/land-cover context | CC BY 4.0; derived class context |

Discovery separates four projections:

- Journal: what the player did and evidence recorded;
- Field Guide: identification index and observation count/regions;
- Collection: only a virtual specimen/find/catch/creation actually acquired;
- Explorer Progress: credit for new identification or new-region evidence.

Reference photographs are licensed identification images. They do not claim the subject appeared at that exact location and are not player camera evidence. Procedural in-world models are original bounded meshes. The current visual manifest covers tools, geology/natural-history entries, wildlife, plants where cataloged, and all companion variants; related variants may share a licensed species reference image.

## 7. Wildlife, plants and companions

Wildlife eligibility is habitat/context-aware but is not a live biodiversity observation service. Logical wildlife is capped and presentation uses no additional movement-triggered provider query. Real conservation status is not inferred from gameplay rarity.

Companions are owned virtual entities, distinct from wildlife evidence. Current catalog groups:

- dogs: Trail Hound, Field Retriever, Park Terrier;
- cats: Harbor Cat, Meadow Tabby, Midnight Cat;
- birds: Virtual Marsh Mallard, City Pigeon;
- canid: Red Fox.

Each catalog record owns world scale, AR scale, size class and behavior archetype. Dogs/cats/fox are ground followers; birds are airborne followers. Names and appearance are fictional even when a real species reference photo is used for identification/design context.

## 8. Assets and model provenance

| Asset family | Location | Authority |
| --- | --- | --- |
| landing/gameplay media | `assets/landing/`, current media under `assets/landing/current/` | project-produced screenshots/art |
| game GLB models | `app/assets/models/` and related asset paths | repository asset metadata/attribution required |
| discovery reference images | `app/assets/discovery/` | manifest-driven licensed/reference images |
| discovery procedural models | `app/js/discovery/*models.js`, field equipment | project-original generated Three.js geometry |
| Moon/Mars/Ocean data/assets | `app/assets`, `app/data`, runtime catalogs | source-specific metadata and project transformation |
| ground artifacts | `app/data`/location-data build products | manifest with provider, release, datum and hash |

The production artifact builder includes only declared/reachable public assets. The strict 4.3.0 audit passes 93 tracked hosting assets plus 27 dynamic PBR assets with no unreachable files. Obsolete and superseded release media were removed recoverably rather than excluded from the gate.

## 9. Cache and fallback policy

- OSM/provider map cache: IndexedDB `worldexplorer3d-map-cache`.
- WorldCover baseline: IndexedDB `worldexplorer3d-worldcover-cache`.
- Discovery profile/events/items/companions/guide: IndexedDB `world-explorer-discovery` for anonymous/local authority.
- Server proxy caches/fallbacks: bounded inside the Cloud Function implementation.
- DeFlock: live mapped nodes with bundled Baltimore last-good fallback.
- Provider failure: explicit health/fallback state; never relabel a fallback as preferred-source truth.
- Location/world change: provider response must match active request identity before publication.
- Production static assets: hashed media/location data is immutable; HTML/JS/CSS revalidate.

## 10. Required representation rules

1. Retain `© OpenStreetMap contributors` wherever OSM-derived public mapping is shown.
2. Preserve every additional source's license/attribution metadata in the artifact and relevant UI/documentation.
3. Display timestamps for time-sensitive data and distinguish observed, valid and fetched time.
4. Never present generated interiors/buildings/vegetation/wildlife/finds as surveyed reality.
5. Never present predicted satellite/tide state as a direct observation.
6. Never present reference marine/spacecraft routes as live operations.
7. Never imply virtual suppression, DeFlock disabling, painting or building changes a physical asset or source dataset.
8. Do not use property, map, weather, aviation, marine, GPS or astronomy presentation for safety-critical decisions.

## 11. Provenance gaps and release checks

| Finding | Status | Required action |
| --- | --- | --- |
| Global provider coverage varies | known limitation | preserve health/fallback/coverage UI and tests |
| Generated long-tail discovery records may reuse reference imagery | acceptable with disclosure | keep reference-not-proof wording visible |
| Marine traffic is not live AIS | explicit limitation | do not market as live vessel tracking |
| Legacy landing assets were unreachable | closed 2026-08-17 | obsolete files removed recoverably; keep the strict asset audit green |
| Source documents outside the six canonical inventory docs may be stale | documentation risk | canonical docs override planning history; update links on material change |

The authoritative source catalogs are code (`geospatial/data-contract.js`, ground provider/catalog modules, discovery catalog/visual manifest, planetary/space catalogs) plus source metadata shipped with the artifact. Prose must be updated when those catalogs change.
