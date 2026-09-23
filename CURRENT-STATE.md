# Current release work

Updated September 23, 2026. This is the starting point for the integration branch,
not proof that a deployment or test has completed. Recheck the referenced receipts
and live services before making release claims.

- Working checkout: `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`.
- Branch: `steven/post-5.2-release-integration`; draft integration PR: #87, base `stable`.
- Production Hosting: 5.2.0, commit `db62593ba377` at the last verified read.
- Hosted staging verified at 12:11 UTC September 23: `5.3.0+9b3d35b56c2a.327bb975810a64af.staging`; hosted build and asset manifests match the tested local artifact. Later documentation commits do not change this artifact identity.
- Production backend verified at 11:45 UTC September 23: 78/78 Functions ACTIVE, required indexes READY, no missing handlers; capture worker invocation is restricted to its dedicated service account. Hosting and security rules were not deployed.
- September 23 repairs: removed per-update transport diagnostic sorting; bounded
  solid-world retention to two recent worlds and detached the prior planet;
  tightened the capture worker invoker policy and its regression test; added the
  missing capture-email retry Hosting route; reconciled backend configuration.
  Added 5 composite indexes and 12 collection-group field indexes, preserving
  existing indexes. All required indexes were verified READY.
- Current artifact evidence: source coherence and 1,222 contracts pass on 9b3d35b5;
  its packaged Moon gameplay/pause check passes and screenshots were inspected.
  Planetary cache integration and the complete 15-assertion city-gameplay check
  pass on db5705d9. Asset comparison proves the only change between those builds
  is the sign-in hint in app/index.html; all runtime JavaScript is byte-identical.
  The earlier Linux city run failed its deadline with very slow SwiftShader
  frames. That failure is retained separately from the passing macOS/Metal run;
  neither is a physical-device performance measurement.
- All remote checks from this audit finished. Temporary staging App Check
  registration, GitHub secret and local credential were removed. No local game
  browser or emulator was launched during this pass; ordinary Chrome stayed open.
- The startup graph contains no Playwright/verification modules or duplicate
  module identities. Diagnostics are on-demand inspection; perf.js controls
  adaptive quality; Memories is gameplay. Source size is not runtime RAM/FPS.
- September 23 work: production backend/index reconciliation and runtime cost audit.
  Follow `output/release-integration/audit-2026-09-23/` for local evidence; private
  parameter files there must never enter Git or public reports.

## Evidence and commands

- Latest [packaged game check](https://github.com/RRG314/WorldExplorer3D/actions/runs/35858596632),
  [planetary integration](https://github.com/RRG314/WorldExplorer3D/actions/runs/35857130505),
  and [complete city gameplay](https://github.com/RRG314/WorldExplorer3D/actions/runs/35857989509).
- `npm run verify:source`: syntax, source coherence and module identities.
- `npm run verify:current-contracts`: explicitly selected current regression tests.
- `node scripts/audit-runtime-startup.mjs`: resolved eager/deferred module graph;
  this reports source bytes, not measured runtime memory or frame performance.
- `scripts/verification/`: separate test programs. They are not game entrypoints.
- `output/release-integration/audit-2026-09-22/structure/PRODUCTION-READINESS.md`:
  previous candidate's detailed evidence. Subsequent product changes require
  appropriate new checks; earlier passes must not be relabeled as new results.
- `progress.md`: chronological history. Old restrictions, candidate IDs and
  interrupted tests in that file are historical, not current state.
- `docs/audits/`, dated release notes, and earlier system inventories describe
  their stated dates. Check implementation and current cloud state first.

## Operating constraints

Keep ordinary Chrome open. Run one bounded local workload at a time on this
8 GiB Mac. Preserve source/history, user data and the live rollback. The owner
authorized production Functions/index repairs on September 23; do not use a
backend deployment as evidence of frontend release acceptance. The experimental GPU
reconstruction job is not provisioned; public capture uses manual placement. Phone acceptance
is still deferred, and sustained physical-device performance remains unverified.
