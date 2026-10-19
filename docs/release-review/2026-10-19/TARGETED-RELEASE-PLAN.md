# Targeted 5.6.1 release review

The owner explicitly stopped repeated broad testing on October 19. Do not restart
the 106/107-gate sweep or the 42-minute performance sequence for this repair.
Keep the existing tests available; remove redundant execution from this release.
The earlier blanket full-matrix requirement is superseded by this decision.

The repeated work had two causes. The source fingerprint invalidates all gates
when any test or verification configuration changes, even when every delivered
game file is identical. The release orchestration then loads the same complete
cities repeatedly for unrelated feature assertions. The 499, 57, bf and e8
candidates delivered the same 756 game assets. Their different verification
revisions did not justify repeating every gameplay journey.

## Evidence to retain

Retain the original receipts, dates, input identities and failures. The 499
candidate completed 105 of 107 checks; e8 completed 88 checks before the owner
interruption, with 83 passing. Current backend and all four released-save,
upgrade, fallback-write and return stages passed. Current venue, ship, sub,
campaign, regional travel, controls and mobile evidence remains useful.
An interrupted check is not a failure of gameplay or a passing test.

The full native performance sequence passed on 499. Later identical game assets
had variable frame timing under host memory pressure. Preserve both results and
the device-performance limitation; do not claim a new universal performance pass.

## Changed-path checks

The Tokyo loading capture completes the world in about 332 seconds. Gameplay
startup finishes earlier, but initial pavement preparation waits for all 5,845
cells. A 30-second worker profile identifies repeated point-in-ring searches
over irrelevant pavement polygons as a major cost. The repair rejects points
outside precomputed polygon bounds before applying the unchanged containment
and hole rules. It changes no roads, bridges, tunnels, buildings or save format.

Validate the containment change against the old predicate, translated/concave
polygons, holes and boundaries, plus existing corner, visibility and pavement
geometry tests. Check one dense-city load with real inputs and inspect its image.
Check the unresolved Kennedy load/recovery path once. Do not load all seven
cities again for each independent feature.

Recheck the exact artifact hashes, ordinary hosted startup and the backend source
to be deployed. Carry forward the backend, save and mobile results only after
reviewing that their inputs did not change. Record transient external provider
availability separately from application errors and retain the free-data rights
and attribution review. Do not invent unavailable ocean observations.

## Release decision

Use the explicit targeted decision only after every listed check has evidence.
It binds the clean source fingerprint, artifact identity, hashed review and
evidence files. It records executed checks separately from reviewed retained
evidence and accounts for every known failure or interruption. It expressly does
not say the full matrix passed. Unresolved required checks prohibit promotion.

Protected GitHub checks, preservation of rollback artifacts, production project
identity, exact staging-to-production asset equivalence, reviewed images and
live post-deployment startup remain required. No branch protection, data rule,
credential or user data is changed by the testing scope decision.
