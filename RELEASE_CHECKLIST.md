# Release Checklist

Use this checklist before merging to the production release branch.

## Branch Safety
1. Confirm you are **not** editing directly on the live branch.
2. Create a production baseline tag before deploy (example: `prod-20260302-1530`).

## Mirror Safety
1. Sync canonical runtime to hosted runtime:
   - `npm run sync:public`
2. Verify app/public parity:
   - `npm run verify:mirror`

## Runtime Safety
1. Run rules tests:
   - `npm run test:rules`
2. Run runtime invariants:
   - `npm run test:runtime`
3. Full gate (recommended single command):
   - `npm run release:verify`

## Required Runtime Invariants
- `centerHits === 0` (no building collision in road center samples)
- `laneHitRatePct <= 2.0`
- `waterAreas + waterways > 0`
- `visibleWaterMeshes > 0`
- `consoleErrors.length === 0`

## Artifacts
- Runtime report: `output/playwright/runtime-invariants/report.json`
- Runtime screenshot: `output/playwright/runtime-invariants/runtime-invariants.png`

## Deploy Rule
- Do not deploy unless all checks above pass.
