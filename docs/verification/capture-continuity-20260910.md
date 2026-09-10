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

Staging acceptance results will be recorded after deployment of this candidate.
Physical Android camera behavior and email arrival in a real inbox cannot be
inferred from browser emulation or an email-provider acceptance response.
These account updates are not background Web Push notifications. No new push
provider, public reconstruction option or parallel building database is added.
