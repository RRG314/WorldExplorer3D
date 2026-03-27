# Testing

Last reviewed: 2026-03-27

This file describes the runtime checks that matter on the `steven/continuous-world-root-repair` branch and where to find their outputs.

## 1. One-Time Local Setup

Install project dependencies:

```bash
npm install
cd functions && npm install && cd ..
```

Install the Playwright browser used by the runtime checks:

```bash
npx playwright install chromium
```

Sync the hosted mirror before running runtime tests:

```bash
npm run sync:public
npm run verify:mirror
```

## 2. Primary Branch Checks

These are the branch-level tests that should be used first when evaluating continuous-world stability.

| Command | Purpose | Notes |
| --- | --- | --- |
| `npm run test:performance-stability` | Startup and warm-reload runtime performance | Treat cold-boot numbers carefully if Overpass is rate-limiting |
| `npm run test:drive-camera-smoothness` | Normal on-road driving smoothness | This is the main drive-feel regression check |
| `npm run test:city-reload-cycle` | Title/menu location switching | Confirms old city data is released and the next city loads cleanly |
| `npm run test:continuous-world-building-continuity` | Far-drive road/building continuity | External Overpass failures should be recorded separately from logic regressions |
| `npm run test:boat-smoke` | Earth boat entry and exit at real water locations | Focused on valid-water detection and mode transitions |

## 3. Secondary Checks

Use these when you are working on a specific subsystem:

| Command | Purpose |
| --- | --- |
| `npm run test:drive-surface-stability` | Road seam, ramp, and elevated surface checks |
| `npm run test:elevated-driving-surfaces` | Elevated road/bridge retention |
| `npm run test:ramp-transition-sanity` | Ramp transition continuity |
| `npm run test:ramp-contact-retention` | Retaining valid road contact through ramp changes |
| `npm run test:load-spawn-settle` | Spawn safety and early load stability |
| `npm run test:runtime` | Broad runtime invariants |
| `npm run test:world-matrix` | Multi-location Earth validation |

## 4. Output Locations

Playwright reports are written under:

- `output/playwright/performance-stability/`
- `output/playwright/drive-camera-smoothness/`
- `output/playwright/city-reload-cycle/`
- `output/playwright/continuous-world-building-continuity/`
- `output/playwright/boat-smoke/`

The branch-level summary belongs in [docs/BRANCH_STATUS.md](docs/BRANCH_STATUS.md). Do not create new dated audit files for routine validation snapshots.

## 5. Interpreting Results

- A test should be considered trustworthy only if its failure matches visible gameplay behavior or a clear infrastructure fault.
- Overpass `429`, `502`, and `504` responses are infrastructure faults. They should be recorded, but they are not the same thing as a renderer, camera, or physics regression.
- `test:performance-stability` can pass overall while still showing a cold-boot slowdown caused by upstream data availability. That distinction belongs in the branch status doc.
- `test:drive-camera-smoothness` is the main gameplay smoothness probe for normal driving. It should not be allowed to hide chase-distance drift or load-coupled stutter behind a false green.
- `test:city-reload-cycle` should be treated as release-blocking for this branch because location switching is a core user flow.

## 6. Documentation Policy

Testing history should live in:

- [CHANGELOG.md](CHANGELOG.md) for notable branch changes
- [docs/BRANCH_STATUS.md](docs/BRANCH_STATUS.md) for the current verified branch snapshot
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for active regressions

Do not add dated report files to the repository root or `docs/` for routine reruns.
