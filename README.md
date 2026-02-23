# World Explorer

Last reviewed: 2026-02-23

World Explorer is a browser-based 3D exploration game platform with:

- Earth, Moon, and Space traversal
- Single-player game modes (including Paint the Town)
- Multiplayer rooms with live presence, chat, invites, friends, and shared artifacts
- Account management (plan, trial, username, linked email, receipts, room quota)
- Firebase Auth + Firestore data/security + Stripe billing

## Runtime Entrypoints

The repository supports both hosting layouts:

- Root runtime: `/index.html` + `/js/*` (GitHub Pages branch-root mode)
- Firebase/public runtime: `public/app/index.html` + `public/app/js/*`

Both runtimes are kept aligned for gameplay controls and multiplayer behavior.

## Core Features

### Exploration and modes

- Free Roam
- Time Trial
- Checkpoints
- Paint the Town
- Police Chase
- Find the Flower

### Paint the Town

- Touch paint and paintball gun options
- Real projectile arc with gravity
- Paintball splats fade automatically to protect performance
- Multiplayer color competition and shared paint claims
- Minimal HUD (time + painted count) with expandable details

### Multiplayer platform

- Private/public rooms with owner/mod controls
- Room code join + invite-link join
- Presence and ghost markers
- Room chat with spam controls
- Friends, incoming invites, recent players
- Shared artifacts and room home base state

## Plan and Access Model

- `Free`
  - Single-player access
  - No multiplayer room create/join
- `Trial` (2 days)
  - Multiplayer unlocked temporarily
  - Can be started from account or invite flow (when eligible)
  - Room create limit: `3`
- `Supporter` ($1/month)
  - Multiplayer enabled
  - Room create limit: `3`
- `Pro` ($5/month)
  - Multiplayer enabled
  - Room create limit: `10`
  - Extras section shows upcoming demo messaging
- Admin tester mode is allowlist-only and hidden for non-eligible users.

## Input and Camera Controls (Paint the Town)

- Fire paintball from center aim: `Ctrl` (`ControlLeft` / `ControlRight`)
- Alternate fire keys: `G` / `P`
- Color quick-select: `1-6`
- Toggle tool: `T`
- Mouse painting: left click only (no right-click paint fire)
- Camera look: right-click or middle-click hold
- Double-left-click camera toggle is disabled

## Firestore Security and Cost Controls

Implemented protections include:

- Auth required for protected writes
- Room membership checks for room data access
- Presence write throttling (`>= 2s` between updates)
- Chat payload validation + cooldown state checks
- Friends/invite ownership checks
- Room quota enforcement via user counters and rules
- Strict field validation for room/player/chat/artifact/state payloads

TTL cleanup is expected on these collection groups (configure in Firestore Console):

- `players.expiresAt`
- `chat.expiresAt`
- `chatState.expiresAt`
- `incomingInvites.expiresAt`
- `recentPlayers.expiresAt`
- `activityFeed.expiresAt`
- `artifacts.expiresAt`

## Repository Layout

```text
public/
  index.html
  app/index.html
  app/js/multiplayer/*
  account/index.html
  js/*                        # auth/entitlements/billing/firebase config
functions/
  index.js                    # billing/account/trial/admin APIs + Stripe webhook
firestore.rules
firestore.indexes.json
tests/
  firestore.rules.security.test.mjs
  painttown.integration.test.mjs
scripts/
  test-rules.mjs
index.html                    # root runtime entry
js/*                          # root runtime modules
```

## Local Development

```bash
cd "/Users/stevenreid/Documents/New project"
npm install
cd functions && npm install && cd ..
python3 -m http.server --directory public 4173
```

Open:

- `http://localhost:4173/`
- `http://localhost:4173/app/`
- `http://localhost:4173/account/`

## Testing

Firestore rules/security tests:

```bash
npm test
```

PaintTown deterministic seed + physics integration check:

```bash
node tests/painttown.integration.test.mjs
```

## Deploy

### GitHub Pages (branch root)

1. GitHub -> `Settings -> Pages`
2. Source: `Deploy from a branch`
3. Branch: `steven/product` (or your target)
4. Folder: `/ (root)`

### Firebase

```bash
firebase use worldexplorer3d-d9b83
firebase deploy
```

## Documentation

- `QUICKSTART.md`
- `USER_GUIDE.md`
- `ARCHITECTURE.md`
- `TECHNICAL_DOCS.md`
- `API_SETUP.md`
- `GITHUB_DEPLOYMENT.md`
- `KNOWN_ISSUES.md`
- `CHANGELOG.md`
- `DOCUMENTATION_INDEX.md`
- `COMPLETE_INVENTORY_REPORT_2026-02-22.md`
