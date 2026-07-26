# Known Issues and Limitations

Last reviewed: 2026-07-25 during the 4.1 recovery audit.

The production-quality work required to resolve the architectural limitations
below is tracked in [ROADMAP.md](ROADMAP.md). A listed limitation is not an
approval to ignore a reproducible defect.

## 4.1 Certification Status

- No unresolved code blocker remains in the fixed 11-class 4.1 geography
  matrix. The selected-location OSM runtime, road/surface occupancy, sparse
  path arrival, Golden Gate bridge, Holland Tunnel, camera clearance, and
  provider-degradation contracts pass.
- Production preview, promotion, and the rollback drill are operational
  release actions, not code fixes. They remain pending until deployment is
  explicitly authorized.
- Passing counters alone are not sufficient. The release requires the
  installed-Chrome performance run and inspected hardware frames in addition
  to deterministic CI.
- Shinjuku remains an unfeatured diagnostic stress location. It completes
  through the shared runtime, but the extended software-browser matrix observed
  a roughly 71-second load. It is not a curated Places entry for 4.1.
- Regional building massing, facades, water, boats, snow, tunnel architecture,
  and rural terrain remain visibly simplified. These are documented fidelity
  limits for 4.1, not claims that later reconstruction and simulation roadmap
  work is complete.

## Map Coverage

- Building footprints, heights, roof shapes, indoor details, roads, vegetation, and water depend on available source data. Coverage varies globally.
- Missing building heights and facade details use bounded visual fallbacks; those fallbacks are not claims about the real structure.
- New OpenStreetMap edits appear only after upstream services and local caches refresh.

## Loading and Performance

- Dense cities and rapid plane travel can be demanding on GPU memory and network bandwidth.
- The initial world load intentionally waits for core roads and buildings so play does not begin in an empty scene. Additional distant detail may continue to refine afterward.
- LOD changes can produce visible vegetation or ground-detail changes while traveling, particularly at vehicle or aircraft speed.
- Browser GPU support and memory limits differ significantly, especially on older phones and integrated graphics.

## Rendering and World Geometry

- The 4.1 candidate replaces medium-quality basic shadow maps with one fitted,
  texel-stabilized soft-shadow policy. Certified Apple Metal frames pass; GPU,
  browser, and source-data combinations outside the release matrix can still
  expose rendering differences.
- Mapped mountain paths now use the shared navigation/surface contract and the
  certified Swiss Alps path is traversable. Incomplete path tagging, extreme
  DEM relief, and thin distant terrain edges can still reduce fidelity outside
  the certified matrix.
- Bridges, viaducts, elevated surfaces, and tunnel approaches depend on incomplete source tags and tile-local feature fragments. Some complex structures can have incorrect grade, clearance, supports, or transitions.
- Generated trees, grass, buildings, and water are validated through several different placement paths. Rare overlaps such as trees or buildings in water, floating vegetation, or land-cover over transportation surfaces can remain outside certified benchmark areas.
- Building facades use a limited material and procedural-window library. Regional typology and material distinctions such as limestone, sandstone, marble, stucco, timber, and metal cladding are not yet represented at the intended quality.
- Water uses gameplay wave displacement and buoyancy, but does not yet provide the intended unified wave-normal, reflection, refraction, shoreline, and vessel system.

## Camera

- Chase-camera clearance is currently resolved from instantaneous collision candidates. Near dense geometry, bridge structures, tunnel walls, or steep terrain, it can shorten abruptly or choose a different side/overhead solution. A persistent obstruction solver with hysteresis is planned.

## External Services

- Geocoding, map geometry, elevation, imagery, weather, and other live context can be degraded by upstream rate limits or outages.
- The runtime includes timeout and fallback behavior, but a fallback may be less detailed than the primary source.
- ADSB.lol is the default observed-aircraft provider and can degrade under upstream outages or rate limits. OpenSky is disabled by default and is not a release dependency; operators may enable it only after obtaining any required written provider agreement.
- Panoramax and KartaView street imagery is an inspection layer with uneven global coverage. It is not used as an unlicensed facade texture source.
- Live vessel positions are not currently presented as observed AIS data. Shipping corridors remain labeled reference data until an AIS source and redistribution license are selected.
- NOAA water-level observations and tide predictions are limited to supported stations, primarily in the United States. Open-Meteo marine values are modeled guidance and remain labeled separately.

## Generated Content

- Real indoor data is uncommon. Buildings without usable indoor mapping receive a footprint-aware generated interior.
- Generated interiors are traversable and sized from the building footprint, but may be visually sparse when no authoritative indoor geometry exists.
- Procedural vegetation, inferred buildings, and deep-space encounters fill data gaps and should not be interpreted as exact observations.
- Solar-system distances and planetary sizes use documented visual scaling so destinations remain navigable. The experience is educational and exploratory, not an orbital-navigation simulator.

## Backend Features

- Sign-in, multiplayer, cloud saves, social features, moderation, leaderboards, and optional support flows require the production backend.
- Local or forked copies do not receive production credentials or administrative access.

## Product Scope

- World Explorer 3D is not turn-by-turn navigation, a marine chart, an aviation trainer, or survey-grade GIS.
- Ocean and underwater behavior is gameplay-oriented rather than a scientific fluid or bathymetry simulation.

Please report reproducible problems through [GitHub Issues](https://github.com/RRG314/WorldExplorer3D/issues).
