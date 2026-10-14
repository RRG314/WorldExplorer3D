# Release source identities

## Current observation — October 14, 2026

Production is **5.5.1**, verified from its live build manifest. The complete
**5.6.1** candidate remains under verification; its local improvements are not
production changes. A version label or preview URL alone does not identify code.

| Reference | Build or source |
| --- | --- |
| Production frontend | `5.5.1+012e5c85582b.eb0d7eddf0f75035.production` |
| Production source | `012e5c85582b78a7808656545bf4143a31a18652` |
| Production Firebase project | `worldexplorer3d-d9b83` |
| Canonical staging frontend | `5.6.1+1f37e893ccae.3e39c25a98b5a66f.staging` |
| Staging Firebase project | `we3d-staging-20260712` |
| Preserved road-safe fallback | `5.6.1+b21b7f12fdfa.31ed9b1212c5002c.staging` |
| Release branch | `stable` (default; no `main` branch) |
| Active development branches | `steven/visual-quality`, `steven/post-5.2-release-integration` |

[Production](https://worldexplorer3d.io/app/) ·
[Staging](https://we3d-staging-20260712.web.app/app/) ·
[Release preparation PR](https://github.com/RRG314/WorldExplorer3D/pull/103)

Canonical staging now serves the 1f37 package; both hosted manifests match local
bytes. Production and backend origin restrictions were not changed. Ordinary
Chrome successfully searches Baltimore. A clean automated browser is rejected
by reCAPTCHA, so its complete shared-voyage/save-recovery check remains open.

## Verification and rollback

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
with identical values; all 2,625 source checks pass. The complete packaged twelve-cycle run preserves coverage, cleanup, memory
retention and touch behavior, but still fails desktop pacing. Profiling links
the largest pauses to collection; a numeric-uniform cache experiment increased
allocation and was rejected without changing the game. Complete acceptance remains
required.

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
