# Quick Start

Last reviewed: 2026-03-13

Fast path to run, test, and validate World Explorer 3D locally.

## 1. Prerequisites

- Node.js 20+
- npm
- Python 3
- Java 21 (required for Firestore rules tests)
- Firebase CLI (`npm i -g firebase-tools`) for backend deploy steps

## 2. Install

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
cd functions && npm install && cd ..
```

## 3. Run Locally (Hosting-Style)

```bash
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

## 4. Mirror Discipline (`app` -> `public/app`)

Canonical runtime source is `app/*`.

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

## 6. Manual Smoke Checklist (Release Candidate)

1. Title launch:
   - verify Earth/Moon/Space/Ocean destination toggles
   - verify `Use My Location` button in title flow
2. Globe selector:
   - verify `Use My Location`
   - verify custom coordinate launch and place label update
3. Runtime:
   - launch Earth and verify world/map UI loads
   - switch Earth <-> Ocean from in-game environment controls
4. No new blocking console/runtime errors in primary flows

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
