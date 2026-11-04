# Coherence release candidate

The frozen portfolio scope is implemented and accepted locally: all twenty retained careers, the three selected racing venues and their required pits, shared vehicle/garage/results systems, Activities navigation, Journal, recovery and the affected world/UI presentation. The immutable candidate and hosted release are separate acceptance boundaries.

| Exit | Current result |
| --- | --- |
| Stages 0–6b | Closed locally; individual evidence and limits are indexed in COHERENCE-DELIVERY-CHECKLIST.md. |
| Required CI | Passed November 3: 4,066 actual cases across all 744 selected files; zero failed, skipped, cancelled or TODO cases. Dependency/source/ownership/types/runtime-name/inventory/sensitivity gates also pass. |
| Immutable package and runtime | Pending; use its exact build and asset manifests, then the required complete-world and equipment journeys. |
| Review, GitHub and rollout | Pending; retain rollback, check hosted identity and report deployment separately. |

CI exposed an outdated reviewed dependency inventory, seven stale assertions and temporary Git fixtures that inherited an external worktree/index. The inventory now records the repaired backend locks and the authorized Collision Lab modules with exact digests and provenance. Temporary repositories explicitly isolate their Git directory, worktree and index, restoring the test worker's environment afterward. All 26 affected repository/identity cases pass; the parent release branch and source changes remain unchanged by the completed CI run. The original interrupted run and its local fixture commit are preserved for diagnosis and were never pushed.

The seven assertion repairs follow previously accepted requirements: the fixed clock no longer subtracts its retained remainder twice, destination records migrate to version 3, the reviewed major-road lane estimate can change while other historical fields remain equal, Maker can start independently, and each venue offers one-, two- and three-lap events. No production behavior was reverted to satisfy the older assertions. Venue laps, career procedures and unchanged hardware matrices were not replayed for these component corrections.

Local evidence: `output/verification/coherence-release-20261103/`. Production was observed at build `5.6.1+c390d3a00ea4.11e2ccd419ea2e2b.production` before this candidate. This document does not claim that the new source is deployed, that a human has reviewed new candidate images, or that physical device/user-study acceptance has occurred.
