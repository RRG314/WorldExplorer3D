# 5.5.0 release preparation

The owner authorized GitHub, Pages, semantic versioning and production deployment.
Use the `steven/visual-quality` checkout identified in CURRENT-STATE.md and explicit
production project `worldexplorer3d-d9b83`. The production backend has been updated;
the public frontend remains on 5.4. PR 96 and v5.5.0 remain drafts. Stable and Pages
have not been promoted.

## Candidate and public presentation

The local and hosted road-repair candidate is `5.5.0+61cc497e6d5a.97fd90a968edc376.staging`.
Its normal packaged-world preflight passes all 29 checks, with zero discontinuities
across 741 joins and no game errors. Hosted manifests match local bytes. Source
checks pass 2,134 tests; GitHub PR and secret scanning pass. Production is unchanged.
The newer loading-presentation addition described below still needs packaging.

The public README, release notes, roadmap, known issues and project page use a
curated gallery of actual unedited gameplay screenshots. They do not include an
internal file dump. The deck and diving images show the existing custom vessel;
licensed replacement art, broader wildlife, spearfishing and unrestricted worldwide
streaming are explicitly outside this release. Complex transport edges and remaining
movement pauses are acknowledged.

## Backend reconciliation and live verification

The initial live inventory lacked place lookup and environmental data and used an
older aircraft gateway. Those three providers were deployed first. A subsequent
audit downloaded actual deployed source archives and found 77 other functions still
using older packages, including marine authority, save revisions and discovery
receipt changes. Comparing only the last release's Git commit would have missed this.

The remaining 77 functions and the two Firestore ocean-presence enum additions are
now deployed. All 80 functions are ACTIVE, and their source archives match all 36
tracked backend JS/CJS/JSON files. All 11 existing runtime parameters are preserved;
Storage rules are unchanged. Firebase CLI reported IAM read failures for
`createCheckoutSession` and `getAdminOverlayFeatureDetail`, but both updated versions
are ACTIVE and their actual invoker policies already match the source. No extra
permission change or broad retry was needed. Private configuration snapshots stay
outside the repository; the temporary deployment environment file was removed.

Actual production tests using three disposable accounts and an exclusively owned
private room pass seven protocol groups: authentication/admission rejection,
marine create/join/exclusive pilot/replay/stale revision, crew and outsider rules,
ocean presence, rejected-write preservation, condition save/retry/legacy compatibility,
and discovery receipt/owner/schema-2 behavior. Every fixture document and temporary
account was deleted and independently checked absent. These are live HTTP/rules
checks; they do not substitute for an ordinary complete browser journey.

Four field overrides apply only to place/weather cache payloads and expiration.
All 11 existing composite indexes and 19 unrelated field policies were preserved.
Both TTL policies are ACTIVE as of 22:06 UTC.
No existing player document was changed by this operation.

Staging alignment is complete. All 80 Functions are ACTIVE and their downloaded
archives match the 36 tracked backend source/configuration files. The exact
preview origin was added while preserving the other ten parameters and all
existing allowed origins. Shared expedition, environment and condition-save
preflights return 204 with that origin. The temporary parameter file was removed.
Ordinary hosted sign-in subsequently passed, but search failed with 401. A
separate read-only probe observed App Check exchange 403, `App attestation failed`,
despite successful reCAPTCHA requests and matching project/app/site-key settings.
The cause remains unresolved. Protections were not disabled and disposable test
accounts/records were removed and independently verified absent.

## Current acceptance

All three frozen backend gates pass, including 14 general backend stages and the
complete two-client marine voyage with 12 journey and three rules cases. The marine
verifier now releases controls during bounded network backpressure and waits for a
fresh authoritative stopped pose before recording a study. Gameplay authority,
scan distance, speed and lease constraints were not relaxed.

The current packaged save upgrade, compatible fallback writes and candidate return
all pass. Existing records, new writes, equipment state and unrelated pending
account data survive the roundtrip. The reviewed fallback artifact remains retained.
The public weather/marine rights, exact deployed source and packaged attribution
review passes. Visible MET, NOAA fallback and HYCOM guidance retains source and valid
time; the UI labels modeled conditions and missing observations clearly. Its local
browser test used registered staging debug attestation, not ordinary production
attestation.

The full frozen 91-gate candidate regression completed with 83 passes and eight
failures. Twelve reload cycles, retention, coverage, transfer, storage and mobile
layout passed. Desktop timing, resource ceilings and six functional/verifier
gates failed. Local repairs and their reruns are tracked in CURRENT-STATE.md;
neither a repaired verifier nor source inspection is a packaged-browser pass.
The earlier 1033 aggregate result
of 61 passes / 30 failures remains preserved: 21 later checks stopped on an expired
disposable staging credential before establishing gameplay results. The current
wrapper renews its private identities and cleans them up at completion.

Sustained movement on the identical 316 payload still failed five of seven hitch
windows, with worst walking/driving frames of 583.2/366.6 ms. Its twelve-cycle
retention run was stopped after six reported reloads when disk availability reached
541 MiB. Those earlier results remain failed/incomplete; the later 4dd2 run
completed all twelve cycles but still failed movement timing. No building coverage was removed
and no performance threshold was relaxed to change the result.

The owner reports that Android works. Device model/browser, thermal and resume
measurements were not supplied. Ordinary hosted, named physical-device, iOS and
uncoached-player acceptance remain open. Deployment authorization is not recorded
as proof of those checks.

The owner's road/secondary-sidewalk correction uncovered separate causes:
depressed approach grading deformed upper streets, generalized map crossings
had conflicting elevations, and generic paved footways bypassed the detailed
pavement owner. The repaired Manhattan scene now passes actual intersection and
bridge driving in both directions, lower-bore exit and mapped-footway walking.
The first bridge test failed and led to a further repair: lower retaining-wall
tops and their collision margins must respect an overlying road. Fallback paved
paths now share the resident concrete pattern and scale. Final material images were inspected and all 2,134 source tests plus dependency,
ownership, type, inventory and sensitivity checks pass. The first new package failed continuity at nine Baltimore joins before deploy.
The measured cause was a nearby terrain station displacing an exact junction
station. Its regression and the actual corrected scene now pass, with zero
broken joins across 741 samples. The replacement package and release checks
remain pending. A cold Baltimore source action run exceeded
its 90-second startup limit; it remains failed loading evidence, with no runtime
exception recorded. Both prescribed movement bursts subsequently pass with staging services
configured and a documented longer diagnostic wait. Optional Overpass failures
are recorded separately. This checks controls and appearance, not a relaxed
release loading/performance threshold.

## Repairs and preservation

The Monaco geometry repair retains surface junctions over tunnel excavation. Source
checks report zero coverage gaps and zero discontinuities across 1,216 sampled
connections; actual keyboard approach, bore and exit pass six checks. Retaining
terrain remains visually rough and is not called finished professional art.
Aircraft requests allow a 20-second client envelope and an absolute nine-second
upstream deadline. Production access-control and live bounded aircraft probes pass.
Targeted sharp 0.35.5 and proxy-addr 2.0.8 security updates clear the dependency audits
and are included in the deployed source packages.

Owner-authorized cleanup removed about 3.8 GiB of obsolete raw diagnostic/profile
data and 47 superseded clean staging packages after confirming their source in
pushed ancestry. Compact reports, manifests, source/history, current production,
the required rollback and recent diagnostics remain. No player data or ordinary
Chrome profile was removed. When the Git index in the older Documents metadata
became unreadable, the inaccessible file was preserved and a private HEAD index
first established that the working tree was clean before rebuilding the index.

## Final loading-screen addition

The owner requested this as the only new feature before release. The screen has
three separate jobs: explain that detailed locations may take over a minute;
show real pipeline progress without a fake countdown; and introduce useful things
to try. Twelve cards rotate at twelve-second intervals, start with two relevant
destination tips, then mix travel, fieldwork, ocean, space and data features.
Previous/next pause rotation, with an explicit play/pause control. Reduced motion
starts paused. The timer stops on hide and startup failure; background tabs do
not advance cards. No new asset downloads or provider requests are introduced.

Copy was checked against current source: the curated E34 model, aviation boarding,
maritime boarding, current-location/Live GPS entry, Explorer Journal/Field Guide,
Backpack, research-vessel journey, Solis Reach/Pathfinder, USGS earthquake registry,
NASA Exoplanet Archive catalog and planetary surface attribution. Supported sites
and Alpha status are stated where needed. Exoplanet landscapes are explicitly
imagined; cards do not promise worldwide travel or the planned ocean expansion.
The feature copy is not labeled as work presently being loaded.

Earth progress follows loader milestones, with actual pavement worker completion
within its reserved interval. Stale sessions and late earlier phases cannot move
it backwards; failed tasks do not complete it. Other-world short transitions use
an indeterminate bar. The overlay is removed only by the existing ready/abort
lifecycle. Startup failure presents a reload action; technical diagnostics remain
recorded and can be explicitly requested with the diagnostic URL option.

Evidence: `output/verification/loading-presentation-55` uses actual HTML/CSS,
presenter and accessibility code for desktop, phone, all-card width, keyboard,
reduced-motion and bootstrap-failure/reload checks. `loading-gameplay-55` records
an actual source Baltimore launch and two prescribed driving bursts, with images
inspected. The 71.6-second load shows monotonic progress and rotating cards. Two
optional external Overpass CORS errors are separately retained; no game errors.
These are loading-presentation checks, not a replacement for the open release
matrix or a claim that loading became faster. Final source checks pass 2,141 tests. The final phone-sized launch passes both prescribed driving bursts after monotonic progress and three cards over 27.5 seconds. All screenshots were inspected. Physical-device performance is not inferred from this emulation. Final package verification pending.

Ordinary installed Chrome on the 61cc preview also returned three Baltimore place
results without debug attestation. This verifies unsigned real search; it does
not erase the earlier isolated automation App Check failure or certify all other
ordinary-browser journeys.


The first loading package, dfa29bb, passed its normal 29-check world preflight and
was hosted. The owner then rejected the oversized rounded card. The replacement
is a compact bottom panel using the app's actual interface tokens, fonts and
controls. All five actual-theme component groups and 16 focused lifecycle/loading
checks pass. The prescribed source launch passes with monotonic progress, six
cards and successful dismissal over 88.3 seconds, followed by both driving bursts.
No runtime errors; optional external Overpass CORS is separately retained. All
images were inspected. This measures UI behavior, not faster loading or full
release readiness. Road, terrain and gameplay authority are unchanged by this
visual correction. See CURRENT-STATE for the separate unmatched-workload terrain
publication observation; no speculative repair was applied.

Compact loading correction: complete source verification passes 2,141 tests, dependency/source/ownership/type checks, inventory and sensitivity. New immutable preview packaging follows.
