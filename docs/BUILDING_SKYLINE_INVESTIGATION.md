# Building skyline investigation — September 8, 2026

Status: open. Not a release approval.

The reported screenshot shows floating building fragments in Baltimore at
39.2903,-76.6112, in flight, with build ba14127. Current fresh source loads do
not reproduce the same scene failure. This does not establish that it is fixed.
The affected open tab remains important evidence; it could not be inspected
while the user's Mac was locked.

## Confirmed loader defect, independently fixed

Overture conversion recorded a parent as replaced before checking whether its
part geometry intersected the requested window and could be emitted. Invalid or
out-of-window parts could therefore remove a usable parent. Registration now
follows finite-coordinate and window validation. Complete valid parts still
replace parents; incomplete provider coverage still preserves the parent.

The premature registration dates to fb02fb4b3 (July 14, 2026), rather than the
recent exterior upgrade. It is not yet proven to explain the reported image.

No mapped heights were capped and no building was removed to hide the symptom.

## Evidence and limits

- tests/building-part-publication-current.test.mjs executes the actual converter.
- scripts/verification/building-skyline-current.mjs loads the real source app,
  enters Earth and flight, and records provenance plus four cardinal views.
- output/verification/building-skyline-cardinal contains 25,102 provenance
  records and zero page errors. This is one source/provider/session load, not
  cross-location or immutable-build acceptance.
- The generic game client captured the pre-game canvas, not gameplay; its
  black canvas is excluded from visual acceptance.

Next: inspect the affected session/build, compare accepted source features with
rendered body/part bounds, reproduce the exact failure, and only then establish
its introduction and validate the correction at other affected locations.
