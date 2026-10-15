# Release source identities

## Current observation — October 15, 2026

Production is **5.5.1**, verified from its live build manifest. The complete
**5.6.1** candidate remains under verification; its local improvements are not
production changes. A version label or preview URL alone does not identify code.

| Reference | Build or source |
| --- | --- |
| Production frontend | `5.5.1+012e5c85582b.eb0d7eddf0f75035.production` |
| Production source | `012e5c85582b78a7808656545bf4143a31a18652` |
| Production Firebase project | `worldexplorer3d-d9b83` |
| Canonical staging frontend | `5.6.1+a0e20c35eab7.aa4dd9dce23502b0.staging` |
| Staging Firebase project | `we3d-staging-20260712` |
| Current frozen candidate | `5.6.1+a0e20c35eab7.aa4dd9dce23502b0.staging` |
| Preserved road-safe fallback | `5.6.1+b21b7f12fdfa.31ed9b1212c5002c.staging` |
| Release branch | `stable` (default; no `main` branch) |
| Active development branches | `steven/visual-quality`, `steven/post-5.2-release-integration` |

[Production](https://worldexplorer3d.io/app/) ·
[Staging](https://we3d-staging-20260712.web.app/app/) ·
[Release preparation PR](https://github.com/RRG314/WorldExplorer3D/pull/103)

Canonical staging now serves the a0e20c35 package; both hosted manifests match
local bytes. Production and backend origin restrictions were not changed.
Ordinary Chrome opens the menu, enters guided Baltimore, displays live weather
and starts field photography. This is not complete account/shared-voyage/save
acceptance. The earlier clean automated browser's reCAPTCHA rejection was not
bypassed; that separate hosted journey remains open.

## Verification and rollback

The a0e20c35 source is pushed to both active development branches. PR #103 remains
draft and stable is unchanged. Current GitHub code/package and secret checks pass.
All 754 package files pass integrity verification. All 2,653 source tests and the
structural chain pass. All three exact-candidate backend gates and the four-stage
released 5.5.1 → candidate → compatible b21 fallback → candidate save journey
pass. The 107-gate candidate matrix is running sequentially; its current receipts
do not yet certify the complete scope.

The source diagnostics pass continuous road contact across the repaired Monaco
junction and regional arrival, provider recovery, return and saved scenery
controls. Ordinary Chrome entry also passes the limited journey described above.
Native flight still pauses (700 and 2649.9 ms in the latest diagnostic), and
steep mountain approaches can still have unrealistic earthworks. A visible
sidewalk-corner fragment needs review. Complete gameplay/performance acceptance,
ordinary hosted account/voyage/save, and final current-image review remain open.

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
