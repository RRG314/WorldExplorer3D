# Selected-location defaults and Play community readiness

October 24, 2026. Released follow-up to the b48 web game; dated identities below distinguish the final account cleanup.

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

- Nine focused runtime components cover defaults, denied storage, preference
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

`npm run verify:community-safety` runs the nine components.
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
the prior saved listing assets have not been replaced on the service. Public production access, broad tester invitations, physical-phone
installation or 12 genuine opted-in testers/14-day period is claimed.

Nine existing backend functions require source-only activation: joinRoom,
submitContribution, createRealityCaptureDraft, reserveRealityCapturePhoto,
createRealityCaptureUploadUrl, submitRealityCaptureHybrid,
saveOverlayFeatureDraft, submitOverlayFeature and deleteAccount. Preserve all
other functions, each configured value/IAM, Auth and existing data. Stage the
additive index, consent/block rules and matching web before gating those commands;
verify preservation and protected source checks before production. Android code 3
is unchanged; avoid a duplicate native build for web-only inputs.


## Released server and web acceptance

Protected PR127: head `59d6712db57791defd268fcb8cac0e2cc098a3a7`, merge
`2e32273f2d5e46cbf39f26559e0e1ecb7da42a3d`; identical trees, required checks,
security scans and all four stable workflows passed. The first CI failed only
because the new consumer of the existing pinned Firestore SDK was absent from
its reviewed inventory; that one consumer was added. No SDK version changed.

Production: `5.6.1+59d6712db577.c1507cbdad82b91e.production`, Hosting
`3b6cffd49531a588`; staging: `5.6.1+59d6712db577.8d8d82cdc6d2dde4.staging`,
Hosting `34c246395d413c68`. The pair differs only in three Firebase config files.
All 43 changed production files matched exact served bytes; 738 preceding files
are unchanged. Actual compiled globe/Settings/room/sign-in/account gates passed.
A stale hidden-tab test locator was corrected to the visible navigation rail;
the failed receipt is retained. Local CAPTCHA/Firestore errors remain separate
from that compiled UI acceptance; no new browser protected-auth pass is claimed.

All nine scoped Functions are ACTIVE in both projects; each configuration/IAM,
the other 75 functions, Auth and project IAM matched before snapshots. Hosting
configuration was preserved. The additive block index was READY before deletion
activation. Staging/production Function archives contain 51 identical source
files (ZIP headers differ). No replay of the unchanged backend suite in production.

Actual staging HTTPS with two disposable guests passed missing-consent denial,
client-rule consent writes, weekly admission, private block writes and cross-user
read denial. Both accounts removed through the normal updated deleteAccount
endpoint; own consent/blocks, incoming block references and membership were
removed, while the existing weekly room and owner remained. Cleanup had no errors;
temporary test tokens were deleted. No shared chat spam or real-player edits.

A final targeted source review then reproduced private social arrays surviving a
direct account change until new snapshots. Four array clears were added to the
existing global subscription cleanup. The actual runtime-owner test fails before
the repair and passes after it, including block-snapshot-first ordering, late
old-account callbacks and new-account rows. One cross-realm harness comparison
failure remains retained. Only that new local case was executed; the unchanged
eight components/rules/live service journeys were not replayed. Backend, rules,
world/physics/native inputs remain unchanged for this frontend-only follow-up.

Google package/certificate registration completed. Closed Alpha reuses code 3,
177 selected regions and only the World Explorer one-owner tester list. Free
pricing, truthful listing wording, Data safety and existing IARC/audience settings
are saved. Existing two accurate UI screenshots are kept for first review; the
eight actual gameplay replacements need the extension's file URL permission.
No unrelated tester list, merchant account or broad invitation was added.

Approving a tester in the existing World Explorer admin portal does not add their
Google account to Play's tester list. Add approved testers' Play email addresses
to the selected World Explorer list before issuing its closed-test opt-in link.
The one-owner internal-test link remains the owner's immediate installation path.
Google review, real Play-installed phone checks and genuine continuous opted-in
closed testing are distinct external requirements, not simulated test passes.


Google now shows **Changes in review** for all 15 submitted changes, including
closed Alpha code 3 and the completed listing/declarations. Package registration
is Registered. This is submission evidence, not Google approval or production
access. The final frontend-only account cleanup's exact source/build, protected
checks, parity and activation are recorded under the operational evidence folder
as `source-account-switch.json`, `protected-account-release.json`,
`account-package-parity.json` and `account-production-web-activated.json`.
The already qualified Functions/rules/native binaries are not redeployed or
retested for that four-line owner cleanup. The final source check confirms those
inputs are byte-identical. Prior production/staging packages remain recoverable.


Final screenshot review of the actual compiled app found the expanded social
panel retained a pale runtime-shell card under interface-v4's inherited light
text. The shared panel and summary now use existing wx theme variables, preserving
light/dark context instead of adding a second palette. Its exact final source is
`source-ui-theme.json`; `protected-community-final-release.json` and
`account-production-web-activated.json` bind its final delivery. The earlier
account cleanup's compiled Settings assertions passed, then its test waited on a
collapsed detail; the continuation corrected a duplicate selector and opened the
actual social summary with prescribed keyboard input. Both failed setup receipts
remain failed. The screenshot exposed the real contrast defect; it was corrected
before final publication. No city, email, backend or native journey was restarted.
