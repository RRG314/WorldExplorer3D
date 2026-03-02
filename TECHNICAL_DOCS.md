# Technical Documentation

Last reviewed: 2026-03-02

Engineering reference for module contracts, data flow, storage keys, APIs, and validation workflows.

## 1. Source-of-Truth Paths

Canonical runtime:

- `app/index.html`
- `app/js/*`

Hosted mirror:

- `public/app/index.html`
- `public/app/js/*`

Mirror workflow:

```bash
npm run sync:public
npm run verify:mirror
```

## 2. Boot and Runtime Contracts

### 2.1 Boot path

- `app/js/bootstrap.js`:
  - loads vendor scripts
  - imports app entrypoint
  - starts optional post-processing bootstrap
- `app/js/app-entry.js`:
  - `bootApp()` initializes engine/UI/tutorial/multiplayer/auth observer

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
- tutorial event emission bridge
- mobile virtual control orchestration
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

