# Quick Start

Last reviewed: 2026-03-27

Fast path to run, test, and validate World Explorer 3D locally.

This file is written for both developers and non-developers.

If you only want to run the project and test gameplay, focus on Sections 1 to 4.
If you are changing code, also follow Sections 5 to 8.

## 1. Prerequisites

- Node.js 20+
- npm
- Python 3
- Java 21 (required for Firestore rules tests)
- Firebase CLI (`npm i -g firebase-tools`) for backend deploy steps

If you are only trying the local build, Python, Node.js, and npm are the important parts.

## 2. Install

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
cd functions && npm install && cd ..
npx playwright install chromium
```

## 3. Run Locally (Hosting-Style)

```bash
npm run sync:public
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

If something looks wrong, always refresh once after `npm run sync:public` so the browser picks up the newest runtime files.

## 4. Mirror Discipline (Canonical -> `public/*`)

Canonical gameplay/runtime source is `app/*`.
Canonical landing/account sources are `index.html` and `account/index.html`.

Before tests/deploy:

```bash
npm run sync:public
npm run verify:mirror
```

## 5. Validation Gates

```bash
npm run test
npm run release:verify
```

Optional focused OSM feature smoke:

```bash
npm run test:osm-smoke
```

This checks:

1. mirror parity
2. Firestore rules tests
3. runtime invariants via Playwright

If you are not changing backend or deployment behavior, you usually do not need every backend step before basic local testing.

## 6. Manual Smoke Checklist

1. Title launch:
   - verify Earth/Moon/Space/Ocean destination toggles
   - verify `Use My Location` button in title flow
2. Globe selector:
   - verify `Use My Location`
   - verify custom coordinate launch and place label update
3. Runtime:
   - launch Earth and verify world/map UI loads
   - verify `M` opens the large map
   - verify `Use My Location` / custom-location launch lands on safe ground, nearest walkable path, or nearest safe road when blocked
   - switch Walk -> Drive -> Drone and confirm traversal stays responsive
   - return to main menu and load a second city
   - verify no fullscreen gameplay loader reappears during normal play
   - verify boat mode appears only near valid water
4. Validation:
   - run `npm run test:performance-stability`
   - run `npm run test:drive-camera-smoothness`
   - run `npm run test:city-reload-cycle`
5. Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the full release gate.

## 7. GitHub Pages Readiness

- Ensure `public/*` has the release-ready build state.
- Ensure runtime links/assets resolve under Pages hosting path.
- Push branch and verify workflows in Actions tab.

## 8. Backend Deploy (If Needed)

```bash
firebase use worldexplorer3d-d9b83
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions
```
