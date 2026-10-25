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

Owner has a phone-insert viewer, no tracked headset and no Apple test device.
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
  mounts/UI/actions/guidance and tracked WebXR conversion/session integration.

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
