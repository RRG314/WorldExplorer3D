# Capture completion pass — staging only

## Delivered

One exterior/interior capture flow retains the existing account, storage, canonical
building, revision, moderation and private-space authorities. No parallel uploader,
building database, or public interior access path was introduced.

- Compass and north-up footprint plus lazy street-map context with selectable walls.
- Saved user street-facing reference is frozen in the submitted revision.
- Contributor and moderator exterior previews show the same blank building shell.
- Shared, versioned exterior geometry fixes outside-view photo mirroring for newly
  applied placements. Legacy placements do not silently change.
- Crop relocation retains source photos and guards overlaps; server validation also
  rejects overlaps. Draft and submitted corrections preserve installed revisions.
- World-scoped public representation lookup, private interiors unchanged.
- Direct account approval queue, pending counts, honest notification status and
  moderator-only email retry without contributor resubmission.

## Executed evidence

- 53 combined orientation, layout and HTTP contract tests passed.
- 40 final notice and HTTP/security tests passed, including moderator-only retry.
- Exterior editor passed 1100/412/390px: real wall picking, map picking, reference
  save, crop placement, account-response normalization and reopen (mock HTTP).
- Room photo editor passed the same widths; home layout editor passed 1100/412px.
- Actual game: authored home entry, W movement, straight-stair ascent, surface
  continuity, upper floor selection and exit; synthetic local layout.
- Real staging: disposable signed-in account, actual Storage image upload, validation,
  save/reload, CPU derivative and submission passed separately for exterior and home.
  Test captures/accounts and temporary App Check test tokens were cleaned up.
- Inspected loaded map, editor, in-game entry and real staging phone-sized screenshots.
- No paid reconstruction or production changes in this pass.

## Genuine external limits

Email transport has no verified sender configured. Staging lacks sending credentials.
No real email delivery is claimed. A valid sending-service configuration is required;
the website now exposes failure and retry rather than making resubmission necessary.

No physical Android device was controlled. Android-sized touch tests and actual cloud
workflow tests do not replace the user's camera/permission check on their own phone.

No signed-in real moderator browser was available for a UI approval test. Backend
authorization, immutable-review and replacement contracts were executed with the
real handlers in the test harness. User moderation acceptance remains necessary.

These limits are not permission to publish interiors or deploy production.
