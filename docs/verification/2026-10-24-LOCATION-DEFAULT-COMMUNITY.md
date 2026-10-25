# Selected-location defaults and Play community readiness

October 24, 2026. Candidate follow-up to the current b48 released web game.

## Behavior and ownership

Selected-location Earth is the browser foundation. Settings explains the finite
area for roads, buildings, entrances and activities, and the selected origin
shared by personal and weekly rooms. Extended Earth scenery remains an explicit
experimental choice. New ocean voyages default to a selected dive site;
continuous ocean exploration is optional. Existing explicit choices, guided
sites and saved v1/v2/v3 voyages keep their original semantics. No forced-reload
travel, generic position setter, new scheduler or competing session store.

Settings now owns both preferences before lazy ocean startup. A failed save
reverts the control and announces the failure. Existing regional/ocean owners
still activate and restore their modes.

The existing account/social/session boundary now owns community consent and
persistent player blocks. An unchecked, cancellable accessible dialog obtains
versioned rules acceptance before shared participation. Frontend, HTTP handlers
and Firestore rules enforce it; declining publishes no consent or room lease.
Account changes invalidate pending work. Missing or stale consent is rejected
before capture upload/reservation, contribution and overlay effects. Existing
Auth, App Check, deletion guards and room admission remain.

Private blocks filter existing and incoming chat, invitations, friends and recent
lists. The server rejects invitation creation/resend if either party blocked the
other. An Unblock list is available from title Multiplayer and the live Room
panel. Loading waits for the first server block snapshot; stale account callbacks
cannot publish. Shared roads/builds/collision and actor admission stay consistent;
blocking is not geographic separation. Existing reports/moderation remain.

Invitation sending now writes one sender-scoped invitation without reading the
recipient's private inbox; authoritative rules retain identity and resend checks.
Account deletion includes own consent/blocks and incoming block references. The
additive blockedPlayers.uid group index must be ready before updated deletion.

## Executed acceptance

- Eight focused runtime components cover defaults, denied storage, preference
  ownership before lazy runtime, consent concurrency/cancel/auth races, accepted
  versions, block filtering/readiness and backend missing/stale/current consent.
- Five real Firestore rule cases cover private/versioned consent, pre-consent
  chat denial, reporting, block privacy/persistence, blocked create/resend,
  unblocking and sender-block/friend restrictions.
- Controlled real Chrome with actual Firebase SDK/Auth/Firestore/HTTP Functions
  and actual UI owners: decline, two guest acceptances/admission/chat, Block,
  server invite denial, reload persistence, Unblock, successful normal invite,
  and both guests joining the same server-owned weekly room. No 3D city loaded.
- Desktop and mobile-layout current Settings markup/owner: both off by default,
  clear limits, ocean choice before runtime, persistence after reload, prescribed
  keyboard Space input and no horizontal overflow. Screenshots inspected; block
  name contrast and disabled-button appearance corrected before final run.
- Two selected existing save tests retain streaming/native-depth checkpoints
  and distinct v1/v2/v3 save behavior.
- Final browser runs have zero page/console errors. Syntax, unresolved names,
  context ownership, test inventory and diff checks passed.

Counts from overlapping intermediate runs are not added together. There was no
historical full matrix, city replay, fresh device performance, physical Android,
32-client load or live protected-auth qualification. Existing qualified gameplay
is retained for unchanged world/physics/assets. San Francisco's recorded initial/
retry street-source failure remains separate, not fixed by the default change.

Evidence and failed attempts are retained under
`output/research/location-default-play-2026-10-24/`. Early missing-JDK/config and
fixture failures are not passes. The final browser-only rerun reused already
passing unchanged rules rather than executing their tests again. The owned
browser helper closed only the test browsers; ordinary Chrome was preserved.

## Reusable bounded checks

`npm run verify:community-safety` runs the eight components.
`npm run verify:community-safety:browser` starts isolated demo emulators, executes
rules, then browser flows sequentially. Append `-- --browser-only` after unchanged
rules have passed when only presentation changed. The demo guard prevents cloud
fixtures. Existing unrelated multiplayer journeys explicitly seed accepted terms
in their isolated fixtures and were syntax checked, not rerun for this change.

## Google Play state and remaining external requirements

Data safety's 16 selected types now have saved accurate handling/purposes. Direct
provider sharing, optional location/social/uploads and required limited
measurement/diagnostics are distinguished. No advertising or independent-audit
badge was claimed. Analytics Data Processing Terms acceptance was explicitly
authorized by the owner and verified in the saved account UI. No other analytics
sharing switch changed. App pricing confirms Free; no merchant account created.

Closed Alpha uses the existing one-owner World Explorer list and feedback email.
The prepared unedited gameplay screenshots still need extension file URL access;
the prior saved listing assets have not been replaced on the service. No review
submission, public production access, broad tester invitations, physical-phone
installation or 12 genuine opted-in testers/14-day period is claimed.

Nine existing backend functions require source-only activation: joinRoom,
submitContribution, createRealityCaptureDraft, reserveRealityCapturePhoto,
createRealityCaptureUploadUrl, submitRealityCaptureHybrid,
saveOverlayFeatureDraft, submitOverlayFeature and deleteAccount. Preserve all
other functions, each configured value/IAM, Auth and existing data. Stage the
additive index, consent/block rules and matching web before gating those commands;
verify preservation and protected source checks before production. Android code 3
is unchanged; avoid a duplicate native build for web-only inputs.
