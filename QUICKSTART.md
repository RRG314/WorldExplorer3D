# Quick Start

Last reviewed: 2026-03-02

Fast path to run, test, and validate the current World Explorer platform.

## 1. Prerequisites

- Node.js 20+
- npm
- Python 3
- Firebase CLI (`npm i -g firebase-tools`)
- Java 21 (required for Firestore emulator tests)

## 2. Install

```bash
cd "/Users/stevenreid/Documents/New project"
npm install
cd functions && npm install && cd ..
```

## 3. Run Locally

### Hosting-style (recommended)

```bash
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

### Branch-root style (Pages compatibility)

```bash
python3 -m http.server 4174
```

Open:

- `http://127.0.0.1:4174/`

## 4. Sync and Parity

If you edited `app/*`, sync to hosting mirror and verify parity:

```bash
npm run sync:public
npm run verify:mirror
```

## 5. Automated Validation

### Full release gate

```bash
npm run release:verify
```

This runs:

1. mirror parity check
2. Firestore rules tests
3. runtime invariant checks

### Individual commands

```bash
npm run test:rules
npm run test:runtime
```

## 6. Manual Smoke Checklist (Pre-Deploy)

1. Location flow:
   - open `Custom` -> globe selector
   - pick a point and confirm place label updates
   - verify `Favorites` shows preset + saved lists
   - delete a saved favorite
2. Launch flow:
   - `Main Menu` from globe selector returns to title menu
   - `Start Here` starts game from selected custom location
3. Tutorial:
   - first run shows walkthrough
   - after completion, hints no longer auto-repeat unless restarted in Settings
4. Driving handling:
   - at speed, hold `Space` + steer on tight turns
   - confirm tighter rear-biased drift behavior
5. Multiplayer:
   - sign in
   - create room
   - join by code
   - invite friend and accept invite
   - verify saved rooms `Open`/owner `Delete`
6. Account:
   - open `/account/`
   - refresh overview and receipts
   - validate profile update

## 7. Firebase Setup

```bash
firebase login
firebase use worldexplorer3d-d9b83
```

Deploy rules/indexes/functions as needed.

## 8. Deploy

### Firebase

```bash
firebase deploy
```

### Preview channel

```bash
firebase hosting:channel:deploy test --project worldexplorer3d-d9b83 --only worldexplorer3d-d9b83 --expires 30d
```

## 9. Troubleshooting

- Rules tests fail immediately: verify Java 21 install and `java -version`.
- Multiplayer create/join denied: verify auth, rules deployment, and user profile quota fields.
- Billing actions fail: verify function env params and function logs.
- UI change not visible: sync mirror and hard refresh browser cache.

