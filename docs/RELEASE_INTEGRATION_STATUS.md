# Post-5.2 release integration

Owner objective, September 16, 2026: retain the work done after the live release,
integrate useful improvements cleanly, and establish production release readiness.
**Status: preserved integration candidate; production acceptance pending.**

## Candidate and preserved work

- Production observed by the forensic audit: `db62593ba377e276e5079c78238fa3a83e501c93`.
- Staging observed by the audit: `d7339491697197c42c1012aab1bf04cb9800bff9`.
- Candidate branch: `steven/post-5.2-release-integration`.
- Candidate worktree: `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`.
- Initial preservation commit: `3a58be2fc35f361834827075efd43a1e418451e0`, based on
  `1519f0618e08b4779a9eff976ec7193d11aa819b` and the audited working-tree source.
- Existing isolated audit copy was moved here, with its former temporary path
  retained as a symlink. Fifty omitted tracked reference files were added from
  the original checkout. No original worktree, branch or deployed app was reset.
- Installed dependencies are symlinks to the existing street checkout's modules;
  clean-runner installation remains an independent release requirement.

The initial commit is a preservation checkpoint, not an assertion that every
included change is correct. Existing generated test output is not fresh evidence
for this branch. Evidence for this effort belongs in `output/release-integration/`
and gate receipts in `output/release-evidence/current/`.

## Reconciliation decisions

| Body of work | Candidate disposition | Release acceptance |
|---|---|---|
| Post-production capture/editor/account/reliability work inherited through the street branch | Retained in ancestry and source | Connected publication, deletion/recovery and account journeys still required |
| Eight committed street R&D changes plus audited uncommitted road/terrain/frontage/performance repairs | Preserved together as the implementation to evaluate | Current CPU geometry, visual correctness, loading, repeated travel and memory gates required |
| Restored game RDT identity and capture spatial lookup | Retained, including attribution/license and exact-selection tests | Correctness and component cost evidence exist; no whole-game speed claim |
| Clean street-surface branch `41dee7ed` and its three unique commits | Preserved separately; not merged wholesale into the competing regional implementation | Requirements mapped below; behavior still requires acceptance |
| Oeis predictors and all eight research commits | Retained in original repository as reference; extracted audit ZIP moved under ignored output | No demonstrated app prediction use case; no Python package or predictor model added to runtime |
| Geospatial synthesis and volumetric research branches; separate Unity project | Preserved separately | Experimental alternative implementations, not automatically compatible app improvements; require scoped acceptance before adoption |
| Old July checkout's two lockfile fixes | Left untouched in original checkout | Do not transplant locks from the wrong source baseline |

The alternative street branch touches 23 distinct paths across its three commits.
The full path comparison is in `output/release-integration/alternative-street-branch.json`.
Its `street-surface-{artifact,mesh,navigation,preview}` modules implement a separate
bounded preview with its own rendering/contact owner. Adding that owner beside
the current carriageway/pavement publisher would not constitute clean integration.

| Alternative requirement | Selected implementation / remaining gap |
|---|---|
| Shared rendering and contact | `terrain/rebuild.js`, `world/street-pavement-runtime.js`, `ground.js`; current carriageway/pavement tests exercise agreement |
| Pedestrian paths follow accepted sidewalks | `living-world/runtime.js` supplies pavement membership and height to `navigation-graphs.js`; routes still need visual and traversal acceptance |
| Vegetation avoids pavement | `world/vegetation.js` uses current pavement sampling; selected vegetation tests |
| Safe publication and teardown | Current publication revision, cancellation and reset owners; component tests are not repeated-world acceptance |
| Independent street grades, complete frontage and bounded resources | Still open in the current implementation; not claimed solved by choosing this branch |
| Alternative fixture and preview evidence | Kept intact on the original branch. It does not verify the selected implementation |

## Readiness tooling repaired in this candidate

1. Hosting builds require readable Git metadata and a committed HEAD at the
   actual repository root. A failed Git command cannot manufacture clean source.
2. Artifact verification compares commit, actual commit timestamp and dirty state
   with the worktree; release identity additionally requires that worktree clean.
3. Execution evidence records artifact-manifest hashes. Artifact-dependent gate
   results cannot be reused for a different environment/build from the same source.
   Final readiness rejects missing/changed manifests. Asset-integrity verification
   remains responsible for checking the actual delivered files against hashes
   and is never reused from a cached receipt.
4. The complete street CPU suite is now a required candidate gate and CP2
   requirement, in addition to packaged worker and rendered-world checks.
5. Production baseline metadata and the source-of-truth document now distinguish
   the observed live artifact from historical September publications.

## Acceptance before production

The configured matrix now contains 46 candidate gates, one backend gate and two
optional component gates. It includes source/contracts, packaged workers,
desktop/mobile controls, environments, games, travel, capture fixtures, persistence,
performance and backend authority. A passing structural gate is not a passing matrix.

Run bounded checks sequentially on this 8 GiB machine. On September 16 the owner
explicitly authorized browser/emulator/full-matrix work and repairs, superseding
the earlier permission limitation for this effort. Monitor actual CPU/memory
pressure and close each owned workload before the next. Do not
silently retry the earlier interrupted world checks. Diagnose the first failure
and preserve logs. A clean CI run and physical-device/connected-service acceptance
remain additional evidence requirements.

Historical leads still requiring current acceptance evidence (not assumed current failures):

- Slow world startup and street resource costs; missing independent grades,
  frontage completeness, regional publication and residency acceptance.
- Atomic multiplayer room admission/privacy and durable account/write recovery.
- Complete capture/edit/review/publication/entry continuity using one revision.
- Actual success/failure/restart/cleanup of all supported activities and repeated
  environment transitions, supported physical devices, and operational recovery.

The live app remains unchanged. This branch may be reviewed and tested without
merging or deploying it. Full production approval requires current execution
receipts, resolved blockers, an explicit release scope/version, compatible backend
and data changes, and a separate authorized promotion.

## Repairs verified during authorized execution

The actual packaged Baltimore journey passed all 29 assertions at `484e578a`.
The full matrix then stopped at mobile-load when its shared Chrome process crossed
our 3 GiB test-process guard. Giving each mobile cold-start journey its own browser
and avoiding full diagnostics during loading produced a passing diagnostic run:
30.1 seconds normal entry, 30.4 seconds GPS permission to play; 2.4 GiB peak RSS.
The complete matrix must still pass against the final clean artifact.

A real Firestore emulator reproduction admitted three simultaneous joiners into
a two-player room with one existing occupant. Admission now goes through the
`joinRoom` HTTP function and a shared per-room transaction lock. Direct membership
creation and expired-lease revival are denied by rules. Heartbeats have bounded
expiry; reconnecting after expiry requests admission again. Private rosters no
longer need to be readable by nonmembers for client-side counting.

This is a coordinated backend/client/rules change: publish and verify the new
function before switching the client; enforce the accompanying rules with the
release. Older clients cannot create memberships after rule activation and must
reload the current app. Never deploy the rules alone or silently fall back to the
unsafe client-only admission path. No such deployment has been performed.


Screenshot inspection found that equipped-item Use introduced a third action row,
placing Jump beneath the look pad. A real Chrome layout fixture reproduced blocked
touch targets across portrait and landscape layouts. Equipment Use now shares the
existing two-row action footprint with Pack; the landscape look pad accounts for
that footprint's width. All 24 viewport/handedness/equipment/pack combinations pass
geometry and actual browser hit tests. The full runtime controls gate now checks
that every visible action button receives touches; the fixture is also required.
