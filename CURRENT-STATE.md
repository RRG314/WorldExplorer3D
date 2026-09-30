# Current release state

Updated September 30, 2026.

## Production

World Explorer 3D 5.4 is deployed at https://worldexplorer3d.io.
Live build: `5.4.0+711fe93aa54e.8d08d47f2ff10556.production`.
Runtime source: `711fe93aa54e23eddea31b2e5c6437e15c0996cd`.
Tested staging: `5.4.0+711fe93aa54e.0a0efe516f4b3921.staging`.
The production promotion changed only three generated Firebase configuration
assets. The owner approved the exact current release capture before promotion.
Previous 5.3 is retained in Firebase channel `rollback-53-711fe93`; the older
rollback channel is also preserved. No backend code, rules or indexes changed
in this deployment.

## Verification and limits

All 57 candidate gates and 13 isolated backend stages passed for runtime source
711fe93. Two authenticated clients also passed the current Chicago weekly-room
journey. Driving, low flight, camera changes, dry-ground return, Earth/space/ship
transitions and cleanup were exercised. Physical-phone acceptance is unverified.

Chase-camera cadence jitter is repaired. The matched 150-second driving check
reduced the worst pause from 1,333 to 317 ms; another repaired run still recorded
967 ms. Occasional GC pauses remain. Average FPS is acceptable to the owner;
world coverage, graphics quality and performance budgets were not reduced.
See `docs/visual-quality/MOVEMENT-EVIDENCE.md` for measurements and limitations.

GitHub's PR inventory additionally identified 14 existing component tests missing
from its executable suite. They are now registered; the complete PR check passes with 1,574 component tests,
no unowned tests and the sensitivity check. This follow-up and release
status documentation do not change the deployed runtime or its artifact.

## Workspace and evidence authority

Work on branch `steven/visual-quality` in the architecture-evaluation worktree,
not the older Documents checkout. Keep ordinary Chrome open, run heavy checks
sequentially and preserve source/history, user data and saved candidates.
Never print raw credentials or cloud configuration.

Deployment records are in `output/release-deploy-20260930/`. Exact-runtime gate
receipts, approval and configuration-promotion receipt are in
`output/release-evidence/current/`; their source identity remains 711fe93 and is
not relabeled as evidence for subsequent test-registration/documentation commits.
Dated notes are historical leads, not current production authority.
