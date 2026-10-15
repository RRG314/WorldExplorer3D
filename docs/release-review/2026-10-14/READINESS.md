# October 14 production candidate

## October 15 — local traversal repair checkpoint

The full source chain passes **2,681 tests**, including structural, ownership,
type, inventory and sensitivity checks. Exact local shop-entrance validation
avoids a measured citywide fallback search during walking. Pavement clipping
reuses private temporary storage; 18 before/after geometry cases match exactly.
Terrain-fitted cells share the existing 16 MiB cache and are reused only with
the same input fingerprint and ground/contact/portal owners. Retained cells
are processed first to avoid sequential cache eviction; final face order stays
canonical. These repairs do not reduce buildings, roads or accepted scenery.

The native `561-cache-order-native-mixed` journey completed its initial flight
and all seven 90-second travel windows without reloads, gameplay interruption,
browser errors or failed local resources. All 49,080 buildings and 18,952 roads
remain. The first sustained drive and all flight windows pass the hitch limits;
both sustained walks and the later drive still fail, with pauses up to 300.1 ms.
Occupied retained heap is 448–452 MiB. Diagnostic-only skipped reload checks are
not acceptance passes. The current screenshot was inspected.

A real traffic collision explains the test driver's civic response; no police
rules were changed. The follow-up walking CPU/collection profile stopped at the 2 GiB disk
safety floor; its interrupted window is not a pass. The latest local source is
not yet packaged or hosted. Production remains 5.5.1, staging remains a0e20c35,
and stable is unchanged. Final immutable acceptance, hosted account/voyage/save
checks and exact-current image review remain required.

## October 15 — initial scenery and street readiness repairs

Source now completes the actual surrounding-pavement worker and mapped-path
publication under the loading cover. Its progress is measured from accepted
cells. Late terrain invalidation cannot count as a completed initial sidewalk
build; bounded retries settle current terrain before play. During travel,
source selection yields in small slices, and takeoff cancels unfinished ground
detail while retaining accepted contact and permitting descent recovery.

The integrated native source diagnostic loads in 113.3 seconds with all 49,080
buildings, 18,952 roads and 6,009 scenery cells. Its 90-second flight has a
50.1 ms worst interval and no intervals over 100 ms. A 166.7 ms driving hitch
led to a separate CPU profile confirming a synchronous source scan; that scan
is now cooperative. The subsequent seven-window native mixed journey completed
with preserved coverage and bounded memory, but still recorded 183–333 ms pauses.
A walking profile attributes one pause to a citywide shop-entrance fallback
search and another cluster to collection during pavement preparation. Local
entrance validation and reusable clipping storage are now under verification.
One later walking window entered custody and is not uninterrupted traversal
proof. No pacing, coverage or resource budget changed.

Mobile regression with the fallback transport provider passes all measured
checks in 38.4 seconds: 26,829 buildings, 1,063 roads and all 1,403 surrounding
cells, with no active street worker or dirty publication at first play. Its
five-second sample peaks at 16.8 ms. The current portrait image was inspected;
this is browser touch emulation, not physical-phone certification. Evidence:
`output/release-review/561-settled-streets-mobile`.

The refreshed full source chain passes all 2,676 tests and the complete
structural, ownership, type, inventory and sensitivity checks. Source work is
not in the a0 staging artifact. Production remains 5.5.1; no new deployment or stable merge
has happened. Final immutable acceptance and current image approval stay open.


## October 15 — verified preparation repairs after the a0 matrix

New source prepares resident GPU buffers and textures under the loading cover,
using the normal Three r128 renderer with all viewport, culling, visibility and
shadow state restored. This addresses measured first-use uploads, not a presumed
shader-only delay. In the owned upload diagnostic, first driving uploads fell
from 97,934,352 bytes / 625.8 ms to 222,956 bytes / 1.1 ms. A separate native
flight run measured driving activation at 220 ms (52.8 ms input-to-frame).
Resident resources remain inside the existing limits. No coverage was removed.

The mapped museum now initializes its actual lazy runtime before the first
playable frame, retains one bounded material lease and prepares exhibit uploads
before display readiness. Unfinished outdoor pavement work suspends while an
interior owns the view; accepted scenery remains available on return. The full
source museum journey passes **67 of 67 checks**, including ordinary entrance,
running/jumping, failed-display retry, Journal saves, exit/reentry, reload and
three native turning windows. Cold entry is 66 ms; cold worst interval 50.1 ms;
both warm turning windows peak at 16.8 ms. Desktop and phone-width images were
inspected. Evidence: `output/release-review/561-museum-resident-prepared`.

The native 90-second flight still has 716.8 ms and 383.3 ms intervals. This is
not a performance pass. Earlier controls confirmed that neither compact report
metadata nor suspending unfinished overview preparation alone eliminates the
pauses. No heap cap, forced collection during timing, coverage reduction or
budget relaxation is adopted. The release verifier now copies scalar load
results instead of the retained facility graph; this is measurement cleanup,
not a claimed runtime fix. Original failed receipts remain preserved.

The a0 staged package below does not contain these source repairs. Production
remains 5.5.1. Final immutable verification, ordinary hosted account/voyage/save
acceptance and current image review remain open.

## October 15 — current a0e20c35 verification

Canonical staging serves `5.6.1+a0e20c35eab7.aa4dd9dce23502b0.staging`.
Both hosted manifests match the immutable local package. Production remains
5.5.1; PR #103 remains draft. All three current backend gates and the complete
released 5.5.1 → candidate → compatible b21 fallback → candidate save journey
pass. The complete 107-gate candidate run finished with **103 passes and four
failed checks** under the original budgets: museum-gallery, performance,
regional-scenery-arrival (prelaunch disk refusal), and artifact-integrity (Git
identity read failed; the immediately following release-identity check passed).
The complete original receipts and compressed performance report are preserved
under `output/release-review/561-a0e20c35-matrix-failures/final-preservation.json`.
No incomplete check is promoted to a pass.

The performance run completed all seven sustained 90-second traversal windows
and twelve environment exits/reloads. Occupied retained heap, teardown, settled
retention, coverage, browser errors and local-resource checks pass. Native flight
still contains a 2,199.9 ms pause; sustained play also fails pacing. Driving
activation measured 1,606 ms and the stationary driving sample rendered
5,114,656 triangles against the unchanged 4,950,000 limit. Short-run external
transfer was 85,089,013 bytes against 67,108,864. This is not release acceptance.
Mobile load-time verification after the failed performance command is unrun.

A separate harness review found that pre-timing load diagnostics serialize
20,769,969 JSON bytes of facility geometry. A bounded-metadata comparison and
actual input-event-to-frame witness are being measured separately. They do not
waive real pauses or change the original limits.

The current assembled-worlds gate passes all seven locations, but Monaco
loaded fallback transport after both optional OSM requests failed. It has zero
authoritative-source junction samples. This is not mixed-provider acceptance;
`561-a0e20c35-matrix-failures/monaco-provider-scope.json` preserves that distinction.
A controlled published-source replay against the immutable runtime is prepared
and has not run.

Current museum functionality completes, but cold admission takes 1,332 ms
against the 1,000 ms limit. A 10-second turning window also contains a 116.7 ms
interval. Earlier CPU evidence places most cold-entry time in synchronous
shader linking; outdoor street-source preparation also continues inside the
occupied gallery. The next repair will prepare the actual gallery's material
variants under the existing loading cover and retire unfinished outdoor street
work while an interior owns the view. These changes are drafted outside the
checkout and have five focused lifecycle checks; they are **not implemented
in this candidate**, and there is no browser performance pass for them yet.

Regional arrival refused to start when free disk fell below its 8 GiB guard.
This is unrun gameplay, not a failed regional journey. The already recorded
source roundtrip is not substituted for immutable candidate acceptance.
No current budget or disk guard has been relaxed.

The existing native GC trace also shows a newly started worker reaching about
388 MB of used heap. Its last minor collection leaves about 354 MB, which is
not a retained-memory measurement: old-generation garbage may still be present.
Worker timing aligns with overview preparation, but named-worker attribution and
causation still need confirmation. The main thread separately exceeds one second
in collector work. Aggregate evidence is in
`output/release-review/561-overview-memory-audit.json`; no raw private heap was
captured or published for this analysis. Do not claim a pacing repair from it.

Current aquarium, museum, Kennedy and launch-pad images have been inspected.
Ordinary hosted Chrome opens and enters guided Baltimore; account/shared-voyage
and save acceptance through that ordinary hosted UI remains separate and open.
Final current-image review, native pacing, and repair/reverification of the failed checks must finish
before promotion. The sections below are historical evidence, not the current
candidate's release status.

## October 15 — constructor-counter identity limitation

The older global typed-array Proxy counters alter `array.constructor === Type`.
Three r128's `AnimationUtils.convertArray` uses exactly that identity to reuse
track arrays; under the counter it instead allocates copies. A minimal evaluation
of the actual converter predicate confirms native reuse, proxy copying, and
reuse when constructor identity is preserved. The GLB character assets already
share all animation accessors through one buffer view, so repacking them again
would not address a missing asset optimization.

Do not use the total buffer counts or heap totals from the f3ac/parking constructor
runs as native browser baselines. They remain instrumented source/call-site leads.
This does not invalidate the separate uninstrumented pacing failures or the
facility callback comparison, which used allocation sampling rather than global
constructor replacements. The prepared network/ribbon scratch diagnostic is not
implemented in runtime and must earn its own evidence before adoption.
Details: `output/release-review/561-buffer-counter-identity-audit.json`.

## October 15 — frozen fb24 acceptance in progress

The immutable 753-file fb24 package passes integrity verification; all 2,637
source tests and structural checks pass. Production remains the verified 5.5.1
build and canonical staging remains 1f37. The exact fb24 native flight still
records 916.6 and 466.7 ms intervals; moving driving also fails pacing. It uses
no heap cap, CPU/allocation profiler or forced collection during timing.

The complete 107-gate run started at 04:29:47 UTC. Aquarium/harbor street entry,
museum street entry, Kennedy tour, launch-pad walking, the actual road junction,
local worker recovery and aquarium repeated-visit/performance checks pass so far.
Current venue and road images were inspected. The museum's complete interaction,
fault/retry and save/reload journey completed, but its cold entry measured
1,022.5 ms against the unchanged 1,000 ms limit. Regional arrival was refused
before launch by its 8 GiB disk guard during temporary swap growth. These are
failed checks, preserved under `output/release-review/561-fb24-first-matrix-failures`.
The run was deliberately stopped during gate 76 after 71 passes and four failures
to repair the confirmed blockers. Urban-sandbox is interrupted and the later gates
are unrun. No complete acceptance claim is made. The owned process tree was closed
and the wrapper cleaned up its temporary staging identity; owner Chrome remained
open. Receipt: `output/release-review/561-fb24-matrix-interruption.json`.

The same run now also exposes a mixed-provider Monaco failure: 20 road junction
height differences, reaching 67.63 m, with exact OSM structures available. All
seven fallback-only assembled locations pass, including Monaco. The historical
b21 Monaco pass had no exact regional OSM and does not cover this combination.
The current failing report and gate receipt are preserved beside the earlier
failures. Diagnose duplicate physical ownership and captured connection groups
before changing profile fitting or tolerances. A bounded current-geometry and
keyboard-driving diagnostic is prepared but has not run.

The Earth swimming check produced no mapped depth samples. Its startup wait can
also resolve on a failed world, while its error check omits the generic runtime
error. The cause is not yet established; the prepared startup diagnostic records
that error and world publication state before attempting water sampling.

Old generated text evidence was losslessly compressed with byte/hash verification.
Superseded pre-October-10 diagnostic images were pruned only in three named
verification folders, preserving the newest image per directory, failure and
diagnostic folders, all reports, source/history, player data and retained builds.
Cleanup receipts are in `output/release-evidence/*20261015*.json`.

## October 15 — remaining collector work and regional numeric storage

The facility-scope repair remains a confirmed retention improvement, not a
frame-pacing fix by itself. Its native source flight still recorded 966.6 ms
and 633.3 ms intervals; walking/driving also exceeded short-window timing limits.
Coverage, activation, occupied memory and browser/local resource checks passed.
The flight used no CPU/heap/collector profiler or forced collection during timing.

The constructor evidence also identifies per-ring geographic index buffers and
per-road published width arrays. These now use separate per-publication bounded
append-only stores. They preserve Float64 geographic coordinates, Float32 road
width rounding, holes, crossings, all features and ownership on cancellation.
A new regression exercises concavity, malformed edges, flat-scan fallback,
source retirement and later generations against the original crossing predicate.
All 41 focused checks and all 2,637 source tests plus the full structural chain
pass. Frozen artifact checks and pacing remain unverified. Production has not changed.

## October 15 — facility callback released the load context

One persistent facility terrain callback was created inside the per-load block.
It now lives in the stable loader scope, retaining the same dynamic terrain
method/receiver while no longer retaining that block's source maps. In sequential
current-source allocation diagnostics, explicit post-load collection falls from
615,743,540 to 488,054,072 bytes. Sampled retained regional source copies, node
lookup and Overture conversion allocations disappear. This is diagnostic
retention evidence, not a native pacing pass; provider variation is possible.
The separate uninstrumented 90-second flight completed with the failures recorded
above. No profiling or forced collection ran during its timed gameplay.

Evidence: `output/release-review/561-current-source-retained-allocation/`,
`output/release-review/561-facility-scope-retained-allocation/comparison.json`.
V8 documents shared closure environments at https://v8.dev/features/weak-references;
that mechanism informed the investigation, while the app profile confirms the
actual retained allocation difference. No feature or coverage was removed.

## October 14 late continuation — demonstrated street and allocation repairs

The original f3ac failures remain below and are not acceptance for these edits.
The exact f3ac downtown capture reproduced a 4.17-unit cut in the main street,
with 231 retaining-wall pieces. A tagged parking aisle contributed an oversized
foundation roof constraint, which propagated through its connected approach.
The obstruction/terrain sweep used a 95 cm lateral extension even though the
published lining/portal outside extent is 37 cm. It now shares that physical
extent, and explicit parking aisles use conservative 3.2-unit inferred headroom
rather than deriving vehicle clearance from burial depth. This is representative
parking geometry, not a surveyed reconstruction. Genuine road tunnel defaults,
source tags, coverage, graph joins and foundation constraints remain in place.

The source-world reproduction now has ordinary terrain-fitted Light Street,
East Wine Court, Mercer Street and Redwood Street, no fabricated cut walls,
and 0.254-unit maximum ordinary fitting cut on the main street. The prescribed
keyboard movement completed; both before/after movement images were inspected;
no page errors occurred. This is a controlled arrival plus short real input,
not a whole-city or released-artifact certification.

Constructor evidence also found intermediate profile publications, temporary
walk/drive path distances, and per-NPC four-wheel height buffers. Compilation
now passes bounded append-only publication storage explicitly through initial
and reconciliation passes. Scratch and publication remain separate; no published
range is reused/detached, and final profiles remain packed. Temporary route and
wheel heights use ordinary double-precision numbers, avoiding native backing-store
finalizers while retaining reentrant ownership and exact arithmetic.

127 focused road/storage checks and all 2,636 source checks plus structural
checks pass. The final source street capture and movement are visually verified.
The 90-second native flight diagnostic still fails: its worst interval is
1,333.3 ms, with seven intervals over 100 ms and two over 250 ms. Mode activation,
coverage and retained-memory checks pass, but this is not release acceptance.
A separate instrumented CPU/collector trace correlates the later flight pause
with garbage collection; instrumentation changes timing and its collector log
is truncated. It does not replace the native failure. Immutable packaging,
matching full matrix, save rollback and hosted ordinary voyage remain pending.
No runtime timing budget was changed. Production remains 5.5.1.
Evidence: `output/release-review/561-parking-publication-source/`,
`/tmp/we3d-transport-fix-tests.log`,
`/tmp/we3d-parking-publication-final-pr.log`.

The owner requested completion and production readiness after the isolated 5.5.1
road-recovery deployment. Use the authorized location-based Earth fallback for
this release. Moving scenery is optional and must not be represented as complete
worldwide road, collision or activity streaming. Preserve the ongoing 5.6 venue,
harbor, NASA, ocean and consolidation work; do not roll it back to the hotfix.

## Complete f3ac candidate run — October 15, 03:11 UTC

Immutable build: `5.6.1+f3ac508d2bd9.a76b6be179dcf332.staging`.
All three backend gates and the four-stage actual-release/candidate/compatible
rollback/candidate save journey pass. The complete candidate run is **103/107**.
The failed regional arrival check did not launch because disk headroom was below
its unchanged guard. City-switch gameplay passed but two outgoing location
requests aborted; their lifecycle accounting needs diagnosis. District activity
admission timed out and still needs reproduction. Desktop performance failed.

Native performance: 12 reload cycles preserve coverage and clear world owners;
retained occupied memory and touch regression pass, with no browser/local
resource errors. Desktop activation, percentiles and hitch criteria fail; the
initial flight's worst interval is 1,300 ms. A sustained walking segment entered
custody, so that traversal is explicitly failed as well. Host swap rose during
the run; this observation alone does not identify the pause's cause.

A green source street check nevertheless captured an abnormal downtown road
cut. Packaged scene and exact source/terrain/profile evidence must establish the
cause before altering shared bridge/tunnel rules. The unused residual surface
propagation pass is already disabled; do not redo that historical repair.

Preserved failures: `output/release-review/561-f3ac-first-matrix-failures/`.
Sequence receipt: `output/release-review/construction-final-verification-sequence.json`.
Focused diagnostics are separate from acceptance. Ordinary hosted voyage/save,
repaired current-source acceptance and current-image review remain open.
Production is still 5.5.1; staging is still 1f37. No promotion occurred.

## Construction-storage implementation before the complete run

All 2,633 source checks and the complete structural chain pass. Terrain request
ownership remains repaired. Temporary transport profiles now use explicit,
bounded scratch scopes; published surfaces retain independent numeric storage.
Generated building construction uses small pages, then moves unbatched survivors
into their own exact attribute storage. This prevents standalone buildings from
pinning their retired neighbors' construction data. Geometry, facade, clone,
neighbor, nested-compilation and real batching regressions pass.

The source junction journey passes approach, turn and departure in one world
session, with no road or page errors; its prescribed-client screenshot was
inspected. That journey preceded the final standalone-storage refinement; the
complete final packaged matrix remains necessary. Earlier storage timing failed
with pauses over one second. After the refinement, GC-only flight records 633.4
and 549.9 ms intervals, with 292 ms in buffer sweeping. Those are failures, not a
native performance pass or complete release certification. No budget was relaxed.

The candidate is being frozen for complete backend, save/rollback and 107-gate
acceptance. Ordinary hosted account/voyage/save and current-image review remain
separate requirements. Production remains 5.5.1 and canonical staging remains
1f37. Both active branches retain the verified terrain fix and rollback review.

## Earlier status — October 14, 22:34 UTC


The a9e15 source chain passes all 2,625 tests and GitHub code/secret checks.
Its backend environmental check now passes with explicit partial availability;
shared marine and place authority also pass. The full backend is blocked by an
actual Logan terrain-publication failure in multiplayer, not room authority.
The a9e15 candidate passes aquarium/harbor, museum, Kennedy and launch-pad
journeys. The matrix was deliberately interrupted during road traversal before
changing terrain ownership; remaining gates are unrun for this artifact.

Two focused regressions reproduce a short terrain consumer cancelling another
consumer's shared image, both through timeout and AbortSignal. The local repair
makes these subscriptions independent: only the cache owns source cancellation,
its existing 10-second deadline, three retries, and world-generation teardown.
No terrain accuracy, road geometry, source coverage or reload policy is relaxed.
A real Chrome fixture decodes a source delayed over three seconds on its first
attempt while a short waiter expires and another cancels. Current complete
world/backend acceptance and final production preparation remain pending.

## Earlier iteration — October 14, 22:08 UTC

Canonical staging serves `5.6.1+1f37e893ccae.3e39c25a98b5a66f.staging` and both
remote manifests match local bytes. Its current prescribed junction and full
resource/lifecycle checks pass. The full performance run finishes twelve reload
cycles: no lost world coverage, gameplay interruption, browser/local resource
error, retained-world growth or mobile-regression failure. Desktop p99 and hitch
checks still fail, including an approximately one-second first-flight pause.
Failed receipts remain in `output/release-review/561-1f37-performance`.

Instrumented driving follows 397 m with ordinary keyboard controls and zero
errors. The major pauses correlate with collector work. A numeric-uniform cache
experiment increases sampled allocation and is rejected; it is not in the game.
A separate load-only diagnostic observes 1.58 GB used heap before collection and
617 MB afterward. Its explicit diagnostic collection is not acceptance evidence.

The current backend run passes shared marine, place authority, security, shared
expeditions, property synchronization, chat, multiplayer and account checks. Its
environmental stage receives waves but no HYCOM current/temperature values; the
legacy assertion incorrectly requires both live feeds despite the implemented
partial-availability contract. The corrected check requires real provenance,
validity times, available measurements and explicit missing-data warnings, and
records incomplete live coverage separately. No provider, security or game code
is changed. The eleven existing deterministic environmental contracts pass.

The full ordinary hosted automation signs in but reCAPTCHA rejects its token.
Read-only inspection confirms matching App Check configuration and allowed host;
ordinary installed Chrome successfully returns Baltimore through visible search.
This establishes ordinary search only, not the complete shared-voyage/save path.
Both disposable automated accounts were removed. No security bypass was added.

Remaining: complete current backend and candidate evidence; four-stage save
roundtrip; ordinary hosted voyage/save path; native pacing resolution; final
provider receipt, production configuration package and current-image approval.
Production remains 5.5.1. No final readiness or deployment claim is made.

## Earlier iteration — October 14, 20:56 UTC

Production remains 5.5.1. The latest committed e498 collision repair is on both
active development branches and passes GitHub code and secret checks. Its
uninstrumented flight check still reproduces a 0.8-second pause, so it is not
production-ready. Instrumented allocation improved substantially; that result
is not treated as a performance pass.

The next storage repair gives generated building position, UV and normal data
one backing buffer, and facade layout/opening data another. The arrays remain
separate, non-overlapping views with unchanged values. All 2,625 source checks
and the complete structural chain pass, including 984 exact building comparisons,
cloning/edit isolation and source retirement. A source flight run has zero
browser/local-resource errors and 33.4 ms p99, but three major pauses including
366.7 ms. Final packaged performance and the complete matrix remain required.

The road-safe b21 fallback has now been rebuilt and verified with production
configuration; only the three approved Firebase configuration assets differ.
The actual released 5.5.1 staging package is byte-verified inside the workspace
for the four-stage save test. Neither operation changes production or player data.

Remaining: final package verification and full matrix/backend run, ordinary
hosted voyage/save recovery, actual released/candidate/fallback-write/return
save roundtrip, final provider receipt, configuration-only production package,
and current-image-bound promotion. Original failures and interrupted runs remain
preserved. Earlier iteration notes below are historical evidence.

## Road-safe fallback selection — October 14, 19:23 UTC

The compatible fallback is now the preserved b21 candidate, replacing 4ec in
the current rollback plan. It retains the same modern save owners and includes
the local road-recovery and connected-approach fixes verified in Monaco and
Baltimore. The older 4ec references below describe the previous fallback plan.
Only five runtime/environment files differ from b21 in the next candidate;
none changes player persistence or backend protocols. Their complete hashes and
individual review are pinned in rollback-runtime-review.json. Production
configuration and the actual four-stage save roundtrip are still pending.

## Release sequence

1. Repair the observed Middleborough/South Marlyn physical junction. Require
   actual keyboard approach, turning and departure, shared surface heights and
   design grades. Audit every connected node on an engineered road, not merely
   the original constraint station. Keep bridges and tunnels under their current
   geometry/contact owners.
2. Freeze the complete source candidate and immutable staging package. Execute
   the candidate matrix, current venue/harbor/Kennedy journeys, road residency and
   recovery, location/scenery switching and real save upgrade/fallback paths.
   Diagnose failed gameplay separately from obsolete or defective test controls.
3. Verify the changed backend, security and ordinary hosted account/travel paths.
   Commerce receipt changes require coordinated frontend/backend publication.
4. Refresh release notes and current public presentation, disclose actual scope
   limits, and bind the deployable package to its exact verification evidence.
   Preserve production/rollback assets and source history.

## Current evidence

- The original road-worker failure is fixed in production 5.5.1. That receipt is
  separate from this unreleased complete 5.6 candidate.
- Native Chrome reproduced a 2.93 m difference at the side-street junction. The
  approach had a graph constraint at distance 0 but none at the branch 206.58 m
  along its polyline. The old audit skipped this branch even though the compiled
  profile/excavation controlled its height. The retaining wall had no opening.
- The correction includes every mapped node of an already-engineered profile in
  the existing joint constraint solver/audit. It does not promote unrelated
  ordinary streets by topology alone. The new regression failed before the fix;
  all 2,611 source tests and the complete structural chain pass afterward.
- The first corrected native scene confirms the junction returns to terrain and
  opens the connected side. Its straight-ahead assertion failed because that
  provider response ended the side street at a T-junction. The subsequent
  keyboard turn entered Middleborough Road successfully but its verifier spent
  too long alternating accelerator/reverse and stopped short of its departure
  target. Those failed reports remain unchanged. The corrected driver uses normal
  acceleration/coasting and steering; the final native Chrome run passes the complete approach, turn and departure.
  The car reaches within 4.65 m of the 40 m departure target, with one world
  generation, no road errors and no page errors. Its screenshot was inspected.
- No current complete-candidate, backend or ordinary-hosted release certification
  has been recorded yet. Earlier passed packages are historical evidence, not
  substitutes for this candidate's results.

Reports and inspected screenshots are under `output/road-continuity/junction-*`.

## Complete candidate iteration 9586566b

Immutable package `release-561-9586566b` builds and its source chain passes
2,611 tests. Both registered road gates pass on its exact bytes: real T-junction
turn/departure and eleven controlled arrivals with one injected worker failure,
one local recovery, one world generation and 69 region evictions. Screenshots
were inspected.

The aquarium completes street entry, model failure/retry, all lifts and
observations, map orientations, run/jump, exit and five reentries with bounded
water-target/model leases. Its first lower-reef sample fails p99/hitch budgets
(55.7 FPS average, 66.6 ms p99, one 100.1 ms frame). The matrix was deliberately
stopped to investigate; its started museum gate is interrupted, not passing.
A capped-heap diagnostic repeat passes frame budgets but does not erase the
first failure. It reveals substantial transform work under the hidden city.

The camera/light lease now hides the retained exterior root while an exclusive
venue owns the camera layer, and restores it on exit. Road readiness uses an
interior actor policy so outside compiler recovery cannot stop an occupied
floor. Two regressions fail before repair; all 41 focused owner/controller
checks pass after it. Source-native profiling with ordinary Chrome memory
settings shows 60 FPS and 16.8 ms p99 in all three windows, but still fails the
1 GiB heap budget (about 2 GiB before a natural collection; 637 MB on reentry).
This is diagnostic evidence, not final packaged performance acceptance.

Additional native venue/harbor/Kennedy gates are now required, making 107
candidate gates. The compatible fallback is the preserved `4ec78f8e` venue
package: it retains modern Backpack/campaign fields. Its pre-hotfix road
behavior is a documented emergency fallback limitation. Current 5.5.1 is the
upgrade starting point. Actual package/save/backend checks remain required.

Generated-package copy-on-write deduplication and transparent compression keep
all file bytes and paths intact. Only downloaded Chrome HTTP/compiled-code
cache entries older than 24 hours were removed. Source, user browser profile,
player storage, current dist and four saved historical packages are intact.
Cleanup receipts are in `output/release-evidence/`.

## Candidate 258988d8: current verification

The complete source chain passes 2,613 tests, including the registered venue
scene-ownership regression. Immutable staging package
`output/hosting-validation/release-561-258988d8` has asset manifest SHA-256
`a89ab6fcd9b0ce03ad6b92c5dedfac532509d586c827bff15f68eab73e9c785d`.
The opt-in allocation diagnostic was subsequently committed at `b6c4dc2d`;
it does not change the shipped game.

Ordinary-memory packaged aquarium testing completes the full visit and five
admissions. All three timing windows are approximately 60 FPS with 16.8 ms
p99 and no measured frame hitches. It still fails the existing 1 GiB raw
JavaScript heap limit: samples are 1.56–1.59 GB. The failed report is retained
in `output/release-review/561-aquarium-package-memory/`.

A separate source allocation diagnostic estimates about 546 MiB of live
sampled allocation. Its raw heap falls naturally from 1.41 GB in Pavilion to
638 MB in the lower gallery and 640 MB on reentry. This distinguishes live
allocation from not-yet-collected garbage, but neither sampling nor a later
collection turns the packaged raw-heap failure into a pass. No memory budget
has been increased, and no forced collection was used in these timing runs.
Diagnostic evidence: `output/release-review/561-aquarium-allocation-profile/`.

The complete 107-gate candidate matrix was interrupted after nine completed
gates against the saved 258988d8 package; city switching was interrupted. Individual results are not a complete release
approval. Backend, save/fallback round-trip and ordinary hosted acceptance
must still match the final candidate. A read-only production Functions
inventory confirms active Node.js 22 functions; that inventory does not prove
the four changed backend files have been deployed or tested live.


## Separated timing and retention review

The 258988d8 matrix passed the four venue/harbor/Kennedy arrivals and both road
gates. Aquarium and museum raw-heap checks failed; museum also recorded a
100.1 ms cold-entry frame. Regional scenery stopped at its 8 GiB disk guard,
before gameplay. City switching was interrupted deliberately while investigating
measurement overhead. These reports remain failures or incomplete, not passes.

Full diagnostics were allocating whole-city inventories while polling loading.
Readiness now reads the same scalar conditions directly. The explicit memory
policy change is documented in [MEMORY-MEASUREMENT.md](MEMORY-MEASUREMENT.md):
all timing runs without forced collection, raw heap remains visible, and a
separate occupied-world retention phase uses the existing 1 GiB numeric limit.
This does not mean the former raw-heap criterion passed.

Fresh packaged checks using that protocol pass: museum 66 assertions, aquarium
57 assertions. All six timing windows show approximately 59.5–60 FPS and
16.8 ms p99. Occupied retained heap is approximately 603 MiB for the museum and
568–569 MiB for the aquarium; raw readings still reach 1.55–1.77 GB. Five aquarium
admissions remain bounded, and the museum Journal survives a full reload.
Screenshots were inspected. Evidence is under
`output/release-review/561-museum-separated-measurement/` and
`output/release-review/561-aquarium-separated-performance/`.

Only generated September diagnostic screenshots were removed for disk space;
old reports, source, current captures, public assets and rollback packages remain.
Additional old text reports were losslessly compressed and hash-verified.
Cleanup receipts are in `output/release-evidence/`.

The final clean candidate, complete matrix/backend, save round-trip and ordinary
hosted review remain outstanding. Production has not changed.


## Current hosted capture and public presentation

The staging preview now serves clean source `2d1cd2c8`, build
`5.6.1+2d1cd2c82bbb.bc28b7fd5f3f8789.staging`. Both remote manifests match the
saved package. Production is unchanged.

Ordinary hosted capture passes Earth walking/driving/drone/flight, vessel room
routes/helm/26 m sailing/steering/submarine/scuba, Saturn/starship command deck and
return to Earth, aquarium street entry/lifts/exit/reentry, and museum street entry.
All five reports contain zero captured page errors. Evidence is in
`output/production-readiness-20261014/`. These are functional capture journeys,
not the separate signed-in shared-voyage acceptance or the complete matrix.

The first aquarium capture completed gameplay but its whole-route clock mixed a
performance.now baseline with a preceding RAF timestamp. The report failed and is
preserved in `output/release-review/561-gallery-initial-clock-failure/`. The clock
now starts on its first RAF. A repeat passes the functional route. Three separate
10-second in-venue windows run near 60 FPS. Whole-route raw timing also records
loading, floor/scene transitions and screenshot readbacks, including a 2.12 s
worst interval; this is not an uninterrupted gameplay benchmark or a passing
whole-route hitch result. No frame values or thresholds were discarded.

Nineteen fresh images now use content hashes in their filenames because Hosting
marks images immutable for a year. Old image URLs retain their original bytes;
the current landing page, Pages, README and release notes reference the new URLs.
Both public surfaces pass desktop/tablet/phone layout and image-decoding checks
without overflow or page errors. Current artwork remains stylized, with the
limitations described in KNOWN_ISSUES; these images do not imply photorealism.

### Bounded refinement source validation

All 2,623 source checks and the complete verify:pr chain pass. Focused checks
prove bounded capture-index construction/validation, cancelled publication,
in-place edit detection and unchanged nearest results. Smaller regional instance
cells retain every source building and transform while excluding more offscreen
instances. Native resource/timing acceptance is still pending.

The b965 sustained run is preserved as failed: seven movement windows completed,
with multiple FPS/hitch failures; teardown was interrupted after two logged
cycles once the remaining synchronous capture-index stall was isolated. It is
not a passing retention receipt. Its output/interruption record is retained at
output/release-review/561-b965-performance.

### Complete 33d5 measurements and collision allocation repair — 20:25 UTC

The 33d5 package passes actual Earth/space/ocean resource checks, land–ocean–land
coverage/pose restoration and three submarine/deck round trips. The registered
connected tutorial gate passes with readable location labels and no browser or
local-resource errors. The full desktop performance run completed all seven
sustained windows and twelve teardown/reload cycles; all retention, coverage,
transfer and error checks pass, as does its touch-emulation profile. Desktop
frame-rate and active-play hitch budgets fail, including a 550 ms flight frame.
No timing target or memory/coverage ceiling was changed.

A separate instrumented flight reproduced major collection during the pause:
heap fell from 1.49 GB to 616 MB, with array-buffer sweeping prominent. Allocation
sampling attributed about 1.1 GiB of temporary storage to collision queries in
90 seconds. A controlled 40,000-query airborne probe reproduced about 268 MB
allocated without any collision hits. Reordering the same horizontal and vertical
predicates rejects distant obstacles before their height evaluation; the same
probe uses about 14 MB. Candidate order, actual near collisions, dynamic updates
and height rules remain unchanged. Loop and interval-object experiments did not
help and were removed. All 33 focused checks and 2,624 complete source checks pass.
Native rebuilt flight and complete final acceptance remain required.

Evidence: output/release-review/561-33d5-performance, 561-33d5-connected,
561-33d5-resource-lifecycle, 561-33d5-flight-trace and collision-allocation-*.json.
The connected archive separates older leftover failure files from this run's
passing stdout report and current numbered screenshots.


## Shared terrain ownership and current release candidate

Candidate 3a43e124 passes all 2,628 source checks and the structural chain. Its
immutable 753-file package builds and verifies. The actual Logan multiplayer
journey passes eleven checks, including two loaded worlds, presence, shared
artifact and vehicle handoff; its screenshot was inspected. Consumer timeout and
abort now release only their subscriptions, preserving the source owner's bounded
retry, deadline and teardown. The delayed real-image fixture passes first-attempt
decoding, independent consumer cancellation and exit/reload.

The cache-ownership experiment still failed native pacing (350 ms worst flight
interval) and was removed; its patch and failed evidence remain available. An
earlier instrumented trace's largest weak-processing event occurred after the
window during profiler shutdown. It must not be cited as an active-play pause.
Active-play major-collection pauses remain real; a GC-event-only capture separates
those from CPU/allocation-profiler overhead. Complete matching backend/candidate,
four-stage saves, ordinary hosted voyage/save and frame pacing remain open.
Production and stable have not been promoted.

## October 15 — verified discovery-panel allocation repair

The source first-session check passes with the unchanged-frame discovery DOM
repair. It exercises actual habitat recording, Journal review, chapter badge,
phone controls, block placement/undo, room and property entry, reload persistence,
and the Flower Sprint receipt. There were no captured browser errors or failed
local resources. Desktop result and phone Journal screenshots were inspected.
Evidence: `output/release-review/561-dom-first-session-visible-action/report.json`.

The direct occupied-world regression observes zero child/text mutations over
120 unchanged renders, retains reference-link focus, and verifies immediate live
message changes. The earlier missed-click attempt is preserved; its button was
below the panel fold. The verifier now scrolls and verifies hit testing before
using the prescribed mouse action. No runtime workaround was added for that miss.
This functional result does not supersede the open native-pacing failure or
constitute immutable final acceptance.


## October 15 — actual Earth swimming diagnostic

The focused source journey passes startup with 69 mapped water areas, 49,080
buildings and 18,952 roads. Surface swimming, automatic scuba on submersion,
mode cleanup, the same vessel's ladder roundtrip and recovery pass without
browser errors. Both underwater and ladder screenshots were visually inspected.
An optional Overpass request failed, but the accepted fallback world published.
Evidence: `output/release-review/561-swimming-startup-diagnostic/swimming-earth.json`.

The original matrix failure did not reproduce and is preserved, not declared
fixed. The canonical verifier now records compact startup ownership and checks
the generic terminal load error before water sampling, so a rejected world cannot
masquerade as an empty-water failure. Swimming runtime was not changed. Final
candidate verification still must pass this journey.


### October 15 physical transport ownership investigation

Controlled published-OSM Monaco replay (real roads, explicitly absent ancillary
primary records) found 1,430 discontinuities in fb24. Full accepted-geometry
conflation for missing layer metadata, curved structures, surface approaches and
pedestrian collections reduces duplicate owners without dropping partial coverage.
Source-family edge grouping removes fallback-only failures, but 346 mixed-provider
physical joins still fail. Treating provider fidelity as a separate vertical
coordinate system is the remaining architectural error, not a measured elevation.

The ignored unified-junction experiment has zero discontinuities across all 3,150
sampled joins, maximum 0.24805 m under the unchanged 0.25 m tolerance, and no grade
violations. Its 648 old source-family audit errors were preserved. Current source
replaces that provenance rule with complete-owner reachability through the physical
road graph: an unrelated same-provider road is now rejected, and a proven physical
provider seam shares one constrained height. Explicit at-grade level separation
also cannot bypass the topology filter through the wider provider snap tolerance.
This source repair is undergoing the real fixed-route drive and full regression
review; it is not final package acceptance. No production promotion has occurred.

Source semantics references: [OSM layer](https://wiki.openstreetmap.org/wiki/Key:layer)
is crossing order, not absolute elevation; [OSM elevation](https://wiki.openstreetmap.org/wiki/Key:ele)
is a separate measured datum. Geometry source fidelity remains unchanged.

The museum admission diagnostic completed all 66 checks, cold admission 920.5 ms,
with bounded occupied/exterior retention and no browser errors. Its CPU profile
identifies shader-link waiting as the dominant cold-entry work. The earlier
1022.5 ms failure remains preserved; final unprofiled immutable acceptance is open.
The native shared-building-store experiment did not demonstrate pacing benefit
and was reverted. The verified discovery DOM repair remains. Native pacing remains
an unresolved release blocker.


### October 15 current source route and native allocation results

The actual keyboard-driven route through the previous mixed-provider failure
completed 79.55 m of 84.21 m, with 69 contact samples, zero airborne samples and
no browser errors. Both start/end images were inspected. This confirms the
connection is drivable; it does not certify mountain scenery realism. The same
exact road already had 48.72 m maximum modeled fill in fb24. The strict 8.5%
approach rule can lift a steeper existing hillside road above its terrain; that
separate limitation remains visible and is not waived by the continuity audit.
Evidence: `output/release-review/561-source-physical-corridor-drive/report.json`.

The facade allocation cleanup preserves all 24 pre-change byte fixtures, but
native flight still records 666.7 and 1100 ms intervals. Walking/driving windows
improve in this run; this is not a repeated controlled performance comparison.
No pacing pass is claimed. Native retained-allocation sampling estimates 446 MiB
retained: frontage edges, building provenance, subdivided road points, collision
records and traversal topology are the largest owners. Unlike the earlier
26.1 GiB startup allocation total, this sample excludes already-collected objects.
Profiling/collection results are diagnostics, never timed acceptance.


### October 15 regional roundtrip and unmarked-road retention

Source regional arrival now passes, including real provider publication, failed
provider retention/recovery, return to origin, and persisted off/on controls.
The same region returns to 357,104 mapped buildings and 70,194,324 regional bytes,
with 18 terrain children before and after. The arrival view was inspected and
has facade colors/detail beyond the origin. This uses controlled actor arrivals,
not an assertion of worldwide physical gameplay. Source evidence is preserved at
`output/release-review/561-source-regional-arrival/report.json`.

Unmarked roads no longer retain dense center-marking sample arrays through the
regional publication callback. Their canonical geometry, indices, collision and
coverage remain unchanged. Four focused suites and the full 2,653-test source
chain pass. Native occupied heap is about 464 MiB after collection versus 478 MiB
in the preceding diagnostic; there is no pacing pass. The latest native flight
still pauses for 700 and 2649.9 ms, and driving activation takes 1022 ms. These
failed results remain in `561-road-marking-retention-native`; they must not be
relabelled or hidden by later successful functional checks.
