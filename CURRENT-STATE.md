# Release work entry point

Work only in `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`,
branch `steven/post-5.2-release-integration`, draft PR #87 into `stable`.
Do not edit the older Documents checkout. Verify Git status and HEAD first.

## Active space-quality work (September 24)

The current task is the owner's space/interior refinement request. Its evidence
ledger is `output/release-integration/space-quality-2026-09-24/LEDGER.md`.
Free CC-BY Sketchfab furnishings were acquired through the signed-in browser,
converted to bounded local GLBs, and integrated across Solis Reach rooms.
Space changes include Pathfinder readiness, aircraft pitch, ship wall/camera
repairs, crew fallback, observed-star projection/selection, volumetric nebulae,
and seamless modeled planet surfaces. These changes are not yet deployed.
Do not use the older production matrix below as acceptance of these changes.

A new audit found 19 asynchronous `waitForFunction` predicates in 12 older
browser verifiers. This installed Playwright treats their Promise as truthy;
those predicates did not reliably wait for readiness. They now use an explicitly
awaited polling helper. Re-evaluate affected evidence when those gates are needed;
do not infer complete production acceptance from their historical receipts.

## Current evidence

The maintained ledger is `output/release-integration/test-confidence-2026-09-23/`.
Read `latest-summary.json`, `OPEN-FINDINGS.md`, and the actual run receipts.
Historical notes and progress entries are leads, not current acceptance.
Read local and hosted build/asset manifests for deployment identity. URL query
labels and branch HEAD do not prove that a repair is deployed.

The original 1,222 cases were Node component/source tests, not player journeys.
Read the executed `current-contracts/report.json` and corresponding inventory
and sensitivity receipts. The cleanup mutation experiment demonstrated that
source-text assertions can pass while the actual runtime behavior is broken.
Browser journeys, signed emulator HTTP, live services, visual review, phone
acceptance, and physical performance are separate evidence levels.

Current nonphysical results and rechecks are recorded in
`vehicle-footprint-matrix-results.json` and
`vehicle-footprint-backend-results.json` in the ledger.
`latest-product-results.json` describes the older staging32 runtime. Do not combine differing runtime
assets into a complete release. For verifier-only commits, check both the runtime
source diff and every gate's asset-manifest hash against the staged package.
Historical virtual-GPU allocation/context failures remain failed receipts;
a fresh-run pass alone does not establish a graphics repair. Functional CI quality
settings and simulation timing cannot establish physical load time or FPS.

## Mobile verification correction (September 24)

Several browser journeys used a touch viewport with Chromium's desktop user
agent. A bounded browser probe confirmed one touch point and desktop app
classification. Their old results establish touch-layout behavior, not mobile
world-loading coverage. Mobile contexts now supply the Playwright iPhone user
agent without changing viewport sizes, pixel ratios, assertions or deadlines.
The recorded multiplayer maps also have a contract against the shipped query
generator. Recheck affected journeys; do not carry their old passes forward as
mobile acceptance. The receipt is `mobile-profile-probe.json` in the ledger.

## Repairs and deployment scope

The latest vehicle repair replaces width-only circular collision with full
swept oriented footprints, covering the visible front and rear body. Its runtime
assets require their own acceptance; older staging32 results are historical.

Recent runtime repairs address idle touch controls cancelling hardware walking
turns, painting also opening unrelated building selection cards, and slow parcel
queries. Parcel loading now resolves spatial IDs before bounded geometry batches.
Before/after regressions, browser journeys, provider readbacks and deployment
identities are linked from the maintained ledger; use those executed receipts.

Repair receipts cover hidden-map requests; exact parcel-query cache ownership;
account concurrency; canonical Stripe subscription reconciliation; and vehicle
lease recovery/authoritative pose and proximity checks. Consult the ledger for
which source is built, verified, or deployed. Canonical billing reads occur for
each distinct signed subscription event, including legacy accounts without a
cursor; lookup failure aborts the transaction for webhook retry.

The owner authorized missing production Functions, indexes and supporting
backend repairs. Use explicit project `worldexplorer3d-d9b83`, preserve working
parameters/data, and deploy only the verified selected Functions. Production
frontend Hosting and restrictive rules await coordinated release acceptance.
Never manufacture owner approval, payment receipts or passing execution records.
See `docs/TEST-AND-RELEASE-EVIDENCE.md` for the promotion guards.

Hosted Stripe checkout, the owner phone walkthrough and physical M1 performance
remain distinct acceptance requirements. Staging test billing is unconfigured;
the Stripe connector requires owner reauthentication. Emulator billing is not a
real hosted payment journey. Experimental GPU capture remains claim-gated.

## Resource and credential ownership

Run one bounded local workload at a time on this 8 GiB Mac. Keep ordinary Chrome
open. The previous physical-performance attempt stopped for swap growth; do not
retry without resolving the resource condition. Preserve source/history, user
data, current dist and live rollback; retain at most four saved candidates.

Temporary staging App Check credentials never belong in source or artifacts.
Use `temporaryStagingCredentials` in the maintained ledger to find the actual
active receipt and every consumer. Revoke the registration, private credential
file and GitHub secret after all consumers finish; never delete a credential
that an active run still needs. Old registration receipts are historical.
