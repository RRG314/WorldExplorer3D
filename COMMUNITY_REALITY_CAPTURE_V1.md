# Community Reality Capture V1 — Local Test Guide

Status: implemented locally but not provisioned or proven end to end. Do not deploy this feature or describe it as complete until the two-proof gate passes.

## What currently works locally

- A mapped building click offers **Improve this place**.
- Exterior and one-room guided capture panels work on desktop and phone layouts.
- The browser normalizes images, removes EXIF/GPS, reports simple focus/exposure warnings, and resumes local drafts with IndexedDB.
- Authenticated backend contracts create immutable capture IDs, validate protected uploads, queue work, broker private assets, moderate results, and manage generic space access.
- New interiors always start `PRIVATE` and owner-only.
- A local Meshroom/Blender worker, GLB budget gate, moderator review workspace, dynamic exterior registry, safe fallback loader, and protected interior visual loader are present.
- Community exterior suppression coexists with World Editor suppression and never changes the road, terrain, mapped building collider, door, property, or POI authority.

## Provisioning required before upload testing

This work intentionally did not change Firebase or production.

1. Initialize a non-production Cloud Storage bucket for the staging project.
2. Review bucket region, retention/soft-delete policy, CORS for the staging origin, lifecycle rules for rejected/abandoned originals, logging, quotas, and billing alerts.
3. Create a score-based reCAPTCHA Enterprise web key for the exact staging domain, register the web app in Firebase App Check, and add `appCheckSiteKey` to the staging Firebase browser config. Do not put `localhost` on the production key.
4. Enable App Check monitoring first; verify legitimate traffic; then enforce it for Storage and the capture HTTP endpoints. Use an App Check debug token only for explicit local/emulator testing.
5. Install a Java runtime and run the rules emulator test before any remote rules deployment.
6. Review and later deploy `storage.rules`, `firestore.rules`, `firestore.indexes.json`, the new HTTPS functions, and hosting rewrites through the project's normal staging process. This repository state has not deployed them.

## Local verification already available

```bash
npm run verify:reality-capture:local
npm run verify:reality-capture:ui
npm run verify:source
git diff --check
```

The rules suite additionally requires Java:

```bash
npm run verify:reality-capture
```

Current local result: 11 focused authority/GLB/presentation tests pass; desktop and 390×844 capture UI pass; undersized input fails visibly; source graph passes. The generic web-game client was also run and produced state output, but its SwiftShader canvas was black, so it was not accepted as visual evidence. Installed-Chrome evidence is in `output/verification/reality-capture-ui/`.

## Exterior proof procedure

Prerequisites: staging Storage/App Check/functions/rules are active; Meshroom and Blender are installed on the worker; the tester owns or has legal access to the capture viewpoints; no people, plates, screens, documents, security details, or private areas are included.

1. Start the app on HTTPS, sign in, enter Earth, and click one real mapped building.
2. Choose **Improve this place → Exterior**.
3. Walk the safe perimeter and collect 20–48 photos, at least two in every side section, keeping strong overlap.
4. Leave **public visual improvement** off for a private processing test; turn it on only when the contributor deliberately offers this exterior for public review.
5. Upload and confirm `draft → uploading → uploaded → queued` with no client-readable original URL.
6. Run the processor:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/staging-worker.json \
MESHROOM_BATCH_BIN=/pinned/meshroom_batch \
BLENDER_BIN=/pinned/blender \
node scripts/reality-capture/process-capture.cjs CAPTURE_ID
```

7. Sign in as a moderator, open Account Admin → Moderation → Reality Captures, inspect protected photo samples, model, mapped footprint, cleanup, budget, and alignment. Set translation/rotation/scale, record a note, then approve or reject.
8. Reload the same Earth location. On approval and explicit public contribution, the reviewed model should load first and only then hide the procedural presentation. Verify the same source building ID, footprint collision, door entry, terrain alignment, property/POI associations, and World Editor behavior.
9. Break or expire the model URL and reload. The procedural building must remain visible.

Record all measurements listed in `COMMUNITY_REALITY_CAPTURE_RND.md`. This test has not yet been performed.

## One-room proof procedure

1. Use a simple room you have explicit permission to photograph. Remove people, mail, documents, screens, family photos, security systems, and other sensitive items from view.
2. Select the mapped building, choose **One room**, enter a room label/type, measure width/length/height and door direction, and confirm permission.
3. Capture 18–48 overlapping images with at least two for the door, four wall/corner regions, and opposite-door view.
4. Upload. Confirm the created space is `PRIVATE`, owner-only, regardless of exterior contribution settings.
5. Process and review as above. Approve only if the GLB is clean, within budget, correctly aligned, and contains no sensitive content.
6. As owner, enter through the mapped door. The captured visual should appear inside the current proxy shell; walking surface, containment, collision, and exit must still come from the existing interior system.
7. As a different user, verify no photo/model URL is returned and the door reports **Private Residence**.
8. Test each deliberate policy: persistent guest, room-bound session guest, one-time grant consumed once, revocation, and `PUBLIC`. Verify public exterior visibility never changes interior entry.
   For an invite-capable mode, put owner and visitor in the same active room and
   interact with the mapped door as the visitor. The backend must derive fresh
   presence for both players, submit one idempotent request, and reject any
   client attempt to invent owner availability or a different session room.
9. Delete a second unapproved room draft and verify originals, processed objects, membership/grant documents, and access requests are removed. Approved removal must require admin workflow.

This proof has not yet been performed.

## Bad-capture tests

- too few/many photos;
- missing coverage section;
- tiny, oversized, unsupported, mislabeled, or bad-magic file;
- duplicate immutable name/overwrite attempt;
- wrong owner/capture metadata;
- unauthenticated or missing App Check request;
- reconstruction with insufficient matches;
- GLB over 20 MB or 500,000 triangles;
- GLB with external buffers/images, invalid header, or no scene;
- approval without a processed model;
- signed URL after expiry;
- world switch while an exterior model is loading.

Every case must stop safely, avoid publication, retain or restore the procedural fallback, and give the owner a deletable/retryable status.

## State and collections

- `realityCaptures/{captureId}` — owner, target, consent, limits, state, processing result, review.
- `privateSpaces/{spaceId}` — generic space owner and mode.
- `privateSpaces/{spaceId}/members` — owner/co-owner/household/guest membership.
- `sessionGrants` and `oneTimeGrants` — bounded temporary access.
- `privateSpaceAccessRequests/{requestId}` — owner decision workflow.
- `buildingRepresentations/{representationId}` — approved public exterior registry only.
- `reality-captures/{uid}/{captureId}/originals` — write-once private quarantine.
- `.../processed/{pipelineVersion}/capture.glb` — private reviewed output.

## Known issues

- Storage and App Check are unprovisioned.
- Rules emulator is blocked by missing Java.
- Reconstruction tools and real photo sets are absent.
- Processor scheduling is manual; no Cloud Run Job is deployed.
- Capture quality thresholds and GLB budgets are provisional until two real scans run on desktop and phone.
- HEIC/HEIF depends on browser decoding; the UI asks for JPEG if decoding fails.
- No malware-scanning service is connected yet. The quarantine, strict raster re-encode, magic checks, non-executable GLB gate, and manual review reduce exposure, but a production upload launch should add a scanning/quarantine service and operational response procedure.
- No automated structural mesh, scan collision, multi-room capture, semantic object detection, rewards, or automatic approval exists.

V1 is complete only after one exterior and one permitted one-room dataset pass all steps and their evidence is recorded. Stop there before Phase 2.
