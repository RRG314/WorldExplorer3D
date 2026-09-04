# Known Issues and Limitations

Last reviewed: 2026-09-03 for World Explorer 3D 5.2.0.

## Location and map coverage

- Earth is a location-based experience. Each session loads one bounded selected
  area; player movement does not turn it into a continuously streaming world.
- Roads, buildings, building heights, roofs, entrances, indoor details,
  vegetation and water depend on available mapped data. Coverage and freshness
  vary by location and provider.
- Mapped identities and height metadata are retained when available. Bounded
  visual fallbacks fill missing attributes but are not surveyed measurements or
  claims about an exact real-world structure.
- The same accepted location snapshot is deterministic. A later session can
  differ when an upstream map provider publishes newer data or a primary source
  is temporarily unavailable and the documented fallback is used.
- Major waterfall sites are not yet represented at production quality. A future
  waterfall pass must extend the existing water and terrain authorities with
  reviewed crest geometry, real upper and lower elevations, flow-aligned
  cascades, whitewater and mist, mobile detail levels, and site-specific visual
  validation. Experimental waterfall rendering is not part of the release.

## Roads and structures

- Bridges, ramps, elevated roads, overpasses and tunnels depend on mapped
  structure, layer and connection tags. Incomplete source tagging or provider
  timing can produce a shorter or less detailed structure than the real one.
- Road and structure geometry is intended for exploration gameplay, not
  turn-by-turn navigation, engineering, surveying or safety-critical use.
- Very narrow service roads and unusually complex multi-level junctions can
  leave limited clearance for larger vehicles.
- Airport runways, aprons, terminals, gates, and towers use available map data.
  The shared airport experience fills missing playable details, but its shape
  and scale may differ from the real airport when mapping is incomplete.

## Performance and compatibility

- Dense cities, rapid aerial travel, detailed facades and large structure
  networks can be demanding on browser and GPU memory. World teardown now
  releases location-owned terrain, provider state and scene resources, but
  total browser memory still varies by browser, driver and device.
- Quality settings control rendering cost and effects. They do not rewrite
  mapped building height or replace the selected world with a lower-detail data
  source.
- WebXR, camera-overlay AR, geolocation and some graphics features depend on
  browser support, device hardware and explicit user permission.
- Performance varies by browser, graphics hardware, and device. Final staging
  review covers desktop and a 390×844 mobile layout, but does not guarantee a
  particular battery, thermal, or frame-rate result on every physical phone.

## External services

- Geocoding, map geometry, elevation, imagery, weather and live-context layers
  depend on third-party services. Rate limits, outages and regional coverage can
  delay a layer or activate a labeled fallback.
- Live-context layers distinguish observations, predictions, models and
  reference routes. Generated or modeled content is never presented as a
  confirmed real-world observation.

## Generated content

- Real indoor mapping is uncommon. Eligible buildings without usable indoor
  data receive a footprint-aware generated interior that may be visually sparse.
- Inferred entrances, facade details, vegetation, distant context and
  deep-space encounters fill data gaps and should not be interpreted as exact
  observations.
- Solar-system distance and body-size presentation uses documented visual
  scaling so destinations remain playable; it is not an orbital simulator.

## Interstellar Expeditions Alpha

- Interstellar Expeditions are an optional Alpha inside the main game. The
  connected Solis Reach, voyage, pod, surface-work, return, and cargo paths are
  playable, but room art, crew animation, vehicle presentation, destination
  variety, mission action variety, sound, and mobile performance remain under
  active development.
- Alpha saves are versioned and migrated, but players should still use the
  built-in backup before a long voyage. Ordinary manual and assisted Space
  Flight remains available independently of an Expedition.

## Action and combat

- Ranged equipment has a screen reticle, camera-directed projectiles, visible
  use actions, impact handling, and bounded projectile cleanup. Precision aim,
  sight alignment, recoil, spread, throwing feel, hit feedback, sound, and
  mobile aiming still need further tuning and presentation work.
- Combat is part of the sandbox rather than a competitive shooting simulator.
  Collision and impact results can vary with browser frame timing and complex
  world geometry.

## Field Guide and Journal

- The eleven regional packs are bounded identification and activity slices for
  built-in destinations, not a complete worldwide species catalog. Their field
  leads use broad habitat and seasonal context; they do not report abundance or
  confirm that an organism is present at the selected point.
- Expansion-pack entries currently use reference presentation unless separately
  reviewed media or creature models are available. Missing media does not block
  identification, Journal, life-list, or activity progress.
- The complete Journal, Guide, companion history, and local Backpack history are
  stored in the current browser. Backup and restore are available, but full
  cross-device Journal sync is not yet provided.

## Online features

- Accounts, multiplayer, cloud saves, social features, moderation,
  leaderboards and optional support flows require the production backend.
- Local forks do not receive production credentials or administrative access.

Please report reproducible problems through
[GitHub Issues](https://github.com/RRG314/WorldExplorer3D/issues).
