# World Explorer 3D 3.1.0

Version 3.1 completes the runtime-ownership work begun in 3.0 and turns Live Earth into a provenance-aware operational workspace. It also replaces the disconnected start flow with one globe-first interface that connects destinations, live layers, missions, multiplayer, and play.

## Highlights

- A consolidated, responsive globe selector is now the primary start hub for Earth, Moon, Mars, Space, Ocean, missions, multiplayer, library, and quick-start actions.
- Live Earth places current OpenSky aircraft at their reported coordinates and exposes observed CelesTrak satellites, USGS earthquakes, current Open-Meteo weather, community street imagery, modeled marine conditions, and NOAA water-level/tide coverage.
- Every operational provider reports provenance, freshness, cache state, health, warnings, and fallback state. Observations, models, predictions, and reference-only layers remain visibly distinct.
- Earth location play retains detailed OSM geometry, while optional continuous travel uses tiled Overture data through a separate source profile and shared surface contract.
- Terrain, land use, hydrology, road elevation, bridges, tunnels, vegetation, building placement, and actor spawning now share explicit ownership and surface-query boundaries.
- Golden Gate road, guardrail, landmark, and vehicle geometry share one authoritative deck profile instead of competing elevations.
- Earth, Ocean, Moon, Mars, and Space transitions use one session coordinator and preserve a populated Earth scene on warm return without a page reload.
- The Solar System keeps the asteroid belt at 2.06-3.27 AU and the Kuiper belt at 30-50 AU, with a permanent log-scale inset that makes both regions legible without falsifying their positions.
- Mobile controls, plane transitions, generated interiors, the 200-block builder, editors, activity persistence, and multiplayer room synchronization are covered by browser verification.
- Unused BMW source, archive, and runtime assets were removed from the public repository.

## Data And Accuracy

World Explorer uses multiple data classes. OpenStreetMap and Overture provide mapped geometry; ESA WorldCover and elevation models provide surface context; operational panels use observed, modeled, or predicted feeds as labeled. Procedural and inferred fallbacks remain bounded and are not presented as real observations.

See [DATA_SOURCES.md](DATA_SOURCES.md), [ATTRIBUTION.md](ATTRIBUTION.md), and [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for provider coverage and limitations.

## Verification

The release gate covers hosting artifact integrity, reachable-source auditing, Firestore rules, local-data safety, runtime and session ownership, transport controllers, mobile controls, editor/multiplayer workflows, plane/interior transitions, planetary launches and returns, geospatial providers, surface contracts, continuous rendering, water/biome behavior, and representative global visual matrices.

Production promotion remains owner-controlled. No Firebase service-account key, payment secret, provider credential, or administrative credential is included in the public repository.
