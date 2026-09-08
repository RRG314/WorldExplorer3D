# Improve this place — manual-first product plan

September 7, 2026 · staging development · not a production readiness claim

## Working baseline

The owner confirmed the four saved photo walls appear on their actual mapped house in staging. Local checkpoint `ba14127f`, also named `steven/manual-capture-working-checkpoint`, preserves that work plus explicitly unfinished hardening. The deployed hosting artifact is `5.2.0+010649748fcf.cc61169899fcd325.staging`; its isolated source snapshot remains `/tmp/we3d-capture-phone-fix.DE4zLe`. These are different baselines: the checkpoint includes undeployed worker changes. Do not deploy it wholesale.

Keep the existing approved revision and source photo generations intact. No new GPU jobs, production deployment, or GitHub publication are authorized by this plan.

## Scope and research decisions

Audience: contributors on phones and computers, and the site moderator. The goal is playable building-specific photo improvements, not another building database or a replacement reconstruction service. Reuse canonical building identity, capture records, protected media, versioned submissions, moderation, private-space authorization, existing room membership, tutorial, and community authorities.

Research scope: planar photo placement, mapped geometry alignment, a bounded single-room interior, private preview versus shared/public delivery, and idempotent community rewards. Primary sources: OpenCV, Three.js, Firebase, and the actual repository. The planning tool is unavailable in this session; this file is the durable plan.

1. **In progress — baseline and manual exterior reliability.** Preserve working source; audit the public upload/queue path; make manual upload the default with one useful photo rather than reconstruction coverage requirements. Keep reconstruction code, but require trusted development authorization for paid queue admission/retry. Correct misleading save/review results. Diagnose the top strip and pale overhead geometry independently; preserve roads, mapped footprints, heights, roofs and collision unless evidence establishes a defect.
2. **Pending — durable editing and owner world preview.** Same capture, immutable photos and revision checks. Recover unsaved placement drafts by account/capture/revision, show save state, never silently overwrite a newer server revision. An explicit owner-preview mode loads only that owner's saved revision through protected delivery, survives reload, and is clearly distinct from the approved world. It must not leak to other players or replace the approved revision globally.
3. **Pending — one manual interior room.** Extend the same editor/schema/derivative pipeline with a room-local floor plan, width/depth/height, four walls initially, floor/ceiling, and a real doorway/exit. Use inward-facing surfaces, bounded camera/collision and established interior entry/exit. Dimensions are user observations, not mapped facts. Optional advanced dimensions and alignment; cropped regions reuse the exterior tool. Interior photos remain private by default. A photo of a doorway does not itself create a navigable opening; openings require geometry and collision agreement. Do not pretend photographed furniture is interactive 3D geometry.
4. **Pending — deliberate shared preview.** Reuse existing multiplayer rooms and memberships. Pin an immutable contribution revision to a room, authorize access server-side, label it unreviewed, and revoke delivery when access is removed. Public residential exteriors do not imply public interiors. Do not introduce a second room service or use a client flag as authorization. Public previews need reporting/removal and an explicit sharing choice.
5. **Pending — discovery and community.** Double-click/tap selection must preserve drag-camera, weapons and existing building selection. Contextual optional tutorial: select building → add photos → crop → save/play privately → submit → review outcome. Use existing account/community pages for attribution, revisions and status. Award contribution credit once per approved canonical target/revision, never per retry/upload; reversals and moderation removals must be reflected. Feature approved places using the existing featured-room/place authority rather than a competing list.
6. **Pending — focused acceptance and staging handoff.** Exercise new manual upload → edit → save → reload on another signed-in device → private play → submit → admin review → approved world → hard refresh. Reject wrong-owner access, stale edits/reviews, duplicate side effects and public interior access. Verify phone and desktop layouts, touch picking/cropping, clean exit and disposal, and no GPU queue admission from the public flow. Visually inspect mapped non-rectangular buildings, the reported house, incomplete photo coverage, and the single room. Record exact build/evidence and commit completed work separately from pending changes.

## Evidence and gaps

| Decision | Evidence | Confidence / remaining check |
| --- | --- | --- |
| Retain four-corner crop projection for flat walls | [OpenCV homography tutorial](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html) describes projection between planes | High for planar surfaces; cannot recover hidden sides, remove occluders, or make photo furniture three-dimensional |
| Use the mapped polygon, not a generic replacement cuboid | Existing capture snapshot stores building-local footprint; [Three.js Shape](https://threejs.org/docs/pages/Shape.html) supports arbitrary outlines and holes | Code already preserves the footprint; wall-height/base agreement needs execution evidence |
| Keep large media in protected Storage and metadata in existing capture records | [Firebase Storage conditions](https://firebase.google.com/docs/storage/security/rules-conditions) supports authenticated ownership and Firestore-backed access decisions | Existing signed delivery also needs server authorization; rules alone do not constrain Admin SDK handlers |
| Pick walls directly, preserve exact surface identity | [model-viewer annotations](https://modelviewer.dev/examples/annotations/index.html) demonstrates surface picking; existing Three.js editor already raycasts walls | Reuse existing editor, not a new viewer dependency |

Research follow-up is limited to unresolved geometry, permission and integration decisions. A photograph is surface evidence, not proof of ownership or a complete room scan. Stop broad research once those consequential decisions have primary support and repository integration evidence; test actual behavior rather than accumulating references.

## Cost boundary and roadmap

## Required privacy contract (owner clarification)

Every interior starts PRIVATE. Saving or playing privately does not request publication. An explicit interior-public sharing choice submits an immutable interior revision for moderation; it remains private while pending or rejected. Only approval of that exact revision permits public delivery. Exterior submission/approval never changes interior access. Subsequent private edits do not silently replace the approved public interior. Revoking public sharing must remove public discovery and asset authorization; short-lived already-issued URLs have a documented expiry. Invite-only play is separate from public publication and must use existing server-validated space grants.

The access-policy update endpoint must not allow setting PUBLIC to bypass a reviewed-interior revision. Public eligibility and access preference must both be satisfied at delivery. Do not make the metadata flag alone authoritative for file access.

Manual projection avoids GPU reconstruction, but storage, image processing, delivery and moderation still cost money. Keep bounded image sizes, uploads and submissions. Preserve reconstruction adapters/workers and object generation for developer experiments; do not offer paid processing in the public contribution UI. Re-enable later only with explicit budgets, quality evidence and a clear opt-in product decision.

Future (not implemented here): multi-room floor plans, non-planar reconstruction, textured furniture objects and wider environmental capture. Do not document the pending steps above as working features.
