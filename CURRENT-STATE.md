# Current release work

Updated September 23, 2026. This is the starting point for the integration branch,
not proof that a deployment or test has completed. Recheck the referenced receipts
and live services before making release claims.

- Working checkout: `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`.
- Branch: `steven/post-5.2-release-integration`; draft integration PR: #87, base `stable`.
- Production Hosting: 5.2.0, commit `db62593ba377` at the last verified read.
- Hosted staging: 5.3.0, commit `94da678c07b6` at the last verified read.
- Production backend verified at 11:45 UTC September 23: 78/78 Functions ACTIVE, required indexes READY, no missing handlers; capture worker invocation is restricted to its dedicated service account. Hosting and security rules were not deployed.
- September 23 work: production backend/index reconciliation and runtime cost audit.
  Follow `output/release-integration/audit-2026-09-23/` for local evidence; private
  parameter files there must never enter Git or public reports.

## Evidence and commands

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
backend deployment as evidence of frontend release acceptance. Phone acceptance
is still deferred, and sustained physical-device performance remains unverified.
