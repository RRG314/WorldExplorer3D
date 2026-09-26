# Reality Capture coherence and orientation

Production is unchanged by this work. The approved exterior remains installed.

## Account workflow correction — 2026-09-09 (current)

The device-only Photo Survey must not replace Reality Capture. Community now
opens the authenticated My contributions library inside the game. Improve this
place checks saved owner/world/building records before starting a local draft;
one exterior resumes directly, multiple records require explicit selection.
Exterior/interior switching retains the existing backend and private defaults.
Lookup errors and incomplete results do not silently start duplicate captures.
Submitted captures still allow library navigation. Account pages identify the
configured environment: source localhost currently uses production Firebase;
the staging capture links use a separate staging project. No data was migrated.

Legacy `survey=1` no longer automatically opens an editor. Existing device batches
are preserved under Advanced in the library; they remain local previews, not
uploaded account contributions. Batch-to-account upload consolidation remains
unfinished and is not described as end-to-end cloud submission.

Verification: existing desktop/390px real UI suite plus fresh-device saved
exterior resume, account library, existing Kitchen navigation and private consent
checks pass with auth/storage transport doubles. Screenshot inspected. Real
signed-in browser inspection was unavailable (browser connector timed out), so
the user's exact server records and approval-to-world reload remain unverified
this pass. No deployment or cloud record mutation.
The retained local-world preview repeat did not complete: the browser closed
during organizer startup. This is a failed/incomplete check, not a passing gate.

## Earlier in-game Photo Survey workspace — superseded entry points

Local Photo Survey now opens within the running Earth game from Community or
Improve this place. Account and legacy survey links enter that same game flow.
The desktop workspace docks beside the visible world; phone layouts fill the
screen without leaving the game session. The crop editor replaces the visible
survey pane, then returns to photos. Closing returns to gameplay without moving
the actor or camera. Upload, save, privacy and moderation authorities are unchanged;
this local batch workflow still saves device previews, not cloud submissions.

Actual Earth checks passed at 1280px and 412px: import, confirm, crop, save, return,
Community reopen, and reload of the mapped facade. Actor/camera positions remained
unchanged; no page errors. Desktop/mobile screenshots were inspected. Component
checks passed with 34 supplied photos on desktop and two on mobile, including two
independent building previews and stale-draft rejection. These are browser checks,
not a physical Android or production signoff. No deployment was performed.

## Authority contract

The existing canonical building owns footprint, origin and world placement.
Capture wall indices refer to its frozen geometry snapshot; do not rotate or
reorder that polygon to make an editor view feel familiar. Photo crops, wall
assignments and user-facing references belong to the revision. Saving does not
publish; review installs that revision. Interior access remains separately private.

## Local orientation implementation

- Primary north-up footprint, previously buried in Advanced.
- Outward compass labels calculated from the existing east/south coordinate frame,
  handling both provider windings and rotated polygons without renumbering walls.
- Map link at the captured building coordinate, plus entrance reference when saved.
- Straight-on camera view from the selected exterior wall's outward direction.
- Optional user-declared street-facing wall persisted through preview normalization.
  This is not a claim about mapped road data or the actual front door.
- Existing crops can be reassigned to another surface without uploading again.
- Interior room plans explicitly use their local frame, rather than a false north label.

## Completion pass — staging, September 9

Implemented after the initial checkpoint:

- Embedded north-up OSM road context with map wall selection, loaded only when opened.
- Street-facing reference frozen on submission and displayed to the moderator from
  that revision. Contributor and moderator model previews include the blank mapped
  shell, rather than isolated floating photo planes.
- Shared exterior geometry for browser and CPU output fixes outside-view mirroring
  for new V2 photo placements. Existing unversioned/V1 placements stay unchanged.
- Moving a crop guards overlaps; the server independently rejects overlapping patches.
- World-scoped representation listing no longer mixes matching IDs across worlds.
- Replacement tests prove draft/submitted revisions leave installed imagery unchanged
  until the new revision is approved, and stale approval requests are rejected.

Staging build: `5.2.0+14496f5352e6.24812dcd2e3ca853.staging`.
No production deployment or live contribution edits occurred in this pass.

Verified: 53 combined orientation/layout/HTTP tests; exterior and interior editor
flows at desktop and mobile widths; actual-game entry, movement, straight stairs,
surface continuity and exit. Inspected the loaded street-map screenshot and interior
entry screenshot. The stair-end screenshot faces a blank wall and is not a visual
quality demonstration. Real staging exterior upload, validation, CPU model submission
and cleanup passed. Cloud home-flow result is recorded in the completion verification.

## External acceptance gates

- Real email delivery is blocked by missing sender configuration (and missing staging
  sending credentials). Sender-provider acceptance must not be called inbox delivery.
- Physical Android camera permission behavior and final user acceptance require the
  user's phone. Mobile viewport and real cloud account checks are not physical tests.
- Real signed-in moderator acceptance should be exercised on staging; local HTTP
  tests prove authorization/revision contracts, not access to the user's browser session.

## Original audit checklist (historical)

1. Embed surrounding road/building context using the existing spatial provider; do
   not infer a front from the nearest road at corner lots or complex buildings.
2. Propagate the submitted orientation reference into frozen review metadata and
   show the same reference in moderator inspection, not a later mutable draft.
3. Check image left/right handedness across both footprint windings in CPU derivative,
   browser preview and runtime. Existing approved data must not silently flip.
4. Compare room layout, door references and stairs in editor versus actual game;
   complete physical Android capture and private-entry checks.
5. Complete live notification configuration and real moderation/publication checks
   from the prior workflow audit. Queue counts alone are not a full notification inbox.
6. Verify correction of an approved revision preserves the installed result until
   replacement approval, including overlapping patches and failed submissions.

## Local verification

### 2026-09-09 — Existing buildings and Photo Survey evidence

Implemented locally: capture-kind navigation now looks up the signed-in owner's
existing contributions for the full `(worldId, sourceBuildingId)` before opening
an interior/exterior. Multiple matches require a choice; no match restores a
separate kind-specific local draft. It does not convert an exterior into an
interior or copy public consent. An updated backend response is required, so an
older unscoped service cannot silently cause duplicate drafts. Deploy the lookup
function and its Firestore index together with the UI when this is accepted.
Room/floor selection and photo editing remain accessible from the inside view.

At the initial audit Photo Survey was not implemented. The local implementation
described below supersedes that checkpoint. The supplied
34 original JPEGs were inspected read-only using pinned exifr 7.1.3, including
raw GPS fields. Total input: 190,488,256 bytes; exact duplicates: zero; all images
report 4096 × 3072 encoded dimensions. Usable coordinates: **0/34**; camera
heading: **0/34**. Invalid GPS rational values must remain unavailable, not be
coerced to `(0,0)`. Pixel rotation is not compass direction. Capture dates without
timezone evidence must not be invented as UTC. A versioned normalization helper
and repeatable read-only audit cover these cases; exifr is a development-only
dependency, not another game startup dependency. Originals have not been copied
into the repository, uploaded, assigned, or published.

Original implementation sequence (status is updated by the local delivery below):

1. Account-launched private batch review; bounded, sequential decode, exact and
   conservative near-duplicate flags, thumbnails, durable per-owner device drafts.
   Read useful metadata before the existing upload normalization strips it.
2. Resolve nearby buildings through the existing runtime provider/canonical
   identity adapter; no independent OSM-only photo building catalog. Missing GPS
   requires contributor-selected map context. Time adjacency can group photos for
   review, never prove that they depict the same building.
3. Rank candidates using distance, true-north viewing direction when present,
   ray/footprint intersection and visible walls. Magnetic direction is not treated
   as true north without a justified conversion. Return reasons and alternatives,
   not uncalibrated percentages. Preserve wall indices and geometry snapshots.
4. Contributor confirms building and wall, then hands the selected files into the
   existing capture/photo reservation/upload/editor path. No server capture is
   created merely by importing a folder. Never auto-publish, auto-claim ownership,
   or infer that a photographed door is the building's main entrance.
5. Separate proposed/confirmed/approved coverage; edits and approval still use
   existing revisions, manifests, private spaces and moderator authority.
6. Prove multi-building matches against labeled real photos and another account.
   These supplied photos cannot establish GPS-assignment accuracy. Need a mapped
   area and confirmed photo/building examples, or original geotagged photos.
7. Only after that passes, adapt existing bounded video extraction. Do not invent
   per-frame location/heading from one video's creation coordinate. Live guidance,
   material libraries and visual-recognition services are deferred, not new parallel
   subsystems in this pass.

Cost/evidence: local metadata inspection used no paid reconstruction or cloud
uploads. Cloud survey cost, top-1/top-3 correctness, wall accuracy, correction rate,
and second-user acceptance are **not measured**, not zero. Current scripts use
transport doubles for UI; no physical Android or production acceptance is claimed.
Reference: https://exiftool.org/TagNames/GPS.html (camera GPS and direction fields).

### Local Photo Survey delivery — 2026-09-09

Test entry: `http://127.0.0.1:4195/app/survey.html`, also linked from the local
Account page. The game exposes Photo Survey from Improve this place. Opening the
world with `survey=1` opens the survey after world startup. No production deploy,
cloud upload, moderation bypass, new Firestore collection, or paid job is involved.

Implemented local acquisition/review:

- Multi-file import, pinned/lazy exifr reader, useful normalized metadata before
  the existing JPEG normalization removes raw EXIF. 120 photos / 500 MB source
  budget; 32 MB individual limit; sequential normalization and bounded thumbnails.
- Existing IndexedDB capture database stores the survey draft and normalized
  photos. Owner-scoped survey key; anonymous local testing uses `local-device`.
  This is local persistence, NOT cross-device account backup or encrypted storage.
  Account changes close the UI and remove local scene previews. Atomic draft
  versions reject concurrent stale saves instead of overwriting another tab.
- Exact SHA-256 duplicates are skipped. Perceptual difference hashes flag similar
  photos for review without deleting them. Existing exposure/focus checks retained.
- Up to 200 nearby **runtime-loaded** canonical mapped buildings, zoomable numbered
  outline map, optional existing street-map component, compass wall labels, and
  explicit confirmation. There is no separate building database/provider fallback.
- Camera position plus optional true heading rank up to three nearby candidates;
  wall outward normals suggest visible sides. Confidence is LOW/MEDIUM, not a
  probability or automatic assignment. Missing/malformed GPS stays unassigned.
- Mixed-location photos can open their recorded area; no-GPS photos use the world
  Travel/map choice or a contributor-entered coordinate. Building groups, ignored
  photos, unassignment, confirmed-side counts and saved-place links are retained.
- Confirmed photos open the **existing** hybrid facade editor, including crop,
  wall selection, placement/adjustment, and revision save. Its device-save mode is
  explicit; account save/submission behavior for normal captures is unchanged.
- Saved patches are supplied to the **existing runtime representation attachment**
  and the shared facade geometry builder. They match the saved world/building and
  footprint, preserve mapped collision, and replace only the local appearance.
  They load after refresh, can be removed without deleting originals, and are
  bounded to eight nearby buildings / 32 total patches / 512px textures.

Local verification:

- `photo-survey-local.mjs`: all 34 supplied JPEGs on desktop; two supplied JPEGs
  at 412px touch width; exact duplicate retry; two independently confirmed test
  building targets; actual crop/editor/store/renderer path; reload; no photo HTTP
  writes and no page errors. Test fixtures do not establish real subject accuracy.
- `photo-survey-world.mjs`: fresh actual Earth scene at Manchester, one supplied
  photo explicitly assigned to a loaded Overture target for workflow testing;
  shared renderer attached at exactly its building origin, screenshot inspected,
  hard refresh retained the preview, no page errors. This does NOT assert that
  this photo depicts that test building. The test uses an isolated browser profile.
- Metadata, candidate-ranking, owner/building lookup and capture-session unit tests
  pass. Interior navigation and existing crop paths retain their focused checks.

Still outside this local acceptance: calibrated geotagged multi-building accuracy,
automatic fetching of multiple remote neighborhoods without opening them, account
cloud synchronization of surveys, batch submission/moderation, five-building
physical ground truth, another physical device/user, and survey video/live guidance.
Existing per-building account upload/moderation is not replaced. The local test UI
does not pretend that saving here has submitted anything to it. Later cloud handoff
must reserve/upload through that authority, not copy arbitrary Storage records.

Orientation unit tests cover normal/reversed winding and rotated geometry.
Existing exterior UI harness passed 1100/412/390px with real canvas wall selection,
crop/save/reopen and no cloud processing; it now exercises marking the front.
Phone-width orientation screenshot inspected. These checks do not constitute a
production, physical Android, or whole-system signoff.
