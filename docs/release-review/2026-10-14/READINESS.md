# October 14 production candidate

The owner requested completion and production readiness after the isolated 5.5.1
road-recovery deployment. Use the authorized location-based Earth fallback for
this release. Moving scenery is optional and must not be represented as complete
worldwide road, collision or activity streaming. Preserve the ongoing 5.6 venue,
harbor, NASA, ocean and consolidation work; do not roll it back to the hotfix.

## Latest status — October 14, 20:56 UTC

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
