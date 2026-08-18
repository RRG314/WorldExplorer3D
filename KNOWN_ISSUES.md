# Known Issues and Limitations

Last reviewed: 2026-08-18 for the local 4.3.0 urban-sandbox foundation branch. Production remains intentionally rolled back to the verified 4.2.1 artifact.

## Current Release Status

Production is serving the verified 4.2.1 rollback artifact. The 4.3.0 source has a local memory repair and an expanded urban-sandbox development line on `steven/urban-sandbox-foundation`; it is not deployed and still requires user/device acceptance before any new release decision.

The GTA-like urban sandbox is a phased product direction, not a completed claim.
The parked-car possession loop and all nine ambient traffic-family promotions
work locally. Ten pedestrian roles, contextual talk/take/inspect actions,
semantic street furniture, a five-slot session equipment inventory, held-item
visuals and condition impacts against people, vehicles and props also work
locally. Off-camera vehicle demotion, driver/passenger states, active traffic
signal simulation, responder exit/contact animation, missions and garage/economy
persistence remain open in `docs/URBAN_SANDBOX_PLAN.md`. Local witnessed events
now dispatch a bounded location-aware responder vehicle with search/pursuit and
warning/citation/recovery outcomes; joined rooms use one server-owned civic
event/timeline/outcome that normal clients cannot forge. The duplicate legacy
Police Chase menu and float toggle are retired. Transaction-owned room
vehicle leases and room condition impacts are implemented locally but their new
Cloud Functions have not been deployed.

The current equipment loadout is a local sandbox baseline, not trusted account
inventory. Room condition changes now synchronize through server-owned entity
documents, but equipment ownership, ammunition, rewards and room movement input
are not trusted account state. Presence/pose is still client-authored under the
existing bounded room rules, so this milestone is not a complete anti-cheat
claim. It is not eligible for production until age/tone, moderation,
authenticated progression, deployed-preview verification, audio/accessibility
and user/device acceptance are completed. The fictional pulse sidearm and
concussion charge are game-only mechanics; the app contains no real-world
weapon construction guidance.

The earlier 2.02 GB editable-world high-water path is resolved locally: building suppression and restoration no longer rebuild the full terrain/provider world. This does not certify every device. Chrome process RSS can remain above live JavaScript heap because V8 and the GPU process reserve memory, so target mobile and integrated-GPU checks remain required.

The 2026-08-18 full release matrix is currently red even though the focused
facade, runtime, multiplayer, account, movement, transport and lifecycle checks
pass. Current blockers are:

- Baltimore and New York did not meet mapped-building metadata enrichment and
  visible fallback coverage requirements; the sampled fallback buildings were
  uniformly 7–15 m and reported zero metadata matches.
- Miami and Tokyo produced excessive grass from the dense-city landcover
  fallback during the provider-outage scenario.
- Everglades finalized the fixed location without far-horizon terrain when both
  elevation and parent fallback were unavailable.
- Lake Tahoe and Panama Canal water starts selected walking rather than their
  expected boat start.

These are worldwide fallback/readiness failures, not facade-test failures. They
must be fixed at their shared data and world-start owners and the full matrix
must pass before 4.3.0 can be deployed. Do not add location-specific visual
patches or weaken the matrix.

## Map Coverage

- Building footprints, heights, roof shapes, indoor details, roads, vegetation, and water depend on available source data. Coverage varies globally.
- Missing building heights, materials, facade details, and roof equipment use bounded visual fallbacks; those fallbacks are not claims about the real structure.
- The local candidate adds bounded entrance detail to published building
  identities. Generic windows remain owned by the facade atlas; close-range
  doors, frames, handles, lights, thresholds, canopies and storefront side panes
  are deterministic visual inference, not claims about an exact real doorway.
- New OpenStreetMap edits appear only after upstream services and local caches refresh.

## Loading and Performance

- Dense cities, rapid plane travel, detailed facades, and large structure networks can be demanding on GPU memory and network bandwidth.
- The initial world load intentionally waits for core roads and buildings so play does not begin in an empty scene. Additional distant detail may continue to refine afterward.
- Browser GPU support and memory limits differ significantly, especially on older phones and integrated graphics.
- The repaired installed-Chrome dense New York journey uses 533.7 MB post-GC, releases to 153.8 MB, and reloads at 568.3 MB. Terrain children, far-field state, accepted-ground data, the 16 MiB water mask, provider staging, and all 49 elevation tiles reach zero at title release. The earlier comparable dense run used 644.6 MB, while the original diagnosis reproduced 715–730 MB.
- A Baltimore building suppression stays in the same world-load sequence and moved from 729.0 MB to 728.2 MB post-GC; restore is also targeted and persistence survives reload. The former 2.02 GB edit/reload path is no longer exercised.
- Rapid Baltimore-to-Monaco replacement passes in installed Chrome: the superseded provider work aborts, the replacement becomes the sole published world, all provider ledgers finish with zero in-flight work, and terrain fetch concurrency remains bounded at 12 without duplicate URLs.
- Returning to the title after loading Earth still retains the already-booted global runtime and shared actor/renderer assets (153.8 MB, 202 geometries, and 31 textures versus an 11.7 MB cold title). Terrain/world ownership is zero, but reducing that post-boot shared baseline remains an optimization target rather than a closed claim.
- Manual acceptance on intended phones and integrated-GPU systems is still open. `performance.memory` measures live JavaScript heap, not total Chrome/V8/GPU process RSS.
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
- Eligible mapped/generated interiors now publish stable multi-floor IDs,
  physically walkable stairs, an accessible proximity elevator, active/adjacent
  floor streaming and multiplayer floor presence. Floor-specific mission and
  discovery anchors, richer authored rooms, two-client same-building visual
  acceptance and target-device memory acceptance remain open.
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
