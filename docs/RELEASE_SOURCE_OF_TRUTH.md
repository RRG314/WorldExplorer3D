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
| Canonical staging frontend | `5.6.1+376c7e55784c.9f1d43b3d9871d58.staging` |
| Staging Firebase project | `we3d-staging-20260712` |
| Preserved road-safe fallback | `5.6.1+b21b7f12fdfa.31ed9b1212c5002c.staging` |
| Release branch | `stable` (default; no `main` branch) |
| Active development branches | `steven/visual-quality`, `steven/post-5.2-release-integration` |

[Production](https://worldexplorer3d.io/app/) ·
[Staging](https://we3d-staging-20260712.web.app/app/) ·
[Release preparation PR](https://github.com/RRG314/WorldExplorer3D/pull/103)

The canonical staging address replaced an unauthorized preview origin for live
account checks. Its package is an exact Hosting clone of the reviewed preview;
production and backend origin restrictions were not changed.

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
regional instance cells without dropping buildings. All 2,623 source checks pass;
its native timing, resource and complete final matrix remain required.

All three 376 backend gates passed. Six changed Functions were deployed only to
staging with existing configuration preserved. Live staging purchases, private
home layouts, photo uploads, CPU submissions and continuation checks passed;
their disposable records were removed. The full ordinary hosted voyage and final
source-bound acceptance remain separate requirements.

The released 5.5.1 package is the save-upgrade starting point. The retained
`b21b7f12` road-repaired package is the candidate's modern-save fallback, subject to the
actual four-stage save roundtrip and a production-configured fallback build.
Do not use the old 5.5.1 frontend as a writer for new 5.6 progress. Its isolated
road-recovery deployment remains valid independently of the new release.

Production promotion must use the verified staging game payload, changing only
the three reviewed Firebase configuration assets. Commit identities, manifests,
backend deployment evidence and the rollback plan must agree before promotion.

[Current state](../CURRENT-STATE.md) ·
[Release status](RELEASE_INTEGRATION_STATUS.md) ·
[Candidate evidence](release-review/2026-10-14/READINESS.md)
