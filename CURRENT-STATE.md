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

## Remaining coordinated release work

1. Verify the focused swimming setup correction, commit the test/doc changes and
   prepare a clean immutable staging package. Reverify the superseded generated
   package before retiring it; retain its manifests and evidence. Every delivered
   gameplay asset must match 499febb6. Keep at most four saved candidates.
2. Complete current source checks, native performance, backend, save/fallback
   roundtrip and the complete candidate scope on that exact source and package.
   Retain failures. Do not rebind old evidence to a changed test fingerprint.
3. Deploy the accepted package to canonical staging. Complete ordinary hosted
   acceptance without debug attestation and the current free-provider receipt.
   Inspect current images and verify the deployed backend source.
4. Require release-scope and public-claim readiness, then merge PR #103 through
   protected stable. Verify the resulting tree before preparing production.
   Use the stable commit and change only the reviewed environment configuration;
   every other delivered asset must remain identical to accepted staging.
5. Deploy only the six reviewed Functions, preserving the other 74 and all
   configured values. Finalize, preview and promote the exact Hosting package.
   Verify live identity and availability before publishing the release.
6. Tag the production commit as v5.6.1, publish the prepared feature-led release
   and verify Pages. Merge stable back into both active development branches
   without force. Update final documentation without rebuilding accepted gameplay.

The modern-save fallback is b21b7f12fdfab0f2adf82eca01faefb55ae64748; both staging
and production packages remain. Production 5.5.1 is the upgrade starting point.
Fallback validation must include a write and return to the candidate. The reviewed
rollback contract is `scripts/verification/rollback-runtime-review.json`.

## Resource and evidence rules

One heavy job at a time on this observed 8 GiB Mac. Preserve ordinary Chrome,
unrelated emulators, current dist, actual production, both b21 fallbacks,
source/history and player records. Close only owned processes. Do not print raw
credentials, cloud environment maps or private heaps. The completed 1.60 GB raw
heap was retired after aggregate analysis; its aggregate evidence remains.

Existing owner-authorized physical-device and fresh-player deferrals remain.
Do not claim new physical-phone tests or human image review. Record the owner's
explicit delegated deployment authorization and Codex image inspection truthfully.
