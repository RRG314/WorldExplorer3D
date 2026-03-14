# Architecture

Last reviewed: 2026-03-13

System topology for gameplay runtime, multiplayer state, account/donations, and security boundaries.

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
- world/render: `engine.js`, `world.js`, `terrain.js`, `surface-rules.js`, `sky.js`, `space.js`, `solar-system.js`
- controls/physics: `input.js`, `physics.js`, `walking.js`, `travel-mode.js`, `hud.js`, `map.js`
- gameplay systems: `game.js`, `flower-challenge.js`, `blocks.js`, `memory.js`, `real-estate.js`
- UI orchestration: `ui.js`, `ui/globe-selector.js`, `tutorial/tutorial.js`

Current Earth runtime architecture details:

- `world.js` owns safe spawn resolution for teleports, geolocation/custom launches, and traversal switching.
- `travel-mode.js` owns high-level drive/walk/drone transitions so keyboard and float-menu mode switches follow the same runtime path.
- Canonical landing/account sources live at `index.html` and `account/index.html`; `npm run sync:public` mirrors those plus `app/*` into `public/*`.
- `world.js` owns the Earth OSM pipeline for roads/buildings/land-use/water plus vegetation staging data (`natural=tree`, `natural=tree_row`, woods/parks/green areas).
- `surface-rules.js` owns shared climate/ground-cover classification so terrain, water, and OSM landuse rendering use the same snow/frozen-water/arid-sand rules.
- Driveable roads stay isolated in `roads`; OSM transport ribbons flow through `linearFeatures` (`railway`, `footway`, `cycleway`).
- `world.js` dedupes identical in-flight Earth loads and only rebuilds `traversalNetworks` after explicit invalidation, which prevents empty early graphs from sticking around after roads arrive.
- `terrain.js` is the single owner for road/building terrain conformance through `requestWorldSurfaceSync()`, which schedules or forces rebuilds instead of letting other modules rebuild roads/buildings ad hoc.
- `building-entry.js` is the shared support resolver for regular buildings plus real-estate/historic destinations; it normalizes exterior footprint, entry anchor, synthetic fallback support, and legend/navigation metadata into one model.
- `interiors.js` is a dormant-on-boot subsystem: it only activates for the one supported building the player deliberately enters, prefers OSM indoor geometry when it is ready, falls back to a generated enclosed interior when it is not, and releases that state on exit. Prompt/candidate checks are throttled so walking near buildings does not trigger redundant scans every frame.

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
- `flowerLeaderboard`
- `paintTownLeaderboard`
- `activityFeed`
- `explorerLeaderboard`

### 6.2 Key subcollections

- user: `friends`, `recentPlayers`, `incomingInvites`, `myRooms`
- room: `players`, `chat`, `chatState`, `artifacts`, `blocks`, `paintClaims`, `state`

### 6.3 Rule domains

- self-user document ownership
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
