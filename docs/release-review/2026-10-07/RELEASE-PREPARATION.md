# 5.5.0 release preparation

The owner authorized GitHub, Pages, semantic versioning and production deployment.
Use the `steven/visual-quality` checkout identified in CURRENT-STATE.md and explicit
production project `worldexplorer3d-d9b83`. The production backend has been updated;
the public frontend remains on 5.4. PR 96 and v5.5.0 remain drafts. Stable and Pages
have not been promoted.

## Candidate and public presentation

The local and hosted candidate is `5.5.0+4dd2e37c69a9.e85c0302553a7fda.staging`.
All 615 delivered file hashes match the Android-tested 135 preview and the 316
game payload. Later source changes corrected verification races and large Git-blob
hashing. Current source checks pass 2,109 tests; GitHub PR and secret scanning pass.
The packaged-world preflight passes 29 checks without browser errors or failed
local resources.

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

The preview backend still needs alignment: a downloaded-source audit found 79
older packages, including the previous condition-save implementation. Its current
preview hostname is authorized for Firebase sign-in, but two actual server CORS
preflights return 403. Production's origin returns 204 with the exact allowed
origin. The prepared staging-only rollout updates the tested source and adds only
this exact preview origin, preserving the other ten parameters and existing
allowed origins. It has not yet run; an ordinary hosted browser check follows it.

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

The full 91-gate candidate regression is running. The earlier 1033 aggregate result
of 61 passes / 30 failures remains preserved: 21 later checks stopped on an expired
disposable staging credential before establishing gameplay results. The current
wrapper renews its private identities and cleans them up at completion.

Sustained movement on the identical 316 payload still failed five of seven hitch
windows, with worst walking/driving frames of 583.2/366.6 ms. Its twelve-cycle
retention run was stopped after six reported reloads when disk availability reached
541 MiB. These results remain failed/incomplete. No building coverage was removed
and no performance threshold was relaxed to change the result.

The owner reports that Android works. Device model/browser, thermal and resume
measurements were not supplied. Ordinary hosted, named physical-device, iOS and
uncoached-player acceptance remain open. Deployment authorization is not recorded
as proof of those checks.

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
