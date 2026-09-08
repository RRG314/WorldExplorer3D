# Digital homes and progressive interiors

Status: design grounded in the current repository, September 8, 2026.
Not an implementation or production-readiness claim. Supersedes the idea of
installing independent room-sized photo boxes inside building-sized collision.

## Product decision

Use **one home layout, progressively improved room by room**. Floor-plan editing
owns room shape and connectivity; Reality Capture supplies photographs and
representation revisions. A photo cannot establish unseen dimensions, doorway
connectivity, a legal ownership claim, or permission to publish an interior.

The first usable increment is one room correctly placed inside an eligible unit,
with a real entry/exit, matching collision, protected account save and photo
placement. It must already have stable home/floor/room identities, so adding a
second room does not require deleting the first. Whole-house automatic scanning,
paid reconstruction and object generation are not prerequisites.

## What exists and what must change

| Existing authority | Keep its responsibility | Required integration |
| --- | --- | --- |
| Canonical building/provider identity and geometry snapshot | Geographic building and accepted exterior | Pin envelope revision; never substitute a room rectangle as the building footprint |
| `real-estate/housing-model`, connected property authority, `functions/property-authority.js` | Virtual property, ownership and economy | Connect home designation and edit entitlement; a capture owner is not automatically the property's owner |
| `realityCaptures` | Uploads, owner, validated manifest, photo placements, submissions and reviews | Reference home/room/surface IDs and layout revision, rather than identify rooms by their display name |
| `privateSpaces` | Access policy, explicit members, session/one-time grants | One home-level space with room restrictions where necessary; retain legacy grants without broadening access |
| `interiors/planner`, `scene-builder`, `floor-model`, `vertical-boundary`, runtime | Interior generation, walk surfaces, collisions, stairs, exit and camera transitions | Compile accepted room graph and envelope; no separate capture movement/collision engine |
| Existing crop editor and private media delivery | Photo selection, crop/grid placement, recovery and account saves | Room-local wall/floor/ceiling surfaces and shared measurements |
| Quick Build / editable-world / Backpack | Virtual additions and possessions | Home-local placement constrained by the accepted layout and existing entitlement; do not duplicate storage or inventory |
| Multiplayer `rooms` | Session/presence | Home visit context only; a multiplayer room ID is NOT an architectural room ID |

Current gaps found in code: new-room creation is hidden; manual finalization and
hybrid submission were exterior-only; the protected interior resolver read only
reconstruction output. Runtime capture attachment hides generated meshes but
keeps their old collision proxy. Existing `spaceIdForCapture` depends on room
label and owner; renaming a room must not create a different permission identity.
No persistent, user-authored whole-home adjacency graph has been established by
these modules. Do not document the new graph as existing functionality.

## Player workflow

### Simple mode — default

1. Choose **My Home → Design inside** from the existing property/account and
   in-world door entry points. Exterior contribution remains separately available.
2. Confirm the highlighted building and, for apartments/townhouses, the unit and
   floor. Show the actual outline, not a generic rectangle. A private draft is
   allowed before publication; installing into a shared property requires the
   appropriate virtual entitlement.
3. Select **Start with one room** or a suggested layout. Suggestions are explicitly
   generated, not claimed to describe the real house. Unknown portions can remain
   unassigned; do not force a user to invent the entire house before saving.
4. Drag room edges with large handles, enter a known measurement in feet/inches
   or metres, rotate, and snap to the envelope or neighboring walls. Show one
   currently selected measurement, not a screen of compulsory fields.
5. **Add a room beside this one** offers adjacent valid space. The shared wall is
   one wall, not two independently overlapping walls. Tap it to add a doorway.
6. Tap a room surface, select a photo thumbnail, crop, then place on the whole
   surface or a grid region. Retain the existing exterior editor's familiar
   gestures, undo and explicit Save-to-account feedback. A simple diagram names
   the selected surface; it does not infer orientation from Photo 1/2/3.
7. **Walk through** loads the compiled draft in an authorized private context.
   Check scale, doors and exit. A prominent Exit returns to the preserved outside
   position, even if photo loading fails.
8. Save privately and optionally request review/sharing. Existing approved work
   remains installed until a newer revision is valid and explicitly activated.

On Android or desktop, the full manual workflow must work independently: choose
the building, create the draft, add library/camera photos, edit, save, reopen,
preview and submit. Desktop-to-phone QR is optional handoff, not a requirement.
No Apple-only sensor or depth hardware is required. Camera permission refusal
must leave library uploads and manual dimensions usable.

### Advanced mode — same document, not a different editor

Expose exact wall lengths, wall thickness, angled/L-shaped rooms, traced plan
images with an explicit scale reference, floor elevations, slab thickness,
ceiling heights, roof-clearance view, door width/offset/swing, windows, stairs,
measurement source and confidence, surface IDs and alignment. Imported floor
plans remain private media. Do not launch a general CAD/BIM product in this phase.

Advanced edits still obey containment, connectivity and permission checks. There
is no unchecked “allow outside building” switch. Drafting an unresolved mismatch
is allowed; pretending it is safely installed is not.

## Geometry contract: nothing outside the accepted exterior

Define a versioned **interior envelope** in building-local metres. It includes
the accepted footprint, holes/courtyards, building parts, per-floor footprint,
floor/slab heights and roof underside where supported. A single XY rectangle or
a center-point test is insufficient for concave houses, courtyards and setbacks.

- Create usable space by insetting the accepted exterior by wall thickness and
  numerical clearance. Use robust polygon offset/boolean operations; test the
  full proposed room region against the usable envelope. Checking only corners
  can miss a wall crossing a concave notch or courtyard.
- At each floor, require room + wall + clearance geometry minus the usable
  envelope to be empty within a small documented numerical tolerance. Do not
  confuse round-off tolerance with permission to overhang.
- Validate vertical volumes too: floors and ceilings cannot cross slabs or roof
  planes. Attics, split levels, overhangs and varying building parts need their
  own accepted envelopes; unsupported shapes remain drafts rather than fake fits.
- Dragging shows the nearest valid fit or a red invalid preview. Offer undo,
  move, adjust dimension, or resolve exterior evidence. Never silently shrink a
  measured room, crop off a doorway, remove the exterior or raise a roof to hide
  an overlap.
- If reliable interior measurements contradict an inferred exterior height or
  footprint, explain the mismatch and submit an exterior correction separately.
  Preserve the interior draft with its measurements. Accepted exterior geometry
  cannot silently change just because an interior editor requested more space.
- When an exterior revision arrives, revalidate linked layout revisions. Keep the
  last compatible installed combination pinned until a corrected layout is
  ready. Never discard photos or remap a scan to a similarly named building.

The backend must validate against its trusted accepted envelope or a verified
snapshot reference. The existing client capture snapshot is untrusted alignment
evidence and cannot authorize geometry expansion. Where no verifiable envelope
exists, permit a clearly labeled private design preview but not shared installation.

## Five-unit complexes and shared buildings

Represent Building → Unit → Floor → Architectural Room. One mapped footprint may
contain five townhouses or many apartments; five entrances do not prove exact
unit boundaries. Let the contributor identify their unit boundary with an
explicit confidence/source. Do not grant the first photographer the entire
complex or other residents' private rooms. Common areas have separate access.

Real-world capture permission and virtual property ownership are separate facts.
Buying a virtual building does not grant permission to photograph somebody's
interior; contributing a photograph does not establish real-world ownership.
Existing starter-home, purchase, wallet and property rules remain authoritative.

## One room graph and one compiled scene

Stable architectural `roomId`, `wallId`, `surfaceId` and `portalId` survive labels,
dimension edits and photo upgrades. Doors join two real spaces or the exterior;
stairs join valid floor landings. A portal is not merely an interaction marker:
its visual opening, collision opening and navigation connection must agree.

Compile from the same accepted layout revision:

layout → wall/floor/ceiling meshes + collision + walk surfaces + door openings
       + room connectivity + safe spawn/exit + camera clearances.

Before “Walk through,” check that the selected room is reachable from an entrance
and the explorer's actual collision capsule fits through every required portal.
Check head clearance, steps and stair slopes using existing traversal rules.
Reserve the player's exit route before allowing Quick Build furniture placement.
Do not introduce a second physics engine or a navmesh solely as a patch; first
extend the existing walker, interior containment and floor/stair authorities.

For a real home with captured rooms and blank rooms, the layout remains the same.
Photos replace surface presentation; missing patches use neutral/generic material.
A photographic sofa is still a flat image, not usable 3D furniture. Interactive
furniture and user-added objects are separate, explicitly virtual entities owned
by existing gameplay/Quick Build systems. Automatic object extraction is future work.

## Persistence, revisions and migration

Add only the missing layout record beneath the existing private space, proposed
as `privateSpaces/{homeSpaceId}/layoutRevisions/{revisionId}`. A small active/draft
pointer sits on the parent. This is layout metadata, not another building registry.

A revision references canonical building/unit identity, envelope revision/hash,
local coordinate frame and units, stable floors/rooms/walls/portals, photo surface
attachments, access-policy revision, validation report and previous revision.
Do not store media blobs in Firestore. Existing protected Storage paths and pinned
media generations remain in use; large derived geometry is a private derivative.

Use the current expected-base-revision conflict pattern. Save is idempotent and
shows account acknowledgment; device autosave is recovery, not shared authority.
On phone/desktop conflicts, preserve both drafts and require review of conflicts;
never last-writer-wins the other device's walls. Local recovery keys must include
owner/home/draft identity. A reconnect cannot publish a deleted/revoked draft.

Migration must inventory existing room captures and spaces first. Map old room
labels/spaces to stable IDs; retain original captures, revisions and grants.
Never merge distinct people's homes solely by address or room name. Migration
is repeatable and reversible, with a dry-run report. Do not delete old media as
part of layout migration. Retention cleanup is a separate reviewed operation.

## Privacy, review and invites

All interior source photos, drafts, processed room models and layouts default to
PRIVATE. A public exterior never changes them. Approval approves an exact content
revision; it does not automatically make the home public. Public sharing requires
an explicit owner choice plus review covering the installed content manifest.

Use existing private-space grants, not a second friends/permissions database.
Invites resolve to an authenticated account and revocable permission; a QR code
or copied URL identifies the draft/place but is not authorization. Session grants
expire with the relevant visit; membership alone does not grant permanent entry.
Default home access applies across rooms, with any room-specific restriction
intersecting—not widening—the home policy. Unreviewed replacements cannot become
visible through an older public approval.

Server authorization precedes asset delivery. No permanent public interior URLs,
raw image URLs in notifications, private titles in public lists, service-worker
caching of protected responses, or relying on a hidden button as a lock. Signed
URL expiry limits delivery lifetime but cannot erase pixels already downloaded;
revocation claims must state that limitation honestly.

Moderator preview access is scoped and auditable. Publicly installed models must
reference reviewed generations. Review checks privacy-sensitive content as well
as technical geometry. Never promise a face/document detector guarantees privacy.

## Implementation order and stopping gates

1. Ground recurrence tests and exterior regression checkpoint; separate commits.
2. Room geometry descriptor and existing editor adaptation; real DOM/touch tests,
   account-save normalizer and unchanged building identity. Current work is here.
3. Home/unit/floor identities and accepted-envelope contract; test concavity,
   courtyard holes, setbacks, roof clearance and exterior revision changes.
4. Single installed room with matching render/collision, entry, exit and protected
   owner preview. This is the first phone-test milestone, not a whole-house claim.
5. Add adjacent rooms/shared walls/doors and incomplete-layout fallback, preserving
   existing room/photo IDs. Then stairs and additional floors under the same model.
6. Cross-device persistence, explicit review/sharing and invited multiplayer visit;
   authenticated HTTPS staging test if needed. No paid reconstruction required.
7. Polish simple/advanced instructions, account status and tutorial; update system
   inventory, architecture and an owner-facing test guide. Only then consider release.

No broad automatic database migration, production deployment, paid reconstruction
or new business/economy system is implied by this design.

## Acceptance matrix

- Desktop mouse/keyboard and physical Android camera/library → edit → save →
  reopen on other device → preview → review → authorized visit → exit.
- One room, two connected rooms, concave house, courtyard, five-unit building,
  two floors, sloped roof and conflicting measurements.
- Change dimensions without losing photo placement; resize without invalid
  portals; rename without new identity; undo; crash/recovery; concurrent edits.
- Private owner, denied stranger, invited guest, expired session, revoked guest,
  explicit reviewed public revision and unreviewed update of a public room.
- Same layout drives renderer/collision; no wall escape, roof escape, external
  overlap, doorway snag or camera collision collapse. Test entering/exiting both
  first- and third-person modes and returning to Earth vehicles.
- Existing exterior crop/save/approval/hard-refresh, property wallet, companions,
  Quick Build, POIs and multiplayer remain functional. Tests using mocked HTTP
  are listed separately from actual Firebase and physical-device observations.
- Bound decoded photo memory, thumbnail pages, visible-room loading and texture
  disposal. Load adjacent rooms lazily; do not download a whole private house
  merely because a passerby approaches its exterior.

## Research basis

- [Floorplanner editor manual](https://cdn.floorplanner.com/static/brochures/Floorplanner%2Beditor%2Bmanual%2Bversion%2B121118.pdf): established room-by-room drawing and dimension-oriented editing inform the simple floor-plan interaction; not a dependency or a promise of automated measurement.
- [Three.js Shape](https://threejs.org/docs/pages/Shape.html): supports polygon shapes with holes and winding requirements. Rendering a shape alone does not establish containment or walkability.
- [Clipper2 overview](https://angusj.com/clipper2/Docs/Overview.htm): robust polygon intersection/difference and offset operations are the relevant class of tools for envelope validation. Select a compatible maintained implementation only after checking existing geometry dependencies, browser/backend determinism and license; no new library is installed by this plan.
- [Babylon/Recast navigation documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/crowdNavigation/createNavMesh.md): clearance-aware navigation illustrates why a visually drawn opening is insufficient. This project should reuse its current traversal authority, not switch engines.

The proposed product/architecture choices above are inferences from these methods
and this repository's existing systems, not claims about competitors' completeness.
