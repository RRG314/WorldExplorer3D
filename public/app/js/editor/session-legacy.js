import { createOverlayDraftFromBaseFeature } from './base-features.js?v=1';
import { worldDataToGeometry } from './geometry.js?v=1';
import { createOverlayFeatureDraft, normalizeOverlayFeature } from './schema.js?v=1';

function currentReferenceWorldPoint(ctx) {
  if (ctx.appCtx.Walk?.getMapRefPosition) {
    const ref = ctx.appCtx.Walk.getMapRefPosition(ctx.appCtx.droneMode, ctx.appCtx.drone);
    if (ref && Number.isFinite(ref.x) && Number.isFinite(ref.z)) {
      return { x: ref.x, z: ref.z, y: ctx.sampleSurfaceY(ref.x, ref.z, 0) };
    }
  }
  const x = Number.isFinite(ctx.appCtx.car?.x) ? ctx.appCtx.car.x : 0;
  const z = Number.isFinite(ctx.appCtx.car?.z) ? ctx.appCtx.car.z : 0;
  return { x, z, y: ctx.sampleSurfaceY(x, z, 0) };
}

function legacyDraftPresetId(ctx, draft = {}) {
  const editType = ctx.sanitizeText(draft.editType || '', 40).toLowerCase();
  if (editType === 'building_note') return 'building';
  if (editType === 'interior_seed') return 'entrance';
  return 'poi_marker';
}

function legacyDraftTags(ctx, draft = {}) {
  const editType = ctx.sanitizeText(draft.editType || '', 40).toLowerCase();
  const tags = {};
  const title = ctx.sanitizeText(draft.title || '', 120);
  const note = ctx.sanitizeText(draft.note || '', 180);
  const category = ctx.sanitizeText(draft.category || '', 60).toLowerCase();
  if (title) tags.name = title;
  if (note) tags.description = note;
  if (editType === 'building_note') tags.building = 'yes';
  if (editType === 'interior_seed') tags.entrance = 'yes';
  if (category) {
    if (editType === 'photo_point') tags.tourism = category;
    else tags.note_category = category;
  }
  if (ctx.sanitizeText(draft.photoUrl || '', 240)) tags.image = ctx.sanitizeText(draft.photoUrl, 240);
  return tags;
}

function buildLegacyDraftPreviewFeature(ctx) {
  const target = ctx.state.legacyCapturedTarget || captureEditorHereTarget(ctx);
  if (!target) return null;
  const draft = ctx.state.legacyDraft || {};
  const editType = ctx.sanitizeText(draft.editType || 'photo_point', 40).toLowerCase();
  if (editType === 'building_note' && ctx.state.selectedBaseFeature?.geometryType === 'Polygon') {
    return normalizeOverlayFeature({
      ...createOverlayDraftFromBaseFeature(ctx.state.selectedBaseFeature),
      tags: {
        ...(ctx.state.selectedBaseFeature?.tags || {}),
        ...legacyDraftTags(ctx, draft)
      },
      summary: ctx.sanitizeText(draft.title || ctx.state.selectedBaseFeature?.displayName || 'Building overlay', 120)
    });
  }
  return createOverlayFeatureDraft({
    presetId: legacyDraftPresetId(ctx, draft),
    geometry: worldDataToGeometry({
      type: 'Point',
      coordinates: {
        x: target.x,
        z: target.z
      }
    }, 'Point'),
    tags: legacyDraftTags(ctx, draft),
    relations: editType === 'interior_seed'
      ? {
          indoorShell: {
            enabled: true,
            levels: [{ level: '0', label: 'Ground' }]
          }
        }
      : {},
    summary: ctx.sanitizeText(draft.title || 'Overlay preview', 120)
  });
}

export function captureEditorHereTarget(ctx) {
  const world = currentReferenceWorldPoint(ctx);
  const geo = ctx.worldToGeoPoint(world.x, world.z);
  ctx.state.legacyCapturedTarget = {
    kind: 'world',
    x: world.x,
    y: world.y,
    z: world.z,
    lat: geo.lat,
    lon: geo.lon
  };
  return ctx.cloneJson(ctx.state.legacyCapturedTarget);
}

export function setEditorDraft(ctx, input = {}) {
  ctx.state.legacyDraft = {
    editType: ctx.sanitizeText(input.editType || 'photo_point', 40).toLowerCase(),
    title: ctx.sanitizeText(input.title || '', 120),
    note: ctx.sanitizeText(input.note || '', 180),
    category: ctx.sanitizeText(input.category || '', 60).toLowerCase(),
    photoUrl: ctx.sanitizeText(input.photoUrl || '', 240)
  };
  return ctx.cloneJson(ctx.state.legacyDraft);
}

export function previewEditorDraft(ctx) {
  if (!ctx.state.active) ctx.openEditorSession({ skipTutorial: true });
  if (!ctx.state.legacyCapturedTarget) captureEditorHereTarget(ctx);
  const feature = buildLegacyDraftPreviewFeature(ctx);
  if (!feature) {
    ctx.setStatus('Could not create a preview feature for this draft.', 'error');
    return null;
  }
  ctx.addWorkspaceFeature(feature);
  ctx.openPreviewDrawer();
  ctx.refreshWorkspacePreview();
  return feature;
}
