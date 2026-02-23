# Complete Inventory Report (Personal/Internal)

Date: 2026-02-22  
Repository: `WorldExplorer`  
Branch inspected: `steven/product`  
Project target: `worldexplorer3d-d9b83`

This is a full systems inventory and technical review of the current branch state after multiplayer platform, account center, and security hardening updates.

## 1. Executive Summary

World Explorer is operating as a multi-surface web product with integrated auth, billing, multiplayer, and persistent social features:

- Landing page (`/`)
- Runtime/game (`/app/`)
- Account + billing (`/account/`)
- Legal pages (`/legal/privacy`, `/legal/terms`)

Current implementation combines:

- Earth/Moon/Space exploration and game modes
- Stripe-backed subscriptions and trial lifecycle
- Firestore-secured multiplayer rooms, presence, chat, social graph, activity feed, and leaderboard
- TTL-based cleanup for cost control

## 2. Surface Inventory

| Route | Source | Purpose | Primary Actions |
| --- | --- | --- | --- |
| `/` | `public/index.html` | Landing + pricing + gameplay gallery | Start app, open multiplayer tab link, start trial, open account |
| `/app/` | `public/app/index.html` | Interactive runtime | Select location/mode, launch game, multiplayer room/social/feed interactions |
| `/account/` | `public/account/index.html` | Account center | Sign in, view plan, update profile, view receipts, open billing portal |
| `/legal/privacy` | `public/legal/privacy.html` | Privacy policy | Review privacy disclosures |
| `/legal/terms` | `public/legal/terms.html` | Terms of service | Review trial/subscription terms |

## 3. Architecture Inventory

### 3.1 Hosting and routing

Configuration files:

- `firebase.json`
- `.firebaserc`

Hosting root and behavior:

- Hosting root: `public/`
- Static asset cache: immutable long-cache
- HTML cache: short-cache
- Rewrites to Cloud Functions:
  - `/createCheckoutSession`
  - `/createPortalSession`
  - `/getAccountOverview`
  - `/listBillingReceipts`
  - `/updateAccountProfile`
  - `/startTrial`
  - `/stripeWebhook`
- Legal rewrites:
  - `/legal/privacy`
  - `/legal/terms`

GitHub Pages workflow:

- `.github/workflows/deploy-pages-public.yml`
- Uploads `./public` as Pages artifact
- Triggered only by push to `codex/github-pages-compat` plus manual dispatch

### 3.2 Frontend runtime architecture

Core runtime modules:

- Boot/loader: `public/app/js/bootstrap.js`, `public/app/js/modules/*`, `public/app/js/app-entry.js`
- Engine/state: `public/app/js/engine.js`, `public/app/js/state.js`, `public/app/js/config.js`, `public/app/js/shared-context.js`, `public/app/js/main.js`
- World stack: `public/app/js/world.js`, `public/app/js/terrain.js`, `public/app/js/ground.js`, `public/app/js/map.js`
- Movement/physics: `public/app/js/input.js`, `public/app/js/physics.js`, `public/app/js/walking.js`
- Environment/space: `public/app/js/env.js`, `public/app/js/sky.js`, `public/app/js/space.js`, `public/app/js/solar-system.js`
- Gameplay: `public/app/js/game.js`, `public/app/js/flower-challenge.js`, `public/app/js/blocks.js`, `public/app/js/memory.js`
- UI/perf: `public/app/js/ui.js`, `public/app/js/hud.js`, `public/app/js/perf.js`, `public/app/js/real-estate.js`

### 3.3 Multiplayer architecture

Multiplayer module directory:

- `public/app/js/multiplayer/rooms.js`
- `public/app/js/multiplayer/presence.js`
- `public/app/js/multiplayer/chat.js`
- `public/app/js/multiplayer/ghosts.js`
- `public/app/js/multiplayer/ui-room.js`
- `public/app/js/multiplayer/social.js`
- `public/app/js/multiplayer/artifacts.js`
- `public/app/js/multiplayer/loop.js`

Implemented capabilities:

- Room lifecycle: create/join/leave/listen (private default, public optional)
- Public room discovery: city-tag search and featured public rooms
- Presence with heartbeat + movement threshold + stale client filtering
- In-room chat with profanity masking and client/server anti-spam controls
- Ghost rendering of active players with throttled scene updates
- Social graph: friends, recent players, inbound invites
- Persistence: home base and shared artifacts
- Return loop: weekly pulse, activity feed, explorer leaderboard

### 3.4 Auth/account/billing architecture

Shared frontend auth/billing modules:

- `public/js/firebase-init.js`
- `public/js/auth-ui.js`
- `public/js/entitlements.js`
- `public/js/billing.js`
- `public/js/firebase-project-config.js`

Cloud Functions endpoints (`functions/index.js`):

- `createCheckoutSession`
- `createPortalSession`
- `startTrial`
- `getAccountOverview`
- `listBillingReceipts`
- `updateAccountProfile`
- `stripeWebhook`

Billing integration:

- Stripe customer ownership checks on sensitive endpoints
- Trial lifecycle on trusted backend function
- Receipt retrieval from Stripe invoices

## 4. Data Inventory

### 4.1 Firestore collections and subcollections

Top-level collections (rules-defined):

- `users/{uid}`
- `flowerLeaderboard/{entryId}`
- `paintTownLeaderboard/{entryId}`
- `activityFeed/{entryId}`
- `explorerLeaderboard/{uid}`
- `rooms/{roomId}`

Room-scoped subcollections:

- `rooms/{roomId}/players/{uid}`
- `rooms/{roomId}/chat/{msgId}`
- `rooms/{roomId}/chatState/{uid}`
- `rooms/{roomId}/artifacts/{artifactId}`
- `rooms/{roomId}/state/homeBase`

User-scoped subcollections:

- `users/{uid}/friends/{friendUid}`
- `users/{uid}/recentPlayers/{otherUid}`
- `users/{uid}/incomingInvites/{inviteId}`

### 4.2 Firestore indexes

`firestore.indexes.json` currently defines:

- `rooms(cityKey ASC, visibility ASC, createdAt DESC)`
- `rooms(visibility ASC, featured ASC, createdAt DESC)`

### 4.3 TTL inventory

TTL field used: `expiresAt`

Known code paths writing `expiresAt`:

- Presence: `players`
- Chat messages: `chat`
- Chat anti-spam state: `chatState`
- Recent players: `recentPlayers`
- Incoming invites: `incomingInvites`
- Activity feed: `activityFeed`
- Optional shared artifacts: `artifacts`

Operational note:

- `players` and `chat` TTL were confirmed active in deployment output.
- Additional TTL groups are expected to be activated in console for full cleanup coverage.

## 5. Security Inventory

### 5.1 Rule-level controls

`firestore.rules` enforces:

- Auth-required room access and multiplayer entitlement gating
- Private/public room read controls
- Presence self-write only + write throttling
- Chat membership enforcement and max-length validation
- Chat state transition validation for server-side anti-spam windows
- Invite doc-id format constraints and sender/member/friend checks
- Owner/mod controls for room state and artifacts
- Client lockout from billing-critical fields on `users/{uid}`

### 5.2 Client-side safeguards

- Chat client throttles:
  - Min interval
  - Burst window
  - Duplicate suppression
- Multiplayer UI XSS hardening:
  - Escaped dynamic content in all `innerHTML` renderers

### 5.3 Backend safeguards

`functions/index.js`:

- Bearer token verification on protected endpoints
- Stripe customer ownership verification
- Trial one-time consumption enforcement
- Sanitized/validated return URL handling

## 6. Testing Inventory

### 6.1 Implemented tests

Rules security test harness:

- `tests/firestore.rules.security.test.mjs`
- Run command:
  - `npm test`
  - `npm run test:rules`

Covers:

- Private-room read denial (anon and non-member)
- Presence write ownership
- Chat length guard and state-linked write checks
- Invite abuse cases (non-member sender, wrong invite id)
- Activity feed auth constraints

Latest result:

- 12/12 checks passed in local emulator run.

### 6.2 Validation artifacts

Recent smoke artifacts under:

- `output/playwright/phase3-platform-smoke/`
- `output/playwright/final-gh-pages-firebase-smoke/`

## 7. Operational Inventory

### 7.1 Runtime/tooling prerequisites

Required local tools:

- Node + npm
- Firebase CLI
- Java (OpenJDK) for Firestore emulator

Current local additions:

- Root `package.json` with rules test script
- Dev dependencies:
  - `@firebase/rules-unit-testing`
  - `firebase`

### 7.2 Deployment commands in active use

- Firestore rules: `firebase deploy --only firestore:rules`
- Firestore indexes: `firebase deploy --only firestore:indexes`
- Functions: `firebase deploy --only functions`

## 8. Review Findings (Ordered by Severity)

### [P1] GitHub Pages auto-deploy is branch-locked away from active delivery branch

File:

- `.github/workflows/deploy-pages-public.yml:6`

Details:

- Pages deploy trigger is restricted to `codex/github-pages-compat`.
- Current production work is on `steven/product`.
- Risk: pushing fixes to active branch will not auto-deploy to Pages unless manual dispatch or branch merge choreography is performed.

Recommendation:

- Add `steven/product` (or target release branch) to workflow triggers, or consolidate release branch policy.

### [P2] Firestore rule static warnings indicate brittle chat-state typing paths

File:

- `firestore.rules:350`
- `firestore.rules:351`

Details:

- Rules compile with warnings about `null` type in chat-state transition variables.
- Current tests pass, but warnings indicate brittle type flow and noisy evaluation paths in denial cases.

Recommendation:

- Refactor `validChatStateTransition()` to avoid nullable map assignment (split create/update paths explicitly) and remove warnings.

### [P2] Rules test script is machine-specific and not portable to CI/Linux/Intel by default

File:

- `package.json:8`

Details:

- `test:rules` hardcodes Apple Silicon Homebrew Java path.
- This will fail in standard CI or non-Apple local environments unless Java path overrides are manually adjusted.

Recommendation:

- Replace with environment-agnostic launcher or fallback strategy:
  - use existing `JAVA_HOME` when set
  - otherwise rely on system `java` on `PATH`

### [P2] Automated test coverage remains concentrated in Firestore rules only

Files:

- `tests/firestore.rules.security.test.mjs`
- `functions/index.js`
- `public/app/js/multiplayer/*.js`

Details:

- Strong rules tests exist, but no committed automated tests for:
  - Functions endpoint auth/ownership behavior
  - Multiplayer client integration regressions
  - Account center end-to-end states

Recommendation:

- Add emulator-backed functions tests and a minimal Playwright CI smoke suite for `/`, `/app/`, `/account/`.

## 9. Open Questions / Assumptions

- Assumes Stripe secret/price/webhook config keys are set in Firebase Functions runtime.
- Assumes all planned TTL collection groups beyond `players` and `chat` are being activated in Firestore console.
- Assumes release process intentionally supports both Firebase Hosting and GitHub Pages modes.

## 10. Overall Assessment

System maturity is high for a single-repo web product:

- Multi-surface architecture is coherent.
- Security posture improved materially (rules hardening, ownership checks, anti-spam, XSS mitigation).
- Rules test harness is now present and repeatable.

Primary remaining risk is release-process consistency (Pages branch trigger policy) and broader automated test depth beyond Firestore rules.
