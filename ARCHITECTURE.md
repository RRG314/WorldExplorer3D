# Architecture

Last reviewed: 2026-02-25

This document describes the current platform architecture for gameplay, multiplayer, account, billing, and security.

## 1. System Topology

### Frontend surfaces

- root landing/runtime compatibility: `index.html` + `js/*`
- main app runtime: `app/index.html` + `app/js/*`
- account center: `account/index.html`
- about/legal content: `about/index.html`, `legal/*`
- Firebase-hosted mirror under `public/*`

### Backend services

- Firebase Authentication
- Cloud Firestore
- Cloud Functions (`functions/index.js`)
- Stripe Checkout/Billing Portal/Webhooks

## 2. Runtime Layers

### 2.1 App runtime

- bootstrap and module load: `app/js/bootstrap.js`, `app/js/modules/*`, `app/js/app-entry.js`
- engine/state: `engine.js`, `state.js`, `shared-context.js`, `main.js`
- world and rendering: `world.js`, `terrain.js`, `ground.js`, `map.js`, `sky.js`, `solar-system.js`, `space.js`
- movement and controls: `input.js`, `physics.js`, `walking.js`, `hud.js`, `ui.js`
- gameplay systems: `game.js`, `flower-challenge.js`, `blocks.js`, `memory.js`, `real-estate.js`

### 2.2 Multiplayer runtime modules (`app/js/multiplayer`)

- `rooms.js`: room lifecycle, settings, deterministic seed, saved room shortcuts, owner delete
- `presence.js`: heartbeat and pose writes, stale filtering
- `ghosts.js`: remote proxy rendering and smoothing
- `chat.js`: chat send/listen/report and anti-spam controls
- `social.js`: friends, invites, recent players
- `artifacts.js`: shared artifacts and home base
- `blocks.js`: shared block sync
- `painttown.js`: paint claim sync
- `loop.js`: leaderboard and activity feed utilities
- `ui-room.js`: multiplayer UI orchestration

## 3. Multiplayer State Model

### 3.1 Persistent room state

Persistent unless owner deletes room:

- `rooms/{roomId}`
- `users/{uid}/myRooms/{roomCode}`
- `rooms/{roomId}/blocks/*`
- `rooms/{roomId}/paintClaims/*`
- `rooms/{roomId}/state/homeBase`

### 3.2 Ephemeral state with TTL

- `rooms/{roomId}/players/*`
- `rooms/{roomId}/chat/*`
- `rooms/{roomId}/chatState/*`
- `users/{uid}/incomingInvites/*`
- `users/{uid}/recentPlayers/*`
- `activityFeed/*`
- `rooms/{roomId}/artifacts/*`

Client-side stale filtering is still used for real-time UX.

## 4. Multiplayer Visual Sync Model

Presence cadence and filtering:

- heartbeat interval: `3s`
- min write interval: `2s`
- movement threshold: `1.0m`
- rotation threshold: `0.08 rad`
- stale player hide threshold: `15s`

Ghost rendering (`ghosts.js`):

- mode-based proxies: `walker`, `car`, `drone`, `space`
- prediction: velocity-based extrapolation from last server pose
- smoothing: damped interpolation and yaw smoothing
- jump protection: teleport clamp for large deltas
- render cadence: internal tick capped to ~30 FPS

## 5. Security Architecture (Firestore Rules)

Rule domains enforce:

- auth and entitlement requirements
- room visibility/member/owner/mod boundaries
- room-create quota coupling with user counter writes
- presence write ownership and throttling checks
- chat payload + chatState transition validation
- friend/invite ownership constraints
- saved-room ownership constraints (`myRooms`)
- block/claim/artifact/homeBase validation by room permissions

## 6. Billing and Account API Architecture

Functions API (`us-central1`):

- `createCheckoutSession`
- `createPortalSession`
- `startTrial`
- `enableAdminTester`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `deleteAccount`
- `stripeWebhook`

Account page merges:

- Firebase Auth user state
- Firestore user profile and social data
- Cloud Function account/billing responses

## 7. Deployment Architecture

### Firebase Hosting

- hosting root: `public/`
- function rewrites for account/billing APIs
- legal page rewrites

### GitHub Pages

- branch-root deploy supported
- root loader routes to `/app/` and uses app module entrypoints

## 8. Validation Architecture

- Firestore rules tests: `tests/firestore.rules.security.test.mjs`
- PaintTown integration test: `tests/painttown.integration.test.mjs`
- rule-test launcher: `scripts/test-rules.mjs` (cross-platform Java detection)
