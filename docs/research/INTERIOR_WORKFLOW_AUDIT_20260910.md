# Interior workflow audit — September 10, 2026

## Findings

The existing shared floor-plan authority was useful; several UI connections were
not. The floor grid was hidden behind a setup form, opaque room fills covered its
grid lines, phone handoff lived behind the editor, and the 3D picker discarded the
selected surface. The crop editor also rejected floor/ceiling initial selections.
Legacy capture-sector labels such as Door described capture guidance, not a
photo's assigned surface, but the interface did not make that distinction.

Manual upload validation froze a photo set before review. This unnecessarily
forced contributors into new records while still designing a home. Draft manual
sets now allow additional immutable photo objects before review/reconstruction;
submitted sets remain frozen. Owner checks, App Check, private Storage rules,
revision conflicts and exact building identity remain enforced.

## Interaction design and implementation

The existing [Sweet Home 3D guide](https://www.sweethome3d.com/users-guide/)
demonstrates linked 2D/3D views, direct wall drawing, room surfaces, doors and an
inside viewpoint. Its versioned manual establishes a pattern, not feature parity.
Floorplanner's [published plan format](https://floorplanner.readme.io/reference/v30-specification)
and [viewer/spaceplanner distinction](https://floorplanner.readme.io/reference/viewer-spaceplanner)
reinforce separating structural geometry from decoration.

Applied here: one visible floor grid, optional starting-room counts, pointer
rectangle/divider tools, shared corner editing, labels and click-to-place doors.
Selecting a room opens its inside view. Picking its wall/floor carries the exact
surface identity into the existing photo crop/placement editor. Phone QR,
existing-photo refresh and imports are exposed in the home workspace. Precise
measurements remain advanced controls, not the first required activity.

`layout-drawing.js` only transforms the existing `interior-layout.mjs` model.
There is no new room database, building identity, renderer authority or privacy
store. Account contributions are grouped by exact world/building identity.
Production and staging libraries remain deliberately separate; this work does
not copy private production images into testing.

## Boundaries and remaining limitations

- Rectangle drawing partitions existing space; freeform outlines use shared
  corner tools. This is not a CAD system or automatic floor-plan recognition.
- Complex mapped outlines may require an explicitly supplied unit boundary.
  Room counts are suggestions, not measured real geometry.
- Changing partitions with placed photos is guarded to avoid silently dropping
  their surface associations. Original uploads are retained.
- Sets already submitted for review/reconstruction do not accept new originals;
  subsequent sets remain separately versioned under the same building.
- Phone handoff requires reachable HTTPS and the same environment/account.
  A localhost link cannot connect a physical phone to this computer.
- Public exterior approval never grants public interior access.

## Verification

Local desktop (1100px) and phone-width (412px) browser checks exercised automatic
grid opening, pointer room drawing, undo, account save, photo crop/place/save,
private CPU derivative submission, inside view, room switching and reopening.
These component checks use transport doubles and real shared geometry/derivative
code. The capture workflow check also exercises actual browser photo/video
normalization, IndexedDB, QR and account-scoped reopening with transport doubles.
The HTTP-handler tests execute actual handlers with isolated storage/database
doubles, including append denial after review and preservation of prior inputs.

Real staging acceptance passed on hosting build
`5.2.0+c5565f32f48f.dadabf3f68090fc9.staging`: the actual home file input uploaded
and validated a photo, two additional photos were added to the same capture,
the saved layout was retained, private review submission and owner-only interior
resolution succeeded, and saved editing, phone-photo refresh, QR handoff and
hard-reload reopening worked. Temporary accounts/captures and attestation
registrations were removed. Production remained
`5.2.0+db62593ba377.6342cddaba06fc68.production`.
The corresponding exterior staging upload/append/save/private-preview/review
regression check also passed; it did not approve or publish the fixture.

Staging acceptance is separately recorded by
`scripts/verification/reality-capture-hybrid-staging.mjs`. It uses disposable
accounts, synthetic photos and a temporary staging App Check debug identity;
it never approves public contributions or launches paid reconstruction. Physical
Android camera behavior still requires user testing. No production deployment
is part of this audit.
