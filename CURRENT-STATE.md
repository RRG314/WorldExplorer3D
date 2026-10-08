# Current development and release state

Updated October 8, 2026. **5.5.0 is a release candidate; production promotion is pending.**
The owner has authorized GitHub, Pages, a versioned release and production deployment.
The draft release acknowledges the remaining product limitations. Failed or missing
verification has not been represented as acceptance.

## Working checkout

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`,
branch `steven/visual-quality`. Do not edit the older Documents/Developer checkouts.
Preserve existing location work, player data, retained artifacts and Git history.
On this observed 8 GiB Apple M1 Mac, run heavy verification sequentially and close
only owned browsers and servers. Ordinary user Chrome must remain open.

## Build identities

| Surface | Current identity |
| --- | --- |
| Production | `5.4.0+1532bdfbb5c1.319d215f60318297.production` |
| Hosted preview and local dist | `5.5.0+61cc497e6d5a.97fd90a968edc376.staging` |
| Candidate source | `61cc497e6d5ae50cf3de69c3afe0cb707bf4e042` |

The 61cc road-repair package passes all 29 normal packaged-world checks with no
browser errors, zero discontinuities across 741 joins, and retained coverage of
49,023 buildings, 18,952 roads, 111 land-use areas and 49 terrain tiles. Both
hosted manifests match local bytes. Production remains unchanged. Source and
GitHub PR/secret-scanning checks pass. Its asset manifest SHA256 is
`52047c86ff3736dcb96d0ce4fff596318352d6dbbf8a84ef4d38c2f584915b31`.

The current dist, compatible 37a fallback, production and unique 0e snapshot must
be preserved. Old generated packages were removed only after pushed ancestry and
payload verification, with manifests, receipts and test evidence retained. The
owner-tested 4dd2 runtime was byte-identical to the earlier 135/316 preview.

The owner has limited the final feature addition to loading presentation. Source
now has a pipeline-driven progress bar, a longer-load note, twelve browsable
feature/tutorial cards, reduced-motion behavior and friendly startup recovery.
The initial source suite passed 2,141 tests. Desktop and 360px phone layouts,
all card widths, keyboard/modal focus, short-screen scrolling and actual bootstrap
failure/reload pass. A prescribed real Baltimore launch records monotonic 3–99%
progress and automatic card rotation across 71.6 seconds, then hides the overlay
and passes both driving bursts. No game errors; optional external Overpass CORS
errors are retained separately. Images were inspected. The final phone-sized launch also passes, showing road, flight and ocean cards before play; its 27.5-second result is browser emulation, not a physical-phone measurement. All final source checks pass 2,141 tests. A new immutable preview is pending.
This is loading-UI evidence, not a performance or full-release acceptance claim.

## Completed verification and repairs

The frozen 4dd2 source chain passes **2,109 tests**, dependency/source/ownership/type
checks, inventory and sensitivity checks. Its GitHub PR and secret scanning pass.
Additional repairs described below pass the full source checks; their updated
immutable package and release checks remain pending.
The targeted dependency audits report no known vulnerabilities.

The owner's road/secondary-sidewalk correction is being verified locally.
Depressed engineered approaches no longer pull down neighboring street terrain;
missing interior crossings in generalized map data share a surface elevation.
Mapped paved footways now join the detailed pavement owner, while park paths,
trails, structures and explicit unpaved surfaces retain their intended coverage.
Fallback paved paths use the same concrete pattern and scale during loading.
Retaining wall tops now respect an overlying road/bridge, with the visible and
collision geometry sharing that boundary. Compiled structure collisions use a
0.02 world-unit vertical margin instead of the approximate-building 0.45 margin.

The complete source suite passes **2,134 tests**, inventory and sensitivity after
the wall/material additions. The focused wall/tunnel/collision and
pavement/publication/ownership checks also pass. Manhattan keyboard driving passes both ways
across West 33rd Street and the West 35th Street bridge, plus the lower tunnel
exit. Actual walking on a formerly coarse generic footway passes with detailed
pavement contact and no duplicate ribbon contact. Images were inspected. Earlier
failed runs are preserved; the first bridge drive uncovered the retaining-wall
collision defect. Both prescribed Baltimore movement bursts pass after configuring
the verifier's live staging services; images were inspected, with no game errors.
Optional external Overpass CORS failures are recorded separately. This diagnostic
used a longer readiness wait after the original 90-second cold-start failure;
that failure remains open, not converted into a loading/performance pass. The final Manhattan material capture completed without page errors and all
three images were inspected. Near pavement took 23.35 seconds to build and
30.3 seconds from the arrival capture to acceptance, following an earlier
41-second build. These variable source diagnostics do not establish release
loading/performance acceptance. The first updated package (`00c56b56`) failed its world preflight before any
preview deployment: 28 checks passed, but nine Baltimore joins had height gaps.
A diagnostic identified auxiliary terrain stations replacing exact junction
stations by 4.9–5.0 mm, which made a feasible 8.5% grade appear infeasible. Exact
transport stations now take priority over nearby ordinary/obstruction samples.
The regression failed before the repair; all 22 focused tests now pass. Actual
Baltimore movement then passes with zero discontinuities across 741 joins,
49,023 buildings, 18,952 roads and no game errors. Both screenshots were inspected.
The complete source chain now passes 2,134 tests. The replacement 61cc package passes its normal 29-check preflight and is hosted; neither failed run was relabeled passing.

The first complete candidate matrix on the previous `1033fb88` package finished
61 passes and 30 failures. Twenty-one later checks stopped before gameplay when
a disposable staging test credential expired. Those results are preserved under
`output/release-evidence/history/candidate-1033-20261007`; they are not passes for
this candidate. The private wrapper now renews and cleans up its staging identities.

Real geometry queries identified three Monaco junctions removed by tunnel
excavation. Full surface-carriageway roof constraints now participate in the
existing graph/grade solver. The source Monaco check reports zero junction gaps
and zero discontinuities across 1,216 sampled joins. Real keyboard tunnel
approach, bore and exit pass six checks. Terrain and retaining edges still need
visual polish; functional passage is not final art acceptance.

On the retained previous package, corrected marine research (eight cases),
habitat (seven cases), real Earth/ship/lift/exit and prescribed Moon movement/pause
checks pass. Screenshots were inspected. A prescribed Monaco source run recorded
external Overpass and imagery CORS failures; it is retained as failed evidence.
The public Pages layout passes desktop and phone-width overflow/image checks.

The aircraft client now permits gateway startup within a 20-second envelope;
the IPv4 upstream has one absolute nine-second deadline through connection and
body delivery. Focused provider tests pass. Staging `getAircraftStates` version 6
is ACTIVE. Production now has aircraft version 5, place lookup version 1 and
environmental data version 1 ACTIVE. All 11 existing deployment parameters are
preserved. A downloaded-source audit then found the other 77 Functions still
used older packages. All 77 are now updated, and all 80 deployed source archives
match the 36 tracked backend code/configuration files. The protected endpoints reject
missing App Check with 401, and a live bounded aircraft query returned 200 in
1,005 ms. The public frontend remains on 5.4. Firestore now admits the tested ocean
presence values; Storage rules are unchanged. Actual production protocol tests
pass for marine authority, condition-save retry/legacy compatibility, discovery
receipts and account isolation. All three temporary accounts and owned fixture
documents were removed and their absence verified. Two deployment IAM lookup
errors were reconciled against live ACTIVE versions and matching permissions;
no permission change or whole-rollout retry was needed.

The current preview was deployed after its packaged-world preflight passed all
29 checks with no browser errors or failed local resources. Hosted manifests
confirm the preview identity above and unchanged production. The rollback
verifier now streams large Git blobs and awaits the visible Start control.
Large-asset corruption regression and all 160 reviewed file pairs pass.

## Remaining release work

Staging alignment is complete: all 80 Functions are ACTIVE, their downloaded
archives match all 36 tracked backend files, and the current preview origin is
allowed. The other ten parameters and all existing origins are preserved. Shared
expedition, environmental data and condition-save preflights each return 204 with
the exact preview origin. The temporary parameter file was removed. The complete ordinary hosted journey remains necessary; source equality and CORS are not that acceptance.
An ordinary hosted Chrome probe signed in successfully but live search failed
with 401. A separate read-only probe observed reCAPTCHA requests returning 200
and the actual App Check token exchange returning 403, `App attestation failed`.
Project/app/site-key alignment and browser-key API permissions were checked;
the cause of the rejected attestation is not established. Debug-attested browser
checks are not ordinary-browser acceptance. No protection was disabled. The
temporary test account and owned records were deleted and absence verified. Subsequently, the owner’s ordinary installed Chrome (without debug attestation) successfully searched Baltimore on the 61cc preview and displayed three real place results. That unsigned search is verified; the prior automation attestation failure and remaining ordinary journeys are not reclassified.

Live providers passed on the identical `316` game payload. Seven sustained
movement windows completed: five fail the hitch limits, with worst observed
walking/drive frames of 583.2/366.6 ms. The cleanup sequence was stopped after six
reported reload cycles when disk availability fell to 541 MiB; remaining cleanup
and mobile checks are incomplete. Obsolete private heap captures and inactive
test-browser data were then removed at the owner's request, recovering about
3.8 GiB; pruning old staging packages recovered additional space. Compact
diagnostic reports and analysis scripts were preserved. No threshold was relaxed.

The packaged save upgrade → fallback write → candidate return journey
passed on the current 4dd2 package, retaining 64 seeded items, existing and new records, equipment controls
and unrelated pending account data. No browser errors or failed local requests
were recorded.
The current 4dd2 backend matrix passes all three gates: the general backend
suite (14 stages), place authority, and shared marine. The latter passes all
12 two-client journey cases and three rules cases. Two verifier races were
corrected: temporary network backpressure and waiting for the server's stopped
pose before recording a study. Runtime ownership rules are unchanged.
The owner reports the current preview works on Android. This is a smoke check,
not measured device/thermal or iOS acceptance. The full frozen 91-gate candidate
run completed: **83 passes and eight failures**. Reports and its log are preserved
in `output/release-evidence/history/candidate-4dd2-20261008`. All 12 reload cycles
completed, and retention, cleanup, coverage, transfer, storage and phone-size
regression checks pass. Desktop frame timing and mode activation fail.

The other failed gates are resource ceilings, normal/fallback Manhattan road
coverage, actor-proxy teardown, optional-provider CORS classification, Logan
recorded-fixture delivery and an expected Ocean request cancellation. Local
verifier fixes have focused tests passing. The complete urban sandbox rerun now
passes all 15 checks, including vehicle/equipment and police/medical recovery.
The other repaired browser gates still need reruns.
The actual Manhattan gap was caused by terrain-only portal placement cutting
through a protected overhead road. The local model now preserves feasible road
roof intervals without changing driving grades. Twenty-four targeted tunnel
tests pass; the actual source scene has zero junction gaps, and keyboard driving
passes both directions across the repaired junction. Images were inspected.
Surrounding terrain and street detail remain visually rough. This is not final
art or a new packaged-candidate acceptance.

Renderer and portal allocation experiments are separate from the shipped build.
The uniform-cache draft preserved pixels/uploads but increased allocations in
the actual four-window movement comparison, so it was rejected and remains
unapplied. The portal fast path preserves exact geometry in 600 randomized
comparisons and reduces synthetic allocations. It is now local, with ten focused
geometry tests passing; actual gameplay performance still needs remeasurement. The current save roundtrip and public weather/marine rights,
deployed-source and packaged-attribution review pass. Ordinary hosted, named
physical-device and uncoached-player acceptance remain unverified. The old resource baseline covers 25,529 Baltimore
buildings; restored coverage retains 49,023. No coverage was removed. A separately captured current Earth baseline retains
49,748 buildings and 375,726,562 geometry bytes, versus 25,529 buildings and
232,692,742 bytes in the old declared baseline. The documented Earth ceilings
are now 400 MiB of source geometry, 60,000 buildings and 12,000 structures.
Other resource, timing, retention and coverage limits remain unchanged; the
new policy still needs a fresh browser gate and is not a physical-phone claim.

PR [96](https://github.com/RRG314/WorldExplorer3D/pull/96) and release `v5.5.0` are
drafts. Stable, public Pages and production have not been promoted. The updated
preview is available at `https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app`.
The supporting production provider rollout is complete; frontend promotion is pending.

The licensed replacement research vessel, broader ocean wildlife/activities,
spearfishing and worldwide streaming are **not implemented by this release**.
Earth remains bounded and location based. See [known issues](KNOWN_ISSUES.md),
[release preparation](docs/release-review/2026-10-07/RELEASE-PREPARATION.md), and
[release identities](docs/RELEASE_SOURCE_OF_TRUTH.md). Earlier investigations remain
in Git history, their dated evidence folders and `progress.md`.

Private cloud configuration and credentials remain outside the repository under
`~/Library/Application Support/WorldExplorer3D/verification-private`. Never print
raw configuration or credential files, and never attach them to release material.

Four provider-cache field policies were applied without changing the 11 existing
composite indexes or 19 unrelated field policies. Both expiration policies are ACTIVE as of 22:06 UTC. Only generated provider
caches are affected. The exact live 5.4 frontend was independently matched by
Hosting version and both manifest bytes; its preserved `release-54-1532` channel
now expires November 6 at 22:26:58 UTC. This exact-live copy is separate from the
reviewed save-compatible 37a fallback.
