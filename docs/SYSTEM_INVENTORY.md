# World Explorer 3D System Inventory

Last updated: 2026-08-26 for the approved 5.0 release.

This inventory describes the systems present in the current source tree and
their honest product boundaries. See [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md)
for ownership and data flow.

## Product model

World Explorer 3D loads one bounded Earth location at a time. Roads, terrain,
water, buildings, land cover, places, vegetation, traffic, pedestrians, and
player-created content are assembled into that location. Earth is not a
continuously streaming planet.

Ocean, Moon, Mars, solar-system, and deep-space play are separate environments
with explicit entry and exit lifecycles.

## Player systems

| Area | Current capability | Boundary |
| --- | --- | --- |
| World selection | Interactive globe, search, presets, coordinates, geolocation, favorites, and recent places | Provider and imagery availability vary |
| Earth traversal | Walk, drive, drone, plane, and boat with shared location handoff | One bounded location per session |
| Other environments | Underwater, Moon, Mars, solar system, and deep space | Environment detail is intentionally different from Earth |
| Mobile play | Analog movement/look controls, mode actions, handedness, sensitivity, camera follow, map, Backpack, and recovery | Physical-device battery and thermal performance still require device testing |
| Field exploration | Field leads, Journal, Field Guide, typed activities, life lists, specialties, companions, Field Today, Expeditions, and seasonal surveys | Game opportunities do not assert live real-world animal presence |
| Regional ecology | Versioned Baltimore pack with 60 taxa, habitat and season fields, source and license metadata, sensitive-species handling, and localization seeds | Worldwide expansion and independent scientific review remain future work |
| Fishing | Shared shore, boat, and underwater records with catch, loss, retry, and recovery | Fish availability depends on the current water and regional data boundary |
| Live GPS | Optional foreground location following, privacy/consent controls, three-stop Expeditions, and shared field activities | No continuous world streaming; background tracking is not part of the product |
| Multiplayer | Bounded public/private rooms, presence, chat, shared Blocks, activities, published overlays, and persistent room vehicles | Large-room capacity and moderation continue to evolve |
| World Editor | One editor for reviewed overlays and persistent local/room Blocks | It does not edit OpenStreetMap or other provider data |
| Accessibility | Keyboard navigation, visible focus, browser zoom, larger text, increased contrast, reduced motion, live status, and coarse-pointer targets | Cross-device assistive-technology review remains ongoing |

## World systems

| System | Primary source area | Responsibility |
| --- | --- | --- |
| Session and boot | `app/js/app-entry.js`, `app/js/session-coordinator.js`, `app/js/runtime/` | Loads services, owns transitions, and tears down superseded work |
| Earth compilation | `app/js/world/`, `app/js/earth-core/`, `app/js/terrain/` | Selects providers and publishes one assembled world |
| Terrain and ground | `app/js/terrain.js`, `app/js/terrain/`, `data/ground-attestations/` | Ground height, land cover, seams, collision, and regional fallbacks |
| Roads and structures | `app/js/world/compiler/`, `app/js/world/transport-structures/` | Roads, bridges, ramps, elevated ways, underpasses, and tunnels |
| Buildings and interiors | `app/js/buildings/`, `app/js/interiors/` | Building form, facades, entrances, generated floors, and mapped indoor detail |
| Water | `app/js/world/water-*`, `app/js/boat-mode/`, `app/js/ocean/` | Surface water, shore transfer, boats, underwater play, and fish life |
| Living world | `app/js/living-world/`, `app/js/urban-sandbox/` | Pedestrians, traffic, wildlife, vehicles, and civic-response play |
| Field and progression | `app/js/discovery/`, `app/js/player/` | Ecology, activities, Backpack, Journal, progression, and retention programs |
| Input and cameras | `app/js/controls/`, `app/js/ui/mobile-controls.js`, `app/js/hud.js`, `app/js/walking/` | Keyboard, touch, gamepad, movement, follow cameras, and HUD units |
| Editor and Blocks | `app/js/editor/`, `app/js/block-builder/`, `app/js/blocks.js` | Integrated editing, persistence, undo, sharing, moderation, and rollback |
| Multiplayer | `app/js/multiplayer/`, `firestore.rules`, `functions/` | Room state, authorization, presence, chat, shared content, and activities |

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

See [DATA_SOURCES.md](../DATA_SOURCES.md) and
[ATTRIBUTION.md](../ATTRIBUTION.md) for source and license details.

## Persistence and backend

The browser keeps device-local preferences and supported offline player data.
Authenticated accounts, room state, published overlays, moderation, and
server-authorized rewards use Firebase services.

The 5.0 Backpack uses schema version 2. Existing schema-version-1 data is
migrated with a local backup and rollback path. Block storage also preserves
supported legacy location records while moving entry into the integrated World
Editor.

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
- The Baltimore ecology pack is a regional slice, not worldwide completeness.
- Creature presentation still includes quality tiers and reference fallbacks;
  not every taxon has a promoted animated model.
- Live GPS remains foreground-only and depends on browser permission, signal
  quality, and secure hosting.
- Broader physical-phone battery, thermal, accessibility, and gameplay coverage
  remains continuing release work.
- Backend-dependent features require the matching authorized environment.
