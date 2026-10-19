# Current development and release state

Updated October 19, 2026. **5.6.1 is not released or accepted yet.**
The owner explicitly authorized completing the repairs and deploying production,
including stable, both active development branches, the release and project page.
Do not ask again or promote a failing package.

## Correct workspace and deployed state

- Worktree: `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`.
- Do not edit the stale Documents checkout or follow the obsolete path in AGENTS.md.
- Last verified production: `5.5.1+012e5c85582b.eb0d7eddf0f75035.production`.
- Last verified canonical staging: `5.6.1+a0e20c35eab7.aa4dd9dce23502b0.staging`.
- Both Firebase projects have 80 active first-generation Functions. No production promotion occurred during this investigation.
- `stable` is the default release branch; no `main` branch exists. Release PR #103 requires a squash merge with passing pull-request and gitleaks checks; no bypass actors exist.
- The latest immutable package is recorded in `output/release-review/current-final-candidate.json`. A pointer does not establish acceptance.

## Repairs and measured evidence

The retained navigation graph contained about 282,000 additional node/segment
objects. Its numeric facts now use exact Float64/Uint32 storage. Feature and
endpoint references, route order, costs, access/one-way rules, road geometry,
coverage and save formats are preserved. All 54 focused traversal checks and
2,739 component tests passed. Source syntax, ownership, dependency, boundary,
inventory and sensitivity checks also passed.

Other retained repairs give unchanged street products publication leases, bound
the compiler cache at 16 MiB, reject superseded edits and preserve accepted
coverage after failed or cancelled preparation. Ground queries follow the actual
actor and avoid discarded intermediate lists. Regional land stores exact indexed
coordinates once. Provenance-storage prototypes are excluded.

A second root cause was verification overhead: a full-city diagnostic was polled
every animation frame during loading. The same packaged aquarium scene loaded
in 107 seconds with light observation, versus 307 seconds with the old poll;
5,186 snapshots consumed 242 seconds. The shared callable guard now waits until
the loading cover clears before evaluating expensive readiness predicates.
Conditions, arguments and timer resets are preserved. Unit and actual Chrome
serialization checks passed. No game code changed for that correction.

On frozen revision 499febb6, the complete native performance gate passed in
42 minutes: seven sustained movement windows and twelve reload/cleanup cycles,
plus mobile layout/load regression. Desktop first playable was 104,454 ms against
the unchanged 120,000 ms limit. Walking, driving, flight, pause clustering,
coverage, old-region cleanup and memory retention checks passed on this M1 Mac.
Earlier failed native runs remain archived; this is not a universal device claim.
All 756 delivered assets matched the preceding b582 package byte for byte.

The full 499febb6 candidate sweep completed with 105 of 107 checks passing.
This included normal and fallback map providers, regional travel, ships, venues,
vehicles, controls, campaigns, interiors, activities, economy and release-file
integrity. Its two failures were investigated before further changes:

- The supplemental source swimming fixture stopped loading at 90 seconds. A
  bounded diagnostic of the same source loaded in 97,125 ms and passed surface
  swimming, automatic scuba, mode cleanup, the boat ladder round trip and vessel
  recovery with no JavaScript errors. Its functional setup now uses the existing
  five-minute complete-world window and records the actual wait. Readiness and
  swimming assertions are unchanged. The separate packaged performance limit
  remains 120 seconds. This does not change gameplay or make the diagnostic a
  release pass; current acceptance must be renewed after the test-source change.
- Live HYCOM current/temperature guidance timed out while NOAA waves remained
  available. A later unchanged request returned valid data in 1.3 seconds. The
  backend suite separately hit a MET Norway connection timeout before HTTP; the
  same request later returned valid data in 1.9 seconds. Original failures are
  preserved. Full provider/UI and backend checks must pass on the final candidate.

The 499 save-migration check correctly refused to run because backend acceptance
had failed. It did not exercise or modify saves. Earlier b582 backend and
released551 → candidate → b21 fallback-write → candidate checks passed, but are
historical evidence rather than acceptance of the final source revision.

Detailed records are in `output/release-review/561-root-cause-audit.md`, the
checkpoint JSON and versioned run folders. Current image inspection is recorded
separately from automated assertions. Do not treat old screenshots or unrun
checks as current proof.

## Final 57ec93a4 findings and measurement correction

The 57 backend suite and all four save/fallback stages passed. Its native run
completed all seven sustained windows, twelve reloads and mobile regression.
First playable was 99,693 ms; hitch, retention, occupied memory and coverage
checks passed. The run still failed two historical criteria: flight p95 34.4 ms
versus 34.36 ms, and an 83,349,831-byte combined session transfer versus 64 MiB.
The old 499 run received zero exact-Overpass bytes; 57 successfully received
17,952,723 bytes. A healthy detail provider must not be required to fail for
transfer acceptance. Original failed receipts are retained.

The explicit revised protocol is documented in
`docs/release-review/2026-10-19/VERIFICATION-MEASUREMENT-SCOPE.md`.
The desktop p95 criterion is now 35 ms (5% scheduling allowance around a 30 FPS
interval); p99, individual-pause and hitch-cluster limits remain unchanged.
The original transfer caps apply per cold-world load, complete bounded travel
window, each reload and finalization. Every byte reconciles to the retained
cumulative total. This changes acceptance policy; do not claim the earlier
criteria passed. Five counter tests cover missing/reset data, excess bursts,
double-accounting and trailing responses. No game assets change. Final source,
package and all acceptance still need to be renewed on this protocol.

The bfdd1b28 backend passed. Its native run passed cleanup,coverage,transfer
accounting and mobile checks, but failed short driving p99 and three sustained
pause windows under increased host swapping. The optional quiet-window request
is pending; continue functional work without waiting. Its save check stopped
before opening a browser because this reviewed configuration hash was stale;
the exact reviewed hash is now updated. This was not a save failure. Revalidate
the rollback review before packaging and run the final source-bound checks.

## Owner correction: targeted completion, no broad reruns

On October 19 the owner explicitly stopped repeated broad testing. The exact
owned sweep tree is stopped; passing, failed and interrupted receipts are
preserved. Do not restart the 106/107-gate matrix or 42-minute performance
sequence. The plan in
`docs/release-review/2026-10-19/TARGETED-RELEASE-PLAN.md` supersedes the earlier
blanket acceptance-renewal instructions above.

The one Tokyo diagnostic completed in 331,601 ms. A worker CPU profile identifies
irrelevant pavement ring searches during the 5,845-cell initial street overview.
The local repair adds bounds rejection before the identical point-in-ring rule.
57 focused geometry checks pass. The targeted release admission tests also pass;
this is not evidence that the new package has been played or released.

Remaining: validate the changed dense-city loading path and Kennedy recovery,
verify exact package integrity and ordinary hosted startup, then complete the
already authorized protected stable merge, reviewed backend/Hosting deployment,
release publication and development-branch synchronization. Retain prior backend,
save and mobile evidence with a source-delta review. Never relabel the stopped
matrix as passing or silently discard a known failure.

Production remains 5.5.1 until live identity verification proves otherwise.
Preserve the b21 staging/production fallbacks, original released551 artifact,
source/history, current dist and player data. One heavy process at a time; keep
ordinary Chrome and unrelated emulators running. No raw credentials in evidence.
