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
   - run `npm run test:world-matrix` to validate the same rules across preset + custom locations
   - switch Walk -> Drive from beside buildings and confirm the car is not trapped in geometry
   - verify greenery appears in parks / woods / mapped tree areas without a large frame-time spike
   - walk up to a supported building prompt, press `E`, confirm the interior loads only on demand, then press `E` or `Esc` to exit cleanly
   - select a real-estate or historic destination, navigate to it, and confirm the same `E` prompt/entry flow works there too
   - open `Contributor Editor`, capture `Current Building`, switch to `Building Note`, preview it, and confirm the live world stayed unchanged
   - switch to `Photo Contribution`, add a test photo URL, preview it, and confirm the building-specific fields swap to photo fields
   - if signed in with Firebase configured, submit a test contribution and confirm it appears in `My Submissions` as `pending`
   - if signed in as admin/allowlisted owner, open `/account/moderation.html`, confirm the queue loads, and verify approve/reject actions work there
   - switch Earth <-> Ocean from in-game environment controls
   - verify water remains visible where expected, including coastal water plus rivers / ponds / lakes
   - verify the current active build keeps path overlays hidden/disabled while walk/drive traversal remains stable on the road-and-ground network
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
