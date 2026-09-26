# World Explorer 3D System Inventory

Updated September 10, 2026 · Version 5.2.0 · Source baseline `53452516c16eb93ae7828a642156d24528a88ca9`.

This is the current system inventory. It replaces the dated patch-note sequence formerly at the top of this document. Historical implementation records remain in Git and the linked specialist documents. A capability listed here exists in the inspected source; it is not automatically certified on every device or deployed to production.

[Project description](PROJECT_DESCRIPTION.md) · [Architecture](ARCHITECTURE_MAP.md) · [Complete source reference](SYSTEM_INVENTORY_REFERENCE.md) · [Audit findings](audits/2026-09-10/README.md) · [Test evidence](audits/2026-09-10/tests-and-evidence.md) · [Repair plan](audits/2026-09-10/repair-plan.md)

## Product model

World Explorer 3D is a browser-based geography sandbox. It combines exploration of real mapped places with vehicles, discovery, virtual property, construction, photo-based building improvements and shared rooms. Ocean, planetary and space environments extend exploration beyond a selected Earth location. Interstellar Expeditions remains Alpha.

Earth sessions assemble one bounded area. Moving to another destination changes the active world; this is not a continuously streamed full-scale Earth or a single global MMO. Real-world map evidence and generated gameplay have different meanings and must retain that distinction.

**Status terminology:** “Implemented” means source exists. “Prior scoped verification” means an earlier task or the owner exercised a specific journey. “Unverified” means this audit has no fresh complete acceptance evidence. “Planned/development” is not a finished public feature. Production availability must be checked against the actual deployed artifact, not this source inventory.

## Player systems

| System | What the player can do in the implemented design | Boundary / evidence |
|---|---|---|
| Destination selection | Globe, search, coordinates, presets, geolocation, favorites and recent places | Bounded scenes; provider coverage varies. |
| Walking and interactions | Move through a scene, use contextual actions, enter supported vehicles and interiors | Entrances, collisions and permission decisions must agree. No worldwide traversal certification. |
| Road vehicles | Drive vehicle families, switch cameras, use condition/recovery and services | Game physics. Permanent BMW remains a free exploration option; recent camera work has prior scoped evidence. |
| Air and drone travel | Personal plane, mapped airport boarding and destination flights, drone exploration | Airport/provider and vehicle-specific constraints; not a flight-training simulator. |
| Boats, ocean and fishing | Pilot vessels, explore underwater, fish from supported contexts | Shared catch records and separate environment lifecycle; fresh full journey not run here. |
| Explorer and Backpack | Identity, character, equipment, quick slots, tools, supplies and condition | Account state and device-local preferences have different persistence. |
| Discovery and progression | Journal, Field Guide, life lists, leads, specialties, regional surveys and field activities | Regional catalogs represent game opportunities, not live wildlife sightings. |
| Companions | Care, trust, levels, travel and eligible vehicle boarding | Catalog and environment restrictions; no fresh all-companion acceptance run. |
| Geology and samples | Inspect mapped geology, record evidence and use field tools | Geology provider evidence is not a guaranteed mineral deposit or identified specimen. |
| Economy and services | Explorer Credits, supplies, service settlement, vehicle upgrades and resource custody | In-game values. Payment support is a separate system. |
| Virtual property | Claim, list, purchase and manage supported building-backed property | Maryland parcel context is additional evidence, not real-world legal ownership. |
| Quick Build and Blocks | Place/remove constructions with local or room persistence | Game-created content; does not edit map providers. |
| Home and facade editor | Add/reshape rooms on the grid, edit layout, place photos, select an entrance, submit revisions | Implemented with prior owner/staging feedback; broad device and shape acceptance remains open. |
| Surface photos | Apply photos to walls, floors and ceilings | Floor visibility and entrance placement received recent scoped fixes; does not imply a whole-app pass. |
| Multiplayer and social | Public/private bounded rooms, presence, chat, activities, shared Blocks and room vehicles | Room privacy/admission findings remain in the audit. Not all local actions are authoritative shared actions. |
| Activities and rankings | Fishing, Flower Sprint, Paint Town, DeFlock and discovery-related records | Activity-specific rules and backend boundaries; source index lists their tests. |
| Planetary exploration | Solid/atmospheric destinations, appropriate astronaut/rover/drone tools and samples | Game scales and environment-specific controls. |
| Space and Expeditions | Solar/deep-space travel, Wayfinder/manual flight, Solis Reach, Pathfinder and voyage events | Expedition Alpha; art, mission variety and cross-device acceptance remain limited. |
| Live GPS and AR | Optional foreground location and capability-dependent AR/camera presentation | Permission-dependent; no background world streaming or persistent AR anchors established. |
| Accessibility and onboarding | First Journey, contextual guidance, configurable controls, contrast/text/motion preferences | Implemented settings are not proof of physical-device or assistive-technology acceptance. |

## World systems

| System | Responsibility | Main boundary |
|---|---|---|
| World compiler and publication | Assemble mapped features into playable geometry | Published geometry, collision and interactions must use consistent identities. |
| Terrain and ground evidence | Elevation, land cover, surface classification, regional transition geometry | Missing/highly variable evidence must not be reported as surveyed terrain. |
| Roads, bridges and tunnels | Transport support, enclosed volumes and transitions | Complex intersections, portals and worldwide coverage remain acceptance work. |
| Building exteriors | Footprints, height, roofs, semantic materials and near details | Generated appearance is not photographic accuracy. |
| Interiors and entrances | Authored/generated layouts, surface geometry, entry/exit and walking collision | Approved representation and saved entrance must reach the runtime together. |
| Vegetation and living world | Plants, animals, pedestrians and traffic | Bounded runtime budgets and catalog-driven behavior. |
| Functional places | Normalize mapped businesses into supported service families | Stock and prices are game values; full family/interior acceptance remains open. |
| Weather, sky and live layers | Weather, astronomy and selected geospatial feeds | Freshness, attribution and provider failure are distinct per feed. |
| Runtime and renderer | Startup, frame work, quality, cleanup and WebGL lifetime | Shared mutable context remains a maintenance risk. |
| Controls and presentation | Keyboard/touch/gamepad actions, HUD, dialogs, notifications and camera | Panels and travel must release/restore input correctly. |

### Supporting product surfaces

| Surface / source | Purpose | Access and evidence boundary |
|---|---|---|
| `index.html`, `about/`, legal pages | Public introduction, attribution and policy | Marketing statements must match released capability. |
| `app/index.html` | Main world runtime | Keyboard/touch WebGL client. |
| `app/capture.html`, `app/survey.html` | Phone/media capture and survey entry | Ownership, permissions and device capabilities apply. |
| `account/index.html`, `account/account-center.js` | Identity, privacy/security, social and contribution navigation | Audit did not complete a fresh signed-in walkthrough of every action. |
| `account/contribution-workspace.js` | Contributor history and review workspace integration | Saving, submitting and approving are separate states. |
| `account/admin.html`, `account/moderation.html`, `js/admin-dashboard.js` | Authorized administration, moderation and reports | UI visibility alone does not prove server authorization. |
| `js/billing.js`, backend payment handlers | Support/checkout/portal and receipt flows | Separate from Explorer Credits; no fresh payment acceptance in this audit. |
| `js/analytics-service.js`, `js/site-analytics.js` | Shared analytics initialization and page/product events | Analytics is not game authority; current policy is not opt-in by default. |

### Current capture availability

Manual photo editing is the intended ordinary contribution path. The source includes phone handoff, uploaded originals, device drafts, photo cropping/alignment, revisions, room layout editing, wall/floor/ceiling photographs, saved entrances, submission and review. Account navigation and in-world review reuse shared contribution components. Interior visibility begins private; broader publication requires the applicable explicit choice and review.

The owner has exercised the updated editor and interior entry in the prior staging work. The latest recorded staging build in that task was `5.2.0+d73394916971.56b6bfc3840ee72e.staging`. This document has not re-queried live hosting and does not imply production promotion of those changes. Earlier exterior production work is historical scoped evidence, not proof that every newer interior change is live there.

Automatic reconstruction tooling (including Meshroom/TRELLIS processing) remains a development path. Source and past jobs do not establish reliable whole-building reconstruction. Public contributor preview rooms, automatic contribution rewards, broad physical-phone acceptance and every-layout correctness are not established as finished.

## Data and truth boundaries

Mapped features, observed measurements, forecasts, modeled/derived data, reference layers and game-generated objects have different truth classes. Preserve source, identity, freshness, units, uncertainty and attribution where provided. A fallback can keep play running without becoming a real-world measurement.

External dependency families include mapping/elevation/land-cover providers, weather and geospatial feeds, Firebase services, browser CDN libraries and optional reconstruction processing. Provider configuration lives in `app/js/geospatial/provider-registry.js`, domain modules and backend proxies; attribution is documented in [DATA_SOURCES.md](../DATA_SOURCES.md) and [ATTRIBUTION.md](../ATTRIBUTION.md). This inventory does not establish current external uptime, cloud cost or quota settings.

## Persistence and backend

| Store / authority | What belongs there | Important limitation |
|---|---|---|
| localStorage | Device preferences and domain-specific local progress | Not automatically account-synced; account switching needs explicit tests. |
| IndexedDB | Larger photo/draft batches and device recovery | Local recovery is not cloud backup. |
| Firebase Auth | Login identity | Deleting identity alone does not delete all authored data. |
| Firestore | Users, profiles, rooms, social records, economy/property, submissions, capture metadata and access records | Rules protect direct clients; backend commands must validate their own requests. |
| Cloud Storage | Originals and derived media | Media existence, approved metadata and runtime delivery must agree. |
| Cloud Functions | Protected account, commerce, property, discovery, capture, moderation and shared commands | Retry/idempotency and deletion defects remain open. |
| In-memory scene | Rendered objects, active physics and transient simulation | Reloading a scene requires rehydrating saved authorities. |

The [reference appendix](SYSTEM_INVENTORY_REFERENCE.md) lists all declared Firestore/Storage match paths and backend source modules. That is a source inventory, not an export of live databases or complete deployed endpoint discovery. Admin SDK operations do not inherit client-rule restrictions. Keep server authorization separate from direct-client rule testing.

## Repository map


| System | Main source owners | State and important boundaries |
|---|---|---|
| Startup and module loading | `app/js/app-entry.js`, `modules/manifest.js`, `modules/script-loader.js` | Script readiness, startup failures, external dependencies. |
| Runtime orchestration | `app/js/runtime/kernel.js`, `lifecycle-scope.js`, `workload-policy.js`, `core-frame-systems.js`, `earth-runtime.js` | Frame work, on-demand systems, lifecycle cleanup. |
| Renderer and input | `app/js/engine/`, `controls/`, `ui/`, `hud/` | WebGL lifecycle, quality, keyboard and touch ownership. |
| Earth and terrain | `app/js/world/`, `terrain/`, `earth-core/`, `geospatial/` | Provider data compiled into bounded playable scenes; coordinate consistency. |
| Live context | `app/js/live-earth/`, `weather/`, `sky/`, `places/`; `functions/geospatial.js` | External feeds, attribution, freshness and failure handling. |
| Movement | `app/js/walking/`, `boat-mode/`, `plane/`, `transport/`, `physics/` | Collision, vehicles, spawn location, transitions and input focus. |
| Living world and urban simulation | `app/js/living-world/`, `urban-sandbox/`, `character/`; `functions/urban-sandbox.js` | Local simulation and protected shared commands. |
| Player state and economy | `app/js/player/`, `economy/`; `functions/player-state-authority.js`, `economy-authority.js` | Local backpack/condition models versus connected server authority. |
| Discovery | `app/js/discovery/`; `functions/discovery.js` | Profiles, receipts, rewards and trades. |
| Property and housing | `app/js/real-estate/`; `functions/property-authority.js` | Parcels, addresses, ownership and connected property state. |
| Interiors | `app/js/interiors/`; `functions/interior-layout.mjs` | Layout geometry, floors, ceilings, entrances, traversal. |
| Reality capture and editing | `app/js/reality-capture/`; `functions/community-reality-capture.js`, `reality-capture-patch-derivative.js`, `capture-account-cleanup.js` | Device drafts, uploaded images, submissions, review, generated derivatives, world consumption. |
| Shared rooms and social | `app/js/multiplayer/`; `firestore.rules` | Room discovery, membership, presence, poses, chat and invitation boundaries. |
| Building and creator tools | `app/js/block-builder/`, `editable-world/`, `creator/` | Local editing versus authorized published/shared changes. |
| Activities | `app/js/fishing/`, `flower-challenge/`, `deflock/`, `leaderboards/`, `activity-discovery/` | Activity rules and score publication; not every activity independently exercised. |
| Other environments | `app/js/ocean/`, `planetary/`, `space/`, `solar-system/`, `universe/`, `expedition/` | Separate environments and transitions; expedition persistent state. |
| AR | `app/js/ar/` | Capability and session handling; persistent anchors are not established here. |
| Identity and API access | `js/firebase-init.js`, `firebase-environment-policy.js`, `auth-ui.js`, `function-api.js` | Auth, environment selection, App Check plumbing and request semantics. |
| Account and review | `account/index.html`, `account-center.js`, `contribution-workspace.js`, `admin.html`, `js/admin-dashboard.js` | Permissions, contribution status, reviewer actions and coherent navigation. |
| Billing and analytics | `js/billing.js`, `analytics-service.js`, `site-analytics.js`; backend handlers | Payment/account integration and event collection; no financial-flow acceptance certification in this audit. |
| Backend | `functions/index.js` plus domain modules | HTTP endpoints, authorization, deletion, shared data commands and generated command engine. |
| Delivery and verification | `scripts/`, `config/`, `.github/workflows/`, Firebase configuration | Builds, artifact identity, release gates, environment selection and evidence. |


### Complete source and verification index

The [source reference](SYSTEM_INVENTORY_REFERENCE.md) enumerates all 696 tracked non-vendor JavaScript modules under `app/js` in 59 directory groups, backend modules, direct export declarations, rule paths, public page sources, 155 package commands, configured release systems and test files. The grouping includes root modules; directory count is not a count of independent products.

Repository runtime: browser JavaScript modules and Three.js/WebGL; Firebase Auth/Firestore/Storage/Functions; Node 22 backend; esbuild hosting tooling; Node tests, browser automation and Firebase emulator checks. Some browser libraries come from CDNs and are outside the npm advisory scan. Generated command code and vendored assets must be distinguished from handwritten logic.

## Current limits

The September 10 audit passed 234 selected contract tests and source checks. Full world/browser execution was interrupted; the security-emulator attempt did not execute tests because Java was unavailable on its PATH. Those results remain incomplete. Full test evidence and CI gaps are in [the evidence ledger](audits/2026-09-10/tests-and-evidence.md).

Highest-priority open findings: incomplete mandatory release coverage; ambiguous-response write retries; account deletion reporting success despite incomplete cleanup; loader retry hangs; multiplayer prejoin disclosure/capacity boundaries; production-default CLI risk; stale evidence and documentation. The [repair plan](audits/2026-09-10/repair-plan.md) gives acceptance criteria.

Cloud backups, restore drills, alerts, budgets and deployed permission settings were not fully inventoried live. Physical Android/iOS, assistive technology, long-session memory and every advertised environment still need suitable acceptance evidence. The source inventory must not be used as a claim that these passed.

On the owner's 8 GiB Mac, follow root `AGENTS.md`: one task at a time, no automatic heavy browser/emulator matrix. The previous cleanup recovered approximately 17.5 GiB; it did not change game behavior. Future reports should identify their source commit and distinguish source presence, scoped verification and deployed availability.
