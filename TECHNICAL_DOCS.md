# Technical Documentation

Last reviewed: 2026-03-13

Engineering reference for module contracts, data flow, storage keys, APIs, and validation workflows.

## 1. Source-of-Truth Paths

Canonical runtime:

- `index.html`
- `account/index.html`
- `app/index.html`
- `app/js/*`

Hosted mirror:

- `public/index.html`
- `public/account/index.html`
- `public/app/index.html`
- `public/app/js/*`

Mirror workflow:

```bash
npm run sync:public
npm run verify:mirror
```

The sync step also mirrors the repository `CNAME` file into `public/CNAME`, so each Pages deployment carries the `worldexplorer3d.io` custom-domain binding alongside the mirrored runtime.

## 2. Boot and Runtime Contracts

### 2.1 Boot path

- `app/js/bootstrap.js`:
  - loads the core Three.js vendor script first, then parallel-loads dependent loader scripts
  - imports app entrypoint
  - starts optional post-processing bootstrap with optional scripts loaded off the critical path
- `app/js/app-entry.js`:
  - `bootApp()` initializes engine/UI/tutorial/multiplayer/auth observer
  - imports `interiors.js` so the lazy indoor subsystem is available before input/runtime updates
  - imports `travel-mode.js` so drive/walk/drone transitions are centralized before keyboard/UI handlers bind
  - `surface-rules.js` is consumed by `terrain.js` and `world.js` to keep climate/ground-cover rules shared instead of duplicating snow/water/desert logic

### 2.2 Render path

`app/js/main.js`:

- `renderLoop(t)`
- `showLoad(text, options)`
- `hideLoad()`
- `showTransitionLoad(mode, durationMs)`
- overlay positioning helpers

## 3. UI Contracts

### 3.1 Main UI (`app/js/ui.js`)

Responsibilities:

- title tabs and location/game mode selection
- launch gating for custom location via globe selector
- shared safe spawn handoff for geolocation/custom launches and in-game custom-location reloads
- tutorial event emission bridge
- mobile virtual control orchestration (`WASD`-move / arrow-look for walk+drone)
- keyboard routing keeps `M` as the large-map key and `F4` as a debug-overlay toggle
- in-game float menu wiring
- return-to-main-menu flow reset

Notable runtime flags:

- `skipGlobeGateOnce`
- `titleLaunchMode`
- persisted last location state key (local storage)

### 3.2 Globe selector (`app/js/ui/globe-selector.js`)

Factory:

- `createGlobeSelector(options)`

Important behaviors:

- `open()`, `close()`, `isOpen()`, `getSelection()`
- `onStartHere(selection)` callback for spawn handoff
- favorites storage key: `worldExplorer3D.globeSelector.savedFavorites`
- max saved favorites: `10`
- grouped list rendering:
  - preset cities
  - saved favorites (deletable)
- reverse lookup with cache + fallback provider
- zoom-aware marker scaling

## 3.3 World and spawn safety (`app/js/world.js`, `app/js/walking.js`, `app/js/travel-mode.js`, `app/js/terrain.js`)

Key runtime contracts:

- `resolveSafeWorldSpawn(x, z, options)`:
  - validates direct walk/drive placement
  - preserves valid positions during traversal switches
  - falls back to nearest safe ground or road when the requested point is blocked
- `applyResolvedWorldSpawn(spawn, options)`:
  - synchronizes car/walker state from the resolved placement
- `applyCustomLocationSpawn(mode, options)`:
  - shared entry for globe selector, geolocation, and in-game custom-location reloads
- `loadRoads()`:
  - dedupes identical in-flight Earth load requests so multiple UI/custom launch paths do not rebuild the same location at once
- `requestWorldSurfaceSync(options)`:
  - single owner for road/building terrain-follow rebuild scheduling and forced syncs

Data lanes kept separate on Earth scenes:

- driveable road network: `roads`, `roadMeshes`
- vegetation lane: `vegetationFeatures`, `vegetationMeshes`
  - populated from OSM landuse/natural green areas plus `natural=tree` nodes and `natural=tree_row` ways
  - batched into instanced tree meshes instead of per-tree scene groups
- deferred OSM linear path ribbons: `linearFeatures`, `linearFeatureMeshes`
  - `railway`
  - `footway`
  - `cycleway`
  - the subsystem remains in the codebase but is currently disabled in runtime while load, switching, and water regressions are being cleaned up
  - arrays stay empty in the active build, and the map/environment path toggles are hidden
- traversal graphs: `traversalNetworks.drive` and `traversalNetworks.walk`
  - drive graph stays road-only
  - walk graph currently stays road-backed as well
  - traversal graphs rebuild only after explicit invalidation, which keeps empty early graphs from persisting once roads are loaded
  - `findTraversalRoute()` consumes the active graph for navigation and map route drawing
  - `GroundHeight.walkSurfaceY()` currently resolves against interiors, roads, and terrain only

Traversal/spawn guarantees in current branch:

- walk -> drive keeps the current position if it is already car-safe
- invalid walk -> drive transitions resolve to the nearest safe road spawn
- custom/geolocation launches validate placement before final spawn
- blocked walk launches resolve onto nearby safe road or terrain fallback instead of invalid blockers
- blocked spawn requests never intentionally place the player inside building/wall colliders
- non-road walk/drive spawn requests are rejected if they land inside mapped water polygons

Selective interior subsystem:

- `app/js/building-entry.js`
  - shared enterable-building resolver used by both normal exploration and real-estate/historic destinations
  - normalizes real building footprints, destination metadata, entry anchors, and synthetic fallback buildings into one support model
- `app/js/interiors.js`
  - runtime prompt + deliberate interaction path (`E`)
  - on-demand support resolution for the targeted nearby building only
  - prefers way-based indoor rooms / corridors plus entrance / door nodes when mapped
  - falls back to a generated enclosed interior from the exterior footprint when mapped indoor data is missing or slow
  - nearby-support scan for the large-map legend is also on-demand, limited, and footprint-filtered so it does not become a global always-on interior loader
  - generated and mapped interiors both stay aligned to an inset building envelope, use temporary local colliders, and expose interior floor meshes as placement targets for build blocks
- `app/js/ground.js`
  - `GroundHeight.walkSurfaceInfo()` now checks `sampleInteriorWalkSurface()` first while an interior is active
- `app/js/physics.js` / `app/js/walking.js`
  - keep interior prompts idle until needed
  - rely on cached/throttled nearby-building checks instead of rescanning and rewriting prompt DOM every frame
  - use collider `baseY` when evaluating temporary interior shell walls so the player stays inside the generated room volume instead of slipping out at terrain level
  - dynamic interior shell colliders are local-only and cleared on exit
  - active interiors also keep a last-valid indoor position so escape/leak cases get snapped back inside the interior envelope instead of wandering outside the shell

Water / terrain-follow notes:

- `app/js/surface-rules.js`
  - centralizes OSM land-cover normalization and climate surface rules
  - provides one shared world surface profile used by both terrain texturing and water rendering
  - current shared rules convert high-latitude Earth scenes to snow/frozen-water presentation and arid low-latitude sparse scenes to sand presentation without city-specific hardcoding
- `app/js/world.js`
  - water polygons/ribbons use the stable averaged surface base again so harbors/coastlines do not drop below exposed terrain after recent path/vegetation changes
  - computes `worldSurfaceProfile` from latitude plus selected OSM landuse/natural/waterway signals, then uses that to classify frozen water and arid land surfaces
- `app/js/terrain.js`
  - landuse reprojection restores water flattening/offset behavior from the previously stable branch
  - `requestWorldSurfaceSync()` now owns road/building terrain conformance updates, replacing duplicate rebuild triggers from walking mode
  - terrain tile texturing now follows the shared surface rules so snow/ice/desert visuals are driven by one climate-aware rule set instead of isolated terrain-only checks

## 4. Tutorial Contracts (`app/js/tutorial/tutorial.js`)

Storage key:

- `worldExplorer3D.tutorialState.v1`

Public API:

- `initTutorial(appContext)`
- `tutorialOnEvent(eventName, payload)`
- `tutorialUpdate(dt)`
- `setTutorialEnabled(enabled)`
- `restartTutorial()`

Completion semantics:

- `completed` state suppresses future automatic prompts
- shown stages tracked to avoid duplicate stage prompts

## 5. Multiplayer Module Contracts

### 5.1 Rooms (`app/js/multiplayer/rooms.js`)

Exports:

- `createRoom(options)`
- `joinRoomByCode(code, options)`
- `leaveRoom()`
- `listenRoom(roomId, callback)`
- `listenMyRooms(callback, options)`
- `listenOwnedRooms(callback, options)`
- `listOwnedRooms(options)`
- `updateRoomSettings(roomId, updates)`
- `setHomeBase(roomId, homeBase)`
- `listenHomeBase(roomId, callback)`
- `deleteOwnedRoom(roomCode)`
- `findPublicRoomsByCity(cityInput, options)`
- `findFeaturedPublicRooms(options)`
- `deriveRoomDeterministicSeed(roomLike)`
- `getCurrentRoom()`

Notable constraints:

- room code length: 6
- room visibility: `private|public`
- max players normalized to 2..32
- room create policy tied to user quota fields

### 5.2 Presence (`app/js/multiplayer/presence.js`)

Exports:

- `startPresence(roomId, getPoseFn)`
- `stopPresence()`
- `listenPlayers(roomId, callback)`

Features:

- stale/expired presence filtering
- write-throttle and movement thresholds
- normalized pose/frame payloads

### 5.3 Ghosts (`app/js/multiplayer/ghosts.js`)

Export:

- `createGhostManager(scene, options)`

Features:

- mode-specific proxy meshes
- interpolation + extrapolation
- teleport clamping and lifecycle cleanup

### 5.4 Chat (`app/js/multiplayer/chat.js`)

Exports:

- `sendMessage(roomId, text)`
- `listenChat(roomId, callback)`
- `reportMessage(roomId, messageId, reason)`
- `CHAT_MAX_LENGTH`

Policy:

- max length 500
- safety filters for links/contact patterns
- client + server rate limiting

### 5.5 Social (`app/js/multiplayer/social.js`)

Exports:

- `addFriend`, `removeFriend`
- `sendInviteToFriend`
- `listenFriends`, `listenIncomingInvites`, `listenRecentPlayers`
- `markInviteSeen`, `dismissInvite`
- `recordRecentPlayers`

### 5.6 Shared room state modules

- Artifacts: `createArtifact`, `listenArtifacts`, `removeArtifact`
- Shared blocks: `upsertSharedBlock`, `removeSharedBlock`, `clearMySharedBlocks`, `listenSharedBlocks`
- Paint claims: `upsertPaintClaim`, `listenPaintClaims`
- Loop utilities: weekly city/room helpers, activity feed, leaderboard

### 5.7 Multiplayer UI platform (`app/js/multiplayer/ui-room.js`)

Export:

- `initMultiplayerPlatform(options)`

Returned API:

- `setAuthUser(user)`
- `openRoomPanel()`
- `closeRoomPanel()`
- `joinRoomByCode(code)`
- `createRoom()`
- `leaveRoom()`
- `getCurrentRoom()`

## 6. Account/Billing Contracts

### 6.1 Auth (`js/auth-ui.js`)

- `ensureSignedIn()`
- `signInWithGoogle()`
- `signInWithEmailPassword(email, password)`
- `signUpWithEmailPassword(email, password, displayName)`
- `signOutUser()`
- `observeAuth(callback)`
- `getCurrentUserToken(forceRefresh)`

### 6.2 Entitlements (`js/entitlements.js`)

- `ensureEntitlements(user, options)`
- `subscribeEntitlements(callback)`
- normalizes plan, room quotas, admin claim status
 - donations are recognition/status only for current core runtime access; map/gameplay are not gated

### 6.3 Billing client (`js/billing.js`)

Function call wrappers:

- `createCheckoutSession(plan)`
- `createPortalSession()`
- `redirectToCheckout(plan)`
- `redirectToPortal()`
- `getAccountOverview()`
- `listBillingReceipts(options)`
- `updateAccountProfile(displayName)`
- `startTrial()`
- `enableAdminTester()`
- `deleteAccount()`

## 7. Cloud Functions API Contracts

File: `functions/index.js`

Endpoints:

- `createCheckoutSession`
- `createPortalSession`
- `startTrial` (legacy)
- `enableAdminTester`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `deleteAccount`
- `stripeWebhook`

Environment/param keys used by function logic:

- `WE3D_STRIPE_SECRET`
- `WE3D_STRIPE_WEBHOOK_SECRET`
- `WE3D_STRIPE_PRICE_SUPPORTER`
- `WE3D_STRIPE_PRICE_PRO`
- `WE3D_ADMIN_ALLOWED_EMAILS`
- `WE3D_ADMIN_ALLOWED_UIDS`
- `WE3D_ALLOWED_ORIGINS`

## 8. Firestore Data + Rules Contracts

Rules file: `firestore.rules`

Validated domains:

- room creation quota coupling
- room schema and update schema
- player/presence schema + write throttle
- chat schema + chatState transition rules
- social/invite ownership rules
- saved room schema
- artifacts/blocks/claims/home base schema rules

Indexes file: `firestore.indexes.json` (city query and featured room query)

## 9. Test and Release Contracts

### 9.1 Commands

```bash
npm run test:rules
npm run test:runtime
npm run test:world-matrix
npm run verify:mirror
npm run release:verify
```

### 9.2 Scripts

- `scripts/test-rules.mjs`
- `scripts/test-runtime-invariants.mjs`
- `scripts/test-world-matrix.mjs`
- `scripts/world-test-locations.mjs`
- `scripts/verify-mirror.mjs`
- `scripts/release-verify.mjs`

### 9.3 Suites

- `tests/firestore.rules.security.test.mjs`
- `tests/painttown.integration.test.mjs`
- `scripts/test-runtime-invariants.mjs` validates spawn safety, lazy interiors, controls, water visibility, and donation/access behavior in the active Earth runtime
- `scripts/test-world-matrix.mjs` validates those world rules across dense downtown, coastal, mixed-terrain, sparse rural, suburban custom, and rural custom locations
