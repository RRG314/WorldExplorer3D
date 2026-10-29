# Platform starter courses

Player-created routes remain owned by their creator and are withdrawn when that
account is deleted. World Explorer's permanent starter catalogue needs a content
owner independent of temporary authoring/test accounts.

`scripts/racing/adopt-curated-route.mjs` is a trusted operator command over the
existing publication owner. It is not a player endpoint or a second catalogue.
Dry-run is the default:

```sh
node scripts/racing/adopt-curated-route.mjs \
  --project we3d-staging-20260712 \
  --id COURSE_ID --owner AUTHOR_UID --revision REVIEWED_REVISION \
  --note "First-party starter course; source credits and timed test reviewed."
```

After reviewing the result, the same command with `--approve` adopts the route.
Production additionally requires `--production-release` during an explicitly
approved release. No command enables the racing service or publishes Hosting.
The signed-in Firebase CLI operator must already have database permission.
Only adopt first-party or otherwise authorised content.

The transaction requires an approved route, exact canonical reference/revision,
current approved geographic district, unchanged location pointer, a completed
server qualification for that author and the current physics version, and its
immutable result fingerprint. An author with a closing marker is rejected.
Map-key order from Firestore cannot change the canonical revision comparison.

Adoption sets the existing route's `ownerUid` to null, removes the author's
editable projection, and stores content-only qualification provenance on the
route and its immutable curation receipt. It does not retain a test identity,
create a wallet, grant Credits, modify a result or bypass geographic admission.
The qualification result can subsequently have personal identity removed by the
normal account cleanup without withdrawing the platform-owned content.

Retries do not recreate author projections. Moderators can remove a curated
course through the existing review flow; adoption retry cannot republish it.
An ordinary player cannot reclaim archived platform content or another living
creator's route. A deleted creator's uncurated archived geometry key can be used
for a new draft, within the normal 40-route limit, with qualification and review
required again. No old approval transfers to its new creator.

Explicit geographic intake can reapprove an identical retired district after
review; it retains immutable facts and refreshes the reviewed credits. This does
not reactivate any withdrawn route or enable a service.

Ten focused source transaction cases cover these boundaries. They are not live
cloud, completed-course gameplay or major-venue acceptance. The initial failing
case exposed missing canonical metadata verification; it is fixed. A later fake
database adapter failure was corrected without changing the release criteria.
