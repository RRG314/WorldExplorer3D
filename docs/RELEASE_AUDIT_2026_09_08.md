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

1. Production config lacks appCheckSiteKey. firebase-init only initializes
   App Check with this key; capture endpoints require verified App Check.
   A hosting-only release cannot certify the photo workflow. Provision/check
   the production provider and permitted domains, then test real authentication.
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
