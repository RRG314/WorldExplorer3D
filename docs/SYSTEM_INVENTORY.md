# World Explorer 3D System Inventory

Last updated: 2026-09-06 for World Explorer 3D 5.2.

POI integration note (2026-09-06): one publication lifecycle now owns normalized
identity, six-family semantics, safe building tenancy, published-door association,
bounded activation, and exterior fallback. Commerce consumes that lifecycle
instead of maintaining a duplicate mapped-category authority. One connected
Explorer Wallet and compensated service settlement are implemented. The full
six-family browser acceptance gate remains in progress. See
[FUNCTIONAL_POI_SYSTEM.md](../FUNCTIONAL_POI_SYSTEM.md).

Maryland parcel note (2026-09-06): the existing Real Estate authority now adds
lazy statewide parcel context in Maryland. It uses the same property registry,
transactions, Explorer Wallet, building/interior routes, and Quick Build system;
there is no second economy or general-purpose GIS warehouse. See
[MARYLAND_PARCEL_PROPERTY_SYSTEM.md](MARYLAND_PARCEL_PROPERTY_SYSTEM.md).

Streetscape note (2026-09-06): the rejected offset-ribbon sidewalk presentation
has been removed from runtime. Existing mapped footways, pedestrian navigation,
compiled roads, and terrain remain. A replacement must solve coherent block
edges and junction joins before release. See
[STREETSCAPE_SYSTEM.md](../STREETSCAPE_SYSTEM.md).

Community Reality Capture note (2026-09-06): a local, not-yet-provisioned V1
adds guided photo contribution for stable mapped-building exteriors and one
permitted interior room. It preserves mapped identity and gameplay collision,
requires processing and moderator approval before presentation, and keeps every
new interior private until its owner separately changes a reusable private-space
policy. See [COMMUNITY_REALITY_CAPTURE_V1.md](../COMMUNITY_REALITY_CAPTURE_V1.md).

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
| Other environments | Underwater, Moon, Mars, solid and atmospheric planets, featured moons and small bodies, solar-system flight, deep space, three distinct three-step planetary field instrument procedures, and the three-deck Solis Reach Expedition Alpha with live local-space views, objective routing, crew guidance, planet pod journeys, a manual Earth–Solis Reach Pathfinder shuttle, and one persistent mid-voyage pirate boarding interception | Distances use explicit game scales; planetary life, NPC, pod, rover, mission, and ship visual detail remains an active quality program rather than worldwide or final asset completeness. Boarding consequences use ship, crew, resource, and failure authority rather than an unsupported interior FPS layer. |
| Mobile play | Analog movement/look controls, mode actions, handedness, sensitivity, camera follow, map, Backpack, and recovery | Physical-device battery and thermal performance still require device testing |
| Browser support | Standards-based WebGL browser runtime verified through current Chromium and Firefox desktop gameplay, with responsive keyboard and touch layouts | Physical-device and assistive-technology coverage remains a release acceptance responsibility; provider features still depend on browser permissions and capabilities |
| Character and equipment | One persistent character profile, attributes, skills, explorer health, six assignable quick slots, ammunition, field tools, and consumable food, water, first aid, and medicine | Complete cross-device character sync is not yet available |
| Vehicles and collisions | Distinct road-vehicle families plus boats, aircraft, rovers, and spacecraft; enter/exit, condition, collision, damage presentation, recovery, ramp/support-loss airborne motion, Earth gravity, and landing impact. The permanent BMW and personal plane remain full-condition, always-drivable exploration options. Fixed-wing classes have distinct acceleration, rotation, lift, stall, drag, bank, and turn response; vessels use length- and displacement-aware throttle, drag, rudder, braking, and wave response | Collisions and handling are readable game physics, not an engineering or accident simulator |
| Urban play | Pedestrian behavior, predictive bounded defensive combat, civic response, recoverable world loot, typed mapped-business trade, compensated service settlement, sequential mechanic upgrades with observable handling effects, responder vehicles, and lifecycle cleanup for temporary entities | Stock, price, and services are game rules rather than claims about a mapped business; shared-room combat, trade, loot, and retirement remain restricted where server authority is unavailable |
| Companions | Individual domestic animals, birds, livestock, trust, care, level progression, travel state, and vehicle boarding | Availability follows the game catalog and regional rules, not live occurrence reports |
| Field exploration | Field leads, Journal, Field Guide, typed activities, life lists, specialties, companions, Field Today, Expeditions, and seasonal surveys | Game opportunities do not assert live real-world animal presence |
| Regional ecology | One versioned registry with 11 packs and 180 taxa covers all 15 built-in Earth destinations; packs retain habitat, season, source, license, attribution, sensitive-species, localization, migration, and rollback metadata | The 10 expansion packs still await independent domain review; this is not worldwide completeness |
| Fishing | Shared shore, boat, and underwater records with catch, loss, retry, and recovery | Fish availability depends on the current water and regional data boundary |
| Live GPS | Optional foreground location following, privacy/consent controls, three-stop Expeditions, and shared field activities | No continuous world streaming; background tracking is not part of the product |
| Multiplayer | Bounded public/private rooms, presence, chat, shared Blocks, activities, and persistent room vehicles | Large-room capacity and moderation continue to evolve |
| Product analytics | Firebase Analytics session and bounded gameplay events; cookieless basic measurement when analytics storage is unset or denied; optional stored analytics and signed-in session identity | Exact GPS, room codes, names, messages, artifact text, and other free-form text are excluded; advertising storage and personalization remain denied |
| Quick Build | One in-world panel for persistent local and room Blocks | It does not edit OpenStreetMap or other provider data |
| Real Estate and Maryland parcels | Existing building-backed ownership worldwide; official parcel-backed land/building grouping in all 23 Maryland counties and Baltimore City; vacant mapped land, public parcel context, and on-demand boundary display | Parcel data loads only from the official statewide service when Real Estate is opened in Maryland. World Explorer ownership/value is virtual, owner data is not loaded, and boundaries are not legal surveys. |
| Accessibility | Keyboard navigation, visible focus, browser zoom, text through 200%, notice duration, reticle size, increased contrast, reduced motion/flashes, persistent action detail, polite live status, and coarse-pointer targets | Cross-device assistive-technology review remains ongoing |

## World systems

| System | Primary source area | Responsibility |
| --- | --- | --- |
| Session and boot | `app/js/app-entry.js`, `app/js/session-coordinator.js`, `app/js/runtime/` | Loads services, owns transitions, and tears down superseded work |
| Earth compilation | `app/js/world/`, `app/js/earth-core/`, `app/js/terrain/` | Selects providers and publishes one assembled world |
| Terrain and ground | `app/js/terrain.js`, `app/js/terrain/`, `data/ground-attestations/` | Ground height, land cover, seams, collision, and regional fallbacks |
| Roads and structures | `app/js/world/compiler/`, `app/js/world/transport-structures/` | Roads, bridges, ramps, elevated ways, underpasses, and tunnels |
| Buildings and interiors | `app/js/buildings/`, `app/js/interiors/`, `app/js/reality-capture/` | Building form, facades, entrances, generated floors, mapped indoor detail, and approved community presentation overlays that retain canonical collision/navigation and fail back to the procedural world |
| Water | `app/js/world/water-*`, `app/js/boat-mode/`, `app/js/ocean/`, `app/js/transport/maritime-*` | Surface water, near-shore rendering, channel camera framing, playable vessel fleets, mapped ship identity, underwater play, and fish life |
| Aviation | `app/js/plane-mode.js`, `app/js/plane/`, `app/js/transport/airport-*`, `app/js/transport/aviation-*` | One flight controller and airport layout authority; map-informed major, regional, and local layouts; scale-appropriate playable fleets; class-specific flight response; parked, taxi, and bounded circuit activity; aircraft collision; pilot/passenger travel; airport arrivals; skydiving handoff; presentation; and recovery |
| Maritime transport | `app/js/boat-mode/`, `app/js/transport/maritime-*` | One vessel controller, displacement-aware handling, generated playable port fleets, bounded harbor traffic, mapped vessel identity, presentation, and recovery |
| Living world | `app/js/living-world/`, `app/js/urban-sandbox/`, `app/js/interaction/world-click-router.js` | Tier-bounded activity-aware pedestrians and traffic, time-band demand, lane following and queues, mapped/inferred stop and signal control, smooth connector traversal, semantic world clicking, wildlife, vehicles, and civic-response play. Optional aggregate live-flow input is provider-neutral and currently unconnected; simulated actors are never claimed as real people or vehicles. |
| Field and progression | `app/js/discovery/`, `app/js/player/` | Ecology, activities, Backpack, Journal, progression, and retention programs |
| Character and companions | `app/js/character/`, `app/js/discovery/companions/` | Attributes, skills, equipment integration, individual companions, care, trust, levels, and travel state |
| Economy, resources, and combat | `app/js/urban-sandbox/`, `app/js/economy/`, `app/js/resources/`, `app/js/player/`, `app/js/expedition/`, `app/js/runtime/entity-lifecycle-policy.js` | One Explorer Credits record, idempotent commerce receipts, effect settlement or compensation, typed mapped-business exchange, signed-in health and owned-vehicle upgrade persistence, transferable material catalog, exact Backpack-to-ship cargo loading, processed and Analysis-approved sample return through Cargo to eligible Earth sale, weapons, ammunition, defensive NPC behavior, condition, world loot, Backpack delivery, and bounded local cleanup |
| Functional mapped POIs | `app/js/poi/`, `app/js/world/load-runtime-session.js`, `app/js/building-entry.js` | One normalized lifecycle for stable POI identity, family/capabilities, building tenancy, published entrances, representative interior archetype, bounded activation, and truthful exterior fallback |
| Input, onboarding, notices, and cameras | `app/js/controls/`, `app/js/tutorial/`, `app/js/interaction/`, `app/js/ui/accessibility.js`, `app/js/ui/mobile-controls.js`, `app/js/hud.js`, `app/js/hud/boat-camera.js`, `app/js/walking/` | Saved action bindings, three-step optional onboarding, proximity/familiarity prompt policy, accessibility preferences, touch, gamepad, movement, follow cameras, harbor/channel framing, and HUD units |
| Quick Build and Blocks | `app/js/block-builder/`, `app/js/blocks.js`, `app/js/runtime/on-demand-block-builder.js` | In-world placement, removal, persistence, undo, room sharing, collision, and recovery |
| Real Estate and parcel context | `app/js/real-estate/`, `app/js/game/property-ui.js`, `app/js/gis/maryland-parcel-*`, `js/property-api.js`, `functions/property-authority.js` | One property identity/transaction authority; Maryland parcel normalization, building association, vacant land, game valuation, boundary inspection, privacy filtering, and parcel-aware build permission |
| Multiplayer | `app/js/multiplayer/`, `firestore.rules`, `functions/` | Room state, authorization, presence, chat, shared content, and activities |
| Community Reality Capture | `app/js/reality-capture/`, `js/community-reality-capture-api.js`, `functions/community-reality-capture.js`, `functions/reality-capture-authority.js`, `scripts/reality-capture/` | Guided local capture drafts, normalized quarantine uploads, reconstruction-worker contract, moderation, approved building presentation, and reusable private-space access modes. Runtime publication fails closed unless staging and publication are both explicitly provisioned; production Storage/App Check and real reconstruction proofs remain gated. |
| Planetary and space | `app/js/planetary/`, `app/js/space/`, `app/js/universe/`, `app/js/expedition/` | Body catalog, physical environments, accepted surfaces, spacecraft state, journeys, Solis Reach rooms and docking, Pathfinder shuttle state, collision, landing, Earth handoff, return, and the one-time Expedition hostile-interception authority with manual defense, boarding pressure, damage, persistence, and course recovery |

## Data and truth boundaries

- OpenStreetMap is used for mapped features and requires ODbL attribution.
- Overture, terrain, weather, satellite, earthquake, aircraft, marine, street
  imagery, and other sources are used only where their terms and coverage allow.
- Observations, forecasts, models, references, and game-generated content are
  labeled as different classes.
- Missing provider data is not invented as surveyed truth.
- Maryland parcels are authoritative mapped context, not proof of legal title,
  a legal survey, a current sale price, or a claim about real occupants.
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
Authenticated accounts, room state, server-authorized property, commerce,
player condition, owned-vehicle upgrades, and Expedition actions, moderation,
and rewards use Firebase services. Service receipts remain pending until their
gameplay effect settles; failed effects compensate the same wallet exactly once.

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
- Community Reality Capture is not production-ready until Storage and App Check
  are provisioned, rules pass in the Firebase emulator, the reconstruction tools
  run in an isolated worker, and one controlled exterior plus one permitted
  private interior pass the documented end-to-end acceptance gate.
- Release readiness is not stored as a hand-edited checkpoint status. Candidate
  and backend matrices must both pass against the exact current commit and
  working-tree fingerprint; any source change makes that evidence stale.
