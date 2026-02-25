# Technical Documentation

Last reviewed: 2026-02-25

Engineering reference for runtime modules, multiplayer behavior, rules, and test flow.

## 1. Source-of-Truth Code Paths

Primary gameplay source:

- `app/index.html`
- `app/js/*`

Compatibility/mirror paths:

- root compatibility loader: `js/*`
- Firebase hosting mirror: `public/*`

When changing behavior, update `app/*` first and keep mirrored paths aligned.

## 2. Module Contracts

### 2.1 Boot and loading

- `app/js/bootstrap.js` -> vendor loader + module entrypoint import
- `app/js/modules/manifest.js` -> cache-bust and script manifest
- `app/js/app-entry.js` -> boot contract, auth observer, multiplayer init

### 2.2 Multiplayer contracts

`app/js/multiplayer/rooms.js`

- `createRoom(options)`
- `joinRoomByCode(code)`
- `leaveRoom()`
- `listenRoom(roomId, callback)`
- `listenMyRooms(callback)`
- `listenOwnedRooms(callback)`
- `deleteOwnedRoom(roomCode)`
- `deriveRoomDeterministicSeed(roomLike)`

`app/js/multiplayer/presence.js`

- `startPresence(roomId, getPoseFn)`
- `stopPresence()`
- `listenPlayers(roomId, callback)`

Timing constants:

- heartbeat: `3000ms`
- min write interval: `2000ms`
- movement threshold: `1.0m`
- rotation threshold: `0.08 rad`

`app/js/multiplayer/ghosts.js`

- `createGhostManager(scene, options)`

Current behavior:

- mode-based remote proxies (character/car/drone/space)
- velocity extrapolation
- damped interpolation and yaw smoothing
- teleport distance clamp
- 30 FPS ghost tick budget

`app/js/multiplayer/chat.js`

- `sendMessage(roomId, text)`
- `listenChat(roomId, callback)`
- `reportMessage(roomId, messageId, reason)`

Spam/safety controls:

- max length: 500
- client interval/burst/duplicate gates
- server interval/burst gates via `chatState`
- contact/link pattern blocking
- profanity masking

`app/js/multiplayer/social.js`

- `addFriend`, `removeFriend`
- `sendInviteToFriend`
- `listenFriends`, `listenIncomingInvites`, `listenRecentPlayers`
- `markInviteSeen`, `dismissInvite`

`app/js/multiplayer/ui-room.js`

- multiplayer panel wiring
- saved-room list rendering and open/delete handlers
- chat drawer wiring
- entitlement checks + invite trial path

## 3. Paint the Town Runtime Notes

Main implementation: `app/js/game.js`.

State highlights:

- `paintballs[]`
- `paintSplats[]`
- `claimsByKey`
- `colorCounts`

Input highlights:

- `Ctrl`/`G`/`P` fire paintball
- `1-6` color select
- `T` tool toggle
- pointer/touch paint by active tool and room rule

Physics/perf highlights:

- projectile arc with gravity
- max active paintballs cap
- splat lifetime cleanup
- multiplayer claim publish hook

## 4. Account and Billing Technical Notes

Frontend modules:

- `js/auth-ui.js`
- `js/entitlements.js`
- `js/billing.js`
- `js/firebase-init.js`

Account page:

- `account/index.html` (module script section wires auth/entitlements/billing/social)

Functions backend:

- `functions/index.js`

Endpoints:

- `createCheckoutSession`
- `createPortalSession`
- `startTrial`
- `enableAdminTester`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `deleteAccount`
- `stripeWebhook`

## 5. Firestore Rules and Data Integrity

Rules file: `firestore.rules`

Notable validation families:

- room payload and update validators
- user profile and quota validators
- player/presence validators
- chat/chatState validators
- social and invite validators
- blocks/claims/artifacts/homeBase validators

Indexes file: `firestore.indexes.json`

- public city query index
- featured room query index

## 6. Testing and Verification

Rules test runner:

```bash
npm test
```

PaintTown integration:

```bash
node tests/painttown.integration.test.mjs
```

Artifacts:

- rules logs via emulator output
- Playwright screenshots/reports under `output/playwright/*`

## 7. Control Reference

Canonical control matrix is maintained in:

- `CONTROLS_REFERENCE.md`
