# World Explorer Stability Audit And Plan (2026-03-02)

## Scope
- Goal: prevent global regressions while shipping targeted fixes.
- Constraint: do not change production behavior except road/building collision cleanup.
- Deployment note: Firebase Hosting serves from `public/`.

## Audit Findings

### 1) Water is currently enabled in the live-served runtime
- Hosting path points to `public`: `firebase.json` (`hosting.public = "public"`).
- Water loading is present in live-served world loader:
  - `public/app/js/world.js` loads vector water polygons/lines and adds water meshes.
- Runtime verification from local app session:
  - `roads: 3400`
  - `waterAreas: 70`
  - `waterways: 8`
  - `visibleWaterMeshes: 2`

### 2) The road-collision fix is local-only and targeted
- Driving collision gate suppresses likely ghost collider hits in road core:
  - `public/app/js/physics.js`
  - mirrored in `app/js/physics.js`
- Building generation now blocks road-overlapping footprints and upgrades risky `bbox` colliders near roads to `full`:
  - `public/app/js/world.js`
  - mirrored in `app/js/world.js`

### 3) Primary regression risk is workflow, not a single bug
- The runtime is maintained in mirrored trees (`app/*` and `public/app/*`).
- A fix in one subsystem can regress another without strict release gates.
- Current repo tests cover Firestore rules only (`package.json`), not runtime world/collision/water invariants.

## Stabilization Plan

### Phase 0: Protect Production
1. Create a production baseline tag before any release (`prod-YYYYMMDD-HHMM`).
2. Deploy only from a dedicated `live` branch.
3. Keep feature work on isolated branches (`steven/<feature>`), never direct to `live`.

### Phase 1: Single Source Workflow (No Drift)
1. Declare one canonical runtime tree (`app/*`).
2. Add a sync step (`app -> public/app`) as a scripted, explicit action.
3. Add a pre-release check that fails if `app/js` and `public/app/js` differ.
4. Include `app/index.html` vs `public/app/index.html` parity check.

### Phase 2: Regression Guardrails (Automated)
1. Add runtime audit scripts to CI/local release checks:
   - Road-center collision invariant: `centerHits === 0`.
   - Water presence invariant at a water-rich location:
     - `waterAreas + waterways > 0`
     - `visibleWaterMeshes > 0`.
2. Keep an allowlist threshold for lane-edge contacts (small non-zero is acceptable).
3. Fail release if any invariant fails.

### Phase 3: Change Isolation
1. Introduce feature flags for risky systems:
   - collision tuning
   - building collider simplification level
   - water/vector tile behavior.
2. Gate new behavior behind flags defaulting to existing production behavior.
3. Promote flags only after local + staging validation.

### Phase 4: Release Checklist (Required Every Time)
1. Run syntax checks for touched runtime files.
2. Run road collision audit script.
3. Run water presence check.
4. Run a manual smoke pass at 2-3 representative locations.
5. Capture artifacts (JSON + screenshots) in `output/playwright/...`.
6. Merge to `live` only if all checks pass.

## Immediate Next Steps (Recommended)
1. Add `scripts/release-verify.mjs` to run all runtime invariants in one command.
2. Add `npm run test:runtime` for collision + water checks.
3. Add `npm run sync:public` and `npm run verify:mirror` to prevent tree drift.
4. Add a short `RELEASE_CHECKLIST.md` with exact commands and pass/fail thresholds.

## Current Status Summary
- Water: confirmed present in local live-served path.
- Road-center ghost collisions: reduced to zero in audit run.
- No production deploy performed during this work.
