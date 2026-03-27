# World Explorer 3D Overlay Editor (Model B)

## Repo audit summary

- Base world runtime lives in `app/js/world.js` and populates immutable OSM-derived runtime arrays such as `appCtx.roads`, `appCtx.buildings`, `appCtx.landuses`, `appCtx.waterAreas`, `appCtx.waterways`, `appCtx.linearFeatures`, and `appCtx.pois`.
- Existing contribution tooling lives in `app/js/editor/session.js`, `app/js/editor/store.js`, `app/js/editor/public-layer.js`, `js/contribution-api.js`, `functions/index.js`, and `firestore.rules`.
- Existing contribution tooling is metadata-first. It captures a point/building target, stores a submission, moderates it, and renders approved marker-like content. It does not support real geometry authoring.
- Sandbox build mode already exists in `app/js/blocks.js`. It remains separate from the serious overlay editor.
- Existing moderation boundaries are good: direct client writes to the current moderation collection are blocked, Cloud Functions own moderation transitions, and admin gating already exists.

## Model B architecture

### Core rule

Raw OSM-derived runtime data remains the base layer. Overlay features are stored and published separately. Runtime merge is additive or suppressive at render/query time. Base ingest data is never mutated by contributors.

### Frontend placement

- `app/js/editor/config.js`
  Presets, tool registry, merge/source/review state enums.
- `app/js/editor/schema.js`
  Overlay feature shape, normalization, bbox/version helpers.
- `app/js/editor/geometry.js`
  World/geo conversion, snapping, line/polygon editing utilities.
- `app/js/editor/validation.js`
  Geometry, semantic, and 3D property validation.
- `app/js/editor/history.js`
  Local undo/redo snapshot stack for real editing.
- `app/js/editor/store.js`
  Firestore listeners for own features, moderation queue, and published overlays.
- `app/js/editor/session.js`
  Desktop-first editor workspace, toolbar, inspector, preset search, preview, and moderation UX.
- `app/js/editor/public-layer.js`
  Published overlay runtime listener and merge renderer.

### Backend placement

- `functions/overlay.js`
  Overlay draft save/update, submit, moderate, and delete endpoints.
- `functions/index.js`
  Re-export overlay endpoints alongside the existing function surface.
- `firestore.rules`
  Read-only client access to published overlays, owner/admin read access to feature heads, no direct live writes.
- `firestore.indexes.json`
  Indexes for own-feature views, moderation queue views, and published area queries.

## Overlay feature head document

Collection: `overlayFeatures/{featureId}`

Required fields:

- `featureId`
- `worldKind`
- `areaKey`
- `presetId`
- `featureClass`
- `sourceType`
- `mergeMode`
- `baseFeatureRef`
- `geometryType`
- `geometry`
- `tags`
- `threeD`
- `relations`
- `bbox`
- `level`
- `buildingRef`
- `reviewState`
- `publicationState`
- `validation`
- `version`
- `headRevisionId`
- `createdBy`
- `createdByName`
- `updatedBy`
- `updatedByName`
- `createdAt`
- `updatedAt`
- `submittedAt`
- `approvedAt`
- `publishedAt`
- `rejectedAt`
- `needsChangesAt`
- `supersedes`
- `supersededBy`

Supporting fields:

- `searchText`
- `summary`
- `moderation`
- `runtimeFlags`

## Revision model

Subcollection: `overlayFeatures/{featureId}/revisions/{revisionId}`

Each revision is immutable and stores:

- `revisionId`
- `featureId`
- `version`
- `action`
- `reviewState`
- `createdBy`
- `createdByName`
- `createdAt`
- `snapshot`
- `diffSummary`

This keeps the editable head small while preserving rollback and moderation history.

## Moderation model

Subcollection: `overlayFeatures/{featureId}/moderation/{eventId}`

Each moderation event stores:

- `eventId`
- `featureId`
- `action`
- `note`
- `actorUid`
- `actorName`
- `createdAt`
- `fromState`
- `toState`

## Published runtime model

Collection: `overlayPublished/{featureId}`

This stores the approved runtime-safe snapshot only:

- `featureId`
- `worldKind`
- `areaKey`
- `presetId`
- `featureClass`
- `sourceType`
- `mergeMode`
- `baseFeatureRef`
- `geometryType`
- `geometry`
- `tags`
- `threeD`
- `relations`
- `bbox`
- `level`
- `buildingRef`
- `reviewState`
- `publicationState`
- `publishedRevisionId`
- `publishedAt`
- `publishedBy`
- `publishedByName`
- `supersedes`
- `supersededBy`

## Geometry format

Canonical storage uses geo coordinates:

- `Point`: `{ type: "Point", coordinates: { lat, lon } }`
- `LineString`: `{ type: "LineString", coordinates: [{ lat, lon }, ...] }`
- `Polygon`: `{ type: "Polygon", coordinates: [{ lat, lon }, ...], rings: [{ role: "outer", points: [{ lat, lon }, ...] }] }`

The polygon format is intentionally Firestore-safe. Firestore rejects nested arrays, so persisted polygons use a flat outer-ring `coordinates` array plus explicit ring objects for future holes/interior rings.

The editor converts this to world-space `x/z` for interaction and rendering. World coordinates are not stored as canonical geometry because they are local to the current runtime origin.

## State model

Review states:

- `draft`
- `submitted`
- `approved`
- `rejected`
- `needs_changes`
- `superseded`

Publication states:

- `unpublished`
- `published`
- `rolled_back`

`approved` remains a moderation state. `published` remains a publication state. A feature can be `approved + published`.

## Merge strategy

### Additive overlays

- New POIs, trees, markers, roads, paths, buildings, landuse, and water can render on top of the base world.
- Additive linear overlays feed traversal without changing base ingest arrays.

### Rendering overrides

- When `mergeMode` is `render_override`, the published overlay draws over the base feature and can suppress matching base display by feature id or local bbox.

### Local replacements

- When `mergeMode` is `local_replace`, runtime creates a suppression rule against the referenced base feature or bbox and uses the overlay geometry instead.
- Buildings can hide matching base meshes by `sourceBuildingId`.
- Roads and paths suppress base routing/query use and render the overlay path on top.

### Conflict handling

- Head docs can declare `supersedes`.
- Publishing a newer feature marks the older feature `superseded` and removes or deactivates its published snapshot.
- Runtime always prefers the newest non-superseded published feature for the same `baseFeatureRef`.

## Validation layer

Validation runs locally before save/submit and again in functions before persistence:

- geometry cardinality and minimum size
- self-intersection-lite checks
- preset/geometry compatibility
- required tag checks
- numeric 3D property bounds
- `mergeMode` requiring `baseFeatureRef` when relevant
- building entrance and level linkage checks

## Workflow

1. Author draws or clones a base feature into an overlay draft.
2. Author edits geometry, tags, and 3D properties.
3. Draft is saved to `overlayFeatures` and a new immutable revision is appended.
4. Author submits for moderation.
5. Moderator reviews, rejects, requests changes, or approves.
6. Approval writes a moderation event and publishes a runtime-safe snapshot to `overlayPublished`.
7. Runtime listeners merge published overlays into render/query layers.
8. Newer approved overlays can supersede older ones.

## Runtime integration points

- `app/js/world.js`
  Traversal, nearest-road lookup, surface naming, building collision supplementation, and local suppression logic.
- `app/js/map.js`
  Published overlay display for lines, polygons, and points on minimap and large map.
- `app/js/state.js`
  Published overlay arrays, suppression registries, and editor session state.
- `app/js/app-entry.js`
  Editor session boot and published overlay runtime boot.
