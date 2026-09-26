# Release work entry point

Work only in `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`,
branch `steven/post-5.2-release-integration`, draft PR #87 into `stable`.
Do not edit the older Documents checkout. Verify Git status and HEAD first.

## Active owner request: ship and exploration redesign

The owner superseded release finishing with a substantial research/design-first
request: circular hallways, an exterior-facing pod bay and launch door, functionally
furnished original exploration-ship rooms, physical specimen placement and research/
fabrication using existing conserved collections, richer all-space destinations,
and line-artifact repairs without changing the nebula appearance they like.

Research/design work is saved in docs/design/SOLIS-REACH-EXPLORATION-REDESIGN.md.
The runtime now uses the shared 32m-radius ring plan for three decks, 25 rooms,
room/crew/station placement, doors, maps and architectural collision. All-pairs
room-route topology tests pass. Physical research uses the existing specimen
records and expedition mutation authority; no parallel inventory was introduced.
Galaxy/stellar-region scenes now have a navigable reconstructed volume. The
nebula artwork is unchanged; selected constellation highlights respect the toggle,
and constellation paths stay on the observer sky shell.

Staging now serves 5.3.0+56fcf94d400b.e1ad84e8534bf3fc.staging, verified by
hosted build-manifest/content hash and all seven new GLB responses. Runtime source
is78f2cc30;56fcf94d adds only handoff documentation. No production deployment.

Real Sketchfab reactor, consoles, laboratory desks, medical tables, equipment
servers, wall instruments and social-room furniture replace their old primitive
builders. Authors, source URLs and licenses are in the asset catalog and
app/assets/models/ATTRIBUTION.md. Remaining custom utility geometry includes
galley appliances, life-support/thermal equipment, hydroponics, exercise/EVA,
resource processing and the fabrication gantry. Do not claim all props replaced
or uniform high-end art quality; these are explicit remaining art limitations.

Completed remote evidence:36207329569 space-quality (61 destinations/25 rooms,
9 nebula views) and game-client-smoke;36207818083 physical ship-research journey;
36207910233 authenticated two-player shared-research diagnostic;36208510386
universe-wayfinder desktop/mobile. Latest36209521137 at78f2cc30 PASS ship-gallery
and game-client-smoke. Opened every final room contact sheet and camera view.
Corrected wall-navigation orientation; both panel faces now visible. Replaced
large cylinder caps with subdivided circular surfaces: actual first-person
screenshots confirm floor/ceiling texture and occlusion issue resolved. Overhead
camera remains beneath ceiling; briefing/observation use licensed furniture.

Staging mutateSharedExpedition is ACTIVE version3, updated2026-09-26T01:32:54Z;
existing deployed parameters preserved and temporary local env removed.
Production research function is not updated by this iteration. Production last
verifieddb62593. Hardware/phone responsiveness remains unverified; remote browser
screenshots use software rendering. Do not equate these results with a completed
production release review for the expanded redesign.

Ordinary Chrome remains open.33GiB free at last check. Temporary AppCheck
registration, private credential and GitHub test secret were removed after all
remote runs completed. Evidence:output/release-integration/ship-systems-redesign/
LEDGER.md,artist-hosted-identity.json,staging-research-readback.json.

## Final space candidate (September 25)

Runtime frozen at fef3e82a; the following commit corrects only an outdated Venus
catalog test and this handoff. No game assets changed after final browser checks.
Evidence: output/release-integration/ship-overhaul-2026-09-25/LEDGER.md and
RELEASE-CANDIDATE.md. Read the hosted identity receipt there for the deployed
staging candidate; URL query labels are not deployment proof.

Final runtime additions: owned indoor PMREM reflections for metallic licensed
furniture and metre-scaled bulkhead/deck panels. Reflections are released on exit;
Earth environment ownership is restored. Reviewed bridge, quarters, medical and
cargo screenshots. Rooms and some fittings remain stylized; a complete new art
kit or measured reconstruction of local extraterrestrial terrain is not claimed.

- Remote 36191268666: space-quality, prescribed game-client-smoke and space-release
  all passed. Includes rendered galleries, camera modes, crew/furnishings,
  atmospheric entry/return, space resource lifecycle and player journeys.
- Remote 36191360361: source-graph, artifact-world, artifact-integrity and
  release-identity passed. current-contracts failed one stale expectation that
  Venus orbit use the surface radar image instead of its new cloud image.
- Corrected that expectation while retaining physical facts and adding a separate
  orbital/surface imagery assertion. Final sequential local component run passed
  all 1377 cases; no skipped/TODO cases. This is not 1377 player journeys.
- Latest ten-solid-world render/cache check remains passed at c1396f13; subsequent
  runtime changes are ship-only. Do not rerun that check without relevant changes.
- Live production inventory: 78 Functions ACTIVE, 11 indexes READY, no pagination.
  This is deployment-state evidence, not execution of every live Function.

Production remains 5.2.0+db62593ba377.6342cddaba06fc68.production. Full production
promotion remains blocked by incomplete/stale release-wide execution manifests
and unverified physical-device/owner phone acceptance. Do not manufacture approval
or reinterpret focused passes as the complete release matrix. Backend, billing
and performance evidence limits below still apply. The owner deferred phone testing.

Keep ordinary Chrome open. Approximately 7 GiB free; no local WebGL tests used.
Temporary staging App Check consumers are runs 36191268666 and 36191360361; see
output/release-integration/live-checks/ship-final-appcheck.json for cleanup state.

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
