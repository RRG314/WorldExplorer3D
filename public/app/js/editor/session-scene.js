import { createOverlayDraftFromBaseFeature } from './base-features.js?v=1';
import { worldDataToGeometry } from './geometry.js?v=1';
import { getOverlayPreset } from './preset-registry.js?v=1';
import { buildEditorHandles, buildOverlayFeatureObject, buildSnapMarker, disposeObject3D } from './renderer.js?v=1';
import { createClientFeatureId, createOverlayFeatureDraft } from './schema.js?v=1';

function ensureSceneGroups(ctx) {
  if (typeof THREE === 'undefined' || !ctx.appCtx.scene) return null;
  if (!ctx.sceneState.group) {
    ctx.sceneState.group = new THREE.Group();
    ctx.sceneState.group.name = ctx.EDITOR_RENDER_GROUP_NAME;
  }
  if (!ctx.sceneState.handleGroup) {
    ctx.sceneState.handleGroup = new THREE.Group();
    ctx.sceneState.handleGroup.name = ctx.EDITOR_HANDLE_GROUP_NAME;
  }
  if (!ctx.sceneState.helperGroup) {
    ctx.sceneState.helperGroup = new THREE.Group();
    ctx.sceneState.helperGroup.name = ctx.EDITOR_HELP_GROUP_NAME;
  }
  if (ctx.sceneState.group.parent !== ctx.appCtx.scene) ctx.appCtx.scene.add(ctx.sceneState.group);
  if (ctx.sceneState.handleGroup.parent !== ctx.appCtx.scene) ctx.appCtx.scene.add(ctx.sceneState.handleGroup);
  if (ctx.sceneState.helperGroup.parent !== ctx.appCtx.scene) ctx.appCtx.scene.add(ctx.sceneState.helperGroup);
  return ctx.sceneState.group;
}

function clearGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const child = group.children[group.children.length - 1];
    group.remove(child);
    disposeObject3D(child);
  }
}

export function scheduleWorkspacePreviewRefresh(ctx) {
  if (!ctx.state.active) return;
  if (ctx.state.previewRefreshQueued) return;
  ctx.state.previewRefreshQueued = true;
  globalThis.requestAnimationFrame?.(() => {
    ctx.state.previewRefreshQueued = false;
    refreshWorkspacePreview(ctx);
  });
}

function renderPendingDraw(ctx, group) {
  if (!ctx.state.pendingDraw.type || !ctx.state.pendingDraw.points.length) return;
  const previewFeature = createOverlayFeatureDraft({
    featureId: createClientFeatureId('preview'),
    presetId: ctx.state.activePresetId,
    geometry: worldDataToGeometry(
      ctx.state.pendingDraw.type === 'Point'
        ? { type: 'Point', coordinates: ctx.state.pendingDraw.points[0] }
        : ctx.state.pendingDraw.type === 'LineString'
          ? { type: 'LineString', coordinates: ctx.state.pendingDraw.points }
          : { type: 'Polygon', coordinates: [ctx.state.pendingDraw.points] },
      ctx.state.pendingDraw.type
    )
  });
  const previewObject = buildOverlayFeatureObject(previewFeature, { color: '#f8fafc', yBias: 0.28, pointRadius: 0.26 });
  if (previewObject) group.add(previewObject);
}

export function refreshWorkspacePreview(ctx) {
  ensureSceneGroups(ctx);
  clearGroup(ctx.sceneState.group);
  clearGroup(ctx.sceneState.handleGroup);
  clearGroup(ctx.sceneState.helperGroup);
  ctx.appCtx.overlayDraftPreviewFeatures = ctx.state.active ? ctx.state.workspaceFeatures.slice() : [];

  if (!ctx.state.active || ctx.state.tab !== 'workspace') return;
  ctx.state.workspaceFeatures.forEach((feature) => {
    const color = feature.featureId === ctx.state.selectedFeatureId ? '#fde047' : getOverlayPreset(feature.presetId).color;
    const object = buildOverlayFeatureObject(feature, { color, pointRadius: 0.28 });
    if (object) ctx.sceneState.group.add(object);
  });
  if (ctx.state.selectedBaseFeature) {
    const preview = createOverlayDraftFromBaseFeature(ctx.state.selectedBaseFeature);
    const baseObject = buildOverlayFeatureObject(preview, { color: '#38bdf8', yBias: 0.32, pointRadius: 0.24 });
    if (baseObject) ctx.sceneState.helperGroup.add(baseObject);
  }
  const feature = ctx.selectedFeature();
  if (feature) {
    const handles = buildEditorHandles(feature, { activeVertexIndex: ctx.state.selectedVertexIndex });
    if (handles) ctx.sceneState.handleGroup.add(handles);
  }
  renderPendingDraw(ctx, ctx.sceneState.helperGroup);
  if (ctx.state.snapPoint) {
    const snapMarker = buildSnapMarker(ctx.state.snapPoint);
    if (snapMarker) ctx.sceneState.helperGroup.add(snapMarker);
  }
}
