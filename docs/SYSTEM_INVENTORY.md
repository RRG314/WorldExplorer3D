# World Explorer 3D System Inventory

Last updated: 2026-09-03 for World Explorer 3D 5.2.

This inventory describes the systems present in the current source tree and
their honest product boundaries. See [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md)
for ownership and data flow.

## Product model

World Explorer 3D loads one bounded Earth location at a time. Roads, terrain,
water, buildings, land cover, places, vegetation, traffic, pedestrians, and
player-created content are assembled into that location. Earth is not a
continuously streaming planet.

Version 5.2 retains the established 5.1 terrain, road, bridge, building, and
traversal owners. Property, Expeditions, economy, and interface additions
consume that assembled world instead of publishing a replacement Earth.

Ocean, Moon, Mars, solar-system, and deep-space play are separate environments
with explicit entry and exit lifecycles.

## Player systems

| Area | Current capability | Boundary |
| --- | --- | --- |
| World selection | Interactive globe, search, presets, coordinates, geolocation, favorites, and recent places | Provider and imagery availability vary |
| Earth traversal | Walk, drive, drone, plane, and boat with shared location handoff | One bounded location per session |
| Other environments | Underwater, Moon, Mars, solid and atmospheric planets, featured moons and small bodies, solar-system flight, deep space, three distinct three-step planetary field instrument procedures, and the three-deck Solis Reach Expedition Alpha with live local-space views, objective routing, crew guidance, planet pod journeys, and a manual Earth–Solis Reach Pathfinder shuttle | Distances use explicit game scales; planetary life, NPC, pod, rover, mission, and ship visual detail remains an active quality program rather than worldwide or final asset completeness |
| Mobile play | Analog movement/look controls, mode actions, handedness, sensitivity, camera follow, map, Backpack, and recovery | Physical-device battery and thermal performance still require device testing |
| Browser support | Standards-based WebGL browser runtime verified through current Chromium and Firefox desktop gameplay, with responsive keyboard and touch layouts | Physical-device and assistive-technology coverage remains a release acceptance responsibility; provider features still depend on browser permissions and capabilities |
| Character and equipment | One persistent character profile, attributes, skills, condition, six assignable quick slots, ammunition, field tools, and usable equipment | Complete cross-device character sync is not yet available |
| Vehicles and collisions | Distinct road-vehicle families plus boats, aircraft, rovers, and spacecraft; enter/exit, condition, collision, damage presentation, and recovery. Fixed-wing classes have distinct acceleration, rotation, lift, stall, drag, bank, and turn response; vessels use length- and displacement-aware throttle, drag, rudder, braking, and wave response | Collisions and handling are readable game physics, not an engineering or accident simulator |
| Urban play | Pedestrian behavior, bounded defensive combat, civic response, recoverable world loot, typed mapped-business trade, responder vehicles, and lifecycle cleanup for temporary entities | Stock, price, and services are game rules rather than claims about a mapped business; shared-room combat, trade, loot, and retirement remain restricted where server authority is unavailable |
| Companions | Individual domestic animals, birds, livestock, trust, care, level progression, travel state, and vehicle boarding | Availability follows the game catalog and regional rules, not live occurrence reports |
| Field exploration | Field leads, Journal, Field Guide, typed activities, life lists, specialties, companions, Field Today, Expeditions, and seasonal surveys | Game opportunities do not assert live real-world animal presence |
| Regional ecology | One versioned registry with 11 packs and 180 taxa covers all 15 built-in Earth destinations; packs retain habitat, season, source, license, attribution, sensitive-species, localization, migration, and rollback metadata | The 10 expansion packs still await independent domain review; this is not worldwide completeness |
| Fishing | Shared shore, boat, and underwater records with catch, loss, retry, and recovery | Fish availability depends on the current water and regional data boundary |
| Live GPS | Optional foreground location following, privacy/consent controls, three-stop Expeditions, and shared field activities | No continuous world streaming; background tracking is not part of the product |
| Multiplayer | Bounded public/private rooms, presence, chat, shared Blocks, activities, and persistent room vehicles | Large-room capacity and moderation continue to evolve |
| Product analytics | Firebase Analytics session and bounded gameplay events; cookieless basic measurement when analytics storage is unset or denied; optional stored analytics and signed-in session identity | Exact GPS, room codes, names, messages, artifact text, and other free-form text are excluded; advertising storage and personalization remain denied |
| Quick Build | One in-world panel for persistent local and room Blocks | It does not edit OpenStreetMap or other provider data |
| Accessibility | Keyboard navigation, visible focus, browser zoom, larger text, increased contrast, reduced motion, live status, and coarse-pointer targets | Cross-device assistive-technology review remains ongoing |

## World systems

| System | Primary source area | Responsibility |
| --- | --- | --- |
| Session and boot | `app/js/app-entry.js`, `app/js/session-coordinator.js`, `app/js/runtime/` | Loads services, owns transitions, and tears down superseded work |
| Earth compilation | `app/js/world/`, `app/js/earth-core/`, `app/js/terrain/` | Selects providers and publishes one assembled world |
| Terrain and ground | `app/js/terrain.js`, `app/js/terrain/`, `data/ground-attestations/` | Ground height, land cover, seams, collision, and regional fallbacks |
| Roads and structures | `app/js/world/compiler/`, `app/js/world/transport-structures/` | Roads, bridges, ramps, elevated ways, underpasses, and tunnels |
| Buildings and interiors | `app/js/buildings/`, `app/js/interiors/` | Building form, facades, entrances, generated floors, and mapped indoor detail |
| Water | `app/js/world/water-*`, `app/js/boat-mode/`, `app/js/ocean/`, `app/js/transport/maritime-*` | Surface water, near-shore rendering, channel camera framing, playable vessel fleets, mapped ship identity, underwater play, and fish life |
| Aviation | `app/js/plane-mode.js`, `app/js/plane/`, `app/js/transport/airport-*`, `app/js/transport/aviation-*` | One flight controller and airport layout authority; map-informed major, regional, and local layouts; scale-appropriate playable fleets; class-specific flight response; parked, taxi, and bounded circuit activity; aircraft collision; pilot/passenger travel; airport arrivals; skydiving handoff; presentation; and recovery |
| Maritime transport | `app/js/boat-mode/`, `app/js/transport/maritime-*` | One vessel controller, displacement-aware handling, generated playable port fleets, bounded harbor traffic, mapped vessel identity, presentation, and recovery |
| Living world | `app/js/living-world/`, `app/js/urban-sandbox/` | Pedestrians, traffic, wildlife, vehicles, and civic-response play |
| Field and progression | `app/js/discovery/`, `app/js/player/` | Ecology, activities, Backpack, Journal, progression, and retention programs |
| Character and companions | `app/js/character/`, `app/js/discovery/companions/` | Attributes, skills, equipment integration, individual companions, care, trust, levels, and travel state |
| Economy, resources, and combat | `app/js/urban-sandbox/`, `app/js/resources/`, `app/js/player/`, `app/js/expedition/`, `app/js/runtime/entity-lifecycle-policy.js` | One Explorer Credits record, typed mapped-business exchange, transferable material catalog, exact Backpack-to-ship cargo loading, processed and Analysis-approved sample return through Cargo to eligible Earth sale, weapons, ammunition, defensive NPC behavior, condition, world loot, Backpack delivery, and bounded local cleanup |
| Input and cameras | `app/js/controls/`, `app/js/ui/mobile-controls.js`, `app/js/hud.js`, `app/js/hud/boat-camera.js`, `app/js/walking/` | Keyboard, touch, gamepad, movement, follow cameras, harbor/channel framing, and HUD units |
| Quick Build and Blocks | `app/js/block-builder/`, `app/js/blocks.js`, `app/js/runtime/on-demand-block-builder.js` | In-world placement, removal, persistence, undo, room sharing, collision, and recovery |
| Multiplayer | `app/js/multiplayer/`, `firestore.rules`, `functions/` | Room state, authorization, presence, chat, shared content, and activities |
| Planetary and space | `app/js/planetary/`, `app/js/space/`, `app/js/universe/`, `app/js/expedition/` | Body catalog, physical environments, accepted surfaces, spacecraft state, journeys, Solis Reach rooms and docking, Pathfinder shuttle state, collision, landing, Earth handoff, and return |

## Data and truth boundaries

- OpenStreetMap is used for mapped features and requires ODbL attribution.
- Overture, terrain, weather, satellite, earthquake, aircraft, marine, street
  imagery, and other sources are used only where their terms and coverage allow.
- Observations, forecasts, models, references, and game-generated content are
  labeled as different classes.
- Missing provider data is not invented as surveyed truth.
- Field leads and virtual wildlife are gameplay. They are not reports of a real
  organism at the player’s location.
- Sensitive-species records avoid exposing precise real-world locations.
- Mapped business identity and category do not establish current inventory,
  prices, hours, access, or service availability. Store stock and Credits are
  game systems.

See [DATA_SOURCES.md](../DATA_SOURCES.md) and
[ATTRIBUTION.md](../ATTRIBUTION.md) for source and license details.

## Persistence and backend

The browser keeps device-local preferences and supported offline player data.
Authenticated accounts, room state, server-authorized property and Expedition
actions, moderation, and rewards use Firebase services.

The current Backpack uses schema version 2. Existing schema-version-1 data is
migrated with a local backup and rollback path. Block storage also preserves
supported legacy location records while moving entry into Quick Build.

Server authorization, Firestore rules, and callable Functions remain the trust
boundary. Client visibility is never treated as permission.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html`, `styles/`, `js/` | Public site and shared web modules |
| `app/` | Browser game runtime and game assets |
| `functions/` | Firebase backend functions |
| `firestore.rules`, `firestore.indexes.json` | Direct-client database policy |
| `data/`, `app/data/` | Bundled world and provider-derived source records |
| `config/` | Environment, quality, provider, and release configuration |
| `scripts/`, `tests/` | Development, security, and gameplay checks |
| `assets/landing/` | Public site imagery |
| `github-pages/` | GitHub Pages project overview |

Generated build output and environment files are ignored and must not be
committed.

## Current limits

- Detailed accepted ground is available only for reviewed locations; other
  areas use labeled fallback terrain.
- Building and interior detail depends on mapped metadata and local coverage.
- The ecology registry covers built-in destination regions, not the whole
  world. Locations outside reviewed pack bounds use the global field catalog.
- The 10 expansion packs remain source-reviewed and await independent domain
  review.
- Creature presentation still includes quality tiers and reference fallbacks;
  not every taxon has a promoted animated model.
- Live GPS remains foreground-only and depends on browser permission, signal
  quality, and secure hosting.
- The solar system uses explicit presentation scales so long journeys remain
  playable in a browser; it is not an astronomical visualization at one uniform
  real-world scale.
- Vehicle and character collision responses are designed for readable gameplay,
  not forensic accident reconstruction.
- Broader physical-phone battery, thermal, accessibility, and gameplay coverage
  remains continuing release work.
- Backend-dependent features require the matching authorized environment.
