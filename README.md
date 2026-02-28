# World Explorer

Last reviewed: 2026-02-28

World Explorer is a browser-native 3D exploration platform with real-location traversal, game modes, multiplayer rooms, optional monthly donations, and Firebase-backed persistence.

## Runtime Surfaces

- Root landing: `/index.html`
- App runtime: `/app/index.html`
- Account center: `/account/index.html`
- About page: `/about/index.html`
- Legal pages: `/legal/privacy`, `/legal/terms`

## Core Product Features

- Earth, Moon, and Space traversal
- Game modes:
  - Free Roam
  - Time Trial
  - Checkpoints
  - Paint the Town
  - Police Chase
  - Find the Flower
- Multiplayer platform:
  - private/public rooms
  - room code + invite links
  - saved rooms (open again later)
  - owner delete for owned rooms
  - live presence, chat, friends, invites, recent players
  - shared blocks, paint claims, artifacts, home base
- Account center:
  - plan/donation status
  - room quota usage
  - username + linked email + providers
  - Stripe donation portal + receipts
  - permanent account closure (self-serve delete flow)

## Multiplayer Rendering and Update Model

Current ghost rendering is no longer bubble-only:

- walking players render as character proxies
- driving players render as car proxies
- drone/space modes render as dedicated lightweight proxies
- remote motion uses interpolation + extrapolation + teleport clamping for smoother movement on 3s presence heartbeats

## Access and Quotas

- Multiplayer is available for all signed-in users.
- Current room creation limits:
  - `Free`: `3`
  - `Supporter`: `3`
  - `Pro`: `10`
  - Admin tester mode: allowlist-only, higher room limit
- Supporter/Pro are optional monthly donations.
- Pro keeps early-demo and priority-contact style perks.

## Controls

Full controls are documented in:

- `CONTROLS_REFERENCE.md`
- in-app `Controls` tab

Paint the Town key controls:

- `Ctrl` (and `G` / `P`) fires paintball shots
- `1-6` picks color
- `T` toggles touch vs gun tool
- right-click camera look is enabled
- double-left-click camera toggle is disabled

## Firestore Security and TTL

Firestore rules enforce:

- authenticated access for protected data
- room membership and ownership boundaries
- room quota write coupling
- presence self-write and write throttling
- chat validation and anti-spam state checks
- friend/invite ownership constraints

TTL `expiresAt` should be enabled for:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

## Repository Layout

Active runtime and backend paths:

- `app/` -> primary app surface (`/app`)
- `js/` -> root compatibility/runtime glue and shared account/auth/billing modules
- `public/` -> Firebase Hosting root mirror
- `functions/` -> Cloud Functions API and Stripe webhook
- `tests/` -> Firestore rules and PaintTown integration tests

Reference/legacy folders not used by active app routing:

- `WorldExplorer3D-rdt-engine/`
- `_style_reference_worldexplorer3d/`
- `world-explorer-esm/`

## Local Development

Install dependencies:

```bash
cd "/Users/stevenreid/Documents/New project"
npm install
cd functions && npm install && cd ..
```

Run Firebase-style local static hosting (`public` root):

```bash
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

## Testing

Rules/security test suite:

```bash
npm test
```

PaintTown deterministic seed + paintball flow test:

```bash
node tests/painttown.integration.test.mjs
```

## Deployment

GitHub Pages (branch root) and Firebase Hosting are both supported.

GitHub Pages:

- source branch: `main`
- folder: `/ (root)`

Firebase:

```bash
firebase use worldexplorer3d-d9b83
firebase deploy
```

## Documentation

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
- `COMPLETE_INVENTORY_REPORT_2026-02-28.md`
