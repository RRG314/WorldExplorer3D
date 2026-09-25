# Release work entry point

Work only in `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`,
branch `steven/post-5.2-release-integration`, draft PR #87 into `stable`.
Do not edit the older Documents checkout. Verify Git status and HEAD first.

## Active space-quality work (September 25)

Runtime fixes are committed through `c1396f13` and pushed to the integration
branch. Evidence: `output/release-integration/ship-overhaul-2026-09-25/LEDGER.md`.
User expanded scope to actual visual quality for planets, flyovers and nebulae.
Implemented legacy-avatar removal and r128 resource ownership fixes, isolated
Earth lighting/environment, regional map UVs, sourced replacement NASA maps,
rounded/textured dwarf planets, Saturn ring imagery, Venus orbital clouds,
body-fixed giant cloud volumes, nebula filaments and surface material relief.

Latest verification:
- `36145930173` (87383f2d): space-quality passed, including actual camera toggles
  around one curated player, seven crew, 39 furnishings, star selection/travel,
  orbital gallery, three nebula viewpoints and four giant-atmosphere fixtures.
- `36145793381` (f691e47b): space-release passed, including 55 component cases,
  local physics, Jupiter entry/return continuity, resource lifecycle and journey.
- `36146107547` (c1396f13): ten-world cache/render check passed after correcting
  a Three r128 shader macro collision. Earlier run36145720979 failed and stays
  recorded as failed. Ground/aerial screenshots reviewed; no GPU errors in rerun.
- Prescribed game-client-smoke passed in run36143533121 (439ee461); later
  changes have focused scene/transition evidence, not renewed input-smoke evidence.
All consuming runs completed; temporary App Check registrations/files/GitHub
secret have been revoked/removed. No local test browser/server left running.

**Not globally visually accepted or production-ready.** Orbital assets and
nebula structure visibly improved; gas flyover is a modeled cloud volume with
observed global color and no repeated floor tiles, still limited close-up detail.
Local landing terrain remains sparse/generic; primitive rover art remains.
Solis Reach architecture/art overhaul is not complete; some rooms remain
boxy and furnishings dark. Free modular Sketchfab kit download was blocked by
Chrome; owner help requested once, still pending. Existing licensed assets are
available. Pluto source has unobserved polar gaps; do not call its coverage complete.
Full physical-device responsiveness/phone acceptance remains unverified.

Staging remains `5.3.0+d56a763ee585.60de62d12b1bd025.staging`; production remains
`5.2.0+db62593ba377.6342cddaba06fc68.production`. No deployment this session.
The owner authorized production only after reported issues are fixed.
Ordinary Chrome remains open. Approximately 3.9 GiB disk free; heavy browser
checks used authorized GitHub runners, not concurrent local WebGL workloads.

## Historical space-quality checkpoint (September 24)

The current task is the owner's space/interior refinement request. Its evidence
ledger is `output/release-integration/space-quality-2026-09-24/LEDGER.md`.
Free CC-BY Sketchfab furnishings were acquired through the signed-in browser,
converted to bounded local GLBs, and integrated across Solis Reach rooms.
Space changes include Pathfinder readiness, aircraft pitch, ship wall/camera
repairs, crew fallback, observed-star projection/selection, volumetric nebulae,
and seamless modeled planet surfaces. Staging now serves runtime `d56a763e`
(build `5.3.0+d56a763ee585.60de62d12b1bd025.staging`). Hosted manifests
matched the verified local/remote assets. Production Hosting is unchanged.
Remote run `36088114408` passed the focused space visual/functional fixture
and gameplay smoke; screenshots were inspected. The fixture verifies seven
curated crew, 32 furnishings, three decks, star selection/travel, constellation
controls, and nebula viewpoints. It does not prove the full Earth-to-Pathfinder
launch journey, physical performance, or phone acceptance. Do not use the older
production matrix below as acceptance of these changes.

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
