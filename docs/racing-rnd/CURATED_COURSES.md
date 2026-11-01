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

## Staging operational acceptance

The Monaco city sprint completed a fresh 45.676 s server qualification using
real staging Auth/App Check/TLS and the already browser-validated geographic
facts. The protected route and reviewer APIs accepted it. The operator CLI dry
run and adoption passed, then ordinary Auth deletion anonymized the temporary
author. The course remained approved, tested and readable by another signed-in
account, and an adoption retry did not recreate the deleted projection. Both
temporary accounts, moderator claims and the private room were removed. The
curated geographic/course content remains; public service discovery is disabled
until the coordinated release. This is protocol/service acceptance, not another
city renderer or a major-track pack.

The same run verified a renewed live room pose exactly matches the stationary
authoritative chassis root and slope. A setup failure omitted the controlled
room's code; the existing rules correctly refused presence. A later observer
read the pre-renew pose too early. The driver now waits for an acknowledged
publication after the server start time. Neither failure required a product
admission bypass. The accepted qualification was not replayed for later cleanup.

Two valid in-flight control packets arrived after the finish and were reported
as `race_not_running`. They did not change the saved result. The focused terminal
input/authority correction is described in `SHARED_RACE_ACCEPTANCE.md`; this run
is not labelled error-free. Failed evidence is retained privately.
