# Architecture

Last reviewed: 2026-03-27

System topology for gameplay runtime, streaming, traversal, backend services, and validation boundaries.

Current verified branch status lives in [docs/BRANCH_STATUS.md](docs/BRANCH_STATUS.md). This file explains ownership, not day-by-day audit history.

## 1. System Topology

### Frontend surfaces

- Landing: `index.html`
- App runtime: `app/index.html` + `app/js/*`
- Account center: `account/index.html`
- Legal/content: `about/*`, `legal/*`
- Hosting mirror: `public/*`

### Backend services

- Firebase Authentication
- Cloud Firestore
- Cloud Functions (`functions/index.js`)
- Stripe Checkout/Portal/Webhook

## 2. Runtime Layering

### 2.1 Boot and load chain

- `app/js/bootstrap.js`
- `app/js/modules/manifest.js`
- `app/js/modules/script-loader.js`
- `app/js/app-entry.js`

Flow:

1. load critical vendor scripts
2. import app module entrypoint
3. initialize engine/UI/tutorial/multiplayer
4. start render loop

### 2.2 Core app runtime

- state/context: `shared-context.js`, `state.js`
- world/render: `engine.js`, `world.js`, `terrain.js`, `surface-rules.js`, `earth-location.js`, `astro.js`, `sky.js`, `weather.js`, `space.js`, `solar-system.js`
- controls/physics: `input.js`, `physics.js`, `walking.js`, `travel-mode.js`, `boat-mode.js`, `hud.js`, `map.js`
- gameplay systems: `game.js`, `flower-challenge.js`, `blocks.js`, `memory.js`, `real-estate.js`
- editor systems: `editor/config.js`, `editor/public-layer.js`, `editor/session.js`, `editor/store.js`
- account/admin moderation surface: `account/moderation.html`, `js/contribution-api.js`, `js/function-api.js`
- UI orchestration: `ui.js`, `ui/globe-selector.js`, `tutorial/tutorial.js`

Continuous-world runtime ownership:

- `continuous-world-runtime.js` owns runtime-level state, region lifetime, and rebasing decisions
- `continuous-world-region-manager.js` owns region keys and coverage bookkeeping
- `continuous-world-feature-manager.js` and `continuous-world-feature-ownership.js` own streamed feature identity and retirement
- `world.js` remains the Earth load/stream orchestrator that decides what to fetch and when
- `terrain.js` owns terrain conformance and road/building surface sync scheduling
- `main.js` owns the fixed-step update and render cadence
- `physics.js` owns traversal motion
- `hud.js` owns camera follow behavior

Current Earth runtime architecture details:

- `world.js` owns safe spawn resolution for teleports, geolocation/custom launches, and traversal switching.
- `travel-mode.js` owns high-level drive/walk/drone transitions so keyboard and float-menu mode switches follow the same runtime path.
- `boat-mode.js` adds a fourth Earth traversal lane on top of that shared mode controller. It detects valid large-water entry candidates from loaded water polygons/waterways, owns deliberate enter/exit behavior, supports intentional auto-entry from water-targeted teleports/custom launches, applies lightweight smoothed wave response, and feeds water-kind-aware offshore detail bias back into `world.js`.
- Canonical landing/account sources live at `index.html` and `account/index.html`; `npm run sync:public` mirrors those plus `app/*` into `public/*`.
- `world.js` owns the Earth OSM pipeline for roads/buildings/land-use/water plus vegetation staging data (`natural=tree`, `natural=tree_row`, woods/parks/green areas).
- `surface-rules.js` owns shared climate/ground-cover classification so terrain, water, and OSM landuse rendering use the same snow/frozen-water/arid-sand rules. It now layers precise rendered OSM polygons first, cached raw surface-feature hints second, and only then broader sparse-area fallback rules.
- `astro.js` owns the lightweight astronomical math for sun position, moon position, moon illumination/phase, and sidereal-time alignment.
- `sky.js` owns Earth-relative sky state generation and applies cached astronomical updates to lighting, fog, exposure, star visibility, and moon appearance based on the current explored coordinates.
- `earth-location.js` owns the observed Earth lat/lon resolver used by both the astronomical sky system and live weather lookups, so drive/walk/drone/ocean location state stays consistent across environment systems.
- `weather.js` owns live weather fetch/caching, manual weather override state, HUD weather summaries, and lightweight weather-driven presentation adjustments layered on top of the astronomical sky state. The current pass keeps that response in shared sky, fog, cloud, and light tuning rather than adding separate boxed-in weather geometry.
- `hud.js` consumes the shared `skyState` so sun, moon, fill light, and cloud placement stay visually aligned without duplicating fake per-frame sky math.
- Driveable roads stay isolated in `roads`; OSM transport ribbons flow through `linearFeatures` (`railway`, `footway`, `cycleway`).
- `world.js` dedupes identical in-flight Earth loads and only rebuilds `traversalNetworks` after explicit invalidation, which prevents empty early graphs from sticking around after roads arrive.
- `terrain.js` is the single owner for road/building terrain conformance through `requestWorldSurfaceSync()`, which schedules or forces rebuilds instead of letting other modules rebuild roads/buildings ad hoc.
- `terrain.js` now also owns the shared procedural sidewalk batch for loaded urban corridors. It rebuilds sidewalks with the road terrain-follow pass, tapers widths near intersections/building edges, and keeps sidewalks in one streamed batch instead of becoming a separate always-on layered floor.
- `main.js` keeps sky and weather updates on low-frequency cached refresh paths instead of recalculating or refetching every frame, and `ocean.js` reuses that same Earth-relative environment path when Ocean mode is active near a real-world launch site.
- `physics.js` short-circuits into the boat update path while boating, so land vehicle physics do not keep running at full cost under water travel.
- `building-entry.js` is the shared support resolver for regular buildings plus real-estate/historic destinations; it normalizes exterior footprint, entry anchor, synthetic fallback support, and legend/navigation metadata into one model.
- `interiors.js` is a dormant-on-boot subsystem: it only activates for the one supported building the player deliberately enters, prefers OSM indoor geometry when it is ready, falls back to a generated enclosed interior when it is not, and releases that state on exit. Prompt/candidate checks are throttled so walking near buildings does not trigger redundant scans every frame.
- `editor/config.js` centralizes contribution-type definitions so payload fields, marker styles, and target requirements stay in one place instead of being duplicated across UI/store/public-layer code.
- `editor/session.js` is dormant on boot: editor controls only appear after the user intentionally opens the contributor workflow. It owns draft capture, type-aware metadata fields, private preview geometry, and the in-app moderation detail flow.
- `editor/store.js` now uses protected backend endpoints for submission and review writes, while still listening to owner/admin/public Firestore reads for isolated session visibility.
- `editor/public-layer.js` is a separate approved-contribution lane. It only reads nearby approved submissions and renders them as markers; it does not modify the base world data lanes.
- `account/moderation.html` is the plain-language owner/admin workflow. It stays outside the runtime world UI and uses admin-gated backend endpoints for queue loading, moderation actions, and notification status.

## 3. Multiplayer Architecture

### 3.1 Module map (`app/js/multiplayer/*`)

- `rooms.js`: room lifecycle, saved rooms, home base, room settings
- `presence.js`: player heartbeat/pose writes and reads
- `ghosts.js`: remote player proxy rendering + smoothing
- `chat.js`: room chat and report/safety handling
- `social.js`: friends/invites/recent players
- `artifacts.js`: room artifacts CRUD/listen
- `blocks.js`: shared block CRUD/listen
- `painttown.js`: paint claim sync
- `loop.js`: weekly room helpers, activity/leaderboard
- `ui-room.js`: UI orchestration and cross-module wiring

### 3.2 Data ownership model

- Room owner controls room updates/deletion.
- Room members can participate in allowed room subcollections.
- Saved room records are user-owned (`users/{uid}/myRooms`).
- Public room read access is broader than private room access.
- Editor submissions are staged in their own collection and never directly overwrite live world data.
- Contribution writes are server-owned: client submission and moderation actions go through Cloud Functions, not raw browser-side Firestore writes.
- Pending/rejected editor submissions are owner/admin-visible only.
- Approved editor submissions are publicly readable and rendered through a dedicated contribution layer.
- Approved contribution reads stay area-scoped through `areaKey` buckets, so the public contribution layer can scale without loading global submission state.

### 3.3 Presence/ghost model

- Periodic presence writes with throttling.
- Client stale filtering + expiresAt semantics.
- Remote entities rendered as mode-specific proxies (walk/car/drone/space).

## 4. Location and Tutorial Architecture

### 4.1 Globe selector

- Interactive Earth pick and search/coordinate fallback.
- Reverse geocode pipeline with cache and fallback provider.
- Favorites split into preset and user-saved groups.
- Saved favorites persisted in browser local storage.
- Final placement is validated through the shared safe spawn resolver before the player is committed to the world.

### 4.2 Tutorial

- Stage machine persisted per browser.
- Event-driven progression from runtime events (mode changes, room actions, build actions).
- Completion state suppresses future automatic re-showing.

## 5. Account and Billing Architecture

### 5.1 Client modules

- `js/auth-ui.js`: auth providers and auth token helpers
- `js/entitlements.js`: user profile/plan normalization
- `js/billing.js`: authenticated HTTPS function calls
- `account/index.html`: account UI and social controls

### 5.2 Functions API

- callable over HTTPS with bearer auth
- CORS allowlist enforcement
- Stripe customer ownership verification
- webhook-driven plan synchronization to Firestore
- donations/status surfaces are informational only for normal runtime access; map/core traversal are not entitlement-gated

## 6. Firestore and Security Architecture

### 6.1 Primary collections

- `users`
- `rooms`
- `editorSubmissions`
- `flowerLeaderboard`
- `paintTownLeaderboard`
- `activityFeed`
- `explorerLeaderboard`

### 6.2 Key subcollections

- user: `friends`, `recentPlayers`, `incomingInvites`, `myRooms`
- room: `players`, `chat`, `chatState`, `artifacts`, `blocks`, `paintClaims`, `state`

### 6.3 Rule domains

- self-user document ownership
- staged editor submission ownership + admin moderation
- approved-only public visibility for contribution records
- room visibility/member/owner/mod checks
- room create quota coupling (`roomCreateCount`, `roomCreateLimit`)
- strict schema validation for room/player/chat/social payloads
- chat anti-spam transition validation

## 7. Deployment Architecture

### Firebase Hosting

- root: `public`
- rewrite forwarding to functions for account/billing routes
- legal rewrites

### GitHub Pages compatibility

- branch-root serving supported for landing/app routes
- still depends on Firebase backend services

## 8. Validation Architecture

- mirror parity: `scripts/verify-mirror.mjs`
- rules suite: `scripts/test-rules.mjs`, `tests/firestore.rules.security.test.mjs`
- runtime invariants: `scripts/test-runtime-invariants.mjs`
- broader world matrix: `scripts/test-world-matrix.mjs`, `scripts/world-test-locations.mjs`
- release gate: `scripts/release-verify.mjs`
