# Technical Documentation

Last reviewed: 2026-02-23

Engineering reference for current runtime, backend APIs, rules, and test flow.

## 1. Code Paths

### Runtime path A (Firebase/public)

- Entry: `public/app/index.html`
- Modules: `public/app/js/*`

### Runtime path B (GitHub Pages root)

- Entry: `index.html`
- Modules: `js/*`

Input and game-mode behavior should remain mirrored between both paths.

## 2. Multiplayer Module Contracts

`public/app/js/multiplayer/rooms.js`

- room lifecycle (create/join/leave)
- room listeners
- deterministic room seed helper used by game logic

`public/app/js/multiplayer/presence.js`

- throttled heartbeat updates
- pose + mode + frame synchronization
- live player list snapshots

`public/app/js/multiplayer/chat.js`

- send/listen/report chat messages
- room-scoped chat state and limits

`public/app/js/multiplayer/social.js`

- friends CRUD
- incoming invite listener and updates
- invite send flow with cooldown gate
- recent player writes/listeners

`public/app/js/multiplayer/artifacts.js`

- shared artifacts CRUD
- room home-base state read/write

`public/app/js/multiplayer/painttown.js`

- PaintTown room-state sync and claim propagation

## 3. PaintTown Runtime Notes

Main implementation lives in `game.js`.

### State highlights

- `paintballs[]` active projectile pool
- `paintSplats[]` temporary ground/impact visual pool
- `claimsByKey` authoritative paint ownership state
- color counters and leaderboard submission hooks

### Input bindings

- `Ctrl` fires paintball from center aim
- `G`/`P` alternate fire keys
- `T` toggles tool
- `1-6` choose color
- left click handles touch/tool paint action
- right click no longer triggers paint fire

### Camera interaction

- right/middle mouse hold for look
- double-click walk camera toggle removed

## 4. Firestore Rules Focus Areas

`firestore.rules` enforces:

- entitlement gate for multiplayer operations
- per-plan room create limits
- transactional room create quota consumption
- room/private visibility rules
- player doc self-write only + rate throttle
- chat validation and membership checks
- invite validity and anti-forgery checks
- artifact and home-base ownership/manager checks

## 5. Cloud Function API Surface

From `functions/index.js`:

- `createCheckoutSession`
- `createPortalSession`
- `startTrial`
- `enableAdminTester`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `stripeWebhook`

## 6. Testing

### Firestore rules security tests

```bash
npm test
```

Uses `scripts/test-rules.mjs` (cross-platform Java detection) and executes:

- `tests/firestore.rules.security.test.mjs`

### PaintTown integration test

```bash
node tests/painttown.integration.test.mjs
```

Validates:

- deterministic seeding behavior
- touch paint flow
- gun/physics paint claim flow

## 7. Performance Guardrails

- presence writes throttled and threshold-gated
- chat query windows bounded
- paintball/splat pools bounded and auto-pruned
- transient Firestore docs should include `expiresAt` for TTL cleanup
