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
npm run sync:public
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

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

## 6. Manual Smoke Checklist (Release Candidate)

1. Title launch:
   - verify Earth/Moon/Space/Ocean destination toggles
   - verify `Use My Location` button in title flow
2. Globe selector:
   - verify `Use My Location`
   - verify custom coordinate launch and place label update
3. Runtime:
   - launch Earth and verify world/map UI loads
   - verify `M` opens the large map
   - verify `F4` still opens the debug overlay
   - verify `Use My Location` / custom-location launch lands on safe ground, nearest walkable path, or nearest safe road when blocked
   - switch Walk -> Drive from beside buildings and confirm the car is not trapped in geometry
   - verify greenery appears in parks / woods / mapped tree areas without a large frame-time spike
   - walk up to a mapped building prompt, press `E`, confirm the interior loads only on demand, then press `E` or `Esc` to exit cleanly
   - switch Earth <-> Ocean from in-game environment controls
   - verify railways / footways / cycleways appear in the loaded city and map overlay as solid terrain-following surfaces
   - verify water remains visible where expected, including coastal water plus rivers / ponds / lakes
   - verify walk navigation can follow footways / cycleways / rail corridors and drive navigation stays on roads
4. Account / donation surfaces:
   - verify landing/runtime/account copy does not imply payment is required for map or core play
5. No new blocking console/runtime errors in primary flows

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
