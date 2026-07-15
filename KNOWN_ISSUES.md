# Known Issues and Limitations

Last reviewed: 2026-07-15 for version 3.0.0.

## Map Coverage

- Building footprints, heights, roof shapes, indoor details, roads, vegetation, and water depend on available source data. Coverage varies globally.
- Missing building heights and facade details use bounded visual fallbacks; those fallbacks are not claims about the real structure.
- New OpenStreetMap edits appear only after upstream services and local caches refresh.

## Loading and Performance

- Dense cities, rapid plane travel, and continuous streaming can be demanding on GPU memory and network bandwidth.
- The initial world load intentionally waits for core roads and buildings so play does not begin in an empty scene. Additional distant detail may continue to refine afterward.
- Browser GPU support and memory limits differ significantly, especially on older phones and integrated graphics.

## External Services

- Geocoding, map geometry, elevation, imagery, weather, and other live context can be degraded by upstream rate limits or outages.
- The runtime includes timeout and fallback behavior, but a fallback may be less detailed than the primary source.

## Generated Content

- Real indoor data is uncommon. Buildings without usable indoor mapping receive a footprint-aware generated interior.
- Procedural vegetation, inferred buildings, distant aerial context, and deep-space encounters fill data gaps and should not be interpreted as exact observations.
- Solar-system distances and planetary sizes use documented visual scaling so destinations remain navigable. The experience is educational and exploratory, not an orbital-navigation simulator.

## Backend Features

- Sign-in, multiplayer, cloud saves, social features, moderation, leaderboards, and optional support flows require the production backend.
- Local or forked copies do not receive production credentials or administrative access.

## Product Scope

- World Explorer 3D is not turn-by-turn navigation, a marine chart, an aviation trainer, or survey-grade GIS.
- Ocean and underwater behavior is gameplay-oriented rather than a scientific fluid or bathymetry simulation.

Please report reproducible problems through [GitHub Issues](https://github.com/RRG314/WorldExplorer3D/issues).
