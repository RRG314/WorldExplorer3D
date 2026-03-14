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

## 3.3 World and spawn safety (`app/js/world.js`, `app/js/walking.js`)

Key runtime contracts:

- `resolveSafeWorldSpawn(x, z, options)`:
  - validates direct walk/drive placement
  - preserves valid positions during traversal switches
  - falls back to nearest safe ground or road when the requested point is blocked
- `applyResolvedWorldSpawn(spawn, options)`:
  - synchronizes car/walker state from the resolved placement
- `applyCustomLocationSpawn(mode, options)`:
  - shared entry for globe selector, geolocation, and in-game custom-location reloads

Data lanes kept separate on Earth scenes:

- driveable road network: `roads`, `roadMeshes`
- vegetation lane: `vegetationFeatures`, `vegetationMeshes`
  - populated from OSM landuse/natural green areas plus `natural=tree` nodes and `natural=tree_row` ways
  - batched into instanced tree meshes instead of per-tree scene groups
- walk-traversable OSM linear ribbons: `linearFeatures`, `linearFeatureMeshes`
  - `railway`
  - `footway`
  - `cycleway`
  - rendered as solid terrain-following ribbons and reused by walk-surface sampling
  - visual overlay starts disabled by default while traversal/pathfinding still use the loaded data
  - fetched in a follow-up Earth pass after the core world is ready, so recent path-network expansion does not block the initial road/building/water load
- traversal graphs: `traversalNetworks.drive` and `traversalNetworks.walk`
  - drive graph stays road-only
  - walk graph starts with roads, then expands once the deferred `railway` / `footway` / `cycleway` pass completes
  - `findTraversalRoute()` consumes the active graph for navigation and map route drawing
  - `GroundHeight.walkSurfaceY()` samples those path surfaces so walking, safe-spawn fallback, and walk navigation stay glued to the rendered ribbon instead of raw terrain when a path is present

Traversal/spawn guarantees in current branch:

- walk -> drive keeps the current position if it is already car-safe
- invalid walk -> drive transitions resolve to the nearest safe road spawn
- custom/geolocation launches validate placement before final spawn
- blocked walk launches can resolve onto nearby walkable paths instead of only raw terrain
- blocked spawn requests never intentionally place the player inside building/wall colliders

Selective interior subsystem:

- `app/js/interiors.js`
  - runtime prompt + deliberate interaction path (`E`)
  - on-demand Overpass indoor fetch for the targeted nearby building only
  - supports way-based indoor rooms / corridors plus entrance / door nodes when mapped
  - builds a single best-mapped floor lazily and tears it back down on exit
  - nearby-support scan for the large-map legend is also on-demand, limited, and footprint-filtered so it does not become a global always-on interior loader
- `app/js/ground.js`
  - `GroundHeight.walkSurfaceInfo()` now checks `sampleInteriorWalkSurface()` first while an interior is active
- `app/js/physics.js` / `app/js/walking.js`
  - keep interior prompts idle until needed
  - use collider `baseY` when evaluating temporary interior shell walls so the player stays inside the generated room volume instead of slipping out at terrain level
  - dynamic interior shell colliders are local-only and cleared on exit

Water / terrain-follow notes:

- `app/js/world.js`
  - water polygons/ribbons use the stable averaged surface base again so harbors/coastlines do not drop below exposed terrain after recent path/vegetation changes
  - footway / cycleway ribbons sample each edge against terrain/road height instead of reusing a single centerline elevation, which keeps them flush with streets and steep ground
- `app/js/terrain.js`
  - landuse reprojection restores water flattening/offset behavior from the previously stable branch
  - linear-feature reprojection now resamples left/right edges independently, reducing floating path strips on sloped roads

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
npm run verify:mirror
npm run release:verify
```

### 9.2 Scripts

- `scripts/test-rules.mjs`
- `scripts/test-runtime-invariants.mjs`
- `scripts/verify-mirror.mjs`
- `scripts/release-verify.mjs`

### 9.3 Suites

- `tests/firestore.rules.security.test.mjs`
- `tests/painttown.integration.test.mjs`
