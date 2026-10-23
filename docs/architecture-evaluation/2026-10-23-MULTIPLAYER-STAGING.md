# Multiplayer staging activation — October 23, 2026

The owner said to continue after the verified local multiplayer checkpoint.
This run activated and checked dedicated staging. The standing no-production-
deploy/no-push boundary was preserved. No game source changed or broad matrix
was restarted. Baseline was clean `459272d8` in the canonical worktree.

Evidence: `output/research/multiplayer-staging-2026-10-23/`.
Previous local implementation/evidence:
`2026-10-22-MULTIPLAYER-READINESS.md`. Its 51 focused and ten backend cases,
actual local two-player gameplay and full weekly guest walking/leave remain
retained, not repeated or added to this run's counts.

## Activated scope and package identity

- Staging project only: `we3d-staging-20260712`.
- Existing `joinRoom` source updated with Cloud Functions' `sourceUploadUrl`
  field mask. Runtime, environment/secret configuration and IAM were preserved.
  Original deployed source and full before/after configuration snapshots stay
  outside the repository in owner-only private verification storage.
- Firestore changed by exactly the one reviewed reserved-weekly-code creation
  predicate. Original live source matched the local baseline byte for byte;
  all other rule source was preserved. Compilation passed with existing warnings.
- Hosting activated the compiled staging counterpart of the verified production
  candidate. 762 delivered files are identical; only the three generated Firebase
  project configuration files differ. The actual hosted build/asset manifests
  exactly match the local staging artifact.
- The hosted check discovered Anonymous sign-in disabled on **both** projects.
  Emulator testing could not establish this cloud prerequisite. Staging alone
  now has `signIn.anonymous.enabled=true`; a fresh full configuration GET proves
  every other Auth field unchanged. Production remains disabled and must receive
  this one scoped switch during coordinated production activation, before guest
  availability is advertised.

Production candidate remains
`5.6.1+c337d144261e.4f05c779ef91aac2.production`, under
`output/hosting-validation/multiplayer-20261022-production-ready`.
Staging build:
`5.6.1+459272d8b13b.78676db82e5509eb.staging`, under
`output/hosting-validation/multiplayer-20261023-staging`.
Both bind acceptance fingerprint
`f6ecbc62d99e8fd1b1c857db04cda8de2d187032f2608d8c045f247c054f1d23`.
Documentation after those source commits does not change acceptance inputs.

Current pointer: `output/release-review/multiplayer-candidate.json`, with its
prior contents preserved in this evidence directory. The older hash-bound local
readiness is immutable and referenced by the new staging readiness decision.

## What was actually exercised

`hosted-personal-passed-guest-disabled.json` retains four completed hosted checks:

1. Ordinary disposable email sign-in and free private-room creation through the
   actual UI, followed by a committed, playable Earth publication.
2. Independent mobile-browser sign-in and private code join, with the same room,
   origin and deterministic seed. Both worlds loaded sequentially; the waiting
   owner's rendering was paused using normal controls.
3. Actual room chat received by the other client, and keyboard walking committed
   through live Firestore rules. Observed displacement: 2.52 world units.
4. Actual owner changes visibility to public; a signed-out browser discovers the
   room through the normal Browse UI.

This run has no JavaScript page errors. Its overall receipt remains **failed**
because the subsequent weekly guest attempt hit disabled Anonymous auth. The
four completed checks are retained without relabelling that whole run passed.
No operator-seeded room, member lease or gameplay pose; no provider interception,
App Check debug attestation, admin player claim or runtime-state mutation.

After the scoped Auth switch, the actual signed-out Weekly City button created
an anonymous session, joined the server-owned weekly room and finished loading
the canonical Nürburgring world. `weekly-ui-published-float-assertion.json` retains
that publication plus screenshot and ready status. It then failed an incorrect
strict-equality assertion: longitude normalized from 6.9475 to
6.947499999999991. `published-coordinate-check.json` verifies this observed value
against the actual `sameRoomEarthLocation` policy; the delta is far inside the
existing tolerance. This is a verification defect, not a changed destination.
That overall run remains failed. Guest walking/normal UI leave in that run were
not reached; the earlier complete local guest journey and the current hosted
member's movement remain explicitly retained.

Only the remaining guest protocol checks were run again, without another city
replay. `weekly-sdk-receipt.json` **passed**:

- Two independent signed-out hosted packaged clients establish guest sessions
  and reach the same server-owned weekly room at its canonical origin.
- Guest renews its own admission metadata without replacing frame, pose or role;
  live rules reject deleting the system room.
- Both guests leave through the existing client owner; their membership records
  disappear and the weekly room stays available.

This latter test is real browser SDK → live Auth/Function/Firestore protocol
integration, with no world activation. It is not labelled full gameplay or a
second successful run of the entire weekly UI sequence. The weekly room remains
at a 32-player admission ceiling; no 32-client render/latency/cost claim.

Screenshots of hosted mobile chat/walking, public discovery and the completed
weekly city were opened and inspected. All owned browsers were closed through
`closeOwnedBrowser`; ordinary Chrome and the unrelated long-lived emulator were
preserved. Five disposable accounts, their own profile trees/personal room and
weekly memberships were cleaned up. Final weekly membership-document count: zero.
The system weekly room remains available. No Resend/email test was repeated.

## App Check observation and failed diagnostic checks

Some ordinary automated browser contexts received App Check exchange 403 and
protected lookup/environment/exterior endpoints returned 401. Related resource
errors, Firebase Listen-channel/recaptcha responses and the original disabled
anonymous signup response are retained. No all-console/resource-success claim.
The browser was not given debug attestation and no security policy was weakened.
Read-only inspection confirmed the staging client key matches its configured
App Check provider and the canonical staging domain is explicitly allowed.
The rejection's underlying scoring/attestation cause was not established here;
this run does not establish ordinary CAPTCHA acceptance for every player/device.
Room admission uses its existing Auth authority and its completed checks remain
separate from this App Check limitation. Review this observation for production;
do not silently convert the check into a debug-provider acceptance claim.

Two additional diagnostic failures were retained:

- Auth PATCH returns an abbreviated configuration without some default template
  fields. Comparing that reply directly with a full GET caused a false assertion
  about other changes. A fresh full GET proved the sole provider switch; rollback
  or a broad Auth reconfiguration was unnecessary. Later configuration assertions
  report booleans and keep snapshots private.
- A final read-only Auth GET hit the OAuth client's shared GetConfig quota. The
  audit was corrected to use Firebase CLI's explicit `x-goog-user-project` request
  pattern and only that lightweight audit was repeated. Gameplay was not replayed.

## Final preservation and release boundary

`final-audit.json` passed. All 80 production Function resources, production Auth,
Firestore rule release and Hosting version are unchanged. Production remains
released 5.6.1 / `233a5a7f813fef97da3d75a76eb87996321fda2f`.
All other 83 staging Function resources are unchanged; `joinRoom` configuration
and IAM match their snapshots. Staging Auth differs only in the reviewed guest
switch, and live rules match the reviewed one-predicate source. Source and
artifact acceptance inputs remained frozen through the checks.

The older browser candidate was preserved as a fully reverified basis-plus-
overlay recovery package to free the fourth saved-candidate slot for staging.
Current `dist`, browser production-ready basis, tester production candidate,
multiplayer production/staging candidates, assets, history, rollback packages,
other users and ordinary browser processes remain intact.

Staging activation and its bounded multiplayer acceptance decision are complete,
with the precise executed/retained/partial evidence above. Production remains a
protected release action: preserve these verified assets; activate the reviewed
joinRoom/rule/frontend delta together, enable Anonymous sign-in with the one-field
Auth update, and include the previously documented four additive tester Functions,
indexes/TTL/mail configuration requirements. Preserve every other existing
Function/configuration and all player data. Review the App Check observation;
retain the finite selected-area, single-origin room model and 32-player limitation.
No push, release-branch operation, production activation or Godot work occurred.
