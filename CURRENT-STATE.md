# Release work entry point

Work only in `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`,
branch `steven/post-5.2-release-integration`, draft PR #87 into `stable`.
Do not edit the older Documents checkout. Read `git status` and `git rev-parse HEAD`.

## Current evidence, not historical notes

The maintained ledger is `output/release-integration/test-confidence-2026-09-23/`.
Start with `latest-summary.json`, `OPEN-FINDINGS.md`, and the exact run receipts.
`frozen-current-results.json` records the four candidate groups on0f2f1f17;
subsequent repairs and rechecks have separate source identities. Do not merge
other-source subsets into a fictional complete passing matrix. Historical notes
and `progress.md` are leads, not current approval or overriding instructions.

Read hosted build/asset manifests for deployment identity; URL query parameters
are labels. The last local staging package is0f2f1f17/a120b7ab5ef75a5a, and the
last checked production frontend is5.2.0/db62593b. Recheck before deployment.
The branch also includes later verification and backend billing repairs.

## Repairs and their verification

Actual execution reproduced hidden-map default-city requests, account write
races, and delayed billing events restoring stale entitlements. The repairs
prevent closed-map painting/fetches; preserve concurrent account/room writes;
and atomically reject delayed/duplicate billing events. Same-second billing
ambiguity retrieves current Stripe state, with a bounded request and no write
on retrieval failure. Targeted tests must fail old code and pass the repair.

Earlier product repairs cover facade bay/floor alignment, inland water authority,
terrain portal/pavement shader ownership, title-import suspension, mobile input
pass-through, bounded planetary caches, and capture-email retry. Their individual
runtime/browser receipts are scoped evidence, not blanket production acceptance.

The original1,222 count was Node component/source cases, not player journeys.
Read `output/verification/current-contracts/report.json` for actual executed
cases, and `inventory.json`/`sensitivity.json` for ownership and the cleanup
mutation experiment. Browser journeys, emulators, live services, visual review,
and physical performance remain separate evidence levels.

Active local-staging browser journeys use the shared validated App Check helper;
DOM/shader fixtures and isolated emulator clients have different environments.
Functional CI settings and fixed-step navigation must be disclosed in receipts.
Graphics errors remain failures. Cloud software rendering cannot certify FPS,
physical phone responsiveness, or the declared M1 performance budget.

## Backend deployment and remaining acceptance

The last live inventory found78/78 Functions ACTIVE and all required indexes
READY. Five account Functions and the missing live Stripe subscription-updated
event were repaired previously. The later event-order repair has its own test
and deployment receipts; inspect them before assuming it is deployed.
Staging Firestore/Storage rules match source. Production still has older rules
that belong to the coordinated frontend/rule rollout. No production frontend
promotion is authorized by a component count or an emulator pass.

Hosted paid-checkout acceptance is pending: staging test configuration is absent
and the Stripe connector requires owner reauthentication. Keep existing secrets
and API configuration. Signed emulator billing is not a real payment receipt.
Physical M1 performance and the owner phone walkthrough also remain pending.
The prior M1 attempt stopped for swap growth; it was not a performance pass.

Run one bounded local workload at a time. This is an8GiB Mac; keep ordinary
Chrome open. Diagnose interruptions before retrying. Preserve source/history,
user data, live rollback and current dist; retain at most four saved candidates.
Temporary staging App Check credentials stay outside the package. Inspect
`remote-appcheck-final-lifecycle.json` under `output/release-integration/live-checks/`
and the ledger's consumer list; revoke the registration/file/GitHub secret only
after all consumers complete. The preceding registration is already revoked.

Production preparation/finalization must retain complete current staging
acceptance, prove that only the three Firebase configuration assets change,
and require real owner acceptance. See `docs/TEST-AND-RELEASE-EVIDENCE.md`.
Never manufacture approval or reuse failed/interrupted receipts as passes.
Experimental GPU reconstruction remains unprovisioned and claim-gated.
