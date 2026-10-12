# Known Issues and Limitations

Last reviewed: October 12, 2026, for the 5.6 update. These are known product
limits, not a promise that every location or device has been validated.
The [GitHub releases](https://github.com/RRG314/WorldExplorer3D/releases) identify
published versions.

## Visual detail and device support

- Phone performance is still being checked across devices. Browser touch-layout
  checks do not establish battery life, heat or reliable resume behavior on every
  phone. Desktop is recommended for the largest city scenes.
- Licensed ship furnishings replace major placeholders, but galley appliances,
  hydroponics, thermal/life-support equipment, exercise/EVA fittings and parts
  of fabrication still use simpler custom geometry. Art detail is not uniform.
- Distant planets and stellar environments combine available observations with
  procedural reconstruction. Gas giants offer atmospheric flight rather than
  a solid surface to land on. Scientific completeness is not claimed.
- Research currently offers a limited set of measurements and fabrication
  outcomes; broader experiments and expedition consequences remain planned.

- Some full-game performance targets remain unmet, particularly frame pacing
  and travel transitions. Aquarium or museum entry can also pause after loading
  a dense city. Smoothness varies across locations and devices.
- Historic sites and regional vegetation are not uniformly complete. Dedicated
  landmark geometry, mapped footprints and inferred buildings can still overlap or differ from the real location.

## Location and map coverage

- Detailed Earth roads, interiors and activities remain within the selected
  location. Optional regional terrain and mapped buildings follow travel, but
  do not extend those gameplay systems. New scenery depends on map availability;
  a slow connection or fast aircraft can outrun loading. The previous complete
  region remains visible during retries. Polar and projection-edge travel is
  not supported by this regional view.
- Roads, buildings, building heights, roofs, entrances, indoor details,
  vegetation and water depend on available mapped data. Coverage and freshness
  vary by location and provider.
- Mapped identities and height metadata are retained when available. Bounded
  visual fallbacks fill missing attributes but are not surveyed measurements or
  claims about an exact real-world structure.
- The same accepted location snapshot is deterministic. A later session can
  differ when an upstream map provider publishes newer data or a primary source
  is temporarily unavailable and the documented fallback is used.
- Major waterfalls are not yet represented reliably. Detailed cascades,
  whitewater, mist and accurate changes in water level need further work.

## Roads and structures

- Generalized map data can omit road widths and sidewalk boundaries. Those
  dimensions are inferred where missing; curb placement can differ from the
  real street, even when the road and pedestrian surfaces connect correctly.
- Bridges, ramps, elevated roads, overpasses and tunnels depend on mapped
  structure, layer and connection tags. Incomplete source tagging or provider
  timing can produce a shorter or less detailed structure than the real one.
- Road and structure geometry is intended for exploration gameplay, not
  turn-by-turn navigation, engineering, surveying or safety-critical use.
- Some portal-adjacent crossings, retaining walls and complex junctions remain
  visually rough. Passing a drivable route does not establish professional
  visual quality for every bridge and tunnel.
- Very narrow service roads and unusually complex multi-level junctions can
  leave limited clearance for larger vehicles.
- Airport runways, aprons, terminals, gates, and towers use available map data.
  The shared airport experience fills missing playable details, but its shape
  and scale may differ from the real airport when mapping is incomplete.

## Ocean exploration

- Personal geographic voyages load nearby ocean scenery as you travel and
  unload areas left behind. Research studies and shared crew voyages keep their
  own bounded areas. This is not a densely populated simulation of every ocean.
- The research hull, submarine and selected fauna use licensed models. The ship
  interior adapts those assets to gameplay; it is not an exact replica of a real
  vessel. Some furnishings and swimmer animations still need art refinement.
- Marine species use conservative game ranges and depth rules. Coverage is
  limited; whales, deep squid, worldwide ecology and spearfishing are not included.
- Deck jumping has physical takeoff and landing but no dedicated authored jump
  animation. Water support and vessel motion remain gameplay approximations.

## Performance and compatibility

- Dense cities, rapid aerial travel, detailed facades and large structure
  networks can be demanding on browser and graphics memory. Areas left behind
  are unloaded, but total memory use still varies by browser and device.
- Quality settings control rendering cost and effects. They do not rewrite
  mapped building height or replace the selected world with a lower-detail data
  source.
- WebXR, camera-overlay AR, geolocation and some graphics features depend on
  browser support, device hardware and explicit user permission.
- Performance varies by browser, graphics hardware, and device. Browser
  review includes desktop and mobile layouts, but does not establish a
  particular battery, thermal, or frame-rate result on every physical phone.

## External services

- Geocoding, map geometry, elevation, imagery, weather and live-context layers
  depend on third-party services. Rate limits, outages and regional coverage can
  delay a layer or activate a labeled fallback.
- Weather, waves, currents and water temperature refresh independently. A
  current or temperature feed may be unavailable while waves still appear;
  missing measurements are not invented.
- Live-context layers distinguish observations, predictions, models and
  reference routes. Generated or modeled content is never presented as a
  confirmed real-world observation.

## Museums, aquariums and other interiors

- The National Aquarium visit covers a limited Pavilion and Blacktip Reef route,
  with upper and lower viewing areas. Other exhibitions and upper programmes
  are not included. Layout details without published dimensions are estimated;
  the exterior is still a mapped building rather than a custom architectural
  replica. Habitat density and surrounding views need further art refinement.

- The first museum gallery interprets The Peale's front ground floor using its
  public room guide. Dimensions and finishes are estimated; rear and upper
  rooms are not included. Smithsonian and Met reproductions are not The Peale's
  collection. Other mapped museums do not yet have these curated interiors.
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

- Accounts, multiplayer, cloud features, leaderboards and optional support
  flows need an internet connection and available online services.

Please report reproducible problems through
[GitHub Issues](https://github.com/RRG314/WorldExplorer3D/issues).
