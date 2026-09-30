# Current release state

Updated September 30, 2026.

## Workspace and authority

Branch: `steven/visual-quality`.

Visual-quality implementation is in progress locally. See
`docs/visual-quality/PLAN.md` and `docs/visual-quality/EVIDENCE.md`.
The local rendering and asset changes are not the deployed build.

The movement runtime is frozen at f7a0865a2c9b. It repairs frame-duration-dependent
chase-camera lag and reduces measured temporary road, geometry and lighting work.
Source validation, 1,550 contracts and source action smoke passed. Matched packaged
driving reduced the worst pause from 1,333 to 317 ms; an earlier integrated run
still had a 967 ms pause. Low flight, camera changes and dry-ground return passed
with inspected visuals. No all-stall elimination claim is made. Average FPS is
acceptable to the owner.

Formal f7 performance/retention, space and integrity gates passed. The full matrix
stopped on stale 5.3 release metadata; the metadata is now aligned to package 5.4
without changing budgets or safeguards. Full current-HEAD candidate/backend and
weekly-room verification remain open. See `docs/visual-quality/MOVEMENT-EVIDENCE.md`.
Production has not changed. Original 8940 and comparison 8357 artifacts are saved.


The owner authorized production deployment and GitHub updates on September 28,
superseding earlier local-only instructions. Keep ordinary Chrome open. Run
heavy local work sequentially and preserve source, history and private data.
Never print raw cloud configuration, credentials or private audit snapshots.

## Production

The live frontend is `5.3.0+2839df5d6bbe.114f3c83341f2200.production`, source
`2839df5d6bbed9f8dfa4b89e379ba2e026cab438`. Its tested staging counterpart is
`5.3.0+2839df5d6bbe.7492cbb92de5e631.staging`. Production promotion changed only
the three generated Firebase configuration assets. The previous live frontend
is preserved in Firebase channel `rollback-bbe65022`.

The action-cooldown backend fix is deployed to `commitUrbanImpacts`; its runtime
configuration and IAM bindings are unchanged. No rules or index changes were
needed. Live file integrity, unauthenticated endpoint rejection, sign-in panels,
public-room browsing and the Chicago weekly-city label were verified.

## Evidence and limits

Earlier 5.3 functional/backend/weekly-room evidence is historical. The current 5.4
runtime has passed the configured performance gate, including world-exit retention,
and space transition/lifecycle checks. Remaining occasional GC pauses are recorded
in the movement ledger. Physical-phone responsiveness remains unverified.

`output/release-deploy-20260928/` contains historical deployment evidence. Current
release receipts are under `output/release-evidence/current/` and are valid only for
the exact source/build identity they record. Do not promote using older receipts.

## Architecture scope

Terrain allocation, indexed water sampling, road/terrain overlap, bounded
building compilation, pavement-worker retention and spotlight shader variants
were improved without reducing mapped-world coverage. Browser-first runtime
behavior is preserved. The portable-core and action-system studies contain
prototypes, not a replacement renderer, deployed action gateway, authoritative
movement server or complete PvP mode.

Dated investigation documents and older progress entries are historical leads.
Use hosted manifests, Git and current receipts to establish the actual state.
