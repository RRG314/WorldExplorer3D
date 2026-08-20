# Known Issues and Limitations

Last reviewed: 2026-08-19 for the local 4.3.0 urban-sandbox foundation branch. Production remains intentionally rolled back to the verified 4.2.1 artifact.

## Current Release Status

Production is serving the verified 4.2.1 rollback artifact. The 4.3.0 source has a local memory repair and an expanded urban-sandbox development line on `steven/urban-sandbox-foundation`; it is not deployed and still requires user/device acceptance before any new release decision.

The urban sandbox is a phased product direction, not a completed claim.
The parked-car possession loop and all nine ambient traffic-family promotions
work locally. Ten pedestrian roles, contextual talk/take/inspect actions,
semantic street furniture, a six-slot session equipment inventory, held-item
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

The latest local coherence slice expands that inventory to six slots and adds a
player-triggered parachute with measured fall/clearance rules and a rendered
pack, canopy, harness and lines. Nearby pedestrians are promoted before they can
appear as interaction placeholders. Stopped civic responder cars can be taken as
the exact vehicle and a witnessed theft enters the same dispatch/search/pursuit
lifecycle. Published wildlife now owns the shared world Action prompt for
observation or a visible meet/care/adopt sequence; the Field Journal can locate
eligible encounters but no longer awards companions by menu clicking. These
features pass their focused installed-Chrome desktop and 390×844 touch journeys,
but have not received user/device acceptance.

Discovery detectors and excavation tools still belong to the Field Journal's
activity owner rather than the character Backpack equipment inventory, and
digging does not yet deform the rendered/collision terrain. The correct follow-up
is one save-compatible authoritative item/equipment domain with Journal adapters;
adding a duplicate inventory or doing an unverified account migration is not
part of this release candidate. Personal home ownership is likewise not yet
implemented and must use stable building/entrance/floor identity plus server
ownership rather than a local-only interior.

The current six-slot equipment loadout is a local sandbox baseline, not trusted account
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

The 2026-08-18 local blocker-repair pass closed the seven runtime defects found
by the worldwide matrix: curated metadata identity, mapped skyline height,
dense-city outage ownership, degraded far-horizon publication, water/land
arrival selection, post-publication vegetation mutation and exterior
third-person camera collision. The fixes live at shared owners; no city-name
rendering exception or weakened threshold was added.

The single 40-location installed-Chrome run produced all 40 screenshots and
exposed three final edge cases. Monaco's mapped-density fallback, polar HUD
distance matching and explicit Holland Tunnel land arrival were corrected and
then passed focused rendered reruns. The 40 screenshots have an approved,
hash-bound visual manifest. Runtime invariants are also green with all 37 checks
true and a stable 411-feature/two-mesh vegetation publication.

This does not approve 4.3.0 for deployment. Production remains on 4.2.1, the
production gate intentionally rejects the dirty/uncommitted evidence identity,
the required ten-minute real-input drive has not been recorded for the final
commit, and hands-on phone/tablet/integrated-GPU acceptance remains open. A clean
candidate must regenerate commit-bound evidence before any preview or release.

## Map Coverage

- Building footprints, heights, roof shapes, indoor details, roads, vegetation, and water depend on available source data. Coverage varies globally.
- Missing building heights, materials, facade details, and roof equipment use bounded visual fallbacks; those fallbacks are not claims about the real structure.
- The local candidate adds bounded entrances directly to the owning building
  facade. Generic windows remain owned by the existing facade material, while
  one shared generated entrance atlas supplies residential, storefront, office,
  civic and service variants through wall attributes and the same facade shader.
  These inferred entrances are not claims about the exact real doorway.
- Entrances do not create individual door meshes or a parallel facade renderer.
  The current Baltimore sample publishes 59 wall-bound entrances with zero
  additional draw calls and about 246 KiB of merged vertex attributes.
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
- The current headless mobile-controls rerun completed iPhone title and Android
  portrait play, then saturated SwiftShader during the landscape world load and
  was stopped rather than allowed to monopolize the machine. The focused 390x844
  touch doorway journey passes, but this does not replace a real-device pass.
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

- All pre-2026-08-19 tests and their screenshots are quarantined outside the
  repository and are not release evidence. Current checks are requirement-led:
  source/entry-graph health, full assembled gameplay at six representative
  locations, JFX final-player surface ordering, four destination environments,
  Live GPS camera/mode behavior, Firestore authorization and two-client
  multiplayer convergence. Release captures use the same assembled entry point
  and are written only when explicitly requested.
- The representative matrix intentionally fails if either an exact mapped
  structure join exceeds 0.25 m or a product-owned engineered profile exceeds
  its compiled design envelope. It does not pretend a universal road slope is
  source data for ordinary terrain-fitted streets.

## Product Scope

- World Explorer 3D is not turn-by-turn navigation, a marine chart, an aviation trainer, or survey-grade GIS.
- Ocean and underwater behavior is gameplay-oriented rather than a scientific fluid or bathymetry simulation.
- Tunnels, bridges, ramps, and stacked roads depend on mapped structure and layer tags. Incomplete source tagging can reduce geometric detail or cause the safer fallback profile to be used.

Please report reproducible problems through [GitHub Issues](https://github.com/RRG314/WorldExplorer3D/issues).

## Current local review candidate (2026-08-20)

- The current staging-shaped artifact is built from a dirty working tree and is
  for local review only. It has not been pushed or deployed.
- The original aerial Baltimore harbor/skyline hero is restored byte-for-byte.
  Marketing media is not accepted as gameplay evidence.
- The transport audit now runs Baltimore/JFX, Golden Gate, London, Monaco,
  Manhattan and rural Iowa through the normal assembled game. The former tunnel
  profile mutation—which rewrote an already-compiled road back to raw terrain—
  is removed, and tunnel shell publication no longer competes with the roadway
  profile authority.
- Monaco exact graph joins are closed in the best local run, but short
  structure-connected approach profiles still fail the engineered-grade gate.
  This is a production blocker, not an accepted limitation.
- The current immutable review artifact
  `4.3.0+96bc2c7c8888.7405ae87d4436a98.staging` was exercised through the normal
  assembled entry flow at Baltimore/JFX, Golden Gate, London, Monaco,
  Manhattan and rural Iowa. Rural Iowa passes. The other five locations fail
  the engineered-profile gate; Manhattan also has three exact elevated joins
  above the 0.25 m continuity limit. London visibly retains broken road/terrain
  composition and Manhattan visibly buries lower building floors. These visual
  failures remain release blockers even where the exact-join metric passes.
- Transport compilation now reads one accepted base-DEM authority instead of
  feeding the derived rendered terrain back into the road solver. This closed
  the sampled exact joins in Baltimore, Golden Gate, London and Monaco and cut
  Baltimore grade failures from twelve to one. Exact graph samples also replace
  nearby synthetic samples, removing the former Golden Gate 535x one-sample
  tunnel spike. The remaining short-profile constraints require a graph-level
  feasibility repair; they are not waived or hidden by a looser threshold.
- Firestore rules pass 79/79 current authorization and legacy-account cases;
  root and Functions dependency audits report zero known vulnerabilities.
  Firebase App Check, an enforced production CSP, deployed privileged-endpoint
  checks, real-device/integrated-GPU acceptance, the real-input drive, final
  clean commit-bound artifact identity and user acceptance remain open.
