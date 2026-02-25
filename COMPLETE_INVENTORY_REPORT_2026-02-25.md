# Complete Inventory Report (Current Branch)

Date: 2026-02-25  
Repository: `WorldExplorer`  
Branch inspected: `steven/product`  
Project target: `worldexplorer3d-d9b83`

This report inventories the current codebase state and active behavior.

## 1. Snapshot and Scope

### Included in this inventory

- active web surfaces (`/`, `/app/`, `/account/`, `/about/`, `/legal/*`)
- gameplay runtime modules
- multiplayer modules
- Firebase/Firestore config, indexes, rules
- Cloud Functions API/billing backend
- test scripts and harnesses
- documentation set

### Excluded from active runtime scope

These folders exist in repo but are not active app routes:

- `WorldExplorer3D-rdt-engine/`
- `_style_reference_worldexplorer3d/`
- `world-explorer-esm/`
- `output/` and `test-results/` artifacts

## 2. Surface Inventory

| Route | Primary File | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Landing/home surface |
| `/app/` | `app/index.html` | Main game runtime |
| `/account/` | `account/index.html` | Account, billing, social management |
| `/about/` | `about/index.html` | Product/founder overview |
| `/legal/privacy` | `legal/privacy.html` | Privacy policy |
| `/legal/terms` | `legal/terms.html` | Terms |

Firebase-hosted mirrors exist under `public/` for deployment.

## 3. Runtime Inventory

### 3.1 Core app module set (`app/js`)

Total modules: `39` (including `multiplayer/*` and `modules/*`).

Key groups:

- boot and loading: `bootstrap.js`, `app-entry.js`, `modules/manifest.js`, `modules/script-loader.js`
- engine/state: `engine.js`, `state.js`, `shared-context.js`, `config.js`, `main.js`
- world/render: `world.js`, `terrain.js`, `ground.js`, `map.js`, `sky.js`, `solar-system.js`, `space.js`
- movement/input/physics: `input.js`, `physics.js`, `walking.js`, `hud.js`
- gameplay systems: `game.js`, `flower-challenge.js`, `blocks.js`, `memory.js`, `real-estate.js`

### 3.2 Multiplayer module set (`app/js/multiplayer`)

Total modules: `10`.

- `rooms.js`: create/join/leave, saved rooms (`myRooms`), room settings, owned-room delete, deterministic room seed
- `presence.js`: heartbeat (3s), write throttle (2s), move/rotation thresholds, stale-player filter (15s)
- `ghosts.js`: mode-based remote proxies (walker/car/drone/space), interpolation/extrapolation smoothing
- `chat.js`: in-room chat send/listen/report, profanity masking, duplicate/burst/cooldown protection
- `social.js`: friends CRUD, recent players, incoming invites, invite link generation
- `artifacts.js`: shared artifacts + room home base storage/listeners
- `blocks.js`: shared room block synchronization
- `painttown.js`: room paint claim sync and cache
- `loop.js`: leaderboard and activity feed helpers
- `ui-room.js`: multiplayer UI orchestration and event wiring

### 3.3 Root compatibility runtime (`js`)

`js/app-entry.js` forwards to `../app/js/app-entry.js`. Root loader shims route branch-root pages into `/app/` and imports app modules.

## 4. Controls Inventory

Canonical controls documentation:

- `CONTROLS_REFERENCE.md`

In-app controls surfaces:

- title `Controls` tab in `app/index.html`
- in-game floating controls panel
- mobile virtual pads and action buttons from `app/js/ui.js`

Paint the Town controls in code:

- fire paintball: `Ctrl` (`ControlLeft`/`ControlRight`), alternates `G`/`P`
- color select: `1-6`
- tool toggle: `T`
- right-click camera look enabled, double-left-click camera toggle disabled

## 5. Firestore Inventory

### 5.1 Collections and subcollections

Top-level:

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
- `blocks/{blockId}`
- `paintClaims/{claimId}`
- `state/{stateId}` (`homeBase` document path is used)

User subcollections:

- `friends/{friendUid}`
- `recentPlayers/{otherUid}`
- `incomingInvites/{inviteId}`
- `myRooms/{roomCode}`

### 5.2 Indexes (`firestore.indexes.json`)

Defined composites:

- `rooms(cityKey ASC, visibility ASC, createdAt DESC)`
- `rooms(visibility ASC, featured ASC, createdAt DESC)`

### 5.3 TTL collection groups (field: `expiresAt`)

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

## 6. Security Inventory

`firestore.rules` includes typed validators and guard functions for:

- auth checks, admin token checks, entitlement checks
- room quota consume checks
- room read/write constraints by visibility/member/owner/mod
- presence payload validation and throttle requirement
- chat payload validation and state transition checks
- friend/recent/invite/saved-room validation
- artifacts, blocks, paint claims, home base validation
- leaderboard write constraints

Rule path coverage includes:

- `users/*`
- `flowerLeaderboard/*`
- `paintTownLeaderboard/*`
- `activityFeed/*`
- `explorerLeaderboard/*`
- `rooms/*` and all room subcollections listed above

## 7. Cloud Functions Inventory (`functions/index.js`)

Region: `us-central1`

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

Core responsibilities:

- bearer-token auth verification
- user document normalization
- plan/trial lifecycle
- admin allowlist checks
- Stripe customer ownership verification
- Stripe subscription/webhook plan sync

## 8. Hosting and Routing Inventory

`firebase.json` currently configures:

- hosting root: `public`
- function rewrites for account/billing APIs
- legal route rewrites
- cache headers for assets and HTML

GitHub Pages branch-root mode is supported using root files and runtime compatibility loaders.

## 9. Test Inventory

### 9.1 Firestore rules test

- script: `scripts/test-rules.mjs`
- test file: `tests/firestore.rules.security.test.mjs`
- command: `npm test`

Coverage includes:

- private room access boundaries
- room ownership delete behavior
- room create quota write coupling
- presence self-write boundaries
- chat constraints and cooldown-state writes
- invite ownership/doc-id checks
- paint claim and shared block permissions
- saved room (`myRooms`) ownership boundaries

### 9.2 PaintTown integration test

- test file: `tests/painttown.integration.test.mjs`
- command: `node tests/painttown.integration.test.mjs`

Coverage includes:

- deterministic room seed derivation
- touch paint claim path
- paintball fire/arc/claim behavior

## 10. Documentation Inventory

Current docs in repo:

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
- `COMPLETE_INVENTORY_REPORT_2026-02-25.md`

## 11. Operational Notes

- Rooms are persistent and remain until owner deletion.
- Presence/chat/other transient collections depend on TTL cleanup and are also filtered client-side for real-time UX.
- Saved-room reopen depends on room code validity and active permissions.
- Multiplayer proxy rendering now uses character/car/drone/space proxies and smoothing rather than simple bubble ghosts.
