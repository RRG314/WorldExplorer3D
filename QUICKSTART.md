# Quick Start

Last reviewed: 2026-02-23

This is the fastest path to run, test, and deploy the current World Explorer platform.

## 1. Prerequisites (Free tooling)

- Node.js 20+
- npm
- Python 3 (for local static hosting)
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

```bash
cd "/Users/stevenreid/Documents/New project"
python3 -m http.server --directory public 4173
```

Open:

- `http://localhost:4173/`
- `http://localhost:4173/app/`
- `http://localhost:4173/account/`

## 4. Quick Functional Check

1. Open `Game Mode` -> select `Paint the Town` -> start game.
2. Verify controls:
   - `Ctrl` fires paintball shots
   - left click paints based on active tool/rules
   - right-click hold rotates camera
   - double-left-click does not toggle camera mode
3. Open Multiplayer tab and verify room panel loads.
4. Open account page and verify username/friends/invites/receipt sections render.

## 5. Firestore Rules/Security Test

```bash
npm test
```

This runs the Firestore emulator and executes:

- `tests/firestore.rules.security.test.mjs`

## 6. PaintTown Integration Test

```bash
node tests/painttown.integration.test.mjs
```

Output report:

- `output/playwright/painttown-physics-check/report.json`

## 7. Firebase Setup

```bash
firebase login
firebase use worldexplorer3d-d9b83
```

Enable Auth providers in Firebase Console:

- Email/Password
- Google

## 8. Stripe Setup (for paid plans)

Set function runtime config values:

```bash
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_live_or_test_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
```

Deploy functions:

```bash
firebase deploy --only functions
```

## 9. Firestore TTL (must configure once)

Create TTL policies in Firestore Console for these collection groups using `expiresAt`:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

TTL is async cleanup. Real-time UX still depends on client-side stale filtering.

## 10. Deploy

Full deploy:

```bash
firebase deploy
```

Or GitHub Pages branch-root publish:

1. Push `steven/product` (or target branch)
2. GitHub Pages -> Deploy from branch -> `/ (root)`

## 11. Troubleshooting

- If rules tests fail with Java errors: verify `java -version`.
- If billing fails: verify Stripe key/price/webhook values and function logs.
- If users cannot sign in: verify Firebase Auth providers and domain allowlist.
- If multiplayer data fails: verify Firestore rules/indexes deployed and TTL configured.
