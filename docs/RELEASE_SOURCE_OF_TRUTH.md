# Release source identities

## Current observation — October 17, 2026

Production remains **5.5.1**, confirmed by the live Hosting release API and both
live manifests. After the owner's account repair, the manifests return HTTP 200
at 10:10 p.m. EDT and match the hotfix identity below. No account mutation,
rollback or new production deployment was performed here. Private account
details are excluded from tracked release records. The complete **5.6.1** candidate remains
under verification. A version label or preview URL alone does not identify code.

| Reference | Build or source |
| --- | --- |
| Production frontend | `5.5.1+012e5c85582b.eb0d7eddf0f75035.production` |
| Production source | `012e5c85582b78a7808656545bf4143a31a18652` |
| Production Firebase project | `worldexplorer3d-d9b83` |
| Canonical staging frontend | `5.6.1+a0e20c35eab7.aa4dd9dce23502b0.staging` |
| Staging Firebase project | `we3d-staging-20260712` |
| Current frozen candidate | `5.6.1+614b452a57ae.dde9743f81c8b8ef.staging` |
| Preserved road-safe fallback | `5.6.1+b21b7f12fdfa.31ed9b1212c5002c.staging` |
| Release branch | `stable` (default; no `main` branch) |
| Active development branches | `steven/visual-quality`, `steven/post-5.2-release-integration` |

[Production](https://worldexplorer3d.io/app/) ·
[Staging](https://we3d-staging-20260712.web.app/app/) ·
[Release preparation PR](https://github.com/RRG314/WorldExplorer3D/pull/103)

Canonical staging now serves the a0e20c35 package; both hosted manifests match
local bytes. Production and backend origin restrictions were not changed.
After production recovered, ordinary Chrome returned live search results,
loaded Baltimore and displayed current weather on 5.5.1. This is not complete
account/shared-voyage/save acceptance. A fresh automated browser loaded the
world but received protected-service 401 responses; its failure was preserved
and no security controls were bypassed.

## Verification and rollback

Current checkpoint `614b452a` is on both active development branches. Its new
immutable package verifies 755 files; 2,695 source tests and the exact 65-file
rollback review pass. Lossless compression recovered 6.49 GiB, with original
paths and decoded contents preserved; free space reached 10.37 GiB before
packaging. Native package validation passes short ground movement and flight,
but sustained walking has a 150–217 ms pause cluster. Collector tracing confirms
memory-collection work in the cluster. No browser/local-service errors or gameplay
interruptions occurred; this is not a pacing pass. Full release acceptance remains
open; neither production nor canonical staging has been updated.

### Earlier b272 and source diagnostics (historical)

The b272ed7a package verifies 754 files and its exact 64-file rollback review.
Both active development branches contain the source. Its complete performance
run passes all twelve reload cycles, memory/coverage/resource limits and touch
regression, but fails desktop ground pacing and uninterrupted traversal. All
flight windows pass; a 550 ms walking interval and a later traffic/custody
interruption remain in the failed record. The 31 original receipt files are
preserved with verified hashes. No production promotion is permitted by these
results.

Subsequent source moves the existing exact Float32 pavement indexing into the
existing worker, transferring private construction buffers. It passes 76 focused
checks and all 2,691 source tests. Native short walking/driving and a 90-second
flight pass; the 90-second walk still has a 117–150 ms pause cluster. No browser
exception or gameplay interruption occurs. That run recorded live service errors
during the Hosting incident; the later ordinary Chrome recovery is recorded above.
The current image and prescribed keyboard action were reviewed. This focused
diagnostic does not include complete mixed-route/reload acceptance.
It is not in the frozen package or hosted staging. The remaining complete-candidate,
backend/save and hosted checks must use the final candidate's exact identity.

The next source change reuses a synchronous collision region for walking camera
probes. Its nine focused checks and complete 2,695-test source chain pass,
including 84 exact before/after camera results. Native source loads in 114.4
seconds and passes the 90-second flight, but sustained walking still records
266–317 ms pauses. Short ground percentile failures remain. No browser errors,
failed local resources or gameplay interruptions occur. Images and prescribed
keyboard input were reviewed. This source is not in the frozen candidate or
hosted releases. About 2.7 GiB free disk also prevents further checks that require
3 GiB to launch, and the regional check still requires 8 GiB. No pacing or
resource requirement was relaxed.

### Earlier geometry repair checkpoints (historical)

Subsequent local geometry-storage repairs pass 2,687 source tests and exact
clipping comparisons. Their native long-walk window passes, while flight and a
short walking frame-time window still fail. Recent live map inputs differ, so
these runs are not presented as a controlled performance comparison. This source
is not yet part of the frozen 296fb8a6 artifact or hosted staging.

The current 296fb8a6 package includes the traversal, graphics-preparation and
pavement-lifetime repairs. Both active development branches contain its source;
all 754 delivered files verify, 2,683 source tests pass and the 63-file rollback
review matches. Native packaged pacing still fails three windows, despite the
initial flight and five sustained windows passing. All twelve reload/cleanup
cycles, retained memory, coverage, transfer, loading and touch checks pass.
The remaining exact-package/backend/save/hosted acceptance is open.
Production and stable have not been promoted.

### Earlier a0e20c35 candidate (historical)

The a0e20c35 package is pushed to both active development branches. Its 754
files verify, all three backend gates pass, and the released 5.5.1 → candidate
→ compatible b21 fallback → candidate save journey passes. Its complete matrix
finished **103/107**: museum performance, general performance, a regional-travel
prelaunch disk refusal, and a Git identity timeout remain in the original record.
The later release-identity gate passed. These failures are not relabeled as passes.

Subsequent source work prepares resident graphics and the museum before first
use, finishes initial street coverage under the loading cover, yields nearby
source selection during travel and validates storefront approaches locally.
The source museum journey passes 67 checks. The current full source chain passes
**2,683 tests** plus structural, ownership, type, inventory and sensitivity checks.
Repeated native 90-second flight windows now peak at 50.1 ms. The full native mixed journey completed with preserved coverage and no
interruptions; both sustained walks and the later drive still have pauses up to
300.1 ms. Terrain-fitted reuse is confirmed within the original 16 MiB budget,
but is not a complete pacing fix. An additional publication-lifetime repair
passes the twelve-replacement collection test: zero old publications remain
reachable, compared with eleven before. Native pacing validation remains open. That source is not in the frozen staging package above.

The repaired mixed-provider Monaco junction passes controlled keyboard driving,
and source regional arrival/recovery/return checks pass. Complete immutable
acceptance, ordinary hosted account/voyage/save acceptance and final current-image
review remain open. Steep mountain approaches and some sidewalk-corner fragments
remain separate visual limitations. Production is still 5.5.1; PR #103 remains
draft and stable has not been promoted. See the October 14 READINESS ledger for
individual receipts and their exact scope.

### Earlier fb24 candidate (historical)

The fb24 source was pushed to both active development branches. PR #103 remained
draft and stable is unchanged. Current GitHub code/package and secret checks pass.
Its package is frozen and passes integrity verification with 753 files.
All 2,637 source tests and the structural chain pass. It includes the verified
parking-entry/main-street repair, bounded regional numeric storage, and the
facility callback repair that releases about 128 MB of load-source retention.
Its native 90-second flight still records 916.6 and 466.7 ms intervals. Short
walking passes; moving driving still fails pacing. Coverage, activation,
occupied memory and browser/local-resource checks pass. This is diagnostic
coverage, not complete candidate acceptance. The full matrix, backend/save
roundtrip, ordinary hosted voyage and final review remain open for fb24. The
in-progress complete run has already passed current city switching, district
activities, connected ocean streaming, submarine/diver/vessel interactions,
runtime cleanup, aquarium/harbor entry and the road junction. The previous f3ac
failures below are historical evidence, not the status of those fb24 checks.

Previous f3ac package: all three backend gates and the four-stage actual released
5.5.1/candidate/compatible b21 rollback/candidate save journey pass. The complete
candidate run finished at 03:11 UTC October 15 with **103 of 107 gates passing**.
Regional arrival was blocked before launch by its disk guard; city-switch
cancellation accounting and district activity admission require diagnosis;
native desktop timing fails, including a 1.3-second first-flight interval.
Twelve reloads, cleanup, coverage and touch regression pass. A separate downtown
street image also needs correction after exact packaged-scene reproduction.
These are not production-ready results. See the current READINESS section for
the preserved receipts and remaining hosted/review requirements.

### Historical comparison (not current acceptance)

The complete 376 candidate matrix finished **101 of 107 gates passing**. Its
failed receipts remain preserved. The preserved b21 candidate fixes the reproduced
Monaco road discontinuities and reuses roof vertices without removing buildings.
All 2,618 source checks, native Monaco assembly and the Baltimore keyboard
junction journey pass. These focused results do not replace the final complete
matrix or its performance, hosted-account and save-compatibility requirements.

The subsequent pavement-scheduling build removed the reproduced long path-builder
blocks but still failed sustained desktop timing. It was not promoted. The next
refinement divides nearby-capture index work across frames and culls smaller
regional instance cells without dropping buildings. The 33d5 package passes native resource/lifecycle and connected tutorial checks.
Its complete twelve-cycle performance run passes cleanup and touch emulation,
but still fails desktop frame-rate/hitch limits. A new, narrowly scoped collision
allocation repair is pushed to both active branches but still reproduces native
flight pauses. Generated building attributes now use fewer native backing buffers
with identical values; all 2,633 source checks pass. The complete packaged twelve-cycle run preserves coverage, cleanup, memory
retention and touch behavior, but still fails desktop pacing. Profiling links
the largest pauses to collection; a numeric-uniform cache experiment increased
allocation and was rejected without changing the game. Complete acceptance remains
required.

The latest shared-terrain repair separates consumer expiry from source cancellation.
Its delayed real-image regression and actual two-player Logan world pass. Those
focused results are not a complete current backend receipt.

All three 376 backend gates passed. Six changed Functions were deployed only to
staging with existing configuration preserved. Live staging purchases, private
home layouts, photo uploads, CPU submissions and continuation checks passed;
their disposable records were removed. The full ordinary hosted voyage and final
source-bound acceptance remain separate requirements.

The released 5.5.1 package is the save-upgrade starting point. The retained
`b21b7f12` road-repaired package is the candidate's modern-save fallback, subject to the
actual four-stage save roundtrip. Its production-configured package is built and
verified; the only differences are the three approved Firebase configuration assets.
Do not use the old 5.5.1 frontend as a writer for new 5.6 progress. Its isolated
road-recovery deployment remains valid independently of the new release.

Production promotion must use the verified staging game payload, changing only
the three reviewed Firebase configuration assets. Commit identities, manifests,
backend deployment evidence and the rollback plan must agree before promotion.

[Current state](../CURRENT-STATE.md) ·
[Release status](RELEASE_INTEGRATION_STATUS.md) ·
[Candidate evidence](release-review/2026-10-14/READINESS.md)
