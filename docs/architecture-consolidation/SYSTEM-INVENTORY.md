# System inventory and completeness

October 13 baseline: 1,104 game/shared/backend JS modules. Native account-page modules and HTML entrypoints are reviewed as supporting surfaces below. The fresh import graph, direct context reads/writes and event/subscription sites are in `output/architecture-consolidation/2026-10-13/baseline/inventory.json`. That graph identifies callers; it cannot prove dynamic callbacks or UI reachability. The C1–C3 supplementary census mapped 1,107 modules into 66 source groups in `output/architecture-consolidation/2026-10-13/module-census.json`. The final follow-up census is recorded below; both receipts are retained. No scanned module is declared unused solely for having zero literal importers.

The tables map the whole discovered product surface. This is a **first-pass inventory**, not an exhaustive manual trace of every action in 227,782 lines. `COMPONENT_VERIFIED` means scoped actual-module tests exist and passed the current source run; it never means the entire row is end-to-end certified. `PARTIAL` means an advertised/general experience has explicitly bounded implementation, not that supported actions should be removed. `IMPLEMENTED_UNVERIFIED` means source is connected but current independent acceptance remains open. Prior browser results are dated inherited evidence in BASELINE and VERIFICATION.

## Shared contracts used in the tables

Each row inherits these lifecycle, persistence, failure and security contracts as applicable; exceptions are called out explicitly.

| Contract | Lifecycle and authority | Persistence / failure / permissions |
| --- | --- | --- |
| E — selected Earth | `world/load-roads.js` → immutable request/session → provider drain → geometry/gameplay publication; `earth-session.js` restores only matching usable results. Reset retires the old scene. | Local selection/pose and saved creations are separate from replaceable meshes. Provider errors expose retry; rejected/stale publication cannot replace current identity. Data provenance remains attached. |
| R — regional Earth | `terrain/regional-building-runtime.js` and regional scenery retain last complete publication while replacing an owned ring. | Graphics toggle; bounded resident resources. No detailed road/interior authority outside the chosen district. No new persistent geographic player authority inferred. |
| M — marine | `boat-mode/research/runtime.js`, `ocean.js` and voyage owners perform vessel → deck → swim/sub → recovery transitions with session guards. | Personal v1/v2/v3 voyage readers preserve old keys. Shared crew commands use room/server authority and never overwrite personal voyage state. Rejected admission preserves prior presentation. |
| S — space | `space/runtime.js`, journey/travel-session owners, nested ship and planetary owners activate/suspend/resume/dispose their scenes. | Personal Expedition store distinct from shared server command state. Game-scaled space; supported destinations only. Failed/stale travel cannot commit a new environment. |
| P — personal progress | `discovery/profile-store.js` owns Journal v5 IndexedDB transactions, derived order indexes, backup and receipt outbox; Backpack projects carried resources. | Original/unknown backup fields retained; local progress is device-owned. Account receipts have explicit owner; storage failure must not imply cloud success. |
| A — account | Firebase Auth → `js/function-api.js` → Functions validation/transaction → subscribed projection. | Captured UID is request policy, not trusted server input. Revision/idempotency and rule checks are independent. Interrupted dispatched writes can have unknown outcome; no automatic replay. |
| U — UI | Existing module/control owner creates/binds; session/pause/panel ownership suspends inputs; disposal removes owned callbacks. | Settings may be local. Device permissions require browser/user approval. A menu item alone is not implementation proof. |

## Earth, scenery and places

| System / purpose and current route | Source owner, data dependencies and state writes | Contract; status; verification and limitation |
| --- | --- | --- |
| Startup, destinations, presets, search, favorites | `bootstrap.js` → `app-entry.js`; `earth-location.js`, `location-session.js`, `places/`, `js/site-content.js`; provider registry → place lookup | E/U; COMPONENT_VERIFIED. World-load request/consumer/session and place-search lifecycle tests. Prior opening browser passed; slow/external providers remain separate. |
| Geospatial coordinates / GIS | `geospatial/`, `earth-core/coordinate-frame.js`, ground registry, `gis/`; mapped identities/projection/unit conversion | E/R; COMPONENT_VERIFIED. Earth coordinate, ground and parcel contracts. Maryland GIS is not worldwide parcel coverage. |
| Terrain, land use, parks/farms | `terrain/accepted-ground-runtime.js`, ground artifacts/provider registry, worldcover and ecological ground; elevation/land-cover/imagery | E/R; PARTIAL. Terrain source/coverage and ecology contracts. Farmland appearance is not a complete farming economy or arbitrary terrain excavation. |
| Roads and sidewalks | World compiler → final carriageway/pavement/contact publication; `street-pavement-runtime.js`, road cross-section profile | E; COMPONENT_VERIFIED. Pavement ownership, road geometry and source checks. No new road profile or width changes in consolidation. |
| Bridges and tunnels | `structure-semantics.js` → transport surface model; envelope owns physical limits, obstruction builder samples existing surfaces | E; COMPONENT_VERIFIED. C3 retains legacy export; 42 focused compiler/structure tests. Worldwide professional visual quality remains unverified. |
| Building coverage and near detail | `world/load-building-*`, building registry, facade/storefront modules; OSM/other attributed sources | E; COMPONENT_VERIFIED. Coverage, body geometry, facade, entrance tests; prior 49,080-building/18,952-road fixture. No thinning permitted. |
| Traveling regional scenery | `terrain/regional-building-runtime.js`, geographic ring and projected building data | R; PARTIAL. Scheduler, lifetime and appearance tests; scenery follows travel but detailed district gameplay does not. C6 worker readback preserves exact water-mask bytes; GPU preparation and full-world performance work remain. |
| Entrances and general interiors | `building-entry.js` → `interiors/runtime.js`; saved/OSM entrances and footprint layouts; collision and elevators | E/U; COMPONENT_VERIFIED. Interior, captured entry and stair authority tests; dimensions inferred where unmapped. |
| Museum | `interiors/gallery-runtime.js`, `museum-catalog.js`, exhibit Journal adapter | E/P; PARTIAL. Peale front-ground-floor interpretive route only; prior gallery/exit browser checks. No whole-museum replica claimed. |
| Aquarium | `interiors/aquarium-runtime.js`, water volumes, exhibit animals/lifts; building entry | E/P; PARTIAL. Pavilion/Blacktip Reef supported route; 33 prior functional checks; entry heap/stall budgets fail. |
| Functional POIs / services | `poi/`, `poi/semantic-authority.js`, supported commerce/interior family resolution | E/A/P; COMPONENT_VERIFIED. POI semantics/association/lifecycle and commerce contracts. Mapped business does not imply every real service. |
| Airports, ports and launch facilities | `transport/`, facility compiler/navigation, plane/boat/space adapters | E/M/S; PARTIAL. Facility/airport exclusion and worldwide airport contracts; mapped footprints with inferred furnishings, not replicas of every facility. |
| Living world, traffic, pedestrians | `living-world/runtime.js`, navigation graphs, wildlife and vegetation render owners | E; COMPONENT_VERIFIED. Graph/contact/obstacle and lifecycle tests. Bounded simulation; no autonomous global society established. |
| Featured locations / landmarks | `world/landmark-catalog.js`, `app/data/featured-landmarks.json`, accepted source metadata | E; IMPLEMENTED_UNVERIFIED. Catalog/placement checks do not validate every landmark alignment or appearance. |

## Travel and simulation

| System / player route | Source owner and dependencies | Contract; status; evidence / limits |
| --- | --- | --- |
| Walking, running, jumping, contextual use | `walking/`, `physics/`, `interaction/context-router.js`; current surface/actor | E/U; COMPONENT_VERIFIED. Actor/input/surface tests and inherited ship/deck routes. Camera/prompt and collision must stay under the active environment. |
| Cars and other road vehicles | `physics.js`, `travel-mode.js`, `transport/actor-contract.js`, urban vehicle runtime | E/A; COMPONENT_VERIFIED. Physics/camera/commerce tests plus new bounded driving smoke. No driving redesign. |
| Plane/helicopter and drone | `plane-mode.js`, `plane/`, transport and camera owners | E/U; COMPONENT_VERIFIED. Aviation/drone actor contracts, prior controls browser evidence. Flight can outrun provider loading. |
| Ocean research ship / smaller boats | `boat-mode/research/runtime.js`, vessel policy, walkable deck/interior and map | M; PARTIAL. Licensed hull/furnished rooms and prior steering/traversal pass; sea state/animation remain approximations. |
| Swimming / scuba | Walking-water adapters and ocean swimmer capability/depth policy | M; COMPONENT_VERIFIED. Swim/entry/depth tests; automatic equipment, bounded safe gameplay depth, no physical diving claim. |
| Submarine and recovery | `ocean.js`, voyage context, shared marine runtime and parent-vessel identity | M/A; COMPONENT_VERIFIED. Admission/recovery/lease tests and prior deck/sub/deck browser evidence. |
| Marine life / ocean streaming | `ocean/stream-runtime.js`, habitat/sighting/species rules, curated models and bathymetry | M/P; PARTIAL. Location/depth observations and streaming retention contracts. Whales/deep squid/spearfishing not implemented. |
| Fishing | `fishing/`, `fishing-game.js`, fish population/shore authority, Journal catch records | E/M/P; COMPONENT_VERIFIED. Shore/population/loss-recovery contracts. Ranged spearfishing is separate planned scope. |
| Space flight and Earth return | `space/journey-authority.js`, travel session, spacecraft authority, Wayfinder | S; COMPONENT_VERIFIED. Return/travel/session/destination tests; prior normal return captured a reCAPTCHA timeout, not a clean hosted pass. |
| Solis Reach / Pathfinder / expeditions | `expedition/command-authority.js`, `runtime.js`, `expedition/store.js`; generated server command engine | S/A/P; PARTIAL. Alpha ship/pod/surface loop; shared command parity checked. Art, consequences and research variety remain limited. |
| Planets, atmosphere, exoplanets | `planetary/runtime/surface-authority.js`, solid-world runtime, space atmospheric-descent owner | S/P; PARTIAL. Solid/gas-giant capability tests. Game scales and procedural detail, not complete planetary science. |
| Frame scheduling, pause and render ownership | `runtime/kernel.js`, simulation clock, `pause-state.js`, scene bootstrap/environment adapters | E/M/S; COMPONENT_VERIFIED. Simulation/session/pause/renderer tests. Existing frame-pacing failures remain despite correct bounded simulation time. |
| Assets and graphics resources | `assets/model-asset-runtime.js`, asset catalog, engine scene/WebGL lifecycle | E/M/S; COMPONENT_VERIFIED. Leases/skeleton/buffer release tests. No new asset rights or rendering budgets assumed; no asset removed. |

## Progress, creation and connected play

| System / route | Owner and data dependencies | Contract; status; evidence / limits |
| --- | --- | --- |
| Explorer character and equipment | `character/model.js`, progression, `player/backpack-store.js`, equipment runtime | P/A; COMPONENT_VERIFIED. Migrations, equipment/action and condition tests; local character vs account acknowledgments stay distinct. |
| Journal, Backpack, Field Guide, survey/geology | `discovery/profile-store.js`, runtime, `journal-index.js`, resource/field catalogs | P; COMPONENT_VERIFIED. Atomic transactions/backup/derived-order/source contracts; full cross-device Journal is not provided. |
| Campaigns / specialties / badges | `campaign/`, discovery event/reward projections | P; PARTIAL. First Bearings, Harbor Run, Three Views, workspace, coastal and lunar routes implemented; every proposed career is not a full campaign. |
| Companions | `discovery/companion-runtime.js`, catalog/progression, vehicle/home adapters | P/E/M/S; COMPONENT_VERIFIED. C8 stable-target and latest-row care tests, including native IndexedDB reload/replay/failure, pass; broad all-species/all-device acceptance remains unrun. |
| Shops, wallet, services, supplies | `urban-sandbox/commerce-model.js`, connected wallet, `functions/economy-authority.js` | A/P; COMPONENT_VERIFIED. C1/C2 account lifetime plus C5 durable recovery/C8 effect targets pass; authenticated emulator concurrency and cross-day receipts pass. Server wallet projection is shared with property. Ordinary hosted acceptance remains separate. |
| Properties, home storage, trades | `game/property-ui.js`, housing model, connected property, `functions/property-authority.js` | A/P; COMPONENT_VERIFIED. C1/C2, real emulator transactions and twelve fresh immutable two-account browser checks pass; Maryland parcel provenance. No real-estate rights granted. |
| Quick Build / shared Blocks | `block-builder/`, `blocks.js`, local-store/shared sync, room rule validation | P/A/E/S; COMPONENT_VERIFIED. Block storage/sync/planetary placement tests. Arbitrary destruction/terrain editing is not implied. |
| Editable world / persistent rooms | `editable-world/runtime.js`, local store and room membership | P/A/E; PARTIAL. Existing supported object edits persist; global collaborative editable terrain is not implemented. |
| Multiplayer, presence, chat and room vehicles | `multiplayer/`, room admission, urban room authority | A/E; COMPONENT_VERIFIED. Fresh room/session/rules and full-world two-player shared object/vehicle/chat emulator journeys pass. Bounded rooms; no MMO claim. |
| Shared marine and shared expeditions | `ocean/shared-marine-runtime.js`, lease authority, `functions/marine-expedition-authority.js`, expedition authority | A/M/S; COMPONENT_VERIFIED. Server-relative lease/backpressure/generation tests and fresh shared-expedition browser recovery pass; public network/device verification remains distinct. |
| Mini-games, casual boards | Flower, Paint Town, fishing, DeFlock modules; game result save state | P/A/U; COMPONENT_VERIFIED. Selected rule/result tests. Player-reported casual results, not independently simulated competitive scores. |
| Local saves / imports / rollback | Local-save session, Journal, Backpack, condition outbox, voyage/expedition stores | P/M/S/A; COMPONENT_VERIFIED. Prior compatible package roundtrip plus current component contracts. No destructive migration; additive commerce intent/delivery fields retain old records. |
| Accounts, billing, entitlements, deletion | `account/account-center.js`, `js/auth-ui.js`, `js/billing.js`, Functions account handlers | A/U; IMPLEMENTED_UNVERIFIED. Fresh isolated account-concurrency/cleanup/billing fixture checks pass; full ordinary sign-in/payment/deletion walkthrough not rerun. No live account deletion/payment performed. |

## Data, contributions and product surfaces

| System / route | Owner / source / authority | Contract; status; evidence / limits |
| --- | --- | --- |
| Providers and Live Earth | `geospatial/provider-registry.js`, `live-earth/registry.js`, Functions environment/geospatial/place modules | E/U/A; COMPONENT_VERIFIED. Bounded caches/retry/cancellation and provider contracts; observations/models/freshness remain distinct. Live external availability is not certified by mocks. |
| Public cameras and imagery | Public camera directory/favorites, imagery provider APIs and public embeds | U/P; PARTIAL. Catalog-backed live/still sources; worldwide coverage and every camera availability not guaranteed. |
| Weather, sky, water evidence | `weather/`, `sky/`, `world/water-environment.js`; MET/NOAA/HYCOM/USGS and other attributed feeds | E/M/U; COMPONENT_VERIFIED. Provider contracts preserve unknowns; prior live availability varies. No paid provider introduced. |
| Live GPS | `live-gps/field-session-authority.js`, foreground sensor and location owner | E/U; IMPLEMENTED_UNVERIFIED. Sensor-fixture contracts do not establish physical phone accuracy, permissions or resume. |
| AR / camera / WebXR | `ar/session-service.js`, capability/eligibility, capture session | U; IMPLEMENTED_UNVERIFIED. Lifecycle fixtures; physical device/camera-world alignment unverified here. |
| Manual photo/interior contributions | `app/capture.html`, `app/survey.html`, `reality-capture/`, account contribution workspace | P/A/U; COMPONENT_VERIFIED. Local draft, revision, upload, access and placement contracts. Automatic full reconstruction remains a development path. |
| Capture publication, private assets, moderation | Functions capture authority, upload validation/storage privacy, Firestore/Storage rules, admin UI | A; COMPONENT_VERIFIED. Fresh HTTP/emulator/private-Storage/Firestore rule checks pass; full ordinary hosted private-grant/revoke journey not repeated. Never infer authorization from UI visibility. |
| Menus, HUD, onboarding, mobile controls | `ui/`, `hud/`, `tutorial/`, controls/action router, DOM state | U; COMPONENT_VERIFIED. Layout/input/accessibility contracts and prior phone-layout checks. Physical device/assistive-technology acceptance remains open. |
| Analytics and support diagnostics | `js/analytics-consent.js`, analytics service/session; bounded runtime support receipt | U/A; COMPONENT_VERIFIED. Consent/session/error contract checks, prior controlled collection. Production delivery and acquisition analytics not measured here. |
| Landing, project page, release media | `index.html`, `github-pages/`, public gallery manifest, release notes | U; COMPONENT_VERIFIED. Prior 22-file/19-image live hash verification; source 5.6 differs from deployed app 5.5. |
| Packaging, CI and deployments | Runtime dependency inventory, hosting artifact/fingerprint, release matrix and promotion scripts | A; COMPONENT_VERIFIED. Full source suite and two separate immutable staging builds pass; production dist/rollback packages preserved, no deploy in this task. |

No row is labeled `VERIFIED_END_TO_END` or `CONSOLIDATED_AND_VERIFIED` for the entire subsystem: the retained performance and cross-account/hosted/device classes prevent that claim. The completed changes are narrower boundaries described in CHANGE-LEDGER.

## Final follow-up census

Fresh AST census after C8: **1,110 modules / 227,966 lines / 66 source groups**,
167 direct context importers and 121 direct writer modules. Zero resolved static
cycles. All scanned modules appear exactly once in
`output/architecture-consolidation/2026-10-13/completed-module-census.json`;
the import/event/persistence/access records are in `completed-inventory/inventory.json`.
The three added runtime modules since C1–C3 are the commerce recovery owner,
water-mask reader and disposable worker. This exhaustive file census does not
turn the subsystem tables into exhaustive per-action acceptance. The final
packaged companion/profile/reload journey passes five checks; no page errors or
failed local assets, with inspected wide/narrow touch-capable Chrome screenshots.
