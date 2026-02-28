# Complete Feature and System Inventory Report

Date: 2026-02-28  
Repository: `WorldExplorer`  
Branch inspected: `steven/product`  
Project target: `worldexplorer3d-d9b83`

This report inventories the current codebase behavior, active product features, and deployment-facing surfaces.

## 1. Scope Snapshot

### Included

- active web routes (`/`, `/app/`, `/account/`, `/about/`, `/legal/*`)
- gameplay runtime modules and game modes
- multiplayer room/social stack
- account and optional donation flows
- Firestore rules/indexes/TTL surfaces
- Cloud Functions endpoints
- tests and documentation set

### Excluded from active route scope

- `WorldExplorer3D-rdt-engine/`
- `_style_reference_worldexplorer3d/`
- `world-explorer-esm/`
- artifact folders such as `output/` and `test-results/`

## 2. Route Inventory

| Route | Primary File | Current Purpose |
| --- | --- | --- |
| `/` | `index.html` | Landing, gameplay gallery, donation CTA, app/account entry |
| `/app/` | `app/index.html` | Main runtime (single-player + multiplayer + auth overlay) |
| `/account/` | `account/index.html` | Account profile, social management, donation status, receipts |
| `/about/` | `about/index.html` | Product/founder overview |
| `/legal/privacy` | `legal/privacy.html` | Privacy terms |
| `/legal/terms` | `legal/terms.html` | Service terms |

Deployment mirror: `public/*`.

## 3. Product Feature Inventory

### 3.1 Exploration and world systems

- Earth traversal
- Moon traversal
- Space flight mode
- Procedural world rendering and terrain updates
- Map overlays and location switching

### 3.2 Gameplay modes

- Free Roam
- Time Trial
- Checkpoints
- Paint the Town
- Police Chase
- Find the Flower

### 3.3 Multiplayer core

- private/public room creation
- room join via code
- shareable invite links
- room leave flow
- saved room list (`myRooms`) with quick reopen
- owner delete for owned rooms

### 3.4 Multiplayer social features

- friends add/remove
- incoming invites
- recent players
- invite send/dismiss/accept flows
- room chat + report action

### 3.5 Multiplayer shared world features

- shared build blocks
- paint claim synchronization
- shared artifacts
- room home base state
- featured public room listing
- public-room browse by city tag

### 3.6 Remote player visualization

- mode-based proxies: walker, car, drone, space
- interpolation + extrapolation smoothing
- stale player filtering and teleport clamp safety

### 3.7 Account and donations

- sign-in with Email/Password and Google
- profile display name updates
- linked provider and email metadata
- optional monthly donations:
  - Supporter: $1
  - Pro: $5
- Stripe-hosted portal and receipt retrieval
- self-serve permanent account deletion

## 4. Access Policy Inventory (Current)

### 4.1 Multiplayer access

- Multiplayer is available to all signed-in users.
- No payment is required to create or join rooms.

### 4.2 Current room creation limits

- `free`: 3
- `supporter`: 3
- `pro`: 10
- `admin`: elevated test quota (10000)

### 4.3 Donation tier differentiation

- Supporter donation: contribution tier (no multiplayer lock advantage over free)
- Pro donation: includes early-demo oriented perks and priority-contact style messaging

## 5. Runtime Module Inventory

### 5.1 App modules (`app/js`)

Key groups:

- boot/load: `bootstrap.js`, `app-entry.js`, `modules/manifest.js`, `modules/script-loader.js`
- engine/state: `engine.js`, `state.js`, `shared-context.js`, `config.js`, `main.js`
- world/render: `world.js`, `terrain.js`, `ground.js`, `map.js`, `sky.js`, `solar-system.js`, `space.js`
- movement/input: `input.js`, `physics.js`, `walking.js`, `hud.js`, `ui.js`
- gameplay systems: `game.js`, `flower-challenge.js`, `blocks.js`, `memory.js`, `real-estate.js`

### 5.2 Multiplayer modules (`app/js/multiplayer`)

- `rooms.js`
- `presence.js`
- `ghosts.js`
- `chat.js`
- `social.js`
- `artifacts.js`
- `blocks.js`
- `painttown.js`
- `loop.js`
- `ui-room.js`

### 5.3 Shared root modules

- auth/config/entitlements/donation wrappers under `js/*`
- mirrored hosting copies under `public/*`

## 6. Firestore Inventory

### 6.1 Top-level collections

- `users`
- `rooms`
- `flowerLeaderboard`
- `paintTownLeaderboard`
- `activityFeed`
- `explorerLeaderboard`

### 6.2 Room subcollections

- `players`
- `chat`
- `chatState`
- `artifacts`
- `blocks`
- `paintClaims`
- `state` (`homeBase`)

### 6.3 User subcollections

- `friends`
- `recentPlayers`
- `incomingInvites`
- `myRooms`

### 6.4 Indexed queries

- `rooms(cityKey ASC, visibility ASC, createdAt DESC)`
- `rooms(visibility ASC, featured ASC, createdAt DESC)`

### 6.5 TTL groups (`expiresAt`)

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

## 7. Security and Rule Inventory

`firestore.rules` guards include:

- auth + ownership checks
- room visibility/member/owner/mod boundaries
- room-create quota coupling checks on user counter writes
- presence/chat payload validations and anti-spam state transitions
- social graph ownership controls
- shared block/paint/artifact/home-base permission checks

Current multiplayer entitlement rule behavior:

- requires sign-in for multiplayer documents
- does not require paid plan for room access

## 8. Cloud Functions Inventory (`functions/index.js`)

Region: `us-central1`

Endpoints:

- `createCheckoutSession`
- `createPortalSession`
- `startTrial` (legacy compatibility endpoint)
- `enableAdminTester`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `deleteAccount`
- `stripeWebhook`

Responsibilities:

- bearer token verification
- user profile normalization
- donation checkout/portal session creation
- Stripe subscription webhook synchronization
- admin allowlist activation path

## 9. Test Inventory

### 9.1 Firestore rules tests

- command: `npm test`
- launcher: `scripts/test-rules.mjs`
- suite: `tests/firestore.rules.security.test.mjs`

### 9.2 PaintTown integration test

- command: `node tests/painttown.integration.test.mjs`
- suite: `tests/painttown.integration.test.mjs`

## 10. Documentation Inventory (Current)

- `README.md`
- `QUICKSTART.md`
- `USER_GUIDE.md`
- `CONTROLS_REFERENCE.md`
- `ARCHITECTURE.md`
- `TECHNICAL_DOCS.md`
- `API_SETUP.md`
- `GITHUB_DEPLOYMENT.md`
- `KNOWN_ISSUES.md`
- `CHANGELOG.md`
- `DOCUMENTATION_INDEX.md`
- `SECURITY_STORAGE_NOTICE.md`
- `COMPLETE_INVENTORY_REPORT_2026-02-28.md`

## 11. Operational Notes

- Rooms persist until owner deletion.
- Transient subcollections rely on TTL plus client-side stale filtering.
- Optional donations are wired through Stripe; payment card data is not stored in Firestore.
- Codebase still retains legacy trial endpoint/state compatibility paths, but multiplayer access is no longer trial-gated.
