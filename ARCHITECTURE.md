# Architecture

Last reviewed: 2026-02-23

This document describes the current platform architecture for gameplay, multiplayer, account, and billing.

## 1. System Topology

### Frontend surfaces

- Root runtime: `index.html` + `js/*` (GitHub Pages branch-root)
- Firebase/public runtime: `public/app/index.html` + `public/app/js/*`
- Landing/marketing: `public/index.html`
- Account: `public/account/index.html`

### Backend services

- Firebase Authentication
- Cloud Firestore (rules + indexes + TTL)
- Firebase Cloud Functions (`functions/index.js`)
- Stripe (Checkout, Billing Portal, Webhooks)

## 2. Runtime Layers

### Gameplay runtime

- 3D engine and modes in `game.js`, `engine.js`, and related modules
- PaintTown subsystem with touch + paintball projectile pipeline
- Mode/rule sync hooks exposed through shared context APIs

### Multiplayer runtime modules

Under `public/app/js/multiplayer/`:

- `rooms.js`: room create/join/leave/listening and deterministic room seed helpers
- `presence.js`: heartbeat pose updates and player listeners
- `chat.js`: room chat send/listen/report helpers
- `ghosts.js`: ghost markers in world scene
- `painttown.js`: multiplayer PaintTown state sync
- `artifacts.js`: shared artifacts and home-base state helpers
- `social.js`: friends, invites, recent players
- `ui-room.js`: room panel, chat drawer, social UI wiring
- `loop.js`: orchestration

## 3. Firestore Data Domains

Top-level collections:

- `users/{uid}`
- `rooms/{roomId}`
- `flowerLeaderboard/{entryId}`
- `paintTownLeaderboard/{entryId}`
- `activityFeed/{entryId}`
- `explorerLeaderboard/{uid}`

Room subcollections:

- `players/{uid}`
- `chat/{msgId}`
- `chatState/{uid}`
- `artifacts/{artifactId}`
- `paintClaims/{claimId}`
- `state/homeBase`

User subcollections:

- `friends/{friendUid}`
- `recentPlayers/{otherUid}`
- `incomingInvites/{inviteId}`

## 4. Security Architecture (Firestore Rules)

Key rule guarantees:

- auth required for protected reads/writes
- room visibility + membership enforced per room read
- multiplayer entitlement gate (`trial/supporter/pro`)
- room create quota checked using user counters
- owner/mod boundaries for room-managed resources
- presence write throttle (`respectsPresenceWriteThrottle`)
- chat content and state transition validation
- invite sender/receiver ownership validation
- leaderboard write constraints

## 5. Billing and Account API Architecture

Cloud Functions (`us-central1`):

- `createCheckoutSession`
- `createPortalSession`
- `startTrial`
- `enableAdminTester`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `stripeWebhook`

Account page consumes these APIs and merges with auth + Firestore state for:

- profile identity data
- plan/trial/quota status
- receipts
- friends/invites actions

## 6. PaintTown Input Architecture

Current behavior:

- paintball fire key: `ControlLeft` / `ControlRight` (`Ctrl`)
- no right-click paint firing
- left click/touch obeys tool/rule mode
- right/middle click hold controls camera
- double-click camera toggle removed

This behavior is synchronized in both runtime code paths:

- `public/app/js/game.js` and `public/app/js/engine.js`
- `js/game.js` and `js/engine.js`

## 7. Performance and Cleanup Controls

- presence writes throttled (2s+)
- movement/pose updates gated by thresholds + interval
- chat query bounded (latest window)
- paintball and splat arrays capped with TTL-style client cleanup
- Firestore TTL for expiring collections (`expiresAt` field)

## 8. Deployment Architecture

### GitHub Pages

- Branch-root mode serves root runtime directly.

### Firebase Hosting

- Serves `public/` with route split (`/`, `/app/`, `/account/`, legal pages)
- Rewrites function endpoints to Cloud Functions where configured

Both rely on the same Firebase project config and backend services.
