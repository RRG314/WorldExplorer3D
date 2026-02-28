# Quick Start

Last reviewed: 2026-02-28

Fast path to run, test, and deploy the current World Explorer platform.

## 1. Prerequisites (Free Tooling)

- Node.js 20+
- npm
- Python 3
- Firebase CLI (`npm i -g firebase-tools`)
- Java 21 JRE/JDK (for Firestore emulator tests)

Java install examples:

- macOS: `brew install openjdk@21`
- Ubuntu/Debian: `sudo apt-get install -y openjdk-21-jre`
- Windows: `winget install EclipseAdoptium.Temurin.21.JRE`

## 2. Install Dependencies

```bash
cd "/Users/stevenreid/Documents/New project"
npm install
cd functions && npm install && cd ..
```

## 3. Run Locally

### Option A: Firebase-hosting style (`public` root)

```bash
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

### Option B: branch-root pages style (repository root)

```bash
python3 -m http.server 4174
```

Open:

- `http://127.0.0.1:4174/`

## 4. Quick Functional Check

1. Open app -> `Games` -> choose `Paint the Town` -> `Explore`.
2. Validate controls:
   - `Ctrl` fires paintball
   - `1-6` color select
   - `T` toggles paint tool
   - right-click hold camera look works
   - double-left-click does not toggle camera
3. Open Multiplayer tab (signed in):
   - create room
   - join by code
   - verify saved room list has `Open` and (owner) `Delete`
4. Open account page and verify:
   - donation status + room quota
   - username
   - receipts
   - friends/invites

## 5. Firestore Rules/Security Test

```bash
npm test
```

Runs:

- `scripts/test-rules.mjs`
- `tests/firestore.rules.security.test.mjs`

## 6. PaintTown Integration Test

```bash
node tests/painttown.integration.test.mjs
```

Report path:

- `output/playwright/painttown-physics-check/report.json`

## 7. Firebase Setup

```bash
firebase login
firebase use worldexplorer3d-d9b83
```

Enable auth providers in Firebase Console:

- Email/Password
- Google

## 8. Stripe Setup (Optional Donations)

```bash
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_live_or_test_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
firebase deploy --only functions
```

## 9. Firestore TTL Setup

Configure TTL in Firestore Console using `expiresAt` on these collection groups:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

TTL is background cleanup, not real-time state propagation.

## 10. Deploy

### Firebase

```bash
firebase deploy
```

### GitHub Pages (branch root)

1. Push target branch (`steven/product`).
2. GitHub -> Settings -> Pages.
3. Source: Deploy from a branch.
4. Branch: `steven/product`.
5. Folder: `/ (root)`.

## 11. Troubleshooting

- Rules tests fail with Java errors -> verify `java -version`.
- Multiplayer create/join denied -> redeploy Firestore rules and verify sign-in/auth state.
- Saved room open fails -> verify room still exists and owner has not deleted it.
- Donation errors -> verify Stripe config + function logs.
