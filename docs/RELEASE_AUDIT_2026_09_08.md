# Production audit — September 8

## Owner-authorized publication

Production Hosting deployment completed and its public manifest was checked:
`5.2.0+1207f341322a.ea1852a7d5fd7648.production`. This is publication authorization,
not a claim that every worldwide/device quality gate below has passed.
Production App Check and Storage have been provisioned; the twenty capture
handlers and Firestore/Storage rules are deployed. The approved house's media
and three publication records were copied with checksums and owner/generation
remapping. Original staging records remain intact. Forty-five focused capture
security/hybrid/camera tests pass. A live production photo test is being completed
after correcting the missing Storage-to-Firestore rules role.

The entries below record findings during preparation; App Check provisioning
and the selected house migration are no longer pending. Physical Android,
complex tunnel passage, cold-start latency and global visual completeness remain
known limits. GitHub source publication uses the repository's protected-branch PR
workflow; production is deployed directly through Firebase, not GitHub.

Status: incomplete, not release approval. Camera/snow candidate
5.2.0+0761b370b3e7.abd395f67b79e0b9.production is served locally on port 4198.
No production deployment or main/stable update performed.

## Confirmed source and deployment identity

Read production build-manifest.json from worldexplorer3d.io: clean 22b2f4ef,
build 5.2.0+22b2f4ef4b07.e7aefb0b4d4eb59e.production. Fetched origin; stable is
an ancestor of this working branch. There are 48 commits beyond stable at
7061358a. The current work is retained, not a separate staging-only codebase.
Pushing stable also publishes GitHub Pages; it does not deploy Firebase.

## Blocking findings

### Camera/capture follow-up

Driving view cycling reproduced a collapsed roof pose on return to chase.
The collision controller now prefers its safe rear destination over the roof
fallback. First person uses the normalized E34 driver seat, keeps the model
visible, and temporarily uses a 4 cm near plane restored on leaving the cabin.
The exterior atlas shell is outward-facing rather than double-sided so its
opaque window backfaces do not block the separate modeled interior. Open-terrain
C-key cycling and cabin screenshots were inspected; seven focused checks pass.
The first East Pratt run exceeded its 70 s startup limit; diagnostics showed
geometry complete and gameplay startup in progress, with the optional exact
Overpass provider unavailable. The corrected bounded 120 s readiness check
passed on the immutable candidate at 39.2898,-76.6102. Actual C-key cycling
produced chase -> cabin -> overhead -> chase, all with the BMW visible,
near clip .5 -> .04 -> .5 -> .5, and restored rear distance 10 units.
Screenshots in driving-camera-baltimore-candidate-bounded were visually inspected:
whole-car rear view and a driver-seat dashboard/windshield view. No page errors.
This verifies stationary city camera switching, not tunnel passage, sustained
driving, or acceptable cold-start latency. Those remain open.

Real staging upload -> validation -> preview save -> stale revision rejection ->
reload -> manual submission passed on a disposable fixture, then removed along
with its temporary account/attestation. No reconstruction ran or public fixture
was approved. The actual approved house is capture_d7a83f7f2adf291ac8d76e04a7cb3636,
not the old reconstruction ID below. Its 48 originals and approved derivative
are present, with no permanent download tokens on originals. Approved revision1
is returned by the public App-Checked canonical-building lookup before and after
reload. This is retrieval evidence, not a new in-world screenshot or moderation
write. Production owner account exists with a different UID; migration and
App Check still need completion. Preflight now uses immutable approved
representations rather than requiring the mutable capture to remain approved.

1. Production config lacks appCheckSiteKey. firebase-init only initializes
   App Check with this key; capture endpoints require verified App Check.
   A hosting-only release cannot certify the photo workflow. Provision/check
   the production provider and permitted domains, then test real authentication.
   Read-only Firebase App Check Enterprise config also returned no site key for
   the production web app; this is not only a missing local field.
2. Staging records/media are not transferred by deployment. The approved manual
   revision and its 48 originals have now been resolved and verified above.
   Copying verified generations/checksums and remapping the different production
   owner UID remains outstanding; do not copy the old reconstruction record or
   bypass review/private-media permissions.
3. Exact bridge/tunnel visual acceptance, sustained travel and physical Android
   completion remain open. Earlier fixture successes are not new release evidence.
4. Snow was visibly featureless after its classification fix. Natural snow
   material now has inspected gameplay evidence in antarctica-snow-natural;
   elevation is still limited. The screenshot also has a mismatched location
   label; cause is not yet established.

## Checks executed this pass

- Guided-camera Chrome synthetic-device check passed: actual media/canvas,
  capture/retake, permission denial, track cleanup, phone layout and input isolation.
- Hybrid editor browser checks passed at desktop and phone widths, including
  saved-preview reopen. Uses explicit transport/storage doubles, not Firebase
  production or a physical Android camera. Phone screenshot inspected.
- Seven biome/material tests passed after snow shader changes. These do not
  establish shader appearance or production cloud access.
- Bounded bridge-tunnel-player-current run failed during its initial readiness
  wait and exited with no executed checks. This explicit fallback fixture did
  not establish either passage safety or exact-provider visual quality. No
  automatic repeated runs were started.

## Remaining ordered release work

1. Finish snow visual check, location-label investigation and clean checkpoint.
2. Complete exact-provider transport visual routes and shared-runtime smoke.
3. Provision production App Check and reconcile deployed handlers/rules with
   the frozen artifact; preserve private originals and avoid paid reconstruction.
4. Resolve approved-house revision and stage a checksum/UID-safe promotion plan.
5. Run authenticated upload -> edit -> save -> submit -> moderation -> hard-refresh
   publication, plus denial/retry/stale revision checks on isolated test data.
6. Give owner the identical release-source HTTPS build for physical Android
   capture/library/crop/save/reopen testing, not a localhost link.
7. Update public documentation/media and integrate main/stable without force
   pushes or overwriting divergent work only after release gates pass.

No claim is made that the whole application is ready for production.
