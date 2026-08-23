# World Explorer 3D System Inventory

Last audited: 2026-08-23 against World Explorer 3D 4.3.1 at stable commit
`9b28e2952cf22b7bb0d40be655ef9a194d0af75f`.

This document describes the current product code, not an earlier prototype or
future design. It is intended as the first handoff document for an engineer,
reviewer, or maintainer who needs to determine what exists, which code owns it,
how it is verified, and where the remaining boundaries are incomplete. Read
[ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md) next for lifecycle and data-flow
diagrams.

## Product boundary

World Explorer 3D is a browser-based, fixed-location geospatial sandbox. An
Earth session loads one bounded selected location and publishes one assembled
world. It is not a continuously streaming world. The same application can
transition to Ocean, Moon, Mars, solar-system, and deep-space environments,
but each environment has an explicit owner and teardown lifecycle.

The current release includes 535 browser JavaScript modules, eight backend
JavaScript modules, 11 release-verification programs, Firestore security rules,
and a generated immutable hosting artifact. Module count is context, not a
quality claim; working product journeys and authoritative ownership are the
acceptance criteria.

Status terms used below:

- **Released and gated** means the normal product path ships and the release
  suite exercises its principal contract.
- **Released, gate incomplete** means the path ships but its complete user
  journey is not a release blocker yet.
- **Partial** means an end-to-end authority, workflow, or coverage area is
  missing.
- **Intentional limit** means the behavior is outside the current product
  contract.

## Repository map

| Path | Authority or purpose | Maintenance rule |
| --- | --- | --- |
| `index.html`, `styles/landing.css`, `js/site-content.js` | Public landing page and launch path | Edit canonical source; do not edit generated hosting copies |
| `app/index.html` | Game document, HUD shell, dialogs, and module-manifest bootstrap | Preserve IDs used by UI, layout, and browser verification |
| `app/js/` | Canonical browser game runtime | Runtime implementation lives here |
| `app/assets/` | Game textures, accepted-ground artifacts, and attributed runtime assets | Preserve attribution and artifact manifests |
| `app/data/` | Bundled building, landmark, bathymetry, and transport control data | Treat provenance-bearing records as source data, not decoration |
| `js/` | Shared site/account/admin/Firebase client modules | Keep secrets and privileged decisions out of the client |
| `functions/` | Authorized Firebase HTTPS backend | Validate authentication, authorization, methods, and payloads server-side |
| `firestore.rules`, `firestore.indexes.json` | Direct-client persistence boundary | Rule changes require emulator verification |
| `config/` | Environment, rendering, verification, and production-program contracts | Keep environment identity explicit |
| `scripts/` | Hosting build, audits, data preparation, and verification | Release checks must target the built artifact when specified |
| `scripts/verification/` | Product and release journey checks | Tests must use the assembled product, not isolated scenes |
| `tests/` | Firestore security and multiplayer/game integration fixtures | Never point emulator tests at production data |
| `data/ground-attestations/` | Reviewed accepted-ground evidence | Preserve source, datum, integrity, and review metadata |
| `assets/landing/` | Public gameplay captures and site media | Captures must come from the real runtime |
| `github-pages/` | Static public project explainer | Separate from the main production game host |
| `dist/` | Generated, ignored hosting artifact | Never edit or commit |
| `.local-candidates/` | Local verification candidates | Never publish as canonical source |

## Boot and runtime foundations

| System | Responsibility | Authoritative entry points | State and lifecycle | Status |
| --- | --- | --- | --- | --- |
| Module bootstrap | Loads critical Three.js dependencies, optional rendering helpers, then the application module | `app/js/modules/manifest.js`, `app/js/app-entry.js` | Browser document lifetime | Released and gated |
| Engine | Creates renderer, scenes, cameras, lighting, controls, and shared engine objects | `app/js/engine.js`, `app/js/engine/` | Application lifetime with environment-owned scene roots | Released and gated |
| Shared context | Explicit cross-module object for runtime APIs and shared references | `app/js/shared-context.js` | Application lifetime; broad dependency surface | Released; architectural risk noted below |
| Runtime kernel | Orders phased systems, fixed updates, frame updates, lifecycle owners, and failure reporting | `app/js/runtime/kernel.js`, `app/js/main.js` | Application lifetime; systems register and unregister | Released and gated |
| Platform services | Lazily loads account, editors, creator/discovery, analytics, multiplayer, and AR services | `app/js/platform/service-registry.js`, `app/js/app-entry.js` | Lazy service instances with status and reset | Released; feature gates vary |
| Session coordination | Serializes environment transitions and cancels superseded work | `app/js/session-coordinator.js`, `app/js/runtime/lifecycle-scope.js` | One active transition/environment ownership scope | Released and gated |
| Workload policy | Defers optional systems and protects core loading work | `app/js/runtime/workload-policy.js` | Per-session/per-runtime policy | Released; numeric performance budgets incomplete |
| Diagnostics | Exposes machine-readable runtime, world, render, and error state for verification | `app/js/runtime-diagnostics.js` | Current application state | Released and gated |
| On-demand environments | Loads Earth, Live Earth, Mars, Ocean/Space, block builder, flower challenge, fishing, and interiors only when requested | `app/js/runtime/on-demand-*.js` | Lazy module and environment scopes | Released and gated for core environments |

## Earth world authority

Earth loading is intentionally a pipeline. Provider payloads are not allowed to
attach competing final worlds directly to the scene.

| Stage | Sole responsibility | Primary implementation |
| --- | --- | --- |
| Request identity | Immutable selected-location request and identity | `app/js/earth-core/world-load-request.js` |
| Load state | Requested, fetching, compiling, published, superseded, failed, or disposed state | `app/js/earth-core/world-load-session.js` |
| Coordination | Cancellation, supersession, and active-load ownership | `app/js/world/world-load-coordinator.js`, `app/js/world/load-runtime-session.js` |
| Orchestration | Reset previous Earth state, select providers, compile layers, then publish | `app/js/world/load-roads.js` |
| Layer products | Immutable terrain, hydrology, transport, buildings, landuse, and places products | `app/js/world/compiler/world-layer-products.js` |
| Snapshot | One immutable assembled `WorldSnapshot` | `app/js/world/world-snapshot-adapter.js` |
| Publication | Final Earth scene visibility and published object lists | `app/js/world/publication.js` |
| Environment ownership | Earth resume/reuse/reload, actor return pose, and scene-root visibility | `app/js/earth-session.js`, `app/js/planetary/scene-ownership.js` |

### World-layer inventory

| Layer | Source and selection | Compilation and publication | Final consumers | Status and limitations |
| --- | --- | --- | --- | --- |
| Terrain | Accepted-ground catalog, provider registry, integrity manifests, WorldCover, polar/far-field and labeled fallback terrain | `app/js/terrain.js`, `app/js/terrain/accepted-ground-*.js`, `app/js/terrain/ground-provider-registry.js`, `app/js/terrain/tiles.js`, `app/js/terrain/seams.js` | Visible ground, collision, road/building anchoring, water masking, actor height queries | Released; 41 reviewed fixed-location artifacts, not global accepted bare earth |
| Hydrology | Mapped water geometry, water-body contracts, terrain masks, material/environment evidence | `app/js/world/water-*.js`, `app/js/world/compiler/hydrology-*`, `app/js/boat-mode/water-query.js` | Water rendering, shoreline context, boating, underwater transfer | Released; source and bathymetry coverage vary |
| Transport | OSM-derived identities and tags normalized into topology, surface profiles, junctions, vertical structures, and tunnels | `app/js/world/compiler/transport-*.js`, `app/js/terrain/road-surface-geometry.js`, `app/js/terrain/road-junctions.js`, `app/js/terrain/structure-visuals.js` | One visible/collidable/traversable road surface, traffic navigation, player vehicles | Released and gated; incomplete source connections can shorten structures |
| Buildings | Overture primary/fallback selection plus OSM/Shortbread fallback, stable identity, footprint deduplication, mapped metadata and semantics | `app/js/world/overture-building-source.js`, `app/js/world/overture-tile-source.js`, `app/js/world/building-*.js`, `app/js/world/compiler/building-*` | Batched massing, LOD/culling, collision/spatial index, roofs, facades, entrances, interiors | Released and gated; mapped height/detail availability varies |
| Land use and vegetation | Mapped landuse plus WorldCover classification and deterministic placement | `app/js/world/landuse-*.js`, `app/js/terrain/worldcover-*.js` | Surface material, vegetation, environmental context | Released; classified/inferred content is not surveyed detail |
| Places and street detail | Mapped POIs, furniture, entrance evidence, place context, and bounded fixed regional context | `app/js/world/poi-*.js`, `app/js/world/street-furniture*.js`, `app/js/living-world/entrance-catalog.js` | Labels, discovery, building access, pedestrian destinations, visual context | Released; mapping density varies |
| Atmosphere and weather | Sky, clouds, lighting, weather state, and environment presentation | `app/js/sky/`, `app/js/weather/`, `app/js/world/environment-*.js` | Final assembled frame and traversal visibility | Released and gated at environment level |

### Transport authority detail

The current transport chain is:

1. Preserve mapped source identity and tags.
2. Normalize provider features in `transport-source-normalizer.js`.
3. Deduplicate and connect them in `transport-network-model.js`.
4. Resolve one surface and vertical profile in `transport-surface-model.js`,
   `transport-surface-profile.js`, and `transport-junction-profile.js`.
5. Assemble bridge, ramp, elevated, underpass, and tunnel structures in
   `transport-structure-assembly.js` and `tunnel-system-model.js`.
6. Generate final road/junction geometry, structure visuals, collision, and
   traversal from the published transport product.

Traffic and player traversal consume this product; they do not own another road
renderer. Pedestrians are restricted to eligible pedestrian surfaces and must
not be inferred from vehicle centerlines.

### Building authority detail

The building chain preserves provider provenance and stable feature identity
through source normalization, footprint deduplication, load budgets, mapped
height resolution, semantic selection, batching, LOD/culling, publication, and
scene attachment. Facade entrances and glass fronts are integrated into the
published building representation rather than overlaid as a duplicate building
system. Generated height is a bounded fallback and is not described as mapped
or surveyed height.

## Player, traversal, and simulation systems

| System | Current responsibility | Primary modules | Persistence or network boundary | Status |
| --- | --- | --- | --- | --- |
| Walking/player | Grounded locomotion, collision, interaction pose, camera handoff | `app/js/walking/`, `app/js/player/`, `app/js/physics/` | Local pose; multiplayer publishes bounded presence | Released and mostly gated |
| Vehicles | Cars and specialty traversal, grade contact, entry/exit, camera and door behavior | `app/js/game/`, `app/js/urban-sandbox/`, `app/js/physics/` | Room vehicle leases and impacts use authorized functions | Released; full interaction gate incomplete |
| Flight | Drone and plane traversal/cameras | `app/js/game/`, `app/js/engine/` | Local mode state | Released, gate incomplete |
| Boats and underwater | Surface boat, waves/wakes, water queries, shoreline transfer, underwater movement | `app/js/boat-mode/`, `app/js/ocean/` | Local environment state | Released; coverage and journey gates partial |
| Planetary traversal | Rover, astronaut, rocket, planet and space transitions | `app/js/planetary/`, `app/js/solar-system/`, `app/js/universe/`, `app/js/space/` | Environment-owned state | Released and environment-lifecycle gated |
| Living world | Pedestrian eligibility, navigation, population, entrances, traffic and parked vehicles | `app/js/living-world/` | Rebuilt from each published world | Released and representative-location gated |
| Urban Sandbox | Backpack, equipment, ammunition, vehicle leases, impacts, civic responders, custody and recovery | `app/js/urban-sandbox/` | Firestore room state plus authorized urban functions | Released, gate incomplete |
| Interiors | Building entry/exit, mapped indoor geometry, generated floors, stairs, elevator and collision | `app/js/interiors/`, `app/js/building-entry.js` | Session-local interior scope | Released; mapped ingestion currently selects one mapped level |
| Discovery | Deterministic local activities, a small wildlife/geology/history catalog, specimens, tools, Journal/Field Guide, goals, progression, companions, and trades | `app/js/discovery/` | Local IndexedDB profiles plus `explorerProfiles`, item subcollections, and discovery functions | Released foundation; field-session rewards, regional ecology, durable Expeditions, and broad species content are incomplete |
| AR | Capability detection, eligibility, WebXR/camera-overlay/3D presentation, virtual wildlife survey | `app/js/ar/` | Device permission plus local/session state | Released, gate incomplete |
| DeFlock Hunt | Virtual objectives from publicly mapped OSM surveillance nodes | `app/js/deflock/`, `functions/deflock.js`, `functions/geospatial.js` | Immutable room state and authorized claim function | Released; provider fallback is explicitly labeled |
| Fishing | Boat-only cast/fight/catch loop with equipment and 14 broadly filtered species; underwater schools are separate | `app/js/fishing-game.js`, `app/js/fishing/`, `app/js/ocean/fish-life.js` | Local catch/equipment state plus leaderboard/backend where enabled | Released foundation; shore access and one regional water/fish population authority are absent |
| Paint Town | Shared paint claims and leaderboard | `app/js/game/paint-town*.js`, `tests/painttown.integration.test.mjs` | Firestore room claims | Released and integration-tested |
| Flower challenge | Local challenge lifecycle and score path | `app/js/flower-challenge/` | Leaderboard where enabled | Released, gate incomplete |
| Block builder | 200-piece construction catalog and shared room blocks | `app/js/block-builder/`, `app/js/multiplayer/` | Firestore room blocks | Released and multiplayer-convergence tested |
| Activity discovery/editor | Built-in and room activities, local authoring, preview and library | `app/js/activity-discovery/`, `app/js/activity-editor/` | Authored library is local-browser only | Partial: production activity publishing is absent |
| Overlay editor | Draft, submit, moderation, published overlay and creator contribution path | `app/js/editor/`, `app/js/editable-world/`, `functions/overlay.js` | Authorized functions and Firestore overlay collections | Partial: backend exists; full release journey is missing |
| Multiplayer/social | Bounded rooms, presence, chat, artifacts, activities, blocks, edits, friends and invites | `app/js/multiplayer/`, root `js/` client APIs | Firebase Auth, Firestore rules, authorized functions | Released; resilience/moderation remain partial |

There is no current authoritative crafting system, unified mission lifecycle,
wallet/currency economy, or universal full-body/hand embodiment contract. These
are not hidden subsystems; they are unimplemented product work tracked in the
[roadmap](../ROADMAP.md).

## Live and external-context systems

| System | Role | Authority and truth boundary | Status |
| --- | --- | --- | --- |
| Live Earth | Registers satellites, earthquakes, aircraft, weather, marine/water-level context, street imagery, and reference layers | `app/js/live-earth/`, `app/js/geospatial/`; each provider records observation/model/prediction/reference class | Released, full journey gate incomplete |
| Live GPS Explore | Starts from the mobile launch path or the in-game Games menu and follows foreground device location inside one already bounded Earth world | `app/js/live-gps/`, `app/js/runtime/on-demand-location-games.js` | Browser permission and session-local fixes; does not create continuous-world streaming or trusted proximity rewards | Released movement path and journey gate; complete field-game authority is absent |
| Geospatial server adapters | Protect provider boundaries and normalize DeFlock, street imagery, and aircraft queries | `functions/geospatial.js` | Same-origin HTTPS functions, bounded caches/timeouts/fallbacks | Released |
| Data provenance | Documents public sources, licenses, fallbacks, and truth classes | `DATA_SOURCES.md`, `ATTRIBUTION.md`, asset attribution files | Documentation plus runtime provenance fields | Released; maintain with provider changes |

## Browser platform and public site

| Area | Implementation | Notes |
| --- | --- | --- |
| Landing and gallery | `index.html`, `styles/landing.css`, `js/site-content.js`, `assets/landing/` | Public launch and gameplay presentation |
| Game UI/HUD | `app/index.html`, `app/js/ui/`, `app/js/hud/`, `app/styles/` | Desktop/mobile layouts, dialogs, live regions, partial screen-layout ownership, and hard-coded key-emulating touch profiles; user remapping is absent |
| Account and entitlements | Root `js/auth*.js`, `js/account*.js`, `js/entitlements*.js`, `account/` | Firebase-authenticated client backed by authorized account/billing functions |
| Admin/moderation | Root `js/admin*.js`, `functions/admin-dashboard.js`, contribution/overlay functions | Moderator allowlist and server-side authorization required |
| Public information | `about/`, `legal/`, README and root Markdown documents | Public-facing repository and product documentation |
| Analytics | Lazy platform analytics service | Must remain consent/environment aware and must not hold world authority |

## Backend function inventory

All deployed functions are assembled in `functions/index.js`. Browser rewrites
are declared in `firebase.json`. The main endpoint groups are:

| Group | Functions |
| --- | --- |
| Billing/account | `createCheckoutSession`, `createPortalSession`, `startTrial`, `enableAdminTester`, `getAccountOverview`, `listBillingReceipts`, `updateAccountProfile`, `deleteAccount`, `stripeWebhook` |
| Geospatial adapters | `getDeFlockCameras`, `getStreetImagery`, `getAircraftStates` |
| Discovery | `claimExplorerDiscovery`, `listExplorerDiscoveries`, `createDiscoveryTrade`, `acceptDiscoveryTrade`, `cancelDiscoveryTrade` |
| Urban authority | `claimUrbanVehicle`, `updateUrbanVehicle`, `releaseUrbanVehicle`, `commitUrbanImpacts`, `commitUrbanCivicEvent`, `resolveUrbanCivicOutcome` |
| DeFlock state | `claimDeFlockVirtualDisable` |
| Legacy contributions | `submitContribution`, `getContributionModerationOverview`, `listContributionSubmissions`, `moderateContributionSubmission` |
| Overlay workflow | `saveOverlayFeatureDraft`, `submitOverlayFeature`, `deleteOverlayFeatureDraft`, `moderateOverlayFeature` |
| Admin operations | `getAdminDashboardOverview`, `listAdminOverlayFeatures`, `getAdminOverlayFeatureDetail`, `listAdminUsers`, `getAdminUserDetail`, `listAdminRooms`, `updateAdminRoomFlags`, `getAdminSiteContent`, `saveAdminSiteContentDraft`, `publishAdminSiteContent`, `listAdminActivity`, `getAdminOperationsSnapshot` |

Not every HTTPS function has a friendly hosting rewrite. Clients may call
Firebase function URLs through their API modules; `firebase.json` remains the
authority for same-origin routes. Server-side checks, not hidden UI controls,
are the authorization boundary.

## Firestore persistence inventory

`firestore.rules` is the direct-client access authority. Major document paths
are:

| Path | Purpose |
| --- | --- |
| `users/{uid}` and social subcollections | Account profile, friends, recent players, invites, and room references |
| `creatorProfiles/{uid}` | Public creator identity and contribution statistics |
| `explorerProfiles/{uid}/items/{item}` | Explorer progression and owned discovery items |
| `discoveryTrades/{trade}` | Server-authorized item trades |
| `editorSubmissions/{submission}` | Legacy contribution workflow |
| `overlayFeatures/{feature}` with `revisions` and `moderation` | Owner drafts, immutable revision history, and moderation events |
| `overlayPublished/{feature}` | Public approved overlay projection |
| `siteContent` and `siteContentPublished` | Draft and published administrative site content |
| `adminActivity/{event}` | Moderator audit activity |
| Leaderboard collections | Flower, Paint Town, DeFlock, fishing, and Explorer scores |
| `rooms/{room}` | Bounded multiplayer room metadata |
| Room `players`, `chat`, `chatState` | Presence and communication |
| Room `artifacts`, `activities`, `activityState`, `blocks`, `worldModifications`, `paintClaims` | Shared sandbox and game state |
| Room `deflockStates`, `urbanEntities`, `urbanActors`, `urbanCivic`, `state` | Authorized cooperative and Urban Sandbox state |

Indexes live in `firestore.indexes.json`. Security rules are tested with the
local Auth, Firestore, and Functions emulators; production data is not part of
the test contract.

## Build, verification, and release inventory

| Command | Contract |
| --- | --- |
| `npm run verify:source` | Source syntax, module reachability, imports, and static contracts |
| `npm run verify:provider-release` | Provider/environment pin and release-provider policy |
| `npm run verify:firestore-rules` | Firestore authorization behavior through emulators |
| `npm run verify:multiplayer` | Two-client bounded-room convergence |
| `npm run verify:world` | Public launch through a fully assembled Baltimore Earth world |
| `npm run verify:jfx-player-surface` | JFX transport surface ownership and player traversal contract |
| `npm run verify:environments` | Earth/Moon/Mars/Ocean/Space transition ownership and teardown |
| `npm run verify:assembled-locations` | Baltimore/JFX, Golden Gate, London, Monaco, Manhattan, rural Iowa, and Tokyo |
| `npm run verify:actors-vehicles` | Actor and vehicle contact/interaction contracts |
| `npm run verify:live-gps` | Visible 390×844 Live GPS entry, real emulated geolocation, walk/drive switching, camera return, and bounded lifecycle; field rewards/ecology are not yet covered |
| `npm run verify:artifact-runtime` | Runtime against the immutable built candidate |
| `npm run build:hosting` | Fresh production-shaped `dist/` with content hashes |
| `npm run audit:reachability` | Rejects hosted code/styles that are not reachable from declared entries |
| `npm run audit:assets` | Validates hosted asset references and artifact integrity |
| `npm run release:verify` | Orchestrates source, provider, backend, security, build, artifact, world, JFX, environment, Live GPS, and worldwide checks |

`config/verification-policy.json` defines evidence policy.
`config/world-rendering-contract.json` defines important rendering ownership.
`config/production-program-gates.json` records the current roadmap gate state.
Automated counts and machine state are supporting evidence; final gameplay
frames and real input journeys remain required for visual acceptance.

## Current architectural risks and incomplete areas

1. `shared-context.js` makes dependencies explicit but remains a large shared
   API surface. New systems should receive narrow capabilities where practical.
2. `app-entry.js` owns critical boot ordering. Moving eager work into it can
   regress startup and memory even when the feature itself works.
3. Provider availability and mapped metadata vary worldwide. Fallbacks must
   preserve identity/truth labels and must not invent surveyed claims.
4. Accepted-ground coverage is reviewed for 41 fixed locations, not the globe;
   the legacy visual fallback has a mixed vertical datum.
5. Mapped indoor ingestion currently selects one mapped level even though the
   generated interior path supports multiple floors.
6. Activity authoring saves to a local browser library; backend publishing is
   not a production feature.
7. Several released systems lack complete release journeys, including
   Discovery, AR, interiors, fishing, DeFlock, creator workflows, civic response,
   and accessibility.
8. Performance mechanisms exist, but a public desktop/mobile matrix for load
   time, frame time, memory, network, draw calls, and teardown retention is not
   yet enforced.
9. The product intentionally does not stream an unbounded continuous Earth.
   Changes that assume cross-location continuity conflict with the product
   architecture.
10. Live GPS movement, Discovery rewards, regional species selection, and
    fishing do not share a trusted field-session/proximity/ecology authority.
    The client can currently claim Discovery rewards without independent server
    validation of location, movement, or proximity.
11. Touch controls are fixed key-emulation profiles. There is no revisioned
    semantic action map, saved remapping/layout, conflict validation, mode-aware
    user profile, or automated proof that a setting changes gameplay.

See [ROADMAP.md](../ROADMAP.md) for the ordered completion program and
[KNOWN_ISSUES.md](../KNOWN_ISSUES.md) for player-facing limitations. The
[Field Exploration and Mobile Control Plan](FIELD_EXPLORATION_AND_MOBILE_CONTROL_PLAN.md)
is the detailed implementation contract for these two new authorities.

## Reviewer start order

1. Run `npm run verify:source` and confirm the checked-out version and Firebase
   environment before changing anything.
2. Read `app/js/app-entry.js`, `app/js/shared-context.js`,
   `app/js/runtime/kernel.js`, and `app/js/session-coordinator.js`.
3. For Earth work, follow the complete pipeline from `world-load-request.js` to
   `load-roads.js`, immutable layer products, snapshot publication, and final
   scene consumers.
4. For persistence or multiplayer work, read the client API, matching backend
   function, Firestore rule, and emulator test together.
5. For provider work, inspect `DATA_SOURCES.md`, runtime provenance, timeout,
   cache, fallback, and truth-type behavior together.
6. Make one bounded authority change, verify the assembled application, inspect
   complete frames, update public limitations/roadmap when needed, and create a
   checkpoint before beginning another change.
