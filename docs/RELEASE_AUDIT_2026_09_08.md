# Production audit — September 8

Status: incomplete, not release approval. Baseline 7061358a plus snow-surface
polish under test. No production deployment or main/stable update performed.

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
East Pratt Street automation timed out before world readiness; city/tunnel
camera acceptance remains open, not assumed from the open-terrain result.

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
2. Staging records/media are not transferred by deployment. Read-only preflight
   for capture_be8fe76770d9db092d58f314f236be0b rejected the current record because
   it is not an approved manual exterior matching its admission requirements.
   This does not prove the published representation is gone. Resolve the actual
   approved immutable representation and ownership before migration; do not
   force-copy this record or reapprove it blindly.
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
