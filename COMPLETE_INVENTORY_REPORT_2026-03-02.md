# Complete Feature and System Inventory Report

Date: 2026-03-02
Repository: `WorldExplorer`
Branch inspected: `steven/professional-audit-cleanup`
Project target: `worldexplorer3d-d9b83`

This report is a code-first inventory of runtime features, backend systems, storage model, security boundaries, and release operations for the current branch.

## 1. Scope and Method

### Included

- Runtime UI and gameplay: `app/index.html`, `app/js/*`
- Multiplayer stack: `app/js/multiplayer/*`
- Tutorial and globe selector: `app/js/tutorial/tutorial.js`, `app/js/ui/globe-selector.js`
- Auth/account/billing client modules: `js/*`
- Account UI: `account/index.html`
- Cloud Functions API: `functions/index.js`
- Firestore security and indexes: `firestore.rules`, `firestore.indexes.json`
- Release/test scripts: `scripts/*`, `tests/*`
- Hosting/deploy wiring: `firebase.json`

### Excluded from active route scope

- `WorldExplorer3D-rdt-engine/`
- `_style_reference_worldexplorer3d/`
- `world-explorer-esm/`
- Generated artifacts under `output/`

## 2. Active Runtime Surfaces

| Route | Primary file | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Landing page, marketing CTA, launch entry |
| `/app/` | `app/index.html` | Main game runtime and multiplayer UI |
| `/account/` | `account/index.html` | Account, social, donations, receipts, deletion |
| `/about/` | `about/index.html` | Product/about content |
| `/legal/privacy` | `legal/privacy.html` | Privacy page |
| `/legal/terms` | `legal/terms.html` | Terms page |

Hosting mirror path is `public/*`; canonical app source is `app/*` with sync to `public/app/*`.

## 3. Frontend Runtime Architecture

### Boot chain

1. `app/js/bootstrap.js` loads critical Three.js vendor scripts.
2. Module entrypoint (`app/js/app-entry.js`) initializes engine, UI, tutorial, auth observer, multiplayer platform.
3. `renderLoop` in `app/js/main.js` drives game updates, rendering, HUD/map/perf overlay cadence.

### Canonical source and mirroring

- Canonical runtime edits should be made in `app/*`.
- Mirror sync command: `npm run sync:public`.
- Mirror parity verification: `npm run verify:mirror`.

## 4. Core Product Feature Inventory

### 4.1 Location and world selection

- Earth, Moon, Space launch modes from title screen.
- Preset city selection (`app/js/config.js` `LOCS`).
- Custom location flow via globe selector overlay.
- Persisted "Continue Last Location" behavior via local storage.

### 4.2 Globe selector (`app/js/ui/globe-selector.js`)

- Click-to-pick lat/lon on interactive Earth globe.
- Search and manual coordinate entry integrated with existing custom search flow.
- Reverse geocode lookup with fallback providers.
- City list tabs:
  - `Nearby`: nearest known menu cities to picked point.
  - `Favorites`: grouped as `Preset Cities` + `Your Saved Favorites`.
- Saved favorites stored locally (`worldExplorer3D.globeSelector.savedFavorites`) with per-item delete support.
- Zoom-aware marker scaling and separate marker styling for preset vs saved favorites.
- `Main Menu` and `Start Here` action buttons.

### 4.3 Tutorial system (`app/js/tutorial/tutorial.js`)

- First-run staged walkthrough with persistent state (`worldExplorer3D.tutorialState.v1`).
- Stages cover globe selection, movement, travel modes, space, moon, build, rooms, invite flow.
- Tutorial is one-time by default after completion.
- User controls in Settings:
  - enable/disable tutorial
  - restart tutorial manually

### 4.4 Gameplay modes (`app/js/game.js`)

- Free Roam
- Time Trial
- Checkpoints
- Paint the Town
- Police Chase
- Find the Flower

### 4.5 Vehicle and movement systems

- Drive, Walk, Drone, Space flight, Moon traversal.
- Mobile virtual controls adapt per mode.
- Current driving handling includes rear-biased drift behavior on Earth:
  - handbrake steering intent via `Space` at speed
  - tighter turn response during active drift
  - rear-slip pivot model to bias slip to rear axle

### 4.6 Environment and simulation systems

- Real-world coordinate projection and world seed derivation.
- Terrain tile loading and rebuild pipeline.
- Roads/buildings/land-use/water/POI layers.
- Sky and astronomy systems (constellation/star data in runtime state).

## 5. Multiplayer System Inventory

### 5.1 Room lifecycle (`app/js/multiplayer/rooms.js`)

- Create/join/leave room.
- Public/private visibility.
- Owner room settings update.
- Owner room delete.
- Saved room records in `users/{uid}/myRooms/{roomCode}`.
- Weekly featured room discovery utilities.
- Deterministic seed derivation (`deriveRoomDeterministicSeed`).

### 5.2 Presence (`app/js/multiplayer/presence.js`)

- Heartbeat writes and stale filtering.
- Player pose/frame normalization.
- Velocity and movement threshold checks.
- Visibility hooks and clean stop behavior.

### 5.3 Remote player rendering (`app/js/multiplayer/ghosts.js`)

- Proxy types: walker, car, drone, space.
- Interpolation and extrapolation smoothing.
- Teleport clamping and stale cleanup.
- Name tag rendering and per-proxy offsets.

### 5.4 Chat (`app/js/multiplayer/chat.js`)

- Per-room chat send/listen/report.
- Client-side spam controls and duplicate suppression.
- Link/contact/email/phone pattern blocking.
- Profanity filter + report flags.

### 5.5 Social graph (`app/js/multiplayer/social.js`)

- Friends add/remove.
- Invite send/seen/dismiss.
- Recent players tracking.
- Invite link generation (`?room=XXXXXX&invite=1`).

### 5.6 Shared world data

- Artifacts: `app/js/multiplayer/artifacts.js`
- Shared blocks: `app/js/multiplayer/blocks.js`
- Paint claims: `app/js/multiplayer/painttown.js`
- Home base state through `rooms/{roomId}/state/homeBase`

### 5.7 Multiplayer UI orchestration (`app/js/multiplayer/ui-room.js`)

- Room panel open/close and tab wiring.
- Room create/join/open/delete actions.
- Chat drawer and ghost toggles.
- Friends/invites/recent players rendering.
- Weekly featured room and public city browse.
- Minimap/large-map room marker publishing to app context.

## 6. Account and Billing Inventory

### Client surfaces

- Auth: `js/auth-ui.js`
- Entitlements: `js/entitlements.js`
- Billing API client: `js/billing.js`
- Account page: `account/index.html`

### Account capabilities

- Sign in/out and profile display name update.
- Plan/room quota/status summary.
- Optional donation upgrade actions.
- Billing portal + receipt listing.
- Friends and incoming invites management from account page.
- Permanent account deletion flow with explicit confirmation and recent-auth check.

## 7. Cloud Functions Inventory (`functions/index.js`)

Region: `us-central1`

Endpoints:

- `POST /createCheckoutSession`
- `POST /createPortalSession`
- `POST /startTrial` (legacy compatibility endpoint)
- `POST /enableAdminTester`
- `POST /getAccountOverview`
- `POST /listBillingReceipts`
- `POST /updateAccountProfile`
- `POST /deleteAccount`
- `POST /stripeWebhook`

Core behaviors:

- CORS allowlist validation
- bearer token auth verification
- plan normalization and room quota shaping
- Stripe customer ownership checks
- webhook-driven subscription synchronization
- full user-data cleanup on delete-account

## 8. Data Model Inventory

### Top-level collections

- `users`
- `rooms`
- `flowerLeaderboard`
- `paintTownLeaderboard`
- `activityFeed`
- `explorerLeaderboard`

### User subcollections

- `friends`
- `recentPlayers`
- `incomingInvites`
- `myRooms`

### Room subcollections

- `players`
- `chat`
- `chatState`
- `artifacts`
- `blocks`
- `paintClaims`
- `state` (`homeBase` document)

### Indexed queries (`firestore.indexes.json`)

- `rooms(cityKey ASC, visibility ASC, createdAt DESC)`
- `rooms(visibility ASC, featured ASC, createdAt DESC)`

## 9. Security Boundary Inventory (`firestore.rules`)

Key enforcement domains:

- self-document ownership for user profile and social subcollections
- room visibility and membership checks (`public` read path + private membership boundaries)
- room create quota coupling with user `roomCreateCount`/`roomCreateLimit`
- room owner/mod management gates for privileged room updates
- strict payload schemas for presence/chat/artifacts/blocks/paint claims/home base
- chat anti-spam state transition validation via `chatState`

Notable rule behavior:

- public room documents are readable without auth
- private room docs require membership
- multiplayer writes still require authenticated users

## 10. Local Storage and Client Persistence Inventory

Key browser storage keys in active flows:

- `worldExplorer3D.tutorialState.v1` (tutorial progression)
- `worldExplorer3D.globeSelector.savedFavorites` (saved globe favorites)
- `worldExplorer3D.firebaseConfig` (optional Firebase config override)
- additional gameplay/UI local state keys used by memory and challenge systems

## 11. Test and Validation Inventory

### Automated scripts

- `npm run test` -> rules + runtime invariant checks
- `npm run test:rules` -> Firestore emulator rule suite
- `npm run test:runtime` -> Playwright runtime invariant checks
- `npm run verify:mirror` -> app/public parity
- `npm run release:verify` -> mirror + rules + runtime gate

### Tests

- `tests/firestore.rules.security.test.mjs`
- `tests/painttown.integration.test.mjs`

### Artifacts

- runtime and Playwright reports/screenshots under `output/playwright/*`

## 12. Deployment and Hosting Inventory

### Firebase Hosting (`firebase.json`)

- Hosting root: `public`
- Rewrites for account/billing function endpoints
- Legal page rewrites

### GitHub Pages compatibility

- Root deployment from branch root remains supported.
- Runtime still expects app/account paths to be present.

## 13. Operational Risk Inventory

1. Node runtime upgrade pending in Functions (target Node 22).
2. Mirror discipline required between `app/*` and `public/app/*`.
3. TTL cleanup is asynchronous and should not be treated as realtime sync.
4. External geocoding/search services can rate-limit or fail intermittently.

## 14. Documentation Coverage Snapshot

Primary docs synchronized with this report:

- `README.md`
- `QUICKSTART.md`
- `USER_GUIDE.md`
- `CONTROLS_REFERENCE.md`
- `ARCHITECTURE.md`
- `TECHNICAL_DOCS.md`
- `API_SETUP.md`
- `GITHUB_DEPLOYMENT.md`
- `RELEASE_CHECKLIST.md`
- `KNOWN_ISSUES.md`
- `SECURITY_STORAGE_NOTICE.md`
- `CHANGELOG.md`
- `DOCUMENTATION_INDEX.md`

