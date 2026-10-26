# VR and Living Portal product delivery

Owner authorization October 25, 2026: finish usable products, not scaffolding.
Starting source f8a9198. Earlier research remains evidence and design input;
the work does not stop at another architecture checkpoint.

## Release outcome

- A responsive Living Portal with Wander, Home, Nature, Together and Beyond
  Earth, persistent independent save/learning/virtual-visit facts, account sync,
  offline last-good content and safe resolved game entry.
- Qualified geographically specific destinations with real content and scoped
  device evidence. A representative city and landscape establish the complete
  journey before more locations are admitted; random global coordinates are
  never silently advertised as qualified rich scenes.
- Working Android and Apple native widgets using the same catalog/Trail, with
  native build evidence, cache/update/error behavior and supported app links.
- Phone-in-viewer stereo with orientation permission, viewer calibration and
  hands-free interaction, plus WebXR for tracked headsets. Guided travel and
  manual car/aircraft/space controls use existing vehicle owners. Flat mobile
  portrait/landscape controls, progress, rooms and location selection survive.
- Targeted service/browser/native checks; actual rendering, device performance
  and comfort evidence remain distinct. Production activation follows qualified
  release artifacts and preservation of player data/recovery anchors.

## Current external constraints

Owner plans a phone-insert viewer but does not have its setup/calibration yet;
there is no tracked headset or Apple test device.
Owner created an Apple account during this work. Live developer account shows
enrollment Pending and membership purchase required (October 25); owner payment
handoff is open. Signing/store access is not yet confirmed. Mac has 8 GiB RAM,
7.2 GiB free, command-line tools
but no full Xcode application. Implement and exercise all independent paths;
use repository automation for native compilation where possible. Hardware
acceptance, Apple enrollment/signing and store decisions cannot be fabricated.
Do not mark the product goal complete while required acceptance remains.

## Execution order

1. Persistent account-scoped Trail through the existing Journal persistence
   owner, protected server commands, catalog and complete responsive UI.
2. Resolve Portal intents through current location/session/travel owners and
   record virtual visits only after actual admitted presentation.
3. Shared VR presentation lifetime and physical scale, phone stereo/calibration,
   WebXR, selectable in-headset controls and guided/manual vehicle actions.
4. Native widget clients, authenticated synchronization and remote build/lint.
5. Complete destination and platform acceptance, correct failures, update public
   instructions/disclosures and prepare coordinated releases.

Continue after local commits. Keep source stable during measurements, retain
failures, reuse unaffected checks and run one heavyweight process at a time.

## Delivery ledger

- Research and shared destination policy: completed in earlier commits.
- Product implementation: active. This file is the execution ledger, not an
  assertion that unimplemented clients or unavailable devices pass acceptance.
- Durable Trail: implemented through the existing Journal profiles store and
  memory adapter. Account-scoped pending actions, safe synchronization merge,
  pagination, legacy backup retention and rollback have 13 focused cases; five
  affected existing receipt cases also pass. Actual IndexedDB/browser UI and
  protected sync service were the next connected slice, now implemented below.
- Portal learning/Trail: responsive page, two sourced investigations, independent
  saved/learned states, device Home preference, explicit copy into an account,
  existing room/planetary menu handoffs and Journal link preserving the game tab.
  Real IndexedDB Chrome/WebKit flows pass. Chrome offline reload plus another
  save passes through a bounded /portal/ static-only service-worker cache.
  Images/portrait/landscape/modal viewport screenshots were inspected. Keyboard
  focus survives store refresh and investigation completion. Initial browser run
  passed behavior but failed local CAPTCHA/favicons; retained, diagnosed and
  corrected with existing temporary staging attestation and authored favicon.
- Protected Trail services: same generated portable rules/catalog, revoked-token
  auth and mandatory App Check; strict initiating owner, catalog/version checks,
  server times/revisions, atomic operation receipts, bounded pagination and
  action quota. Deleting accounts cannot create more Trail actions. Recursive
  profile cleanup already covers records; legacy fallback now covers them too.
  Six endpoint cases use actual handlers with transactional storage doubles;
  six sync-owner cases cover retries, superseded choices and account replacement.
  Seven affected routing/fingerprint cases also pass; repeat runs overlap.
- Source packaging includes /portal/, a bundled Portal entry and the two API
  routes. Final artifact, live services, signed-in browser/account acceptance,
  qualified 3D destination arrival, native widgets and VR remain unfinished.
  No qualification fixtures have been promoted to a released quality assessment.

Evidence: output/research/vr-portal-product-2026-10-25/ service-sync-first.tap,
affected-contracts-final.tap, portal-chromium/ (failed),
portal-chromium-attested/, portal-webkit-attested/, portal-focus-final/.
Temporary staging debug identities and owned browsers/servers were cleaned up.
The browser service checks do not establish native, hardware or live backend
acceptance. Continue implementation after the local commit.

- VR frame ownership: existing kernel now exposes one exclusive external frame
  lease, with late callback rejection, error cancellation, timing reset and an
  opt-out of immediate flat resume until XR framebuffer teardown completes.
  The ordinary renderLoop and stopRuntimeKernel use this owner. Manual stepping
  rejects concurrent external presentation. Ten focused lease cases and 24
  affected existing simulation/render lifecycle cases pass.
- Phone optics and head sensing: measured screen/lens geometry, bounded standard
  Cardboard viewer URL/protobuf parsing, mirrored asymmetric projections and a
  stereo render/warp pass using shipped Three r128. Five optics cases pass;
  one first test incorrectly expected the physical FOV boundary to be outside,
  corrected to test a corner beyond it; failed receipt is retained. Rotation-only
  sensing has four focused cases for permission, calibration, rotation, stale
  data, visibility and disposed/obsolete grants. No additional RAF or actor writes.
- Real WebGL component receipt: two eyes rendered at DPR 2, 1920×1080 bounded
  target, illustrative 64 mm spacing converted to .0576577 world units, no
  console/page/GL errors, restored viewport/scissor/autoClear and interrupted-draw
  cleanup. Geometry, texture and lifecycle resources return to baseline.
  Inspected stereo image. Controlled scene is not gameplay, lens calibration,
  frame pacing or physical comfort acceptance. Adapters still need actual game
  mounts/UI/actions/guidance and tracked WebXR conversion/session integration at
  that commit; the connected phone slice is recorded below.

- Connected phone VR: measured calibration/permission UI, main-world walking,
  cabin and aircraft mounts, gaze Start/Pause/Recenter/Exit and trigger selection.
  Main input/camera/render phases delegate while VR owns the view. Stale tracking
  blocks the same simulation frame and requires explicit restart; mode, actor,
  world, viewport and late-permission handoffs dispose their own resources.
  Tilt steering is suspended while head tracking owns orientation. Existing
  flat pause, vehicle physics, admission and portrait return are preserved.
  Four session cases and 23 affected core cases pass. The first run caught a flat
  pause regression, fixed; failed evidence is retained. Five tracked-view math
  cases pass for metre conversion, repeated reads and canted-eye culling.
- Actual selected-city browser journey: Baltimore WebGL/physics plus synthetic
  orientation/illustrative optics passes entry, stationary stereo, gaze Start,
  prescribed driving, gaze Exit, exact lifecycle cleanup and portrait return.
  No page/console/resource errors. Inspected screenshots exposed flat UI covering
  stereo despite a behavior pass: initialize the existing lazy screen-layout
  service before VR, then require hidden controls in the corrected browser run.
  Failed tutorial-click and form-precision fixtures were diagnosed, corrected
  and retained. Final receipt: phone-game-layer-final/. This is desktop Chrome
  touch emulation, not physical optics, comfort or phone/headset performance.
  Tracked sessions/input, guidance, other renderer domains and native clients
  remain active product work. Continue after committing this connected slice.

- Tracked VR: actual WebXR permission and local reference-space entry, explicit
  renderer ArrayCamera/framebuffer adapter, calibrated physical head movement,
  native compositor frames through the existing kernel lease and no flat RAF
  alongside it. Async context-compatibility work drains on cancellation before
  flat resume; reference setup cannot adopt after native end. Standard paired
  XR controller actions merge through the ordinary reader with neutral rearming.
  Gaze, tracked-pointer and transient pinch-style selection share in-world UI.
  No hand-joint feature permission is requested just for base select events.
  Main world load waits for presentation release; superseded requests do not
  perform duplicate resets. Existing quality choice controls layer scale.
- Tracked verification: seven lifecycle, four input, two gaze and three async
  world-preparation cases; 11 affected existing load and four standard-input/
  pause cases pass. Earlier five view-math cases remain applicable. Real WebGL
  canted views at DPR2 pass physical spacing, gaze Start, pointer Exit, exact
  resource return and no GL/page/console errors. Initial input rounding failure
  fixed by clamping. Browser gaze diagnostics traced an ulp-length quaternion
  ray miss at a shared triangle diagonal; normalized world rays fix it, with a
  focused regression. Failed evidence is preserved, including an initially
  incorrect preview canvas that showed the flat buffer instead of XR pixels.
- Connected city verification now covers phone followed by tracked VR in one
  Baltimore load. Actual UI entry, gaze Start, native-source controller throttle
  through the real car owner, transient-pointer Exit, no extra frame owner and
  portrait return pass. Inspected both city eye views and return images; no
  page/console/resource errors. The compositor/session boundary is a controlled
  fixture and does not qualify a physical runtime or performance/comfort.
  Evidence: tracked-webgl-final/, vr-connected-game-first/, tracked-first.tap,
  tracked-input-final.tap, tracked-world-release.tap, tracked-gaze-final.tap,
  tracked-session-input-final.tap. Native widgets, guided routes, safe qualified
  Portal entry, space/ocean presentation and physical acceptance remain active.

Tracked adapter primary sources:
https://raw.githubusercontent.com/mrdoob/three.js/r128/src/renderers/WebGLRenderer.js,
https://raw.githubusercontent.com/mrdoob/three.js/r128/src/renderers/webgl/WebGLState.js,
https://immersive-web.github.io/webxr/#dom-xrsession-updaterenderstate,
https://immersive-web.github.io/webxr-gamepads-module/#xr-standard-gamepad-mapping.

Additional primary source evidence used in implementation:
https://github.com/googlevr/cardboard/blob/master/proto/cardboard_device.proto,
https://github.com/googlevr/cardboard/blob/master/sdk/lens_distortion.cc,
https://github.com/googlevr/cardboard/blob/master/sdk/distortion_mesh.cc,
https://github.com/mrdoob/three.js/blob/r128/examples/jsm/controls/DeviceOrientationControls.js,
https://github.com/mrdoob/three.js/blob/r128/src/renderers/webxr/WebXRManager.js.
The r128 union frustum assumes parallel eyes and mixes pose distance with
projection depth. Tracked views need an explicit audited unit adapter, not just
a scaled parent. Its XR manager exposes the compositor callback directly;
the convenience renderer animation loop must not restart a parallel window RAF.

- Guided road ride: reuses current immutable TrafficGraph directed lane facts,
  source access, driving side and grade; no independent road graph, navigation
  display line, inferred connection or extra geographic data. Up to 80 metres
  on one loaded lane, with buffers before its junction. Checks current source,
  width, three-point physical contact, gentle grade, buildings and coverage.
  A read-only query on the existing detail owner avoids preview notices and
  rejects retired coverage. This short corridor stays inside existing retention.
- Explicit preparation uses the existing surface-activity ground-arrival owner;
  no new pose writer or forced vessel/interior exit. In-view Start begins ordinary
  car actions at a 4 mph target. Service braking stops before the end; small
  manual steering/pedal input cancels guidance. Missing support, blocked path,
  airborne travel, wrong heading or replaced ownership stops the ride. Stopped
  rides can deliberately return to manual play. UI admits the move to the start
  explicitly and shows the road, distance, progress and final/manual state.
- Verification: six ride cases, two completion/manual-resume session cases, two
  ordinary UI-handoff session cases and one affected transport publication case
  pass. Wider focused session/input reruns overlap existing cases. First braking
  boundary assertion failed; the stopping envelope/service-brake control was
  corrected before the actual city run. Local alias-release rebinding is now
  correctly excluded from state-property writes; later alias writes still count.
  No actual context pose writer was granted a new allowlist entry.
- Actual Baltimore integration: the 78 m East Fayette Street ride completes using
  its real compiled lane, ground admission, car physics and service braking.
  Gaze Exit releases route/headset/frame resources and returns flat play. Tracked
  compositor and timestamps are controlled, so this is not physical runtime,
  pacing or comfort acceptance. The phone-specific city run confirms guided
  movement with real RAF, synthetic orientation and illustrative optics, then
  stale-sensor pause, explicit restart, prescribed steering takeover, gaze Exit
  and portrait/resource return. No page/console/resource errors. All new city and
  caption screenshots inspected. Scope notes correct the phone runner's reused
  top-level metadata string while preserving its raw receipt.
- Caption WebGL check includes the new label texture/geometry and returns GPU
  and lifecycle counts exactly to baseline. Closed route, phone and tracked
  owners release borrowed actor/world/native references. Map, Backpack or other
  activity admission exits VR so its ordinary UI can own presentation.

Evidence: road-ride-game-first/, road-ride-phone-first/ (with scope-notes.md),
ride-caption-webgl-final/, road-ride-first.tap (failed),
road-ride-controller-final.tap, road-ride-connected-contracts.tap,
road-ride-coverage.tap, road-ride-ownership-final.tap,
road-ride-manual-resume.tap, vr-ui-owner-handoff.tap,
road-ride-context-reviewed.tap in output/research/vr-portal-product-2026-10-25/.
No new deployment or release. Continue Portal qualified entry/live services,
native widgets, other renderer domains and physical/platform acceptance.

- Portal entry: opaque catalog ID/revision only, no composable raw poses,
  coordinates, seeds, rooms or alternate environments. Trusted qualification
  gates the Portal link and game. Title/location/load/session owners remain in
  charge; existing surface travel admission refuses water, vessel, aircraft and
  interior replacement. An observer on the same kernel waits for a successful
  matching visible world draw before saving a virtual visit. Ownership changes
  revoke it; it unregisters immediately after its one receipt. No new scheduler.
- Independent visits use Journal Trail persistence/outbox and a separate
  confirmPortalVisit endpoint with existing Auth/App Check, initiating owner,
  idempotent transaction, quota, catalog scope and deletion checks. Offline
  occurrence time is retained. The receipt explicitly says client-admitted
  virtual presentation, not physical presence or trusted activity/rewards.
  Widgets cannot submit visits through their action endpoint, and explicit
  copying of guest saves/learning does not copy guest visits.
- Ten new focused cases pass, plus affected persistence, policy, render, ownership
  and routing contracts. Repeated receipts overlap. Actual browser save → admitted
  Baltimore city render → prescribed normal walking → returned durable Trail
  passes with inspected screenshots and no page/console/resource errors.
  A browser-only qualification fixture establishes this wiring; catalog release
  qualifications remain empty. Real destination/device approval is still required.
- Failed browser evidence is retained: first stale diagnostics field, then a
  real exact-coordinate rejection caused by longitude wrapping floating-point
  drift. Shared canonical geographic comparison matches the existing selection
  normalizer, including the antimeridian, without a nearby-place tolerance.
  Installed Playwright's async-predicate polling can return a false result after
  seeing a truthy Promise. The runner now awaits IndexedDB explicitly and asserts
  the stored visit, so the earlier premature progress statement is not evidence.

Evidence: portal-game-first/ (failed), portal-game-final/ (failed),
portal-game-identity-fixed/ (pass), portal-entry-first.tap,
portal-entry-affected.tap, portal-entry-identity-fixed.tap and
portal-entry-service-time-final.tap. No new Hosting/native deployment. Continue
native widget clients/account integration, actual destination qualifications,
remaining VR domains and coordinated release/platform acceptance.

- Native Android widget implementation now uses RemoteViews within the existing
  Java TWA package. It has compact and expanded layouts, independent per-widget
  follow modes/Home choice, offline bundled/last-good catalog, native fact pages,
  saved/investigated Trail, complete native investigations/sources and guarded
  game/room/planetary links. Small tiles open native details; expanded widgets
  support investigation directly. No new renderer, continuous GPS or connection.
  Android JobScheduler owns network refresh; the daily widget request and user
  actions trigger bounded work. Cancelled jobs cannot publish a late catalog.
- Native public/bundled catalog copies are generated from the actual shared
  content and full qualification policy. Offers retain time/device/version scope;
  release qualifications remain empty. Two conformance cases pass. Java/native
  XML/workflow compilation and actual emulator interaction are the next check;
  source existence and syntax checks do not establish native acceptance.
- Native account coordinator, signed-in sync, Apple containing app/WidgetKit,
  preview imagery, broader destination qualification and distribution remain
  unfinished. Android currently labels its native Trail as device-local. A
  debug-only fresh-owned-emulator test host exercises actual widget binding,
  RemoteViews/pending intents, persistence, investigation, native Trail and
  compact layout; it refuses existing data/non-emulator devices. Production
  packages do not contain that test host or instrumentation component.

Implementation references: Android official Views app-widget advanced and
configuration guides, AppWidgetProviderInfo updatePeriodMillis, and Apple
WidgetKit/App Intents interactivity and timelines. Android retains its existing
Java stack instead of introducing Compose just for this platform projection.
No native build or device success is claimed until the targeted CI receipt.

## October 25 — native Android acceptance and browser account approval

Native Android build/lint and the owned AOSP emulator's real widget taps, fact
investigation, Trail and compact/expanded layouts pass at 4f676d1 (CI run
40241590430). Inspected all final screenshots. Earlier fixture/binding failures,
occluded screenshots and clipped layouts are retained separately; they are not
accepted visual receipts. This is offline/emulator widget evidence, not physical
phone, native authentication or live synchronization acceptance.

Registered one Android and one Apple Firebase app in each existing project,
using io.worldexplorer3d.app. No production provider, signing key, Hosting or
Function was changed. Native SDKs are still to be connected.

Added a browser-approved native connection protocol: registered native App Check,
S256 verifier, recent existing Explorer authentication, visible matching code,
explicit approval, single-use claim and native/browser cancellation. A callback
contains a short-lived code, never an identity token. Account changes, late
hash/approval results, expiry, deletion/revocation and signing/cancellation races
fail closed. A dedicated least-privilege service account and TTL policies are
declared but not provisioned/deployed. Existing account deletion removes owned
pairing rows. Browser Portal approval uses its existing UI and authentication.

Seventeen distinct new service/controller cases pass; twelve affected existing
service/routing/ownership cases pass. Chromium and WebKit controlled approval UI
runs pass with portrait/landscape screenshots inspected and no page/console
errors. The runner exercises real Portal UI, WebCrypto and service handlers;
Auth/App Check, signer and storage boundaries are controlled. It does not prove
live Google/native SDK sign-in or native callback adoption. Evidence:
native-connection-terminal-final.tap, native-connection-integration-final.tap,
native-connect-chromium-final/, native-connect-webkit-final/ under the current
product evidence folder. Native SDK ownership/sync, Apple app/widget, preview
images, real destination qualification, other VR domains and releases continue.

## October 25/26 — native identity, durable sync and live staging service

Android now uses named Firebase Auth/App Check SDK instances, initialized only
for Portal account work. Its existing TWA launcher avoids Firebase auto-start.
Browser approval uses an encrypted short-lived verifier in Android Keystore;
SDKs own authentication credentials. Candidate sign-in stays separate from the
active account. Adoption is serialized, drained and rolled back on cancellation;
a durable marker rejects interrupted adoption after process death. Native buttons
and confirmations pin the displayed account; investigation completion pins the
content version actually displayed. Device choice copying is explicit and never
copies visits or expeditions. JobScheduler still owns bounded background work.

The native Trail now separates accepted state from pending choices using the
shared wire envelope. It migrates existing flattened guest records, retains
remote visits, acknowledges exact operations and rejects stale owner replies.
Seven fixtures generated from the actual JS model check cross-language behavior.
CI run 40246325021 at 2ea23de passes strict dependency verification, release
build/lint, debug build and actual owned AOSP widget interactions. Eighteen new
native contract cases include data migration, delayed replies, owner replacement,
explicit copy, mixed callbacks, Keystore persistence, cancelled SDK adoption,
identity mismatch and real SDK initialization/recovery. Existing 4 persistence,
3 widget and 3 layout/handoff checks pass. All five screenshots inspected.
This is emulator/offline acceptance, not native live authentication or a phone.
Later displayed-owner/content-version refinements add one case and require the
focused debug receipt; the full product release build remains separate.

SDKs are pinned to Firebase Android BoM 35.1.0. All 93 new artifact hashes match
Google Maven/Maven Central, with existing checksums retained. Strict builds
exposed Kotlin's redirected common module missing from generated lock state;
it is explicitly locked only for runtime consumers. Failed compile/lock receipts
remain; no permissive dependency-verification setting was adopted.

Staging now has the nine additive Portal connection/Trail Functions. All existing
84 Functions have identical canonical metadata hashes. Pairing uses a dedicated
service account: datastore.user and firebaseauth.viewer at project scope, token
creation only on itself, no service-account key. Two scoped TTL policies are
active. New endpoints contain no copied mail/commerce secrets. Hosting and the
existing deleteAccount Function are unchanged; coordinated release must include
its reviewed immediate pairing-row cleanup (expiry/deletion admission already
blocks new claims).

The first deploy lacked unrelated shared-entrypoint parameters; explicit empty
values for the new APIs resolved that without copying secrets. The next CLI
failure was a shared OAuth consumer's Cloud Billing read quota (429). The
supported GOOGLE_CLOUD_QUOTA_PROJECT setting and this existing staging project's
Cloud Billing metadata API fixed it, preserving the actual billing check. No
billing relationship/payment change. Raw map serialization had also made a
noncanonical inventory hash comparison misleading; unchanged versions/timestamps
and the subsequent canonical before/after comparison establish preservation.
Private raw snapshots/logs stay outside the repository.

Live staging HTTP verification passes real email Auth, registered native/web
App Check debug attestations, recent approval, dedicated signing, single-use
claim, same-UID Auth lookup, protected save/idempotent receipt/browser-role read,
browser cancellation API and account-deletion tombstone rejection. All temporary
identities, approval rows and debug registrations were removed. This uses Auth
REST clients, not native SDK UI or Google OAuth. The first runner expected a
localId field absent from custom-token REST responses; it now verifies identity
through Auth lookup. Both receipts remain. A scope note clarifies that receipt
labels refer to HTTP client roles, not actual browser UI in this live run.

Production's new Android Firebase client now has its actual Play signing SHA-1
and SHA-256 registered, and its dedicated auto-created Android key is restricted
to that package/certificate and the four required Firebase APIs. Existing web
keys are distinct and unchanged. Play Integrity provider defaults are retained;
linking the existing Play project awaits specific approval of Google's separate
API terms. Apple membership still visibly Pending with purchase required.
No production Functions, Hosting or new native release was deployed.

Evidence: android-account-dependency-*/; android-account-strict-first.log and
second.log (failed); android-account-native-first/; staging-pairing-provision*.json;
native-infrastructure-status.json; staging-portal-deployment-scoped.json;
staging-portal-cli-quota-diagnosis.json; portal-native-live-staging.json (failed)
and portal-native-live-staging-identity-fixed.json (pass), in the current product
folder. Continue native SDK live acceptance, Apple app/WidgetKit, preview imagery,
actual destination qualification, remaining VR domains and coordinated releases.


## October 26 — Apple native implementation and first platform check

The containing SwiftUI app and interactive WidgetKit client share a bounded,
atomically replaced App Group document with a stable interprocess file lock.
Offline learning/saving, per-widget modes, independent visits, scoped copying,
exact outbox acknowledgement and owner/content guards use the shared wire model.
Private connection proof lives only in Keychain; Firebase owns refresh tokens.
One serialized account coordinator drains SDK adoption, rolls back cancellation
and uses a durable interrupted-commit marker. Apple SDK source inspection found
that updateCurrentUser retains the candidate User's weak Auth association; the
primary therefore signs in independently before candidate teardown. Native SDK
forced-refresh acceptance is still required, not inferred from this inspection.

Debug and Release select separate bundle IDs, app groups, callback schemes and
Firebase clients. Widget App Intents compile in both containing app and extension.
WidgetKit and BGTaskScheduler own refresh timing. No renderer, background GPS or
socket is created. The project pins Firebase Apple SDK 13.1.1 and XcodeGen 2.46.0;
CI will compile and exercise one fresh, owned simulator, preserving sanitized
logs and explicit screenshot attachments. It does not assert physical iPhone,
App Attest, TestFlight or actual Home Screen widget success before those run.

Local 16-case Foundation verification passes, including shared JS fixtures,
late acknowledgements, interrupted owners, content replacement, pending sync and
40 concurrent store writers. This overlaps earlier Apple model checks; it is not
16 additional cases. XML resources and shell syntax also parse. Evidence:
apple-project-foundation-compile.log and apple-project-foundation-run.log.
Continue actual platform checks, live native SDK adoption, browser identity
handoff, qualified imagery/destinations, remaining VR domains and distribution.
