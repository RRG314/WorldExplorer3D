# Known Issues and Limitations

Last reviewed: 2026-07-25 during the 4.1 recovery audit.

The production-quality work required to resolve the architectural limitations
below is tracked in [ROADMAP.md](ROADMAP.md). A listed limitation is not an
approval to ignore a reproducible defect.

## 4.1 Release Blockers

- The verified 4.0.0 Baltimore production journey can render a large building
  mass across or immediately over the street corridor. This is a systemic
  surface/occupancy failure, not an approved data variation. Release 4.1
  remains blocked until all location loads use the same canonical
  surface and occupancy contracts and the global fixtures pass visual review.
- Passing source counts, runtime counters, or unit tests do not clear a world
  frame with missing roads, road/building overlap, invalid grade separation,
  or similarly broken composition.
- The fixed Apple Metal structure/mountain subset is mechanically green but
  not fully approved. The roadless Swiss Alps fixture now starts on its mapped
  OSM footway at an 11.9-degree slope, and the unsupported steep land-cover
  slabs are removed. Snow presentation remains plain and thin distant terrain
  edges can still be visible, but these are tracked fidelity limitations
  rather than the original broken geometry. Holland Tunnel traversal has a
  coherent interior, but its initial portal/urban composition contains
  overlapping and clipped structure geometry. Golden Gate Bridge is coherent
  but took 28.8 seconds to load in the focused run, above the 20-second release
  budget.

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
  texel-stabilized soft-shadow policy. Wider daylight/dusk and geography
  certification remains open; a failed hardware frame remains release-blocking.
- Mountain sidewalks and paths can intersect or be partially covered by steep terrain because corridors and terrain do not yet share one composited surface owner.
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
