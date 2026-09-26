# Reality Capture continuity and editing — September 10, 2026

## Scope

Local implementation and staging acceptance only. Production data, hosting and
permissions are not changed. No reconstruction jobs are launched.

## Changes

- Continue improving creates an idempotent private editable capture with copied,
  generation-pinned originals and existing placements/layout. The submitted
  capture remains unchanged. Partial copies can be retried; editing stays locked
  until the manifest is complete. This uses the existing capture collection,
  canonical building identity, private space and upload pipeline.
- All owned capture pages are retrieved, rather than silently stopping at 60.
  Phone and in-world libraries group exact world/building identities and use the
  same review/draft labels. Approved private exteriors are not called published.
- Compatible legacy single-room placements migrate without losing photo/surface
  identity. Incompatible rooms open the original editor with an explanation.
- Stale device drafts are inspectable, never automatically written over account
  revisions. Undo restores both layout and photo associations. Account saves
  still enforce revision conflicts. Closing unsaved edits asks for confirmation.
- Floor plans have redo, zoom/pan/reset, shared-wall dragging and metric/feet
  measurement display. Advanced geometry coordinates remain explicitly metric.
- Photo editing supports labels, rotation, replacement, placement-use labels,
  and viewing the shell without photos. Home photo Save explicitly identifies
  that it also saves the current home layout. Submission is distinct from Save.
- Review reasons are shown with next steps. Home moderation counts include room
  placements. Authoritative submission/review events produce idempotent updates
  in the existing owner-only users/notifications collection. Account, phone and
  in-world contribution lists expose these updates. No raw photo URLs or home
  details are included. Existing moderation-email delivery remains separate.

## Evidence and limits

Unit/handler checks exercise pagination, owner denial, continuation idempotency,
original-version preservation, room migration, geometry/privacy and event
deduplication. Desktop and phone-width component checks exercise drawing,
shared-wall movement, undo/redo, zoom/reset, rotation, labels, photo save,
private CPU submission, inside picking, and reopen. Component transport doubles
are not proof of a deployed Firebase workflow.

Staging acceptance passed on hosting
`5.2.0+859335051ed3.06c5683046ebc2be.staging`. The real interior flow uploaded
three photos, retained a two-floor layout, submitted a private CPU derivative,
received an account notice, reopened after reload, displayed its phone QR, and
created an idempotent continuation retaining all three photos and the placement.
The real exterior flow likewise retained both photos and its placement in the
continued version. Both building-scoped libraries returned the source and new
version. The owner-only interior resolver and denial of paid reconstruction were
checked. Disposable captures/accounts and temporary attestation were cleaned up.

The focused suite passed 64 checks. The desktop/phone component runs also passed
stale-device inspection followed by Undo without writing over the account, shared
wall dragging, saved photo labels, rotation, redo and navigation controls. The
broader capture UI run passed upload failure/retry, photo/video handling, account
switching and continuation using transport doubles. Staged screenshots were
inspected; this does not claim real-house photographic quality from synthetic
test photos.

Production was read-only checked and remains
`5.2.0+db62593ba377.6342cddaba06fc68.production`.

Physical Android camera behavior and email arrival in a real inbox cannot be
inferred from browser emulation or an email-provider acceptance response.
These account updates are not background Web Push notifications. No new push
provider, public reconstruction option or parallel building database is added.
Staging has a moderation recipient but no configured sending address or Resend
key. Email delivery is therefore a configuration blocker, not a passed feature.
