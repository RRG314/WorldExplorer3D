import { getOverlayPreset } from './preset-registry.js?v=1';
import { normalizeOverlayFeature, overlayFeatureLabel } from './schema.js?v=1';
import {
  createOrUpdateOverlayDraft,
  listenOverlayModerationQueue,
  listenOwnOverlayFeatures,
  overlayBackendReady,
  removeOverlayDraft,
  submitOverlayDraft
} from './store.js?v=1';
import { buildSubmissionSummary } from './help.js?v=1';
import { validateOverlayFeature } from './validation.js?v=1';

function normalizeWorkspaceSidebarView(ctx, viewId) {
  const normalized = ctx.sanitizeText(viewId || '', 24).toLowerCase();
  if (normalized === 'presets' || normalized === 'selection') return normalized;
  return 'start';
}

export function selectedFeature(ctx) {
  return ctx.state.workspaceFeatures.find((feature) => feature.featureId === ctx.state.selectedFeatureId) || null;
}

export function selectedModerationFeature(ctx) {
  const featureId = ctx.sanitizeText(ctx.state.selectedFeatureId, 180);
  return ctx.state.moderationQueue.find((feature) => feature.featureId === featureId) || null;
}

export function setStatus(ctx, text, tone = 'info') {
  ctx.state.status = {
    text: ctx.sanitizeText(text || '', 220),
    tone: ctx.sanitizeText(tone || 'info', 16).toLowerCase()
  };
  ctx.renderUi();
}

export function workspaceStage(ctx, feature = selectedFeature(ctx)) {
  if (feature) return 'selected';
  if (ctx.state.selectedBaseFeature || ctx.state.pendingDraw.type || ctx.state.workspaceFeatures.length > 0) return 'drafting';
  return 'start';
}

export function resolveWorkspaceSidebarView(ctx, feature = selectedFeature(ctx)) {
  const requested = normalizeWorkspaceSidebarView(ctx, ctx.state.workspaceSidebarView);
  if (requested === 'selection' && !feature) {
    return ctx.state.workspaceFeatures.length > 0 ? 'presets' : 'start';
  }
  return requested;
}

export function setWorkspaceSidebarView(ctx, viewId) {
  ctx.state.workspaceSidebarView = normalizeWorkspaceSidebarView(ctx, viewId);
  ctx.renderUi();
}

export function editorSnapshot(ctx) {
  return {
    workspaceFeatures: ctx.cloneJson(ctx.state.workspaceFeatures),
    selectedFeatureId: ctx.state.selectedFeatureId,
    secondaryFeatureId: ctx.state.secondaryFeatureId,
    selectedVertexIndex: ctx.state.selectedVertexIndex,
    activePresetId: ctx.state.activePresetId,
    pendingDraw: ctx.cloneJson(ctx.state.pendingDraw),
    previewOpen: ctx.state.previewOpen,
    previewNote: ctx.state.previewNote,
    selectedBaseFeature: ctx.cloneJson(ctx.state.selectedBaseFeature)
  };
}

export function pushHistory(ctx) {
  ctx.state.history.push(editorSnapshot(ctx));
}

export function applyHistorySnapshot(ctx, snapshot) {
  if (!snapshot) return false;
  ctx.state.workspaceFeatures = Array.isArray(snapshot.workspaceFeatures)
    ? snapshot.workspaceFeatures.map((feature) => normalizeOverlayFeature(feature))
    : [];
  ctx.state.selectedFeatureId = ctx.sanitizeText(snapshot.selectedFeatureId || '', 180);
  ctx.state.secondaryFeatureId = ctx.sanitizeText(snapshot.secondaryFeatureId || '', 180);
  ctx.state.selectedVertexIndex = Number.isFinite(Number(snapshot.selectedVertexIndex)) ? Number(snapshot.selectedVertexIndex) : -1;
  ctx.state.activePresetId = ctx.sanitizeText(snapshot.activePresetId || ctx.state.activePresetId, 80).toLowerCase() || 'road';
  ctx.state.pendingDraw = snapshot.pendingDraw && typeof snapshot.pendingDraw === 'object'
    ? {
        type: ctx.sanitizeText(snapshot.pendingDraw.type || '', 20),
        points: Array.isArray(snapshot.pendingDraw.points) ? ctx.cloneJson(snapshot.pendingDraw.points) : []
      }
    : { type: '', points: [] };
  ctx.state.drawGesture = null;
  ctx.state.drawGestureCandidate = null;
  ctx.state.previewOpen = snapshot.previewOpen === true;
  ctx.state.previewNote = ctx.sanitizeText(snapshot.previewNote || '', 320);
  ctx.state.selectedBaseFeature = snapshot.selectedBaseFeature || null;
  ctx.state.workspaceSidebarView = ctx.state.selectedFeatureId ? 'selection' : ctx.state.workspaceFeatures.length ? 'presets' : 'start';
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
  return true;
}

export function resetWorkspace(ctx) {
  ctx.state.workspaceFeatures = [];
  ctx.state.selectedFeatureId = '';
  ctx.state.secondaryFeatureId = '';
  ctx.state.selectedVertexIndex = -1;
  ctx.state.selectedBaseFeature = null;
  ctx.state.pendingDraw = { type: '', points: [] };
  ctx.state.previewOpen = false;
  ctx.state.previewNote = '';
  ctx.state.workspaceSidebarView = 'start';
  ctx.state.helpContext = null;
  ctx.state.legacyDraft = null;
  ctx.state.snapPoint = null;
  ctx.state.drag = null;
  ctx.state.drawGesture = null;
  ctx.state.drawGestureCandidate = null;
  ctx.state.previewRefreshQueued = false;
  ctx.state.history.clear();
  pushHistory(ctx);
  ctx.refreshWorkspacePreview();
}

export function currentWorldKind(ctx) {
  if (typeof ctx.appCtx.isEnv === 'function' && ctx.appCtx.ENV) {
    if (ctx.appCtx.isEnv(ctx.appCtx.ENV.MOON)) return 'moon';
    if (ctx.appCtx.isEnv(ctx.appCtx.ENV.SPACE)) return 'space';
  }
  return ctx.appCtx.onMoon ? 'moon' : 'earth';
}

export function isEditorWorldSupported(ctx) {
  return currentWorldKind(ctx) === 'earth' && ctx.appCtx.gameStarted === true && ctx.appCtx.paused !== true;
}

export function readAdminState(ctx, user = ctx.state.authUser) {
  const entitlements = globalThis.__WE3D_ENTITLEMENTS__ || {};
  if (entitlements.isAdmin === true || String(entitlements.role || '').toLowerCase() === 'admin') return true;
  if (user && typeof user.getIdTokenResult === 'function') {
    user.getIdTokenResult(false).then((result) => {
      const claims = result?.claims || {};
      const isAdmin = claims.admin === true || String(claims.role || '').toLowerCase() === 'admin';
      if (ctx.state.userIsAdmin !== isAdmin) {
        ctx.state.userIsAdmin = isAdmin;
        updateSubmissionListeners(ctx);
        ctx.renderUi();
      }
    }).catch(() => {});
  }
  return false;
}

export function selectedFeatureValidation(ctx) {
  const feature = selectedFeature(ctx);
  if (!feature) return { valid: false, issues: [] };
  const result = validateOverlayFeature(feature);
  feature.validation = {
    valid: result.valid,
    issues: result.issues,
    updatedAtMs: Date.now()
  };
  return result;
}

export function applySubmissionMetadata(ctx, feature) {
  if (!feature || typeof feature !== 'object') return;
  const summary = buildSubmissionSummary(feature);
  if (!feature.submission || typeof feature.submission !== 'object') feature.submission = {};
  feature.submission.contributorNote = ctx.sanitizeText(ctx.state.previewNote || feature.submission.contributorNote || '', 320);
  feature.submission.generatedSummary = ctx.sanitizeText(summary.description || '', 240);
  feature.submission.changeSummary = ctx.sanitizeText(summary.highlights?.slice(0, 3).join(' • ') || '', 180);
  feature.submission.editIntent = ctx.sanitizeText(getOverlayPreset(feature.presetId).label || '', 120);
}

export function updateFeatureAtIndex(ctx, index, feature) {
  ctx.state.workspaceFeatures[index] = normalizeOverlayFeature(feature);
}

export function setSelectedFeature(ctx, featureId, options = {}) {
  ctx.state.selectedFeatureId = ctx.sanitizeText(featureId || '', 180);
  ctx.state.selectedVertexIndex = options.resetVertex === false ? ctx.state.selectedVertexIndex : -1;
  if (options.clearSecondary !== false) ctx.state.secondaryFeatureId = '';
  if (ctx.state.selectedFeatureId) {
    ctx.state.workspaceSidebarView = 'selection';
    const feature = ctx.state.workspaceFeatures.find((entry) => entry.featureId === ctx.state.selectedFeatureId) || null;
    if (feature) {
      ctx.state.activePresetId = ctx.sanitizeText(feature.presetId || ctx.state.activePresetId, 80).toLowerCase() || ctx.state.activePresetId;
      ctx.state.previewNote = ctx.sanitizeText(feature.submission?.contributorNote || '', 320);
    }
    selectedFeatureValidation(ctx);
  } else if (!ctx.state.workspaceFeatures.length) {
    ctx.state.workspaceSidebarView = 'start';
  }
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
}

export function addWorkspaceFeature(ctx, feature, options = {}) {
  const normalized = normalizeOverlayFeature(feature);
  const existingIndex = ctx.state.workspaceFeatures.findIndex((entry) => entry.featureId === normalized.featureId);
  if (existingIndex >= 0) updateFeatureAtIndex(ctx, existingIndex, normalized);
  else ctx.state.workspaceFeatures.push(normalized);
  if (options.select !== false) {
    ctx.state.selectedFeatureId = normalized.featureId;
    ctx.state.workspaceSidebarView = 'selection';
    ctx.state.activePresetId = ctx.sanitizeText(normalized.presetId || ctx.state.activePresetId, 80).toLowerCase() || ctx.state.activePresetId;
    ctx.state.previewNote = ctx.sanitizeText(normalized.submission?.contributorNote || ctx.state.previewNote || '', 320);
  }
  selectedFeatureValidation(ctx);
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
}

export function removeWorkspaceFeature(ctx, featureId) {
  ctx.state.workspaceFeatures = ctx.state.workspaceFeatures.filter((feature) => feature.featureId !== featureId);
  if (ctx.state.selectedFeatureId === featureId) {
    ctx.state.selectedFeatureId = ctx.state.workspaceFeatures[0]?.featureId || '';
    ctx.state.workspaceSidebarView = ctx.state.selectedFeatureId ? 'selection' : 'start';
    ctx.state.selectedVertexIndex = -1;
  }
  if (ctx.state.secondaryFeatureId === featureId) ctx.state.secondaryFeatureId = '';
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
}

export function updateSubmissionListeners(ctx) {
  ctx.state.ownUnsub?.();
  ctx.state.ownUnsub = null;
  ctx.state.moderationUnsub?.();
  ctx.state.moderationUnsub = null;
  ctx.state.ownFeatures = [];
  ctx.state.moderationQueue = [];
  if (!ctx.state.active) {
    ctx.renderUi();
    return;
  }

  ctx.state.ownUnsub = listenOwnOverlayFeatures((items) => {
    ctx.state.ownFeatures = items;
    ctx.renderUi();
  });
  if (ctx.state.userIsAdmin && overlayBackendReady()) {
    ctx.state.moderationUnsub = listenOverlayModerationQueue((items) => {
      ctx.state.moderationQueue = items;
      ctx.renderUi();
    });
  }
}

export async function saveSelectedFeature(ctx) {
  const feature = selectedFeature(ctx);
  if (!feature) {
    setStatus(ctx, 'Select a draft feature before saving.', 'error');
    return false;
  }
  applySubmissionMetadata(ctx, feature);
  const validation = validateOverlayFeature(feature);
  feature.validation = { valid: validation.valid, issues: validation.issues, updatedAtMs: Date.now() };
  feature.updatedBy = ctx.state.authUser?.uid || '';
  feature.updatedByName = ctx.sanitizeText(ctx.state.authUser?.displayName || ctx.state.authUser?.email || 'Explorer', 80);
  feature.createdBy = feature.createdBy || feature.updatedBy;
  feature.createdByName = feature.createdByName || feature.updatedByName;
  try {
    const saved = await createOrUpdateOverlayDraft(feature);
    addWorkspaceFeature(ctx, saved);
    updateSubmissionListeners(ctx);
    pushHistory(ctx);
    setStatus(
      ctx,
      saved.storageMode === 'local'
        ? `Draft ${overlayFeatureLabel(saved)} saved on this device. Sign in to sync it to the cloud.`
        : `Draft ${overlayFeatureLabel(saved)} saved.`,
      'ok'
    );
    return true;
  } catch (error) {
    setStatus(ctx, error?.message || 'Could not save overlay draft.', 'error');
    return false;
  }
}

export async function submitSelectedFeatureForReview(ctx) {
  let feature = selectedFeature(ctx);
  if (!feature) {
    setStatus(ctx, 'Select a draft feature before submitting.', 'error');
    return false;
  }
  applySubmissionMetadata(ctx, feature);
  const validation = validateOverlayFeature(feature);
  if (!validation.valid) {
    ctx.openPreviewDrawer();
    setStatus(ctx, 'Resolve validation errors before submitting.', 'error');
    return false;
  }
  if (feature.storageMode === 'local') {
    setStatus(ctx, 'This draft is only on this device. Sign in and save it to the cloud before submitting.', 'warning');
    return false;
  }
  if (!(await saveSelectedFeature(ctx))) return false;
  feature = selectedFeature(ctx);
  if (feature?.storageMode === 'local') {
    setStatus(ctx, 'This draft is only on this device. Sign in and save it to the cloud before submitting.', 'warning');
    return false;
  }
  try {
    const saved = await submitOverlayDraft(feature.featureId);
    addWorkspaceFeature(ctx, saved);
    pushHistory(ctx);
    setStatus(ctx, `Submitted ${overlayFeatureLabel(saved)} for moderation.`, 'ok');
    return true;
  } catch (error) {
    setStatus(ctx, error?.message || 'Could not submit overlay draft.', 'error');
    return false;
  }
}

export async function deleteSelectedFeature(ctx) {
  const feature = selectedFeature(ctx);
  if (!feature) {
    setStatus(ctx, 'No workspace feature is selected.', 'warning');
    return false;
  }
  const saved = ctx.state.ownFeatures.find((entry) => entry.featureId === feature.featureId);
  if (saved && feature.reviewState !== 'draft' && feature.reviewState !== 'needs_changes' && feature.reviewState !== 'rejected') {
    setStatus(ctx, 'Only draft or returned features can be removed.', 'error');
    return false;
  }
  try {
    if (saved) {
      await removeOverlayDraft(feature.featureId);
    }
    removeWorkspaceFeature(ctx, feature.featureId);
    updateSubmissionListeners(ctx);
    pushHistory(ctx);
    setStatus(ctx, `Removed ${overlayFeatureLabel(feature)}.`, 'ok');
    return true;
  } catch (error) {
    setStatus(ctx, error?.message || 'Could not remove overlay feature.', 'error');
    return false;
  }
}

export function focusFeatureInWorld(ctx, feature = selectedFeature(ctx)) {
  if (!feature || typeof ctx.appCtx.teleportToLocation !== 'function') return false;
  const center = ctx.featureWorldCenter(feature);
  ctx.appCtx.teleportToLocation(center.x, center.z);
  setStatus(ctx, `Centered on ${overlayFeatureLabel(feature)}.`, 'info');
  return true;
}
