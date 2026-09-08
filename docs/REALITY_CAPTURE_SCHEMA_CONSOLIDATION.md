# Reality Capture consolidation contract

Status: researched migration plan, September 7, 2026. **Not migrated or ready for wider-user access.**

## Plan state

- Discovery: complete for current local source, staging root records/media and production capture-related inventory.
- Follow-up: complete; confirmed bearer-token bypass, scene-origin identity drift, mutable history and inconsistent access decisions.
- Synthesis/migration contract: complete as a proposed design, not implemented. Planning tool discovery returned no available `update_plan`; this file records the plan instead.
- Audit verification: complete; current-token containment verified live, 35 local security/decoder/provider/HTTP tests passed. Full schema migration is the next work item and remains unimplemented; cross-device publication acceptance remains pending.

## Do not rename data just to match conceptual names

`realityCaptures/{captureId}` remains the capture-session root. Existing capture IDs and `reality-captures/{uid}/{captureId}/originals/{photoId}` remain valid. Keep `privateSpaces/{spaceId}` as the private-space policy authority, with existing membership/grant subcollections. Do not create a second independently writable `captureSessions` or `accessPolicies` collection alongside these.

Proposed subordinate records, not yet implemented:

- `realityCaptures/{id}/processingAttempts/{attemptId}`: immutable identity/input manifest revision/configuration; controlled status transitions and lease; output revision refs. Current-session status is a derived pointer/summary, not a second job authority.
- `realityCaptures/{id}/representationRevisions/{revisionId}`: immutable geometry snapshot reference, asset refs (`bucket,path,generation,sha256,size,mime`), representation kind, authored alignment and evidence classification. Revision never changes after submission; an edit creates another revision.
- `realityCaptures/{id}/reviews/{reviewId}`: exact revision, target snapshot, decision, actor, reason, timestamp and idempotency key. A decision is append-only. A later reversal is a new record.
- `buildingRepresentations/{publicationId}`: current approved revision/composition pointer, selected by target and representation slot. Full exterior and facade patches share this lifecycle; composition prevents duplicate overlapping publications.
- Optional bounded `uploads/{photoId}` under session if manifest growth/query needs warrant it; the current 48-photo bound can retain a compact validated manifest. No blobs/base64 media in Firestore.

## Shared target references, not another building database

Introduce a minimal shared world target/alias service consumed by capture, property, POI and entrances. Preserve existing sourceBuildingId, propertyId, poiId and entranceId as different entity identities/relationships. Only the building reference is shared.

Target record: `targetId, entityKind, worldDomain, canonicalSourceRef, verificationState`. Alias record: `provider, externalId, targetId, providerRelease, evidence, validFrom, validTo, state`. Geometry snapshot: `targetId, providerRelease, geometryHash, coordinateFrame, geometryRef, trust, createdAt`. These are proposed logical records; finalize physical paths with all consumers before adding writers.

Do not use scene origin, local coordinates, current room label or uploader ID as the building's stable identity. Do not remove uploader information from existing private-space IDs and blindly merge the result. Never conflate nearby entities automatically. Provider split/merge or uncertain geometry updates require reviewed reattachment. Overture bridge files map provider IDs; they do not guarantee arbitrary proximity matches.

## Ownership and visibility invariants

1. Contributor UID owns capture source media unless explicit rights transfer exists.
2. Existing property authority owns virtual-property entitlements; that is not permission to see residential photos.
3. Policy-controller UID/household controls a persistent private space; immutable space ID is independent of its editable label.
4. Exterior visibility, source capture privacy, processed interior visibility and entry permission are independent.
5. Every asset request resolves one target/space/revision/policy decision server-side. One-time entry cannot be consumed twice by a resolve-then-fetch sequence.
6. No public IAM/ACL/token access for private media; signed URL lifetime is a bounded revocation window, not immediate recall.
7. Processing, admission and review use idempotent operation IDs; notifications are durable downstream events, never approval prerequisites.

## Safe migration sequence

1. Preserve current records/paths/owners; capture backup and generation manifests without logging credentials or tokens. Preview migration changes before applying.
2. Add schema version and target references using verified evidence. Keep original worldId as scene context and legacy evidence only. Mark uncertain references unresolved.
3. Backfill only observable attempts/results and existing decisions. Missing previous history remains unknown; do not synthesize successful attempts or permissions.
4. Introduce immutable revisions and explicit publication pointers. Pin legacy output generations/hashes after reinspection; don't trust a mutable path as an approved revision.
5. Convert readers/writers together through one bounded compatibility adapter. No permanent dual-write authority. Keep per-record migration version, preconditions and rollback checkpoint.
6. Reconcile private spaces explicitly; no guest-list unions, no property-purchase access inheritance, no selecting the first arbitrary allowed room.
7. Verify origin changes, aliases, spaces, retries, stale reviews, revoked URLs, deletion, hard refresh and account/admin UX. Only then retire legacy writers/adapter.

## Live evidence and immediate changes

Staging inventory: 4 sessions (2 drafts,2 review_required),45 originals,2 outputs,1 scheduler lease,7 admission docs; no privateSpaces/buildingRepresentations root records. Production root inventory had no capture-related collections; configured media bucket absent, discovered Functions source bucket had no capture-prefix objects. No truncated inventory pages.

45 staging original objects carried long-lived Firebase download tokens. Anonymous one-byte token request returned206 despite deny-read Storage rules. `scripts/reality-capture/audit-storage-privacy.mjs --apply` revoked45 tokens with generation/metageneration preconditions; old token returned403, media generations/hash unchanged. No originals deleted. Subsequent audit must remain token-free.

Local fixes: seal tokens during validation, create-only worker output upload, pin processed generation/hash in output/read paths, remove unsafe duplicate-completion artifact deletion. Not deployed. Old worker and future SDK upload-time token creation still need coordinated rollout; validation alone does not close the pre-finalization window.

## Claim/gap ledger

- Metadata/media separation: code + [Firestore limits](https://firebase.google.com/docs/firestore/quotas). High confidence; media stored separately already.
- Atomic review/publication: [transactions](https://firebase.google.com/docs/firestore/manage-data/transactions). High confidence for Firestore only; Storage/worker effects need compensation/outbox.
- Retry semantics: [Firestore triggers](https://firebase.google.com/docs/functions/firestore-events). High confidence; ordering not guaranteed and at-least-once events.
- Stable source identity: [Overture GERS](https://docs.overturemaps.org/gers/), code consumer audit. Existing shared source IDs are useful, provider alias resolver absent. Migration matching unresolved.
- Private URL risk: live206/403 probe + [signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls) + [Firebase download API](https://firebase.google.com/docs/storage/web/download-files). High confidence for tested staging token; all45 token metadata removed. No inference about undisclosed historical projects.
- Safe object updates: [Storage preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions). High confidence; live metadata-only repair verified. Worker redeployment not tested.
- Authorization boundary: [Firebase rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) and endpoint comparisons. Server SDK bypasses rules; access decision consolidation pending.
- Deletion: [Firestore deletion](https://firebase.google.com/docs/firestore/manage-data/delete-data), functions/index.js account cleanup. Capture/space/media deletion integration not complete.

Sources accessed September7,2026. First pass covered collection/lifecycle/identity and Firebase/GERS docs. Follow-up covered IAM/ACL/token evidence, output preconditions, private grants and live production/staging inventory. Stopped broad research because the database decision is supported; remaining gaps require implementation/migration evidence rather than more general articles.
