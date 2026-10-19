# Current development and release state

Updated October 19, 2026. **5.6.1 is not released or accepted yet.**
The owner explicitly authorized finishing the repairs and deploying production,
including stable, both active development branches, the release and project page.
Do not ask again for that authorization or promote a failing package.

## Correct workspace and deployed state

- Worktree: `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`.
- Do not edit the stale Documents checkout or follow the obsolete path in AGENTS.md.
- Last verified production: `5.5.1+012e5c85582b.eb0d7eddf0f75035.production`.
- Last verified canonical staging: `5.6.1+a0e20c35eab7.aa4dd9dce23502b0.staging`.
- Both Firebase projects have 80 active first-generation Functions. No production promotion occurred during this investigation.
- `stable` is the default release branch; no `main` branch exists. PR #103 is the release preparation PR.
- Current frozen package identity is in `output/release-review/current-final-candidate.json`.

## Current repair and evidence

The previous immutable 9b56760d package failed walking with a 133.4/100.3 ms
pause cluster. Its completed driving window passed; subsequent stages were not
run. Preserve that failure. An earlier focused source pass was not acceptance.

Earlier profiles found main-thread collection of the retained world graph.
Private heap analysis identified approximately 282,000 navigation
node/segment records beyond the underlying road endpoints and features. The
current repair packs their numeric facts into exact Float64/Uint32 storage.
Endpoint and feature references retain their existing authority. Queries reuse
one local row view; pedestrian and traffic compilers use temporary rows and
retain their existing output graphs. Routing, one-way/access rules, ordering,
levels, road/bridge/tunnel geometry, coverage and save formats are unchanged.
Two unprofiled b582 long-play runs still failed their pause-cluster limits.
Read-only host observations found heavy memory compression around one cluster;
this is a correlation, not a performance pass or grounds to waive the limit.

All 54 focused traversal checks pass. All 2,739 component tests and the source syntax,
ownership, boundary, inventory and sensitivity checks pass. The first full source
chain correctly rejected an unregistered new test file; its registration was
fixed and the complete component/inventory/sensitivity remainder passed. Browser
pacing and final release acceptance for this repair remain unverified. The b582
backend suite and released551 → candidate → b21 fallback-write → candidate save
round trip passed. Subsequent test-source changes require fresh release evidence.

The first broad browser gate exposed a verification defect. Its readiness poll
called the full city diagnostic every animation frame while loading. A controlled
comparison of the same packaged aquarium location completed in 107 seconds with
light observation, versus 307 seconds with the original diagnostic polling.
The latter made 5,186 full snapshots consuming 242 seconds. No game code changed
between those runs. The shared verification guard now suspends these expensive
predicates under the loading cover, preserving their arguments, conditions and
timeouts. Timer-based stability checks still reset during loading. Five unit
checks and actual Chrome serialization checks pass. The corrected aquarium
exterior entry, interior exit and harbor quay-stop/reverse journey passed in
149 seconds against unchanged b582 game bytes, with no JS or local asset errors.
The full release sequence still requires current evidence on the frozen revision.

The provenance-storage experiments are excluded. The isolated Node benchmark
suggested a large saving, but actual Chrome building records saved only about
1 MiB at best. Their long movement windows passed without establishing a causal
memory/pacing improvement. No provenance prototype is in shipping code.

The completed 1.60 GB private raw heap capture was retired after aggregate owner
analysis. Aggregated findings remain; source, assets, history, player data and
release packages were preserved. Detailed diagnostic receipts are under
`output/release-review/561-root-cause-audit.md` and the current checkpoint JSON.

## Earlier verified repairs retained

- Unchanged street products retain render batches and walking contacts through
  publication leases; the cache stays bounded at 16 MiB.
- Cancelled/failed preparation preserves accepted coverage, and superseded edits
  cannot publish stale street products.
- Civic incidents follow the actual ground actor. Ordinary nearest-road,
  furniture, map and building-entry queries avoid discarded intermediate lists.
- Regional land retains exact indexed ring coordinates once. Water is unchanged.
- The sustained verifier observes the real walk-to-car action and continues from
  the walker; it no longer resets that handoff to the original route start.
- Frame/load/coverage/retention limits remain unchanged. The complete performance
  process has a 60-minute deadline for seven windows, twelve reloads and mobile.

## Remaining coordinated release work

1. Freeze the verified source and review every runtime/environment difference
   against the preserved b21 fallback. Complete packaged performance, backend,
   save/fallback roundtrip and all candidate gates on that exact package.
2. Deploy that package to canonical staging and complete ordinary hosted-client
   acceptance and the current free-provider receipt. Inspect current images.
3. Require current release-scope and public-claim readiness. Stable requires a
   squash-only PR merge with passing pull-request and gitleaks checks; no bypass
   actors exist. Merge the accepted PR, verify its entire tree matches, and use
   that stable commit for production configuration promotion. Every gameplay
   asset must remain byte-identical to the accepted staging package.
4. Deploy only the six reviewed Functions, preview/promote the exact Hosting
   package, and verify live identity. Tag that production commit, publish v5.6.1
   and verify Pages. Merge stable back into both development branches without
   force. Do not invent main or direct-push the protected stable branch.

The known modern-save fallback is b21b7f12fdfab0f2adf82eca01faefb55ae64748.
Both its staging and production packages remain. Production 5.5.1 is the upgrade
starting point; fallback validation must include a write and return to candidate.
The reviewed rollback contract is `scripts/verification/rollback-runtime-review.json`.

## Resource and evidence rules

Run one heavy job at a time on this observed 8 GiB Mac. Preserve ordinary Chrome,
unrelated emulators, current dist, the actual production artifact, both b21
fallback packages, source/history and user records. Keep at most four saved
candidates; retire only byte-verified superseded generated packages. Close only
owned processes. Never print credentials, raw cloud environment maps or private
heap contents. Interrupted, mocked and diagnostic checks are not release passes.

Existing owner-authorized physical-device/fresh-player deferrals remain; do not
claim new physical-device tests. Record delegated deployment authorization and
Codex image inspection truthfully rather than inventing a new human review.
