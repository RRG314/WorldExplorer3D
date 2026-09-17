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
- Root and Functions dependencies were installed independently in this candidate
  with `npm ci` from the preserved lockfiles. Earlier dependency symlink targets
  were left untouched. Both fresh npm security audits reported zero known
  vulnerabilities. A separate CI runner remains independent release evidence.

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

The September 17 continuation found another current defect in a real Baltimore
interior journey: entry placed the walker against a generated partition and
subsequent normal input could rotate but not move. The five-point spawn clearance
test missed thin walls between its samples. Clearance now measures the complete
0.35 m walker footprint against polygon edges and refuses an unsafe fallback;
failed generated construction releases its allocated geometry/materials. Three
regression cases, including previously failing thin/diagonal walls, now pass.
The rebuilt 94835a4c artifact passed desktop entry, stairs, elevator round trips,
wall collision/recovery and exit. Its mobile reload then reproduced a separate
47.7 m displacement: a saved safe doorway pose passed the real 0.28/0.35 m walking
collision checks but failed the 1.5 m fresh-arrival margin. Shared walking poses
and saved walking-session restoration now use the full player radius for that
check; fresh arrivals retain their wider margin. A regression using the captured
Baltimore footprint fails before the fix and passes afterward, including rejection
of poses inside or too close to walls. Source validation and all 490 current
contracts pass. A focused real phone-sized browser check restored the exact saved
horizontal position and passed touch entry/exit/re-entry (45.3 s, 2494 MiB peak).
The preceding full run passed desktop traversal but hit the 3000 MiB process
guard during mobile startup. The complete verifier now uses a fresh Chrome
process for each device stage and a 1280 MiB JavaScript old-space cap. Neither
the memory stop nor the focused diagnostic is counted as a complete gate pass.

The clean 09939be3 artifact subsequently passed the entire desktop/mobile interior
gate in 326.4 seconds, with sampled peak 2539 MiB, and POI lifecycle passed.
Urban arrest and medical recovery then passed, but the process guard stopped
the third world at 3090 MiB. A fresh capped browser for each urban journey let
the complete vehicle/equipment diagnostic pass all 11 assertions in 207 seconds,
peak 2438 MiB. The aggregate three-world gate now allows 20 minutes; its individual
gameplay assertions/timeouts and performance budgets are unchanged. A complete
clean urban gate receipt is still required.

The clean 22766d2d run passed equipment (14 checks), tutorial controls, commerce,
and the full desktop/mobile menu gate. Urban arrest and medical recovery passed,
but vehicle startup again crossed the process guard at 3025 MiB. A separate
hotbar run passed every desktop action through free space flight and direct Moon
travel, then reached the same sampled peak during mobile startup. Neither
interrupted gate is counted as complete. Hotbar verification now closes each
independent journey's browser before creating the next, caps old-space at 1280
MiB, and saves failure state. Its aggregate allowance is 20 minutes for four
world starts; individual gameplay timeouts and performance limits remain intact.
These harness changes require fresh complete receipts before release acceptance.

Analytics verification reproduced `measurement_id_missing`: the shipped staging
configuration replaced an init-script override, and staging deliberately has no
analytics measurement ID. The verifier also served source despite requiring an
artifact. It now serves the selected artifact and uses an explicit synthetic
measurement ID, real analytics SDK, locally intercepted configuration/collection,
and blocked installation registration. All five destinations plus storage-blocked,
default, denied and granted consent transitions passed in 141.2 seconds, sampled
peak 2210 MiB. Denial removed analytics cookies; re-grant started exactly one
current session. This is local event-formation evidence, not production delivery
verification. No production or staging analytics configuration was changed.

At clean 89a30976, Explorer passed all 11 browser checks in 147.6 seconds. The
regional matrix passed Tokyo, London and Seattle, then its ten-minute aggregate
timeout interrupted Los Angeles. Regional verification now retains an incremental
report, saves failures, uses a fresh capped browser per location, and skips costly
diagnostics while the loading cover is visible. The six-world aggregate allowance
is 30 minutes; each world's 300-second readiness limit is unchanged. The report
explicitly distinguishes Tokyo's field-lead gameplay check from guide/layout-only
coverage elsewhere. A complete six-location receipt remains required.

A September 17 preservation refresh matched all 1880 original source hashes and
the original street, old app and Oeis HEAD/status records. The live manifest still
identifies production commit db62593ba377. Evidence is retained under
`output/release-integration/live-checks/`.

London ground accuracy remains an unresolved release-quality question. Comparing
the actual production and candidate artifacts found 191 changed grid samples
(maximum 16.74 m). Seven independent Environment Agency 1 m DTM point queries
show substantial differences in local relief, including an adjacent pair where
the app rises 10.35 m and DTM falls 1.44 m. Two additional queries were denied.
The app uses EGM2008 and the DTM uses ODN; point queries and coarse-grid samples
also differ. This preliminary comparison does not establish a transformed,
survey-grade replacement. No data values were changed on this basis. The source
and reproducible query URLs are in `output/release-integration/live-checks/london-independent-dtm-samples.json`.
[Environment Agency dataset](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc)

Release environment isolation also strips all six additional discovered scope
selectors for urban, regional, viewport, block, road-terrain and transport-facility
diagnostics. They were unset during these runs, but must not silently narrow a
future release gate. The expanded environment regression test passes.

Terrain-boundary diagnostics passed with temporary registered staging App Check
debug attestation (70.5 seconds, 2518 MiB peak). The original localhost run correctly
failed on App Check/HTTP 401. The credential was revoked and its private file
removed after testing. The verifier supports `WE3D_STAGING_APP_CHECK_FILE` only
for loopback staging, labels debug attestation in its report, and preserves failed
geometry evidence. This does not certify production reCAPTCHA attestation or
change application enforcement. These diagnostics are not final clean-artifact
release receipts.

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

The mobile-controls verifier previously combined a desktop user agent with one
emulated touch point. Executing the app's actual device detector in Chrome
confirmed that profile selected desktop budgets; the iPhone profile selects
mobile budgets. The verifier now uses a complete iPhone profile and asserts the
mobile world budget, with loading-aware diagnostic polling.

The fixture now includes the actual bottom menu and settings button. It exposed
settings overlapping Run (or the movement pad in southpaw mode) and the bottom
menu intercepting landscape controls. Settings now clears the action targets;
landscape controls sit above the bottom menu. All 24 expanded hit-test cases pass.

Actual uploaded road geometry now supplies the integrity counters. Road tops are
normalized at Float32 precision before normals and contacts are built: zero
horizontal footprints are removed, downward winding is corrected, and index
ranges retain their terrain modes. This preserves surviving triangle footprints;
it does not claim to eliminate overlaps. The assembled and terrain verifiers
require measured data rather than accepting absent counters as zero.

Junction coverage is measured against actual uploaded contact triangles. It
records exact-coordinate misses separately from distances within the compiler's
0.001 grid and Float32 rounding bound. Physical contact remains unexpanded. The
JFX investigation identified two phantom junctions beyond the geometry boundary:
road source topology now includes only source points retained by publication,
while original source node IDs remain available for provenance. Behavior tests
reproduce the phantom-junction failure and verify clipping and subdivision.

Each assembled location now owns a separate browser, saves its result immediately,
and stops the matrix at its first failure. Diagnostic location filters are cleared
by the release runner so they cannot certify a complete representative-world gate.
Current execution details and incomplete checks remain in the ignored evidence
ledger at `output/release-integration/RESULTS.md`.

The London CPU profile identified exhaustive POI-to-building association during
world finalization. Batch association now indexes full building footprints once,
retains input order for tie-breaking, handles large footprints separately, and
rebuilds from each supplied publication. Differential tests preserve the exact
association records, including containment, doors, radius limits and edited
buildings. A synthetic 4,000-building/1,000-POI benchmark measured median 1,016 ms
exhaustive versus 10.9 ms indexed; this is a subsystem result, not a whole-world
startup claim. The road precision diagnostic also accounts for both input-grid
and computed-intersection rounding before Float32 upload; physical collision
surfaces remain unchanged by that diagnostic allowance.

The first assembled-world correctness run used a 1,536 MiB Chrome old-space cap
on this 8 GiB workstation, alongside the unchanged 3,000 MiB aggregate RSS guard.
World content and assertions are unchanged; the report records this browser
budget. A Golden Gate diagnostic passed all 27 checks at 2,568 MiB peak owned
RSS after an uncapped run crossed the guard. Correctness under this heap cap is
not a substitute for the separate performance or physical-device gates.

## Complete gate scope and workstation headroom

The release runner removes inherited diagnostic location, profile, resume,
shortened-audit and forced-fallback switches before starting gates. Separate
gate commands still select their required scenario. Emulator addresses and
artifact/resource settings are preserved. This prevents a developer's partial
test session from silently narrowing release coverage.

The assembled-world correctness browser uses a 1,280 MiB V8 old-space cap.
A full matrix with the previous 1,536 MiB cap crossed the unchanged 3,000 MiB
owned-process guard during Manhattan's provider-outage load. The isolated
Manhattan journey passed all 27 assertions with the lower cap, peaking at
2,768 MiB aggregate RSS. This is correctness-test headroom, not performance
or physical-phone acceptance. Full final-artifact gates remain required.

Actor/vehicle verification now runs one capped Chrome server per location, checks
loading visibility before polling diagnostics at 500 ms, and persists each
location's results and screenshots even on failure. It selects Day through the
current visible time control; the removed Environment-controls selector had
silently skipped that step. BrowserServer owns process shutdown. A small real
Chrome lifecycle probe confirmed server close terminates that process.

Backend property clients initialize and capture screenshots sequentially while
retaining both authenticated clients for transactions and listeners. The full
multiplayer verifier waits for the owner's complete world before joining the
member (room UI itself starts world loading), uses a 1,280 MiB old-space cap, and
retains both worlds for walking, vehicle ownership, release and takeover. It
brakes until the actual exit action appears, preserving the low-speed/stability
rules. Failed runs retain runtime snapshots and screenshots.

The corrected multiplayer and account diagnostic passed in 529.5 seconds with
2,641 MiB peak aggregate RSS. All twelve backend stages have passed across
local runs, but a complete final-artifact backend receipt is still required.
The outer twelve-stage backend gate allows 20 minutes: its prior ten-minute
default left almost no time for other stages after the 510-second multiplayer
case. Individual test limits and the separate performance budgets are unchanged.
