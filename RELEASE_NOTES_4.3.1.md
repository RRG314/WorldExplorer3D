# World Explorer 3D 4.3.1

World Explorer 3D 4.3.1 is the corrected Explorer and Urban Sandbox release. It
supersedes 4.3.0 without rewriting its published tag and brings the release
record back in line with the production source.

## Explorer and urban experience

- Discover contextual wildlife, geology, natural-history specimens and detector
  finds while exploring real-world locations.
- Use field tools, review observations in the Field Journal and Field Guide,
  maintain a Collection and advance Explorer specialties and regional progress.
- Choose grounded or airborne companions and use capability-aware AR through
  WebXR, camera overlay or interactive 3D fallback according to the device.
- Interact with richer pedestrian roles, vehicle families, street furniture,
  wildlife and bounded civic-response scenarios through one contextual action
  system and a six-slot equipment loadout.
- Enter eligible buildings through deterministic street-oriented doors and
  storefronts that belong to the existing facade renderer. Generated interiors
  can include stable floors, walkable stairs and a proximity elevator.

## Geospatial world

- Mapped building height and identity now survive footprint selection,
  deduplication, batching and every near/far LOD. Quality settings do not rewrite
  authoritative skyline height or replace distant mapped detail.
- At-grade roads, solid junction footprints, final terrain, building clearance
  and vehicle wheel contact share the same published surface authority.
- Bridge, ramp, overpass, elevated-road and tunnel endpoints are resolved inside
  the shared transport compiler. The release does not add city-specific
  structure renderers or claim measurements that are not present in source data.
- Earth remains a bounded, deterministic selected-location experience. Player,
  vehicle and camera movement does not create a continuously streaming world.
- Water, wake, sky and bathymetry presentation is richer while observations,
  models, mapped features and visual fallbacks remain explicitly distinct.

## Reliability, memory and security

- Returning to the title releases location-owned terrain, provider staging,
  accepted-ground state and scene resources instead of rebuilding or retaining a
  second world.
- Production packaging preserves one root Firebase/module instance across the
  application shell, account, multiplayer and shared-edit entry points.
- Firestore authorization covers current account, room, discovery, trade,
  shared-edit, condition-impact and deletion paths.
- Strict hosted-source reachability and asset ownership reject orphaned runtime
  modules and undeclared release media.

## Verification

- Root and Cloud Functions dependency audits report zero known vulnerabilities.
- Firestore emulator security suite: 79/79 assertions.
- Two authenticated multiplayer browsers completed private-room presence and
  shared-artifact synchronization.
- Packaged Earth, Moon, Mars, Space, Ocean and Live GPS journeys completed with
  one renderer and no application or browser errors.
- Complete assembled-world checks cover Baltimore/JFX, Golden Gate, London,
  Monaco, Manhattan, rural Iowa and Tokyo with terrain, water, buildings,
  transport, population, atmosphere, HUD, collision and player control active
  together.
- The hosted artifact contains 563 reachable modules with zero orphans, 95
  declared hosted assets and 27 owned dynamic PBR assets.

## Compatibility and limitations

Map and structure detail still depends on mapped source coverage and provider
availability. Incomplete layer or connection tags can make a bridge, ramp,
overpass or tunnel shorter or less detailed than its real counterpart. Dense
urban scenes can remain demanding on lower-memory devices. These are disclosed
limitations, not permission to lower mapped building height or silently remove
distant world detail. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md),
[DATA_SOURCES.md](DATA_SOURCES.md) and [ATTRIBUTION.md](ATTRIBUTION.md).

## Rollback

Rollback target: immutable production build
`4.2.1+74f1a47d4370.be7d9ff364590461.production` at commit
`74f1a47d437027bae5d7bd5745e35d1db0bbfe3e`. Promote its retained artifact;
do not rebuild historical source as 4.3.1.
