# Known Issues and Limitations

Last reviewed: 2026-08-17 for version 4.3.0 release source. The exact immutable commit and content hash are recorded by the hosting build manifest.

## Current Release Status

Version 4.3.0 completed its immutable preview gate and is approved for production promotion. The production-configured candidate passed source/artifact identity, bundled browser boot, deployed visual inspection and the privileged operational endpoint check. Firestore rules and the seven new DeFlock/Discovery Functions were deployed before hosting promotion; existing parameterized billing/admin Functions were intentionally left untouched so their production configuration was not replaced.

The Living/Editable World 2.02 GB heap high-water observation is accepted as a disclosed 4.3.0 risk, not marked fixed. The fresh title-release journey still proves that the loaded world is released rather than retained as a duplicate.

## Map Coverage

- Building footprints, heights, roof shapes, indoor details, roads, vegetation, and water depend on available source data. Coverage varies globally.
- Missing building heights, materials, facade details, and roof equipment use bounded visual fallbacks; those fallbacks are not claims about the real structure.
- New OpenStreetMap edits appear only after upstream services and local caches refresh.

## Loading and Performance

- Dense cities, rapid plane travel, detailed facades, and large structure networks can be demanding on GPU memory and network bandwidth.
- The initial world load intentionally waits for core roads and buildings so play does not begin in an empty scene. Additional distant detail may continue to refine afterward.
- Browser GPU support and memory limits differ significantly, especially on older phones and integrated graphics.
- A fresh installed-Chrome release journey correctly released the loaded Earth world at the title screen (heap 689.5 MB to 469.8 MB; geometries 1,251 to 231) and rebuilt it without duplicate ownership. A heavier Living/Editable World edit-and-reload journey nevertheless reached a reported 2.02 GB JavaScript heap high-water mark. This is not evidence of a retained duplicate world, but it remains a production-risk observation requiring target-hardware review before deployment.
- Provider latency can make the same location load at different speeds even when the generated world is unchanged.
- Narrow or tightly mapped service roads can leave little vehicle clearance.
  The runtime gate samples all road centers and lanes for building collisions,
  then runs movement journeys only on verified straight, unobstructed segments.

## External Services

- Geocoding, map geometry, elevation, imagery, weather, and other live context can be degraded by upstream rate limits or outages.
- The runtime includes timeout and fallback behavior, but a fallback may be less detailed than the primary source.
- OpenSky access can be restricted from some cloud-hosting networks. The release preview must pass the production-egress preflight; otherwise aircraft remain explicitly labeled reference routes rather than observed flights.
- Panoramax and KartaView street imagery is an inspection layer with uneven global coverage. It is not used as an unlicensed facade texture source.
- Live vessel positions are not currently presented as observed AIS data. Shipping corridors remain labeled reference data until an AIS source and redistribution license are selected.
- NOAA water-level observations and tide predictions are limited to supported stations, primarily in the United States. Open-Meteo marine values are modeled guidance and remain labeled separately.
- Provider timing can delay exact bridge/tunnel records. The fixed regional fallback and connected-structure compiler preserve visible continuity, but well-known structures must still be visually checked in the preview candidate rather than inferred from source record counts.

## Generated Content

- Real indoor data is uncommon. Buildings without usable indoor mapping receive a footprint-aware generated interior.
- Generated interiors are traversable and sized from the building footprint, but may be visually sparse when no authoritative indoor geometry exists.
- Procedural vegetation, inferred buildings, distant aerial context, and deep-space encounters fill data gaps and should not be interpreted as exact observations.
- Solar-system distances and planetary sizes use documented visual scaling so destinations remain navigable. The experience is educational and exploratory, not an orbital-navigation simulator.

## Backend Features

- Sign-in, multiplayer, cloud saves, social features, moderation, leaderboards, and optional support flows require the production backend.
- Local or forked copies do not receive production credentials or administrative access.
- The current Firestore rules and emulator-backed two-client multiplayer journeys pass. Production-only privileged endpoint behavior still requires a deployed preview URL and cannot be certified from localhost alone.

## Test Harness Limitations

- Two older bundled-Chromium matrix scripts (`test:fixed-world-travel-browser` and `test:editor-multiplayer`) did not reach a terminal report under their SwiftShader path during this check. They produced no failing assertion before being stopped. Installed-Google-Chrome journeys independently passed the corresponding travel-control, world-cancellation, title lifecycle, two-client multiplayer, rules, building-edit persistence, and session-lifecycle behaviors. The legacy harnesses should be bounded or migrated, but they are not counted as passing evidence.

## Product Scope

- World Explorer 3D is not turn-by-turn navigation, a marine chart, an aviation trainer, or survey-grade GIS.
- Ocean and underwater behavior is gameplay-oriented rather than a scientific fluid or bathymetry simulation.
- Tunnels, bridges, ramps, and stacked roads depend on mapped structure and layer tags. Incomplete source tagging can reduce geometric detail or cause the safer fallback profile to be used.

Please report reproducible problems through [GitHub Issues](https://github.com/RRG314/WorldExplorer3D/issues).
