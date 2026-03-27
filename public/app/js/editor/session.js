import { observeAuth } from '../../../js/auth-ui.js';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { currentMapReferenceWorldPosition } from '../map-coordinates.js?v=2';
import {
  OVERLAY_EDITOR_TOOLS,
  OVERLAY_REVIEW_STATES,
  normalizeOverlayTool
} from './config.js?v=1';
import {
  applyOverlayFieldValue,
  readOverlayFieldValue
} from './field-registry.js?v=1';
import {
  getOverlayPreset,
  getOverlayPresetAdvancedFieldGroups,
  getOverlayPresetFieldGroups,
  getOverlayPresetPickerGroups
} from './preset-registry.js?v=1';
import { pickBaseFeatureAtWorldPoint, createOverlayDraftFromBaseFeature, snapTargetsAroundPoint } from './base-features.js?v=1';
import {
  buildAxisAlignedWorldRing,
  cleanWorldLinePoints,
  cleanWorldRingPoints,
  distanceToWorldFeature,
  featureWorldCenter,
  geometryToWorldData,
  insertWorldGeometryVertex,
  mergeLineWorldGeometries,
  nearestSegmentIndex,
  nearestVertexIndex,
  projectPointToPolygonBoundary,
  removeWorldGeometryVertex,
  sampleSurfaceY,
  splitLineWorldGeometry,
  updateWorldGeometryVertex,
  worldDataToGeometry,
  worldToGeoPoint
} from './geometry.js?v=1';
import { EditorHistoryStack } from './history.js?v=1';
import { buildEditorHandles, buildOverlayFeatureObject, buildSnapMarker, disposeObject3D } from './renderer.js?v=2';
import {
  createClientFeatureId,
  createOverlayFeatureDraft,
  normalizeOverlayFeature,
  overlayFeatureLabel
} from './schema.js?v=1';
import {
  createOrUpdateOverlayDraft,
  listenOverlayModerationQueue,
  listenOwnOverlayFeatures,
  moderateOverlayDraft,
  overlayBackendReady,
  removeOverlayDraft,
  submitOverlayDraft
} from './store.js?v=1';
import {
  DEFAULT_EDITOR_HELP_TOPIC,
  buildHelpTopic,
  buildPresetHelpCard,
  buildSubmissionSummary,
  buildValidationIssueGuidance,
  listHelpTopics,
  listPresetAdvancedMappings,
  readableFeatureDescription
} from './help.js?v=1';
import { validateOverlayFeature } from './validation.js?v=1';

const EDITOR_RENDER_GROUP_NAME = 'overlayEditorWorkspace';
const EDITOR_HANDLE_GROUP_NAME = 'overlayEditorHandles';
const EDITOR_HELP_GROUP_NAME = 'overlayEditorHelpers';
const SNAP_DISTANCE = 5.5;
const VERTEX_DISTANCE = 3.4;
const FEATURE_SELECT_DISTANCE = 8.5;
const LEGACY_EDITOR_EDIT_TYPES = ['place_info', 'artifact_marker', 'building_note', 'interior_seed', 'photo_point'];

const state = {
  active: false,
  tab: 'workspace',
  authUser: null,
  userIsAdmin: false,
  tool: 'select',
  presetQuery: '',
  activePresetId: 'road',
  workspaceSidebarView: 'start',
  workspaceFeatures: [],
  selectedFeatureId: '',
  secondaryFeatureId: '',
  selectedVertexIndex: -1,
  selectedBaseFeature: null,
  pendingDraw: {
    type: '',
    points: []
  },
  previewOpen: false,
  previewNote: '',
  advancedMode: false,
  peekWorld: false,
  viewMode: '3d',
  helpOpen: false,
  helpTopic: DEFAULT_EDITOR_HELP_TOPIC,
  helpContext: null,
  moderationNote: '',
  status: {
    text: 'Overlay editor is ready.',
    tone: 'info'
  },
  ownFeatures: [],
  moderationQueue: [],
  ownUnsub: null,
  moderationUnsub: null,
  authUnsub: null,
  editorPerfRestore: null,
  editorRenderQualityRestore: '',
  drag: null,
  drawGesture: null,
  drawGestureCandidate: null,
  previewRefreshQueued: false,
  editorViewRestore: null,
  snapPoint: null,
  history: new EditorHistoryStack(100),
  refsBound: false,
  canvasBound: false,
  canvasElement: null,
  pointerWorld: null,
  legacyCapturedTarget: null,
  legacyDraft: null,
  workspaceSnapshot: null
};

const sceneState = {
  group: null,
  handleGroup: null,
  helperGroup: null
};

function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentReferenceWorldPoint() {
  const ref = currentMapReferenceWorldPosition();
  if (ref && Number.isFinite(ref.x) && Number.isFinite(ref.z)) {
    return { x: ref.x, z: ref.z, y: sampleSurfaceY(ref.x, ref.z, 0) };
  }
  const x = Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0;
  const z = Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0;
  return { x, z, y: sampleSurfaceY(x, z, 0) };
}

function legacyDraftPresetId(draft = {}) {
  const editType = sanitizeText(draft.editType || '', 40).toLowerCase();
  if (editType === 'building_note') return 'building';
  if (editType === 'interior_seed') return 'entrance';
  return 'poi_marker';
}

function legacyDraftTags(draft = {}) {
  const editType = sanitizeText(draft.editType || '', 40).toLowerCase();
  const tags = {};
  const title = sanitizeText(draft.title || '', 120);
  const note = sanitizeText(draft.note || '', 180);
  const category = sanitizeText(draft.category || '', 60).toLowerCase();
  if (title) tags.name = title;
  if (note) tags.description = note;
  if (editType === 'building_note') tags.building = 'yes';
  if (editType === 'interior_seed') tags.entrance = 'yes';
  if (category) {
    if (editType === 'photo_point') tags.tourism = category;
    else tags.note_category = category;
  }
  if (sanitizeText(draft.photoUrl || '', 240)) tags.image = sanitizeText(draft.photoUrl, 240);
  return tags;
}

function buildLegacyDraftPreviewFeature() {
  const target = state.legacyCapturedTarget || captureEditorHereTarget();
  if (!target) return null;
  const draft = state.legacyDraft || {};
  const editType = sanitizeText(draft.editType || 'photo_point', 40).toLowerCase();
  if (editType === 'building_note' && state.selectedBaseFeature?.geometryType === 'Polygon') {
    return normalizeOverlayFeature({
      ...createOverlayDraftFromBaseFeature(state.selectedBaseFeature),
      tags: {
        ...(state.selectedBaseFeature?.tags || {}),
        ...legacyDraftTags(draft)
      },
      summary: sanitizeText(draft.title || state.selectedBaseFeature?.displayName || 'Building overlay', 120)
    });
  }
  return createOverlayFeatureDraft({
    presetId: legacyDraftPresetId(draft),
    geometry: worldDataToGeometry({
      type: 'Point',
      coordinates: {
        x: target.x,
        z: target.z
      }
    }, 'Point'),
    tags: legacyDraftTags(draft),
    relations: editType === 'interior_seed'
      ? {
          indoorShell: {
            enabled: true,
            levels: [{ level: '0', label: 'Ground' }]
          }
        }
      : {},
    summary: sanitizeText(draft.title || 'Overlay preview', 120)
  });
}

function getRefs() {
  return {
    panel: document.getElementById('editorPanel'),
    title: document.getElementById('editorPanelTitle'),
    subline: document.getElementById('editorPanelSubline'),
    helpBtn: document.getElementById('editorHelpBtn'),
    peekBtn: document.getElementById('editorPeekBtn'),
    closeBtn: document.getElementById('editorCloseBtn'),
    floatItem: document.getElementById('fEditorMode'),
    status: document.getElementById('editorStatus'),
    toolbar: document.getElementById('editorToolbar'),
    workspaceTabBtn: document.getElementById('editorTabWorkspace'),
    mineTabBtn: document.getElementById('editorTabMine'),
    moderationTabBtn: document.getElementById('editorTabModeration'),
    sidebarPanel: document.getElementById('editorSidebarPanel'),
    sidebarStartBtn: document.getElementById('editorSidebarStartBtn'),
    sidebarPresetsBtn: document.getElementById('editorSidebarPresetsBtn'),
    sidebarSelectionBtn: document.getElementById('editorSidebarSelectionBtn'),
    sidebarStartView: document.getElementById('editorSidebarStartView'),
    sidebarPresetsView: document.getElementById('editorSidebarPresetsView'),
    sidebarSelectionView: document.getElementById('editorSidebarSelectionView'),
    onboardingCard: document.getElementById('editorOnboardingCard'),
    workspacePane: document.getElementById('editorWorkspacePane'),
    minePane: document.getElementById('editorMinePane'),
    moderationPane: document.getElementById('editorModerationPane'),
    presetSearchInput: document.getElementById('editorPresetSearchInput'),
    presetList: document.getElementById('editorPresetList'),
    presetSummary: document.getElementById('editorPresetSummary'),
    validationIssues: document.getElementById('editorValidationIssues'),
    workspaceFeatureList: document.getElementById('editorWorkspaceFeatureList'),
    viewportHint: document.getElementById('editorViewportHint'),
    viewportMeta: document.getElementById('editorViewportMeta'),
    inspectorPanel: document.getElementById('editorInspectorPanel'),
    selectedFeatureTitle: document.getElementById('editorSelectedFeatureTitle'),
    selectedFeatureMeta: document.getElementById('editorSelectedFeatureMeta'),
    geometryTypeValue: document.getElementById('editorGeometryTypeValue'),
    reviewStateBadge: document.getElementById('editorReviewStateBadge'),
    baseSelection: document.getElementById('editorBaseSelection'),
    cloneBaseBtn: document.getElementById('editorCloneBaseBtn'),
    centerFeatureBtn: document.getElementById('editorCenterFeatureBtn'),
    deleteFeatureBtn: document.getElementById('editorDeleteFeatureBtn'),
    selectedPresetCard: document.getElementById('editorSelectedPresetCard'),
    guidedFieldPanel: document.getElementById('editorGuidedFieldPanel'),
    advancedToggle: document.getElementById('editorAdvancedToggle'),
    advancedPanel: document.getElementById('editorAdvancedPanel'),
    advancedFieldPanel: document.getElementById('editorAdvancedFieldPanel'),
    advancedMapping: document.getElementById('editorAdvancedMapping'),
    tagList: document.getElementById('editorTagList'),
    newTagKeyInput: document.getElementById('editorNewTagKeyInput'),
    newTagValueInput: document.getElementById('editorNewTagValueInput'),
    addTagBtn: document.getElementById('editorAddTagBtn'),
    heightInput: document.getElementById('editorHeightInput'),
    levelsInput: document.getElementById('editorLevelsInput'),
    minHeightInput: document.getElementById('editorMinHeightInput'),
    roofShapeSelect: document.getElementById('editorRoofShapeSelect'),
    layerInput: document.getElementById('editorLayerInput'),
    bridgeCheckbox: document.getElementById('editorBridgeCheckbox'),
    tunnelCheckbox: document.getElementById('editorTunnelCheckbox'),
    surfaceInput: document.getElementById('editorSurfaceInput'),
    levelRefInput: document.getElementById('editorLevelRefInput'),
    buildingRefInput: document.getElementById('editorBuildingRefInput'),
    entrancesList: document.getElementById('editorEntrancesList'),
    addEntranceBtn: document.getElementById('editorAddEntranceBtn'),
    previewDrawer: document.getElementById('editorPreviewDrawer'),
    previewSummary: document.getElementById('editorPreviewSummary'),
    previewHighlights: document.getElementById('editorPreviewHighlights'),
    previewValidation: document.getElementById('editorPreviewValidation'),
    previewChecklist: document.getElementById('editorPreviewChecklist'),
    submissionNoteInput: document.getElementById('editorSubmissionNoteInput'),
    saveDraftBtn: document.getElementById('editorSaveDraftBtn'),
    previewBtn: document.getElementById('editorPreviewBtn'),
    submitBtn: document.getElementById('editorSubmitBtn'),
    ownFeatureList: document.getElementById('editorOwnFeatureList'),
    moderationStateFilter: document.getElementById('editorModerationStateFilter'),
    moderationSearchInput: document.getElementById('editorModerationSearchInput'),
    moderationList: document.getElementById('editorModerationList'),
    moderationDetail: document.getElementById('editorModerationDetail'),
    moderationNoteInput: document.getElementById('editorModerationNoteInput'),
    moderationApproveBtn: document.getElementById('editorModerationApproveBtn'),
    moderationNeedsBtn: document.getElementById('editorModerationNeedsBtn'),
    moderationRejectBtn: document.getElementById('editorModerationRejectBtn'),
    tutorial: document.getElementById('editorTutorialModal'),
    tutorialStartBtn: document.getElementById('editorTutorialStartBtn'),
    tutorialCancelBtn: document.getElementById('editorTutorialCancelBtn'),
    authBadge: document.getElementById('editorAuthBadge'),
    viewModeBtn: document.getElementById('editorViewModeBtn'),
    helpDrawer: document.getElementById('editorHelpDrawer'),
    helpDrawerTitle: document.getElementById('editorHelpDrawerTitle'),
    helpDrawerSummary: document.getElementById('editorHelpDrawerSummary'),
    helpTopicList: document.getElementById('editorHelpTopicList'),
    helpContent: document.getElementById('editorHelpContent'),
    helpCloseBtn: document.getElementById('editorHelpCloseBtn')
  };
}

function ensureSceneGroups() {
  if (typeof THREE === 'undefined' || !appCtx.scene) return null;
  if (!sceneState.group) {
    sceneState.group = new THREE.Group();
    sceneState.group.name = EDITOR_RENDER_GROUP_NAME;
  }
  if (!sceneState.handleGroup) {
    sceneState.handleGroup = new THREE.Group();
    sceneState.handleGroup.name = EDITOR_HANDLE_GROUP_NAME;
  }
  if (!sceneState.helperGroup) {
    sceneState.helperGroup = new THREE.Group();
    sceneState.helperGroup.name = EDITOR_HELP_GROUP_NAME;
  }
  if (sceneState.group.parent !== appCtx.scene) appCtx.scene.add(sceneState.group);
  if (sceneState.handleGroup.parent !== appCtx.scene) appCtx.scene.add(sceneState.handleGroup);
  if (sceneState.helperGroup.parent !== appCtx.scene) appCtx.scene.add(sceneState.helperGroup);
  return sceneState.group;
}

function clearGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const child = group.children[group.children.length - 1];
    group.remove(child);
    disposeObject3D(child);
  }
}

function selectedFeature() {
  return state.workspaceFeatures.find((feature) => feature.featureId === state.selectedFeatureId) || null;
}

function selectedModerationFeature() {
  const featureId = sanitizeText(state.selectedFeatureId, 180);
  return state.moderationQueue.find((feature) => feature.featureId === featureId) || null;
}

function setStatus(text, tone = 'info') {
  state.status = {
    text: sanitizeText(text || '', 220),
    tone: sanitizeText(tone || 'info', 16).toLowerCase()
  };
  renderUi();
}

function scheduleWorkspacePreviewRefresh() {
  if (!state.active) return;
  if (state.previewRefreshQueued) return;
  state.previewRefreshQueued = true;
  globalThis.requestAnimationFrame?.(() => {
    state.previewRefreshQueued = false;
    refreshWorkspacePreview();
  });
}

function normalizeWorkspaceSidebarView(viewId) {
  const normalized = sanitizeText(viewId || '', 24).toLowerCase();
  if (normalized === 'presets' || normalized === 'selection') return normalized;
  return 'start';
}

function workspaceStage(feature = selectedFeature()) {
  if (feature) return 'selected';
  if (state.selectedBaseFeature || state.pendingDraw.type || state.workspaceFeatures.length > 0) return 'drafting';
  return 'start';
}

function resolveWorkspaceSidebarView(feature = selectedFeature()) {
  const requested = normalizeWorkspaceSidebarView(state.workspaceSidebarView);
  if (requested === 'selection' && !feature) {
    return state.workspaceFeatures.length > 0 ? 'presets' : 'start';
  }
  return requested;
}

function setWorkspaceSidebarView(viewId) {
  state.workspaceSidebarView = normalizeWorkspaceSidebarView(viewId);
  renderUi();
}

function editorSnapshot() {
  return {
    workspaceFeatures: cloneJson(state.workspaceFeatures),
    selectedFeatureId: state.selectedFeatureId,
    secondaryFeatureId: state.secondaryFeatureId,
    selectedVertexIndex: state.selectedVertexIndex,
    activePresetId: state.activePresetId,
    pendingDraw: cloneJson(state.pendingDraw),
    previewOpen: state.previewOpen,
    previewNote: state.previewNote,
    selectedBaseFeature: cloneJson(state.selectedBaseFeature)
  };
}

function pushHistory() {
  state.history.push(editorSnapshot());
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot) return false;
  state.workspaceFeatures = Array.isArray(snapshot.workspaceFeatures) ? snapshot.workspaceFeatures.map((feature) => normalizeOverlayFeature(feature)) : [];
  state.selectedFeatureId = sanitizeText(snapshot.selectedFeatureId || '', 180);
  state.secondaryFeatureId = sanitizeText(snapshot.secondaryFeatureId || '', 180);
  state.selectedVertexIndex = Number.isFinite(Number(snapshot.selectedVertexIndex)) ? Number(snapshot.selectedVertexIndex) : -1;
  state.activePresetId = sanitizeText(snapshot.activePresetId || state.activePresetId, 80).toLowerCase() || 'road';
  state.pendingDraw = snapshot.pendingDraw && typeof snapshot.pendingDraw === 'object'
    ? { type: sanitizeText(snapshot.pendingDraw.type || '', 20), points: Array.isArray(snapshot.pendingDraw.points) ? cloneJson(snapshot.pendingDraw.points) : [] }
    : { type: '', points: [] };
  state.drawGesture = null;
  state.drawGestureCandidate = null;
  state.previewOpen = snapshot.previewOpen === true;
  state.previewNote = sanitizeText(snapshot.previewNote || '', 320);
  state.selectedBaseFeature = snapshot.selectedBaseFeature || null;
  state.workspaceSidebarView = state.selectedFeatureId ? 'selection' : state.workspaceFeatures.length ? 'presets' : 'start';
  refreshWorkspacePreview();
  renderUi();
  return true;
}

function resetWorkspace() {
  state.workspaceFeatures = [];
  state.selectedFeatureId = '';
  state.secondaryFeatureId = '';
  state.selectedVertexIndex = -1;
  state.selectedBaseFeature = null;
  state.pendingDraw = { type: '', points: [] };
  state.previewOpen = false;
  state.previewNote = '';
  state.workspaceSidebarView = 'start';
  state.helpContext = null;
  state.legacyDraft = null;
  state.snapPoint = null;
  state.drag = null;
  state.drawGesture = null;
  state.drawGestureCandidate = null;
  state.previewRefreshQueued = false;
  state.history.clear();
  pushHistory();
  refreshWorkspacePreview();
}

function currentWorldKind() {
  if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
    if (appCtx.isEnv(appCtx.ENV.MOON)) return 'moon';
    if (appCtx.isEnv(appCtx.ENV.SPACE)) return 'space';
  }
  return appCtx.onMoon ? 'moon' : 'earth';
}

function isEditorWorldSupported() {
  return currentWorldKind() === 'earth' && appCtx.gameStarted === true && appCtx.paused !== true;
}

function readAdminState(user = state.authUser) {
  const entitlements = globalThis.__WE3D_ENTITLEMENTS__ || {};
  if (entitlements.isAdmin === true || String(entitlements.role || '').toLowerCase() === 'admin') return true;
  if (user && typeof user.getIdTokenResult === 'function') {
    user.getIdTokenResult(false).then((result) => {
      const claims = result?.claims || {};
      const isAdmin = claims.admin === true || String(claims.role || '').toLowerCase() === 'admin';
      if (state.userIsAdmin !== isAdmin) {
        state.userIsAdmin = isAdmin;
        updateSubmissionListeners();
        renderUi();
      }
    }).catch(() => {});
  }
  return false;
}

function selectedFeatureValidation() {
  const feature = selectedFeature();
  if (!feature) return { valid: false, issues: [] };
  const result = validateOverlayFeature(feature);
  feature.validation = {
    valid: result.valid,
    issues: result.issues,
    updatedAtMs: Date.now()
  };
  return result;
}

function applySubmissionMetadata(feature) {
  if (!feature || typeof feature !== 'object') return;
  const summary = buildSubmissionSummary(feature);
  if (!feature.submission || typeof feature.submission !== 'object') feature.submission = {};
  feature.submission.contributorNote = sanitizeText(state.previewNote || feature.submission.contributorNote || '', 320);
  feature.submission.generatedSummary = sanitizeText(summary.description || '', 240);
  feature.submission.changeSummary = sanitizeText(summary.highlights?.slice(0, 3).join(' • ') || '', 180);
  feature.submission.editIntent = sanitizeText(getOverlayPreset(feature.presetId).label || '', 120);
}

function updateFeatureAtIndex(index, feature) {
  state.workspaceFeatures[index] = normalizeOverlayFeature(feature);
}

function setSelectedFeature(featureId, options = {}) {
  state.selectedFeatureId = sanitizeText(featureId || '', 180);
  state.selectedVertexIndex = options.resetVertex === false ? state.selectedVertexIndex : -1;
  if (options.clearSecondary !== false) state.secondaryFeatureId = '';
  if (state.selectedFeatureId) {
    state.workspaceSidebarView = 'selection';
    const feature = state.workspaceFeatures.find((entry) => entry.featureId === state.selectedFeatureId) || null;
    if (feature) {
      state.activePresetId = sanitizeText(feature.presetId || state.activePresetId, 80).toLowerCase() || state.activePresetId;
      state.previewNote = sanitizeText(feature.submission?.contributorNote || '', 320);
    }
    selectedFeatureValidation();
  } else if (!state.workspaceFeatures.length) {
    state.workspaceSidebarView = 'start';
  }
  refreshWorkspacePreview();
  renderUi();
}

function addWorkspaceFeature(feature, options = {}) {
  const normalized = normalizeOverlayFeature(feature);
  const existingIndex = state.workspaceFeatures.findIndex((entry) => entry.featureId === normalized.featureId);
  if (existingIndex >= 0) updateFeatureAtIndex(existingIndex, normalized);
  else state.workspaceFeatures.push(normalized);
  if (options.select !== false) {
    state.selectedFeatureId = normalized.featureId;
    state.workspaceSidebarView = 'selection';
    state.activePresetId = sanitizeText(normalized.presetId || state.activePresetId, 80).toLowerCase() || state.activePresetId;
    state.previewNote = sanitizeText(normalized.submission?.contributorNote || state.previewNote || '', 320);
  }
  selectedFeatureValidation();
  refreshWorkspacePreview();
  renderUi();
}

function removeWorkspaceFeature(featureId) {
  state.workspaceFeatures = state.workspaceFeatures.filter((feature) => feature.featureId !== featureId);
  if (state.selectedFeatureId === featureId) {
    state.selectedFeatureId = state.workspaceFeatures[0]?.featureId || '';
    state.workspaceSidebarView = state.selectedFeatureId ? 'selection' : 'start';
    state.selectedVertexIndex = -1;
  }
  if (state.secondaryFeatureId === featureId) state.secondaryFeatureId = '';
  refreshWorkspacePreview();
  renderUi();
}

function featureSelectHit(worldPoint) {
  let best = null;
  state.workspaceFeatures.forEach((feature) => {
    const hit = distanceToWorldFeature(feature, worldPoint, { maxDistance: FEATURE_SELECT_DISTANCE });
    if (!hit || !Number.isFinite(hit.distance) || hit.distance > FEATURE_SELECT_DISTANCE) return;
    if (!best || hit.distance < best.distance) {
      best = {
        feature,
        distance: hit.distance,
        target: hit.target,
        segmentIndex: hit.segmentIndex ?? -1
      };
    }
  });
  return best;
}

function snapWorldPoint(worldPoint, options = {}) {
  const allowBase = options.allowBase !== false;
  const allowSelected = options.allowSelected !== false;
  let best = null;
  if (allowBase) {
    const vertexTarget = snapTargetsAroundPoint(worldPoint, SNAP_DISTANCE)[0];
    if (vertexTarget) {
      best = {
        point: vertexTarget.point,
        distance: vertexTarget.distance,
        kind: 'vertex'
      };
    }
    const baseHit = pickBaseFeatureAtWorldPoint(worldPoint, SNAP_DISTANCE);
    if (baseHit && (!best || baseHit.distance < best.distance)) {
      best = {
        point: baseHit.target || worldPoint,
        distance: baseHit.distance,
        kind: 'edge'
      };
    }
  }
  if (allowSelected) {
    const feature = selectedFeature();
    if (feature) {
      const worldGeometry = geometryToWorldData(feature.geometry || {});
      const points = worldGeometry.type === 'Point'
        ? [worldGeometry.coordinates]
        : worldGeometry.type === 'LineString'
          ? worldGeometry.coordinates || []
          : worldGeometry.coordinates?.[0] || [];
      const nearestVertex = nearestVertexIndex(points, worldPoint, SNAP_DISTANCE);
      if (nearestVertex >= 0) {
        const point = points[nearestVertex];
        const dist = Math.hypot(point.x - worldPoint.x, point.z - worldPoint.z);
        if (!best || dist < best.distance) {
          best = { point, distance: dist, kind: 'vertex' };
        }
      }
      const nearestSegment = nearestSegmentIndex(points, worldPoint, feature.geometryType === 'Polygon', SNAP_DISTANCE);
      if (nearestSegment.index >= 0 && nearestSegment.point && (!best || nearestSegment.distance < best.distance)) {
        best = {
          point: { x: nearestSegment.point.x, z: nearestSegment.point.z },
          distance: nearestSegment.distance,
          kind: 'edge'
        };
      }
    }
  }
  state.snapPoint = best?.point || null;
  return state.snapPoint || worldPoint;
}

function worldPointFromPointerEvent(event) {
  if (typeof THREE === 'undefined' || !appCtx.camera || !appCtx.renderer?.domElement) return null;
  const rect = appCtx.renderer.domElement.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, appCtx.camera);
  const origin = raycaster.ray.origin;
  const direction = raycaster.ray.direction;
  if (Math.abs(direction.y) < 1e-5) return null;
  let x = 0;
  let z = 0;
  for (let i = 0; i < 3; i += 1) {
    const targetY = i === 0 ? 0 : sampleSurfaceY(x, z, 0);
    const t = (targetY - origin.y) / direction.y;
    x = origin.x + direction.x * t;
    z = origin.z + direction.z * t;
  }
  return {
    x,
    z,
    y: sampleSurfaceY(x, z, 0)
  };
}

function renderPendingDraw(group) {
  if (!state.pendingDraw.type || !state.pendingDraw.points.length) return;
  const previewFeature = createOverlayFeatureDraft({
    featureId: createClientFeatureId('preview'),
    presetId: state.activePresetId,
    geometry: worldDataToGeometry(
      state.pendingDraw.type === 'Point'
        ? { type: 'Point', coordinates: state.pendingDraw.points[0] }
        : state.pendingDraw.type === 'LineString'
          ? { type: 'LineString', coordinates: state.pendingDraw.points }
          : { type: 'Polygon', coordinates: [state.pendingDraw.points] },
      state.pendingDraw.type
    )
  });
  const previewObject = buildOverlayFeatureObject(previewFeature, { color: '#f8fafc', yBias: 0.28, pointRadius: 0.26 });
  if (previewObject) group.add(previewObject);
}

function refreshWorkspacePreview() {
  ensureSceneGroups();
  clearGroup(sceneState.group);
  clearGroup(sceneState.handleGroup);
  clearGroup(sceneState.helperGroup);
  appCtx.overlayDraftPreviewFeatures = state.active ? state.workspaceFeatures.slice() : [];

  if (!state.active || state.tab !== 'workspace') return;
  state.workspaceFeatures.forEach((feature) => {
    const color = feature.featureId === state.selectedFeatureId ? '#fde047' : getOverlayPreset(feature.presetId).color;
    const object = buildOverlayFeatureObject(feature, { color, pointRadius: 0.28 });
    if (object) sceneState.group.add(object);
  });
  if (state.selectedBaseFeature) {
    const preview = createOverlayDraftFromBaseFeature(state.selectedBaseFeature);
    const baseObject = buildOverlayFeatureObject(preview, { color: '#38bdf8', yBias: 0.32, pointRadius: 0.24 });
    if (baseObject) sceneState.helperGroup.add(baseObject);
  }
  const feature = selectedFeature();
  if (feature) {
    const handles = buildEditorHandles(feature, { activeVertexIndex: state.selectedVertexIndex });
    if (handles) sceneState.handleGroup.add(handles);
  }
  renderPendingDraw(sceneState.helperGroup);
  if (state.snapPoint) {
    const snapMarker = buildSnapMarker(state.snapPoint);
    if (snapMarker) sceneState.helperGroup.add(snapMarker);
  }
}

function openPreviewDrawer() {
  const feature = selectedFeature();
  if (!feature) {
    setStatus('Select or draw an overlay feature before previewing.', 'error');
    return false;
  }
  applySubmissionMetadata(feature);
  const result = selectedFeatureValidation();
  state.previewOpen = true;
  if (!result.valid) {
    setStatus('Preview opened with validation issues that need attention before publish.', 'warning');
  } else {
    setStatus('Submission preview is ready.', 'ok');
  }
  renderUi();
  return true;
}

function closePreviewDrawer() {
  state.previewOpen = false;
  renderUi();
}

function captureEditorHereTarget() {
  const world = currentReferenceWorldPoint();
  const geo = worldToGeoPoint(world.x, world.z);
  state.legacyCapturedTarget = {
    kind: 'world',
    x: world.x,
    y: world.y,
    z: world.z,
    lat: geo.lat,
    lon: geo.lon
  };
  return cloneJson(state.legacyCapturedTarget);
}

function workspaceSnapshotHalfExtentWorld(options = {}) {
  const loadConfig = appCtx._continuousWorldVisibleLoadConfig || {};
  const buildingFarLoadDistance = Number(loadConfig.buildingFarLoadDistance || 0);
  const featureRadiusWorld =
    Math.abs(Number(loadConfig.featureRadius || 0)) * Math.max(1, Number(appCtx.SCALE) || 1);
  const requestedHalfExtent = Number(options.halfExtentWorld || 0);
  return Math.round(Math.max(
    1800,
    Math.min(
      6400,
      Math.max(
        requestedHalfExtent,
        buildingFarLoadDistance,
        featureRadiusWorld * 0.92
      )
    )
  ));
}

function captureEditorWorkspaceSnapshot(options = {}) {
  const center = options.center && Number.isFinite(options.center.x) && Number.isFinite(options.center.z)
    ? {
        x: Number(options.center.x),
        y: Number.isFinite(options.center.y) ? Number(options.center.y) : sampleSurfaceY(Number(options.center.x), Number(options.center.z), 0),
        z: Number(options.center.z)
      }
    : currentReferenceWorldPoint();
  const halfExtentWorld = workspaceSnapshotHalfExtentWorld(options);
  const bounds = {
    minX: center.x - halfExtentWorld,
    maxX: center.x + halfExtentWorld,
    minZ: center.z - halfExtentWorld,
    maxZ: center.z + halfExtentWorld
  };
  const northwest = worldToGeoPoint(bounds.minX, bounds.minZ);
  const northeast = worldToGeoPoint(bounds.maxX, bounds.minZ);
  const southwest = worldToGeoPoint(bounds.minX, bounds.maxZ);
  const southeast = worldToGeoPoint(bounds.maxX, bounds.maxZ);
  state.workspaceSnapshot = {
    centerWorld: { x: center.x, y: center.y, z: center.z },
    halfExtentWorld,
    widthWorld: halfExtentWorld * 2,
    heightWorld: halfExtentWorld * 2,
    boundsWorld: bounds,
    boundsGeo: {
      northwest,
      northeast,
      southwest,
      southeast
    },
    capturedAtMs: performance.now()
  };
  return cloneJson(state.workspaceSnapshot);
}

function setEditorDraft(input = {}) {
  state.legacyDraft = {
    editType: sanitizeText(input.editType || 'photo_point', 40).toLowerCase(),
    title: sanitizeText(input.title || '', 120),
    note: sanitizeText(input.note || '', 180),
    category: sanitizeText(input.category || '', 60).toLowerCase(),
    photoUrl: sanitizeText(input.photoUrl || '', 240)
  };
  return cloneJson(state.legacyDraft);
}

function previewEditorDraft() {
  if (!state.active) openEditorSession({ skipTutorial: true });
  if (!state.legacyCapturedTarget) captureEditorHereTarget();
  const feature = buildLegacyDraftPreviewFeature();
  if (!feature) {
    setStatus('Could not create a preview feature for this draft.', 'error');
    return null;
  }
  addWorkspaceFeature(feature);
  openPreviewDrawer();
  refreshWorkspacePreview();
  return feature;
}

function finishPendingDraw() {
  const preset = getOverlayPreset(state.activePresetId);
  const points = state.pendingDraw.type === 'Polygon'
    ? cleanWorldRingPoints(state.pendingDraw.points)
    : cleanWorldLinePoints(state.pendingDraw.points);
  if (state.pendingDraw.type === 'Point' && points.length >= 1) {
    const feature = createOverlayFeatureDraft({
      presetId: state.activePresetId,
      geometry: worldDataToGeometry({ type: 'Point', coordinates: points[0] }, 'Point')
    });
    addWorkspaceFeature(feature);
    pushHistory();
  } else if (state.pendingDraw.type === 'LineString' && points.length >= 2) {
    const feature = createOverlayFeatureDraft({
      presetId: state.activePresetId,
      geometry: worldDataToGeometry({ type: 'LineString', coordinates: points }, 'LineString')
    });
    addWorkspaceFeature(feature);
    pushHistory();
  } else if (state.pendingDraw.type === 'Polygon' && points.length >= 3) {
    const feature = createOverlayFeatureDraft({
      presetId: state.activePresetId,
      geometry: worldDataToGeometry({ type: 'Polygon', coordinates: [points] }, 'Polygon')
    });
    addWorkspaceFeature(feature);
    pushHistory();
  } else {
    setStatus(`${preset.label} needs more geometry before it can be created.`, 'warning');
    return false;
  }
  state.pendingDraw = { type: '', points: [] };
  setStatus(`${preset.label} draft created.`, 'ok');
  refreshWorkspacePreview();
  renderUi();
  return true;
}

function setTool(toolId) {
  state.tool = normalizeOverlayTool(toolId);
  state.pendingDraw.type = '';
  state.pendingDraw.points = [];
  state.drawGesture = null;
  state.drawGestureCandidate = null;
  state.selectedVertexIndex = -1;
  closePreviewDrawer();
  refreshWorkspacePreview();
  renderUi();
}

function setActivePreset(presetId) {
  state.activePresetId = sanitizeText(presetId || state.activePresetId, 80).toLowerCase() || 'road';
  if (!state.selectedFeatureId) state.workspaceSidebarView = 'presets';
  if (state.tool === 'draw_point' || state.tool === 'draw_line' || state.tool === 'draw_polygon') {
    state.pendingDraw.type = getOverlayPreset(state.activePresetId).geometryType;
  }
  renderUi();
}

function setToolForPreset(presetId) {
  setActivePreset(presetId);
  const preset = getOverlayPreset(presetId);
  if (preset.geometryType === 'Point') setTool('draw_point');
  else if (preset.geometryType === 'LineString') setTool('draw_line');
  else setTool('draw_polygon');
}

function presetDrawBehavior(preset = getOverlayPreset(state.activePresetId)) {
  const featureClass = sanitizeText(preset?.featureClass || '', 40).toLowerCase();
  if (featureClass === 'building' || featureClass === 'parking' || preset?.id === 'building') {
    return 'drag_box';
  }
  if (featureClass === 'road' || featureClass === 'footway' || featureClass === 'cycleway' || featureClass === 'railway' || featureClass === 'corridor' || featureClass === 'stairs') {
    return 'drag_segment';
  }
  return 'click_vertices';
}

function previewDragGeometry(anchor, current, geometryType, behavior) {
  if (!anchor || !current) return [];
  if (geometryType === 'LineString' && behavior === 'drag_segment') {
    return cleanWorldLinePoints([anchor, current]);
  }
  if (geometryType === 'Polygon' && behavior === 'drag_box') {
    return buildAxisAlignedWorldRing(anchor, current);
  }
  return [];
}

function projectEntranceToBuilding(feature, worldPoint) {
  const worldGeometry = geometryToWorldData(feature.geometry || {});
  const ring = worldGeometry.type === 'Polygon' ? worldGeometry.coordinates?.[0] || [] : [];
  if (ring.length < 3) return null;
  return projectPointToPolygonBoundary(worldPoint, ring);
}

function updateSubmissionListeners() {
  state.ownUnsub?.();
  state.ownUnsub = null;
  state.moderationUnsub?.();
  state.moderationUnsub = null;
  state.ownFeatures = [];
  state.moderationQueue = [];
  if (!state.active) {
    renderUi();
    return;
  }

  state.ownUnsub = listenOwnOverlayFeatures((items) => {
    state.ownFeatures = items;
    renderUi();
  });
  if (state.userIsAdmin && overlayBackendReady()) {
    state.moderationUnsub = listenOverlayModerationQueue((items) => {
      state.moderationQueue = items;
      renderUi();
    });
  }
}

async function saveSelectedFeature() {
  const feature = selectedFeature();
  if (!feature) {
    setStatus('Select a draft feature before saving.', 'error');
    return false;
  }
  applySubmissionMetadata(feature);
  const validation = validateOverlayFeature(feature);
  feature.validation = { valid: validation.valid, issues: validation.issues, updatedAtMs: Date.now() };
  feature.updatedBy = state.authUser?.uid || '';
  feature.updatedByName = sanitizeText(state.authUser?.displayName || state.authUser?.email || 'Explorer', 80);
  feature.createdBy = feature.createdBy || feature.updatedBy;
  feature.createdByName = feature.createdByName || feature.updatedByName;
  try {
    const saved = await createOrUpdateOverlayDraft(feature);
    addWorkspaceFeature(saved);
    updateSubmissionListeners();
    pushHistory();
    setStatus(
      saved.storageMode === 'local'
        ? `Draft ${overlayFeatureLabel(saved)} saved on this device. Sign in to sync it to the cloud.`
        : `Draft ${overlayFeatureLabel(saved)} saved.`,
      'ok'
    );
    return true;
  } catch (error) {
    setStatus(error?.message || 'Could not save overlay draft.', 'error');
    return false;
  }
}

async function submitSelectedFeatureForReview() {
  let feature = selectedFeature();
  if (!feature) {
    setStatus('Select a draft feature before submitting.', 'error');
    return false;
  }
  applySubmissionMetadata(feature);
  const validation = validateOverlayFeature(feature);
  if (!validation.valid) {
    openPreviewDrawer();
    setStatus('Resolve validation errors before submitting.', 'error');
    return false;
  }
  if (feature.storageMode === 'local') {
    setStatus('This draft is only on this device. Sign in and save it to the cloud before submitting.', 'warning');
    return false;
  }
  if (!(await saveSelectedFeature())) return false;
  feature = selectedFeature();
  if (feature?.storageMode === 'local') {
    setStatus('This draft is only on this device. Sign in and save it to the cloud before submitting.', 'warning');
    return false;
  }
  try {
    const saved = await submitOverlayDraft(feature.featureId);
    addWorkspaceFeature(saved);
    pushHistory();
    setStatus(`Submitted ${overlayFeatureLabel(saved)} for moderation.`, 'ok');
    return true;
  } catch (error) {
    setStatus(error?.message || 'Could not submit overlay draft.', 'error');
    return false;
  }
}

async function deleteSelectedFeature() {
  const feature = selectedFeature();
  if (!feature) {
    setStatus('No workspace feature is selected.', 'warning');
    return false;
  }
  const saved = state.ownFeatures.find((entry) => entry.featureId === feature.featureId);
  if (saved && feature.reviewState !== 'draft' && feature.reviewState !== 'needs_changes' && feature.reviewState !== 'rejected') {
    setStatus('Only draft or returned features can be removed.', 'error');
    return false;
  }
  try {
    if (saved) {
      await removeOverlayDraft(feature.featureId);
    }
    removeWorkspaceFeature(feature.featureId);
    updateSubmissionListeners();
    pushHistory();
    setStatus(`Removed ${overlayFeatureLabel(feature)}.`, 'ok');
    return true;
  } catch (error) {
    setStatus(error?.message || 'Could not remove overlay feature.', 'error');
    return false;
  }
}

function focusFeatureInWorld(feature = selectedFeature()) {
  if (!feature || typeof appCtx.teleportToLocation !== 'function') return false;
  const center = featureWorldCenter(feature);
  appCtx.teleportToLocation(center.x, center.z);
  setStatus(`Centered on ${overlayFeatureLabel(feature)}.`, 'info');
  return true;
}

function handleSelectTool(worldPoint, event) {
  const feature = selectedFeature();
  if (feature) {
    const worldGeometry = geometryToWorldData(feature.geometry || {});
    const points = worldGeometry.type === 'Point'
      ? [worldGeometry.coordinates]
      : worldGeometry.type === 'LineString'
        ? worldGeometry.coordinates || []
        : worldGeometry.coordinates?.[0] || [];
    const vertexIndex = nearestVertexIndex(points, worldPoint, VERTEX_DISTANCE);
    if (vertexIndex >= 0) {
      state.selectedVertexIndex = vertexIndex;
      state.drag = {
        featureId: feature.featureId,
        vertexIndex
      };
      refreshWorkspacePreview();
      renderUi();
      return true;
    }
  }

  const workspaceHit = featureSelectHit(worldPoint);
  if (workspaceHit) {
    if ((event.metaKey || event.ctrlKey) && feature && feature.featureId !== workspaceHit.feature.featureId) {
      state.secondaryFeatureId = workspaceHit.feature.featureId;
    } else {
      state.secondaryFeatureId = '';
      state.selectedBaseFeature = null;
      setSelectedFeature(workspaceHit.feature.featureId);
    }
    refreshWorkspacePreview();
    renderUi();
    return true;
  }

  const baseFeature = pickBaseFeatureAtWorldPoint(worldPoint, FEATURE_SELECT_DISTANCE);
  state.selectedBaseFeature = baseFeature;
  state.selectedFeatureId = '';
  state.selectedVertexIndex = -1;
  refreshWorkspacePreview();
  renderUi();
  return !!baseFeature;
}

function handleDrawTool(worldPoint) {
  const preset = getOverlayPreset(state.activePresetId);
  const geometryType = preset.geometryType;
  const snapped = snapWorldPoint(worldPoint);
  if (geometryType === 'Point') {
    state.pendingDraw = { type: 'Point', points: [snapped] };
    return finishPendingDraw();
  }
  if (state.pendingDraw.type !== geometryType) {
    state.pendingDraw = { type: geometryType, points: [] };
  }
  if (geometryType === 'Polygon' && state.pendingDraw.points.length >= 3) {
    const first = state.pendingDraw.points[0];
    if (Math.hypot(first.x - snapped.x, first.z - snapped.z) <= SNAP_DISTANCE) {
      return finishPendingDraw();
    }
  }
  state.pendingDraw.points.push(snapped);
  refreshWorkspacePreview();
  renderUi();
  return true;
}

function handleGeometryEditTool(worldPoint) {
  const feature = selectedFeature();
  if (!feature) {
    setStatus('Select a workspace feature first.', 'warning');
    return false;
  }
  const worldGeometry = geometryToWorldData(feature.geometry || {});
  const points = worldGeometry.type === 'Point'
    ? [worldGeometry.coordinates]
    : worldGeometry.type === 'LineString'
      ? worldGeometry.coordinates || []
      : worldGeometry.coordinates?.[0] || [];
  const snapped = snapWorldPoint(worldPoint);

  if (state.tool === 'add_vertex') {
    const segment = nearestSegmentIndex(points, snapped, feature.geometryType === 'Polygon', FEATURE_SELECT_DISTANCE);
    if (segment.index < 0) return false;
    const updated = insertWorldGeometryVertex(worldGeometry, segment.index, snapped);
    feature.geometry = worldDataToGeometry(updated, feature.geometryType);
    addWorkspaceFeature(feature);
    pushHistory();
    setStatus('Vertex inserted.', 'ok');
    return true;
  }

  if (state.tool === 'delete_vertex') {
    const vertexIndex = nearestVertexIndex(points, snapped, FEATURE_SELECT_DISTANCE);
    if (vertexIndex < 0) return false;
    const updated = removeWorldGeometryVertex(worldGeometry, vertexIndex);
    feature.geometry = worldDataToGeometry(updated, feature.geometryType);
    addWorkspaceFeature(feature);
    pushHistory();
    setStatus('Vertex removed.', 'ok');
    return true;
  }

  if (state.tool === 'split_line' && feature.geometryType === 'LineString') {
    const segment = nearestSegmentIndex(points, snapped, false, FEATURE_SELECT_DISTANCE);
    if (segment.index < 0) return false;
    const split = splitLineWorldGeometry(worldGeometry, segment.index, snapped);
    if (!split) return false;
    const first = normalizeOverlayFeature({
      ...cloneJson(feature),
      geometry: worldDataToGeometry(split[0], 'LineString'),
      version: 1,
      featureId: feature.featureId
    });
    const second = createOverlayFeatureDraft({
      ...cloneJson(feature),
      featureId: createClientFeatureId('split'),
      geometry: worldDataToGeometry(split[1], 'LineString')
    });
    const index = state.workspaceFeatures.findIndex((entry) => entry.featureId === feature.featureId);
    if (index >= 0) {
      state.workspaceFeatures.splice(index, 1, first, second);
      state.selectedFeatureId = second.featureId;
      pushHistory();
      refreshWorkspacePreview();
      renderUi();
      setStatus('Line split into two overlay features.', 'ok');
      return true;
    }
  }
  return false;
}

function mergeSelectedFeatures() {
  const feature = selectedFeature();
  const other = state.workspaceFeatures.find((entry) => entry.featureId === state.secondaryFeatureId) || null;
  if (!feature || !other) {
    setStatus('Select two compatible overlay line features to merge.', 'warning');
    return false;
  }
  if (feature.geometryType !== 'LineString' || other.geometryType !== 'LineString' || feature.presetId !== other.presetId) {
    setStatus('Only compatible line overlays can be merged in this pass.', 'error');
    return false;
  }
  const mergedWorld = mergeLineWorldGeometries(
    geometryToWorldData(feature.geometry || {}),
    geometryToWorldData(other.geometry || {})
  );
  if (!mergedWorld) {
    setStatus('Those line features do not share a mergeable endpoint.', 'warning');
    return false;
  }
  feature.geometry = worldDataToGeometry(mergedWorld, 'LineString');
  addWorkspaceFeature(feature);
  removeWorkspaceFeature(other.featureId);
  state.secondaryFeatureId = '';
  pushHistory();
  setStatus('Overlay lines merged.', 'ok');
  return true;
}

function addEntranceAtCurrentPoint() {
  const feature = selectedFeature();
  if (!feature || feature.featureClass !== 'building') {
    setStatus('Select a building overlay before adding an entrance.', 'warning');
    return false;
  }
  const point = state.snapPoint || state.pointerWorld;
  if (!point) {
    setStatus('Move the pointer near the building wall to place an entrance.', 'warning');
    return false;
  }
  const projected = projectEntranceToBuilding(feature, point);
  if (!projected) {
    setStatus('Could not project that entrance onto the building shell.', 'warning');
    return false;
  }
  const anchorGeometry = worldDataToGeometry({ type: 'Point', coordinates: projected.point }, 'Point');
  const entrance = {
    lat: anchorGeometry.coordinates.lat,
    lon: anchorGeometry.coordinates.lon,
    label: `Entrance ${feature.threeD?.entrances?.length ? feature.threeD.entrances.length + 1 : 1}`,
    kind: 'entrance',
    elevation: 0,
    yaw: projected.yaw
  };
  feature.threeD.entrances = Array.isArray(feature.threeD?.entrances) ? feature.threeD.entrances.concat([entrance]) : [entrance];
  addWorkspaceFeature(feature);
  pushHistory();
  setStatus('Entrance added to building overlay.', 'ok');
  return true;
}

function handleCanvasPointerDown(event) {
  if (!state.active || state.tab !== 'workspace' || event.button !== 0) return;
  const worldPoint = worldPointFromPointerEvent(event);
  if (!worldPoint) return;
  state.pointerWorld = worldPoint;
  const snapped = snapWorldPoint(worldPoint);
  if (state.tool === 'select') {
    handleSelectTool(snapped, event);
    return;
  }
  if (state.tool === 'draw_point') {
    handleDrawTool(snapped);
    return;
  }
  if (state.tool === 'draw_line' || state.tool === 'draw_polygon') {
    const preset = getOverlayPreset(state.activePresetId);
    state.drawGestureCandidate = {
      anchor: snapped,
      geometryType: preset.geometryType,
      behavior: presetDrawBehavior(preset)
    };
    return;
  }
  handleGeometryEditTool(snapped);
}

function handleCanvasPointerMove(event) {
  if (!state.active || state.tab !== 'workspace') return;
  const worldPoint = worldPointFromPointerEvent(event);
  if (!worldPoint) return;
  state.pointerWorld = worldPoint;
  const snapped = snapWorldPoint(worldPoint);
  if (state.drag?.featureId && Number.isFinite(state.drag.vertexIndex)) {
    const feature = state.workspaceFeatures.find((entry) => entry.featureId === state.drag.featureId);
    if (feature) {
      const worldGeometry = geometryToWorldData(feature.geometry || {});
      const updated = updateWorldGeometryVertex(worldGeometry, state.drag.vertexIndex, snapped);
      feature.geometry = worldDataToGeometry(updated, feature.geometryType);
      addWorkspaceFeature(feature);
    }
    scheduleWorkspacePreviewRefresh();
    return;
  }
  if (state.drawGestureCandidate?.anchor && state.drawGestureCandidate.behavior !== 'click_vertices') {
    const distance = Math.hypot(
      snapped.x - state.drawGestureCandidate.anchor.x,
      snapped.z - state.drawGestureCandidate.anchor.z
    );
    if (distance > 1.2) {
      state.drawGesture = cloneJson(state.drawGestureCandidate);
      state.pendingDraw = {
        type: state.drawGesture.geometryType,
        points: previewDragGeometry(
          state.drawGesture.anchor,
          snapped,
          state.drawGesture.geometryType,
          state.drawGesture.behavior
        )
      };
    }
  } else if (state.drawGesture?.anchor) {
    state.pendingDraw = {
      type: state.drawGesture.geometryType,
      points: previewDragGeometry(
        state.drawGesture.anchor,
        snapped,
        state.drawGesture.geometryType,
        state.drawGesture.behavior
      )
    };
  }
  scheduleWorkspacePreviewRefresh();
}

function handleCanvasPointerUp(event) {
  if (state.drag) {
    state.drag = null;
    pushHistory();
    refreshWorkspacePreview();
    return;
  }
  const worldPoint = event ? worldPointFromPointerEvent(event) : null;
  const snapped = worldPoint ? snapWorldPoint(worldPoint) : null;
  if (state.drawGesture?.anchor) {
    const previewPoints = Array.isArray(state.pendingDraw.points) ? state.pendingDraw.points.slice() : [];
    state.drawGesture = null;
    state.drawGestureCandidate = null;
    if (previewPoints.length) {
      return finishPendingDraw();
    }
  }
  if (state.drawGestureCandidate?.anchor && snapped) {
    const clickPoint = snapped;
    state.drawGestureCandidate = null;
    return handleDrawTool(clickPoint);
  }
  state.drawGestureCandidate = null;
}

function handleWindowKeyDown(event) {
  if (!state.active) return;
  const target = event.target;
  const editingText = target instanceof HTMLElement && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
  if (editingText) return;

  const key = String(event.key || '').toLowerCase();
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === 'z') {
    event.preventDefault();
    const snapshot = state.history.undo(editorSnapshot());
    if (snapshot) applyHistorySnapshot(snapshot);
    return;
  }
  if (((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'z') || ((event.metaKey || event.ctrlKey) && key === 'y')) {
    event.preventDefault();
    const snapshot = state.history.redo(editorSnapshot());
    if (snapshot) applyHistorySnapshot(snapshot);
    return;
  }

  const tool = OVERLAY_EDITOR_TOOLS.find((entry) => String(entry.hotkey || '').toLowerCase() === key);
  if (tool) {
    event.preventDefault();
    setTool(tool.id);
    return;
  }

  if (key === 'enter') {
    if (state.pendingDraw.type) {
      event.preventDefault();
      finishPendingDraw();
    } else {
      openPreviewDrawer();
    }
    return;
  }

  if (key === 'escape') {
    if (state.pendingDraw.type) {
      state.pendingDraw = { type: '', points: [] };
      refreshWorkspacePreview();
      renderUi();
      return;
    }
    if (state.helpOpen) {
      closeHelpDrawer();
      return;
    }
    closePreviewDrawer();
    return;
  }

  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    deleteSelectedFeature();
    return;
  }
}

function bindCanvasEvents() {
  if (state.canvasBound || !appCtx.renderer?.domElement) return;
  const canvas = appCtx.renderer.domElement;
  canvas.addEventListener('pointerdown', handleCanvasPointerDown);
  canvas.addEventListener('pointermove', handleCanvasPointerMove);
  window.addEventListener('pointerup', handleCanvasPointerUp);
  window.addEventListener('keydown', handleWindowKeyDown);
  state.canvasElement = canvas;
  state.canvasBound = true;
}

function unbindCanvasEvents() {
  if (!state.canvasBound) return;
  const canvas = state.canvasElement || appCtx.renderer?.domElement;
  canvas?.removeEventListener('pointerdown', handleCanvasPointerDown);
  canvas?.removeEventListener('pointermove', handleCanvasPointerMove);
  window.removeEventListener('pointerup', handleCanvasPointerUp);
  window.removeEventListener('keydown', handleWindowKeyDown);
  state.canvasElement = null;
  state.canvasBound = false;
}

function ensureAuthObserver() {
  if (state.authUnsub) return;
  state.authUnsub = observeAuth((user) => handleAuthChanged(user));
}

function pauseEditorObservers() {
  state.authUnsub?.();
  state.authUnsub = null;
  state.ownUnsub?.();
  state.ownUnsub = null;
  state.moderationUnsub?.();
  state.moderationUnsub = null;
  state.ownFeatures = [];
  state.moderationQueue = [];
}

function updateFieldValue(ref, value) {
  if (!ref) return;
  if (ref.type === 'checkbox') ref.checked = value === true;
  else if (ref.value !== String(value ?? '')) ref.value = String(value ?? '');
}

function updateSelectedFeature(mutator) {
  const index = state.workspaceFeatures.findIndex((feature) => feature.featureId === state.selectedFeatureId);
  if (index < 0) return;
  const next = normalizeOverlayFeature(cloneJson(state.workspaceFeatures[index]));
  mutator(next);
  updateFeatureAtIndex(index, next);
  selectedFeatureValidation();
  refreshWorkspacePreview();
  renderUi();
}

function presetSampleFeature(presetId) {
  return createOverlayFeatureDraft({ presetId });
}

function helpTopicsForUi(presetId) {
  const topics = listHelpTopics();
  topics.push({ id: 'preset', label: `${getOverlayPreset(presetId).label} Guide` });
  topics.push({ id: 'advanced_mappings', label: 'Mapping' });
  if (state.helpTopic === 'validation_issue' && state.helpContext?.issue) {
    topics.push({ id: 'validation_issue', label: 'Current Issue' });
  }
  if (state.helpTopic === 'field' && state.helpContext?.fieldId) {
    topics.push({ id: 'field', label: 'Field Help' });
  }
  return topics;
}

function openHelpDrawer(topicId = DEFAULT_EDITOR_HELP_TOPIC, context = null) {
  state.helpOpen = true;
  state.helpTopic = sanitizeText(topicId || DEFAULT_EDITOR_HELP_TOPIC, 80).toLowerCase() || DEFAULT_EDITOR_HELP_TOPIC;
  state.helpContext = context ? cloneJson(context) : null;
  renderUi();
}

function closeHelpDrawer() {
  state.helpOpen = false;
  state.helpTopic = DEFAULT_EDITOR_HELP_TOPIC;
  state.helpContext = null;
  renderUi();
}

function collapseRuntimeUiForEditor() {
  document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
  appCtx.showLargeMap = false;
  document.getElementById('largeMap')?.classList.remove('show');
  document.getElementById('legendPanel')?.style?.setProperty('display', 'none');
  document.getElementById('mapInfoPanel')?.style?.setProperty('display', 'none');
  document.getElementById('navigationHud')?.style?.setProperty('display', 'none');
  document.getElementById('flowerActionMenu')?.classList.remove('open');
  document.getElementById('gameShareMenu')?.classList.remove('show');
  document.getElementById('roomPanelModal')?.classList.remove('show');
  document.getElementById('memoryInfoPanel')?.classList.remove('show');
  document.getElementById('boatPrompt')?.classList.remove('show');
  document.getElementById('liveEarthLocalPanel')?.classList.remove('show');
  document.getElementById('flowerChallengeHud')?.classList.remove('show');
  document.getElementById('paintTownHud')?.classList.remove('show');
  if (typeof appCtx.closePropertyPanel === 'function') appCtx.closePropertyPanel();
  if (typeof appCtx.closeHistoricPanel === 'function') appCtx.closeHistoricPanel();
  if (typeof appCtx.closeMemoryComposer === 'function') appCtx.closeMemoryComposer();
}

function restoreRuntimeUiAfterEditor() {
  if (!appCtx.gameStarted) return;
  if (typeof appCtx.updateHUD === 'function') appCtx.updateHUD();
  if (typeof appCtx.drawMinimap === 'function') appCtx.drawMinimap();
  if (appCtx.showLargeMap && typeof appCtx.drawLargeMap === 'function') appCtx.drawLargeMap();
}

function captureEditorViewRestoreState() {
  if (state.editorViewRestore) return state.editorViewRestore;
  state.editorViewRestore = {
    walkView: sanitizeText(appCtx.Walk?.state?.view || '', 24).toLowerCase(),
    camMode: Number.isFinite(appCtx.camMode) ? appCtx.camMode : null
  };
  return state.editorViewRestore;
}

function applyEditorViewMode(mode = '3d') {
  const nextMode = sanitizeText(mode || '3d', 8).toLowerCase() === '2d' ? '2d' : '3d';
  state.viewMode = nextMode;
  if (nextMode === '2d') {
    captureEditorViewRestoreState();
    if (appCtx.walkMode && appCtx.Walk?.state) {
      appCtx.Walk.state.view = 'overhead';
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
    } else if (Number.isFinite(appCtx.camMode)) {
      appCtx.camMode = 2;
    }
    setStatus('2D plan view enabled. Drag paths and box out footprints from above.', 'ok');
  } else if (state.editorViewRestore) {
    if (appCtx.walkMode && appCtx.Walk?.state && state.editorViewRestore.walkView) {
      appCtx.Walk.state.view = state.editorViewRestore.walkView;
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
    } else if (Number.isFinite(state.editorViewRestore.camMode)) {
      appCtx.camMode = state.editorViewRestore.camMode;
    }
    state.editorViewRestore = null;
    setStatus('3D edit view restored.', 'ok');
  }
  renderUi();
}

function restoreEditorViewMode() {
  if (!state.editorViewRestore) {
    state.viewMode = '3d';
    return;
  }
  if (appCtx.walkMode && appCtx.Walk?.state && state.editorViewRestore.walkView) {
    appCtx.Walk.state.view = state.editorViewRestore.walkView;
    if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
  } else if (Number.isFinite(state.editorViewRestore.camMode)) {
    appCtx.camMode = state.editorViewRestore.camMode;
  }
  state.editorViewRestore = null;
  state.viewMode = '3d';
}

function enterEditorPerformanceMode() {
  const currentTier = typeof appCtx.getPerfAutoQualityTier === 'function' ? appCtx.getPerfAutoQualityTier() : '';
  const autoEnabled = typeof appCtx.getPerfAutoQualityEnabled === 'function' ? appCtx.getPerfAutoQualityEnabled() : false;
  state.editorPerfRestore = {
    autoEnabled,
    tier: sanitizeText(currentTier || '', 24).toLowerCase()
  };
  const performanceTier = sanitizeText(appCtx.PERF_QUALITY_TIER_PERFORMANCE || 'performance', 24).toLowerCase();
  if (autoEnabled === true && performanceTier && currentTier !== performanceTier && typeof appCtx.setPerfAutoQualityTier === 'function') {
    appCtx.setPerfAutoQualityTier(performanceTier, { reason: 'editor_mode' });
  }
  const renderQuality = typeof appCtx.getRenderQualityLevel === 'function'
    ? appCtx.getRenderQualityLevel()
    : appCtx.renderQualityLevel;
  state.editorRenderQualityRestore = sanitizeText(renderQuality || '', 24).toLowerCase();
  if (state.editorRenderQualityRestore && state.editorRenderQualityRestore !== 'low' && typeof appCtx.setRenderQualityLevel === 'function') {
    appCtx.setRenderQualityLevel('low', { persist: false });
  }
}

function restoreEditorPerformanceMode() {
  const restore = state.editorPerfRestore;
  const renderRestore = sanitizeText(state.editorRenderQualityRestore || '', 24).toLowerCase();
  state.editorPerfRestore = null;
  state.editorRenderQualityRestore = '';
  if (restore && restore.autoEnabled === true && restore.tier && typeof appCtx.getPerfAutoQualityTier === 'function' && typeof appCtx.setPerfAutoQualityTier === 'function') {
    if (appCtx.getPerfAutoQualityTier() !== restore.tier) {
      appCtx.setPerfAutoQualityTier(restore.tier, { reason: 'editor_restore' });
    }
  }
  if (renderRestore && typeof appCtx.getRenderQualityLevel === 'function' && typeof appCtx.setRenderQualityLevel === 'function') {
    if (appCtx.getRenderQualityLevel() !== renderRestore) {
      appCtx.setRenderQualityLevel(renderRestore, { persist: false });
    }
  }
}

function guidedFieldInputHtml(field, feature, disabled) {
  const value = readOverlayFieldValue(feature, field.id);
  const disabledAttr = disabled ? ' disabled' : '';
  const helpText = escapeHtml(field.help?.shortText || field.helpText || field.description || '');
  const exampleValue = Array.isArray(field.exampleValues) ? field.exampleValues[0] : field.example;
  const example = exampleValue ? `<div class="editorFieldExample">Example: ${escapeHtml(exampleValue)}</div>` : '';
  const helpBtn = `<button type="button" class="editorFieldHelpBtn" data-editor-help-field="${escapeHtml(field.id)}">Help</button>`;

  if (field.inputType === 'select' || field.kind === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    const optionHtml = options.map((entry) => `
      <option value="${escapeHtml(entry.value)}"${String(entry.value) === String(value) ? ' selected' : ''}>${escapeHtml(entry.label)}</option>
    `).join('');
    const activeOption = options.find((entry) => String(entry.value) === String(value));
    const hint = activeOption?.description ? `<div class="editorSelectOptionHint">${escapeHtml(activeOption.description)}</div>` : '';
    return `
      <label class="editorField">
        <div class="editorFieldLead">
          <span class="editorFieldLabel">${escapeHtml(field.label)}</span>
          ${helpBtn}
        </div>
        <select data-editor-guided-field="${escapeHtml(field.id)}"${disabledAttr}>${optionHtml}</select>
        <div class="editorFieldHelp">${helpText}</div>
        ${example}
        ${hint}
      </label>
    `;
  }

  if (field.inputType === 'toggle' || field.kind === 'toggle') {
    return `
      <div class="editorField">
        <div class="editorFieldLead">
          <span class="editorFieldLabel">${escapeHtml(field.label)}</span>
          ${helpBtn}
        </div>
        <label class="editorAdvancedToggle">
          <input type="checkbox" data-editor-guided-field="${escapeHtml(field.id)}"${value === true ? ' checked' : ''}${disabledAttr}>
          <span>${escapeHtml(field.label)}</span>
        </label>
        <div class="editorFieldHelp">${helpText}</div>
        ${example}
      </div>
    `;
  }

  if (field.inputType === 'textarea' || field.kind === 'textarea') {
    return `
      <label class="editorField">
        <div class="editorFieldLead">
          <span class="editorFieldLabel">${escapeHtml(field.label)}</span>
          ${helpBtn}
        </div>
        <textarea data-editor-guided-field="${escapeHtml(field.id)}" rows="${Number.isFinite(Number(field.rows)) ? Number(field.rows) : 3}" maxlength="${Number.isFinite(Number(field.maxLength)) ? Number(field.maxLength) : 320}" placeholder="${escapeHtml(field.placeholderText || field.placeholder || '')}"${disabledAttr}>${escapeHtml(value || '')}</textarea>
        <div class="editorFieldHelp">${helpText}</div>
        ${example}
      </label>
    `;
  }

  const inputType = field.inputType === 'number' || field.kind === 'number' ? 'number' : 'text';
  const stepAttr = (field.inputType === 'number' || field.kind === 'number') && field.step != null ? ` step="${escapeHtml(field.step)}"` : '';
  const minAttr = (field.inputType === 'number' || field.kind === 'number') && field.min != null ? ` min="${escapeHtml(field.min)}"` : '';
  const maxAttr = (field.inputType === 'number' || field.kind === 'number') && field.max != null ? ` max="${escapeHtml(field.max)}"` : '';
  return `
    <label class="editorField">
      <div class="editorFieldLead">
        <span class="editorFieldLabel">${escapeHtml(field.label)}</span>
        ${helpBtn}
      </div>
      <input type="${inputType}" data-editor-guided-field="${escapeHtml(field.id)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(field.placeholderText || field.placeholder || '')}"${stepAttr}${minAttr}${maxAttr}${disabledAttr}>
      <div class="editorFieldHelp">${helpText}</div>
      ${example}
    </label>
  `;
}

function renderTagList(refs, feature) {
  if (!(refs.tagList instanceof HTMLElement)) return;
  if (!feature) {
    refs.tagList.innerHTML = '<div class="editorEmptyState">Select or create an overlay feature to edit raw tags.</div>';
    return;
  }
  const keys = [...new Set([
    ...Object.keys(getOverlayPreset(feature.presetId).tags || {}),
    ...Object.keys(feature.tags || {})
  ])].filter(Boolean);
  refs.tagList.innerHTML = keys.length
    ? keys.map((key) => `
        <label class="editorKeyValueRow">
          <span>${escapeHtml(key)}</span>
          <input type="text" data-editor-tag="${escapeHtml(key)}" value="${escapeHtml(feature.tags?.[key] || '')}">
        </label>
      `).join('')
    : '<div class="editorEmptyState">No raw tags yet. Add one below.</div>';
}

function renderWorkspaceFeatureList(refs) {
  if (!(refs.workspaceFeatureList instanceof HTMLElement)) return;
  refs.workspaceFeatureList.innerHTML = state.workspaceFeatures.length
    ? state.workspaceFeatures.map((feature) => `
        <button class="editorListRow ${feature.featureId === state.selectedFeatureId ? 'selected' : ''}" data-editor-workspace-id="${escapeHtml(feature.featureId)}">
          <span>${escapeHtml(overlayFeatureLabel(feature))}</span>
          <span>${escapeHtml(feature.storageMode === 'local' ? 'local draft' : feature.reviewState)}</span>
        </button>
      `).join('')
    : '<div class="editorEmptyState">No workspace features yet. Pick a preset and draw in the world.</div>';
}

function renderValidation(refs, feature) {
  if (!(refs.validationIssues instanceof HTMLElement)) return;
  const issues = feature?.validation?.issues || [];
  refs.validationIssues.innerHTML = issues.length
    ? issues.map((entry) => {
        const guidance = buildValidationIssueGuidance(entry);
        return `
          <div class="editorIssue ${escapeHtml(guidance.severity)}">
            <div class="editorIssueHead">
              <div class="editorIssueTitle">${escapeHtml(guidance.title)}</div>
              <button type="button" class="editorIssueHelpBtn" data-editor-validation-help="${escapeHtml(entry.code)}">Why?</button>
            </div>
            <div>${escapeHtml(guidance.message)}</div>
            ${guidance.hint ? `<div class="editorIssueHint">${escapeHtml(guidance.hint)}</div>` : ''}
          </div>
        `;
      }).join('')
    : '<div class="editorIssue ok">No validation issues on the selected feature.</div>';
}

function renderOnboardingCard(refs, feature) {
  if (!(refs.onboardingCard instanceof HTMLElement)) return;
  const preset = getOverlayPreset(feature?.presetId || state.activePresetId);
  const hasBaseSelection = !!state.selectedBaseFeature;
  refs.onboardingCard.innerHTML = `
    <div class="editorOnboardingEyebrow">Beta Demo Workflow</div>
    <div class="editorOnboardingTitle">Start here</div>
    <div class="editorOnboardingCopy">Pick a preset first, then drag or click directly in the world. This beta demo previews World Explorer overlays only and does not post to OpenStreetMap.</div>
    <div class="editorOnboardingSteps">
      <div class="editorOnboardingStep">
        <strong>1. Choose a preset</strong>
        ${escapeHtml(`Current preset: ${preset.label}. Switch presets before drawing if this is the wrong feature type.`)}
      </div>
      <div class="editorOnboardingStep">
        <strong>2. Place or patch geometry</strong>
        ${escapeHtml(hasBaseSelection
          ? `A base feature is selected. Clone ${state.selectedBaseFeature.displayName || 'it'} into an overlay patch, or ignore it and draw a fresh overlay.`
          : 'Drag roads and paths to lay segments. Drag buildings and parking to box out footprints. Click still works for custom vertex editing.')}
      </div>
      <div class="editorOnboardingStep">
        <strong>3. Edit fields after geometry exists</strong>
        Guided fields, validation, and submission preview stay hidden until there is something real to edit.
      </div>
    </div>
    <div class="editorOnboardingActions">
      <button type="button" data-editor-sidebar-view="presets">Browse Presets</button>
      <button type="button" class="secondary" data-editor-start-draw="1">Draw ${escapeHtml(preset.label)}</button>
      <button type="button" class="secondary" data-editor-help-topic="workflow">How review works</button>
    </div>
  `;
}

function renderPresetList(refs) {
  if (!(refs.presetList instanceof HTMLElement)) return;
  const groups = getOverlayPresetPickerGroups(state.presetQuery);
  refs.presetList.innerHTML = groups.map((category) => {
    return `
      <div class="editorPresetCategoryBlock">
        <div class="editorPresetCategoryLabel">${escapeHtml(category.label)}</div>
        ${category.presets.map((preset) => `
          <button class="editorPresetCard ${preset.id === state.activePresetId ? 'active' : ''}" data-editor-preset="${escapeHtml(preset.id)}">
            <strong>${escapeHtml(preset.label)}</strong>
            <span>${escapeHtml(preset.geometryType)} • ${escapeHtml(preset.featureClass)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }).join('');
  if (refs.presetSummary) {
    const preset = getOverlayPreset(state.activePresetId);
    const helpCard = buildPresetHelpCard(preset.id);
    refs.presetSummary.innerHTML = `
      <div class="editorPresetSummaryTitle">
        <strong>${escapeHtml(helpCard.label)}</strong>
        <span class="editorPresetSummaryMeta">${escapeHtml(helpCard.categoryLabel)} • ${escapeHtml(preset.geometryType)}</span>
      </div>
      <div class="editorPresetSummaryText">${escapeHtml(helpCard.description)}</div>
      <div class="editorPresetSummaryList">
        ${helpCard.whenToUse.slice(0, 2).map((entry) => `<div>Use when: ${escapeHtml(entry)}</div>`).join('')}
        ${helpCard.mistakes.slice(0, 1).map((entry) => `<div>Watch for: ${escapeHtml(entry)}</div>`).join('')}
      </div>
      <div class="editorPresetSummaryRelated">
        <button type="button" data-editor-help-topic="preset">Open Guide</button>
        ${helpCard.relatedPresets.slice(0, 3).map((entry) => `<button type="button" data-editor-related-preset="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</button>`).join('')}
      </div>
    `;
  }
}

function renderSelectedPresetCard(refs, feature) {
  if (!(refs.selectedPresetCard instanceof HTMLElement)) return;
  const preset = getOverlayPreset(feature?.presetId || state.activePresetId);
  const helpCard = buildPresetHelpCard(preset.id);
  refs.selectedPresetCard.innerHTML = `
    <div class="editorPresetSummaryTitle">
      <strong>${escapeHtml(preset.label)}</strong>
      <span class="editorPresetSummaryMeta">${escapeHtml(preset.featureClass)} • ${escapeHtml(preset.geometryType)}</span>
    </div>
    <div class="editorPresetSummaryText">${escapeHtml(helpCard.description)}</div>
    <div class="editorPresetSummaryList">
      ${helpCard.whenToUse.slice(0, 2).map((entry) => `<div>${escapeHtml(entry)}</div>`).join('')}
    </div>
  `;
}

function renderFieldGroupCards(container, groups, previewFeature, disabled, emptyMessage) {
  if (!(container instanceof HTMLElement)) return;
  if (!groups.length) {
    container.innerHTML = `<div class="editorEmptyState">${escapeHtml(emptyMessage)}</div>`;
    return;
  }
  container.innerHTML = `
    ${disabled ? '<div class="editorEmptyState">Draw or clone geometry to enable editing for this feature.</div>' : ''}
    ${groups.map((group) => `
      <div class="editorFieldGroupCard">
        <div class="editorFieldGroupTitle">${escapeHtml(group.label)}</div>
        ${group.fields.map((field) => guidedFieldInputHtml(field, previewFeature, disabled)).join('')}
      </div>
    `).join('')}
  `;
}

function renderGuidedFieldPanel(refs, feature) {
  const presetId = feature?.presetId || state.activePresetId;
  const groups = getOverlayPresetFieldGroups(presetId, { feature });
  const previewFeature = feature || presetSampleFeature(presetId);
  const disabled = !feature;
  renderFieldGroupCards(
    refs.guidedFieldPanel,
    groups,
    previewFeature,
    disabled,
    'No guided fields are registered for this preset yet.'
  );
}

function renderAdvancedFieldPanel(refs, feature) {
  const presetId = feature?.presetId || state.activePresetId;
  const groups = getOverlayPresetAdvancedFieldGroups(presetId, { feature, advancedMode: true });
  const previewFeature = feature || presetSampleFeature(presetId);
  const disabled = !feature;
  renderFieldGroupCards(
    refs.advancedFieldPanel,
    groups,
    previewFeature,
    disabled,
    'No advanced overlay fields are registered for this preset.'
  );
}

function renderAdvancedMapping(refs, feature) {
  if (!(refs.advancedMapping instanceof HTMLElement)) return;
  const presetId = feature?.presetId || state.activePresetId;
  const mappings = listPresetAdvancedMappings(presetId);
  refs.advancedMapping.innerHTML = mappings.length
    ? mappings.map((entry) => `
        <div class="editorAdvancedMappingRow">
          <div>
            <strong>${escapeHtml(entry.fieldLabel)}</strong>
            <span>${escapeHtml(entry.label)}</span>
          </div>
          <span>${escapeHtml(entry.path)}</span>
        </div>
      `).join('')
    : '<div class="editorEmptyState">No advanced mapping metadata is registered for this preset.</div>';
}

function renderWorkspaceSidebar(refs, feature) {
  const view = resolveWorkspaceSidebarView(feature);
  refs.sidebarStartBtn?.classList.toggle('active', view === 'start');
  refs.sidebarPresetsBtn?.classList.toggle('active', view === 'presets');
  refs.sidebarSelectionBtn?.classList.toggle('active', view === 'selection');
  if (refs.sidebarSelectionBtn) refs.sidebarSelectionBtn.disabled = !feature && state.workspaceFeatures.length === 0;
  if (refs.sidebarStartView) refs.sidebarStartView.hidden = view !== 'start';
  if (refs.sidebarPresetsView) refs.sidebarPresetsView.hidden = view !== 'presets';
  if (refs.sidebarSelectionView) refs.sidebarSelectionView.hidden = view !== 'selection';
  renderOnboardingCard(refs, feature);
}

function renderOwnFeatures(refs) {
  if (!(refs.ownFeatureList instanceof HTMLElement)) return;
  refs.ownFeatureList.innerHTML = state.ownFeatures.length
    ? state.ownFeatures.map((feature) => {
        const summary = buildSubmissionSummary(feature);
        return `
          <div class="editorSubmissionCard">
            <div class="editorSubmissionTop">
              <strong>${escapeHtml(summary.title)}</strong>
              <span class="editorSubmissionStatus" data-status="${escapeHtml(feature.reviewState)}">${escapeHtml(feature.storageMode === 'local' ? 'local draft' : feature.reviewState)}</span>
            </div>
            <div class="editorSubmissionMeta">${escapeHtml(feature.presetId)} • v${escapeHtml(feature.version)} • ${escapeHtml(summary.validationLine)}${feature.storageMode === 'local' ? ' • local device draft' : ''}</div>
            <div class="editorSubmissionSubtitle">${escapeHtml(summary.description)}</div>
            ${summary.highlights.length ? `<div class="editorSubmissionChipRow">${summary.highlights.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
            ${summary.contributorNote ? `<div class="editorSubmissionNote">${escapeHtml(summary.contributorNote)}</div>` : ''}
            <div class="editorSubmissionActions">
              <button type="button" data-editor-own-action="load" data-editor-own-id="${escapeHtml(feature.featureId)}">Load</button>
              <button type="button" data-editor-own-action="focus" data-editor-own-id="${escapeHtml(feature.featureId)}">Focus</button>
              ${feature.reviewState === 'draft' || feature.reviewState === 'needs_changes' || feature.reviewState === 'rejected'
                ? `<button type="button" data-editor-own-action="submit" data-editor-own-id="${escapeHtml(feature.featureId)}">Submit</button>
                   <button type="button" data-editor-own-action="delete" data-editor-own-id="${escapeHtml(feature.featureId)}">Delete</button>`
                : ''}
            </div>
          </div>
        `;
      }).join('')
    : '<div class="editorEmptyState">No saved drafts on this device yet.</div>';
}

function moderationFilteredItems(refs) {
  const stateFilter = sanitizeText(refs.moderationStateFilter?.value || '', 40).toLowerCase();
  const search = sanitizeText(refs.moderationSearchInput?.value || '', 80).toLowerCase();
  return state.moderationQueue.filter((feature) => {
    const matchesState = !stateFilter || stateFilter === 'all' || feature.reviewState === stateFilter;
    if (!matchesState) return false;
    if (!search) return true;
    return [
      overlayFeatureLabel(feature),
      feature.featureClass,
      feature.presetId,
      feature.tags?.name,
      feature.baseFeatureRef?.displayName
    ].join(' ').toLowerCase().includes(search);
  });
}

function renderModeration(refs) {
  if (!(refs.moderationList instanceof HTMLElement)) return;
  const items = moderationFilteredItems(refs);
  refs.moderationList.innerHTML = items.length
    ? items.map((feature) => `
        <button class="editorListRow ${feature.featureId === state.selectedFeatureId ? 'selected' : ''}" data-editor-moderation-id="${escapeHtml(feature.featureId)}">
          <span>${escapeHtml(overlayFeatureLabel(feature))}</span>
          <span>${escapeHtml(feature.reviewState)}</span>
        </button>
      `).join('')
    : '<div class="editorEmptyState">No moderation items match this view.</div>';

  const selected = items.find((feature) => feature.featureId === state.selectedFeatureId) || items[0] || null;
  if (selected && state.selectedFeatureId !== selected.featureId) {
    state.selectedFeatureId = selected.featureId;
  }
  if (!(refs.moderationDetail instanceof HTMLElement)) return;
  if (!selected) {
    refs.moderationDetail.innerHTML = '<div class="editorEmptyState">Select a submitted overlay feature to inspect and moderate it.</div>';
    return;
  }
  const summary = buildSubmissionSummary(selected);
  refs.moderationDetail.innerHTML = `
    <div class="editorModerationDetailHead">
      <div>
        <div class="editorModerationDetailTitle">${escapeHtml(summary.title)}</div>
        <div class="editorModerationCellValue">${escapeHtml(summary.description)}</div>
      </div>
      <span class="editorSubmissionStatus" data-status="${escapeHtml(selected.reviewState)}">${escapeHtml(selected.reviewState)}</span>
    </div>
    <div class="editorModerationDetailGrid">
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Preset</div>
        <div class="editorModerationCellValue">${escapeHtml(selected.presetId)} • ${escapeHtml(selected.geometryType)}</div>
      </div>
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Merge</div>
        <div class="editorModerationCellValue">${escapeHtml(selected.mergeMode)}</div>
      </div>
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Base Ref</div>
        <div class="editorModerationCellValue">${escapeHtml(selected.baseFeatureRef?.displayName || selected.baseFeatureRef?.featureId || 'none')}</div>
      </div>
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Validation</div>
        <div class="editorModerationCellValue">${escapeHtml(summary.validationLine)}</div>
      </div>
    </div>
    ${summary.highlights.length ? `
      <div class="editorHelpSection">
        <strong>Readable Summary</strong>
        ${summary.highlights.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
      </div>
    ` : ''}
    ${summary.contributorNote ? `
      <div class="editorHelpSection">
        <strong>Contributor Note</strong>
        <div>${escapeHtml(summary.contributorNote)}</div>
      </div>
    ` : ''}
    ${selected.moderation?.note ? `
      <div class="editorHelpSection">
        <strong>Latest Moderator Note</strong>
        <div>${escapeHtml(selected.moderation.note)}</div>
      </div>
    ` : ''}
    ${Array.isArray(selected.validation?.issues) && selected.validation.issues.length ? `
      <div class="editorHelpSection">
        <strong>Validation Notes</strong>
        ${selected.validation.issues.slice(0, 5).map((item) => `<div>${escapeHtml(item.message)}${item.hint ? ` - ${escapeHtml(item.hint)}` : ''}</div>`).join('')}
      </div>
    ` : ''}
  `;
}

function renderHelpDrawer(refs, feature) {
  if (!(refs.helpDrawer instanceof HTMLElement)) return;
  refs.helpDrawer.classList.toggle('show', state.helpOpen);
  refs.helpDrawer.setAttribute('aria-hidden', state.helpOpen ? 'false' : 'true');
  const topic = buildHelpTopic(state.helpTopic, {
    presetId: feature?.presetId || state.activePresetId,
    issue: state.helpContext?.issue || null,
    fieldId: state.helpContext?.fieldId || ''
  });
  if (refs.helpDrawerTitle) refs.helpDrawerTitle.textContent = topic.label || 'Guide';
  if (refs.helpDrawerSummary) refs.helpDrawerSummary.textContent = topic.summary || '';
  if (refs.helpTopicList) {
    refs.helpTopicList.innerHTML = helpTopicsForUi(feature?.presetId || state.activePresetId).map((entry) => `
      <button type="button" class="${entry.id === state.helpTopic ? 'active' : ''}" data-editor-help-topic="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</button>
    `).join('');
  }
  if (refs.helpContent) {
    const sections = Array.isArray(topic.sections) ? topic.sections : [];
    refs.helpContent.innerHTML = sections.map((section) => `
      <div class="editorHelpSection">
        <strong>${escapeHtml(section.title || '')}</strong>
        ${(Array.isArray(section.items) ? section.items : []).map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
      </div>
    `).join('') || '<div class="editorEmptyState">No help content is available for this selection yet.</div>';
  }
}

function renderUi() {
  const refs = getRefs();
  if (!(refs.panel instanceof HTMLElement)) return;
  const feature = selectedFeature();
  const stage = workspaceStage(feature);
  const sidebarView = resolveWorkspaceSidebarView(feature);
  refs.panel.classList.toggle('show', state.active);
  refs.panel.classList.toggle('editorWorldPeek', state.peekWorld === true);
  refs.panel.classList.toggle('editorNoSelection', !feature);
  refs.panel.classList.toggle('editorHasSelection', !!feature);
  refs.panel.dataset.tab = state.tab;
  refs.panel.dataset.stage = stage;
  refs.panel.dataset.sidebarView = sidebarView;
  document.body.classList.toggle('editor-workspace-open', state.active);
  document.body.classList.toggle('editor-workspace-peek', state.active && state.peekWorld === true);
  if (refs.title) refs.title.textContent = 'Overlay Editor Beta';
  if (refs.subline) refs.subline.textContent = 'Beta demo for World Explorer overlays. Use presets first. This does not submit to OpenStreetMap.';
  if (refs.authBadge) {
    refs.authBadge.textContent = state.authUser?.uid
      ? `${sanitizeText(state.authUser.displayName || state.authUser.email || 'Explorer', 60)}${state.userIsAdmin ? ' • Admin' : ''}`
      : 'Local drafts available • Sign in to sync cloud drafts • Not an OSM editor';
  }
  if (refs.viewModeBtn) refs.viewModeBtn.textContent = state.viewMode === '2d' ? '3D View' : '2D Plan';
  if (refs.status) {
    refs.status.textContent = state.status.text;
    refs.status.dataset.tone = state.status.tone;
    refs.status.hidden = state.status.tone === 'info'
      && (
        state.status.text === 'Overlay editor is ready.'
        || state.status.text === 'Editor panels restored.'
        || state.status.text.startsWith('Centered on ')
      );
  }
  if (refs.peekBtn) refs.peekBtn.textContent = state.peekWorld ? 'Restore Panels' : 'Peek World';
  renderPresetList(refs);
  const preset = getOverlayPreset(feature?.presetId || state.activePresetId);
  renderWorkspaceSidebar(refs, feature);
  renderWorkspaceFeatureList(refs);
  renderSelectedPresetCard(refs, feature);
  renderGuidedFieldPanel(refs, feature);
  renderAdvancedFieldPanel(refs, feature);
  renderValidation(refs, feature);
  renderOwnFeatures(refs);
  renderModeration(refs);
  renderAdvancedMapping(refs, feature);
  renderHelpDrawer(refs, feature);

  if (refs.viewportHint) {
    refs.viewportHint.hidden = true;
    refs.viewportHint.textContent = '';
  }
  if (refs.viewportMeta) {
    refs.viewportMeta.innerHTML = '';
  }

  if (refs.selectedFeatureTitle) refs.selectedFeatureTitle.textContent = feature ? overlayFeatureLabel(feature) : 'No Overlay Selected';
  if (refs.selectedFeatureMeta) {
    refs.selectedFeatureMeta.textContent = feature
      ? readableFeatureDescription(feature)
      : state.selectedBaseFeature
        ? `Base feature: ${state.selectedBaseFeature.displayName}`
        : 'Select a base world feature or draw a new overlay.';
  }
  if (refs.geometryTypeValue) refs.geometryTypeValue.textContent = feature?.geometryType || state.selectedBaseFeature?.geometryType || preset.geometryType || 'n/a';
  if (refs.reviewStateBadge) refs.reviewStateBadge.textContent = feature ? (feature.storageMode === 'local' ? 'local draft' : feature.reviewState) : 'unsaved';
  if (refs.inspectorPanel) refs.inspectorPanel.hidden = !feature;
  if (refs.baseSelection) {
    refs.baseSelection.innerHTML = state.selectedBaseFeature
      ? `<strong>${escapeHtml(state.selectedBaseFeature.displayName)}</strong><div>${escapeHtml(state.selectedBaseFeature.featureType)} • ${escapeHtml(state.selectedBaseFeature.geometryType)}</div>`
      : '<div class="editorEmptyState">Nothing selected yet. Click a building, road, or place in the world if you want to patch existing data.</div>';
  }

  updateFieldValue(refs.heightInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'height') || '');
  updateFieldValue(refs.levelsInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'building_levels') || '');
  updateFieldValue(refs.minHeightInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'min_height') || 0);
  updateFieldValue(refs.roofShapeSelect, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'roof_shape') || 'flat');
  updateFieldValue(refs.layerInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'layer') || 0);
  updateFieldValue(refs.bridgeCheckbox, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'bridge') === true);
  updateFieldValue(refs.tunnelCheckbox, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'tunnel') === true);
  updateFieldValue(refs.surfaceInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'surface') || '');
  updateFieldValue(refs.levelRefInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'level') || '');
  updateFieldValue(refs.buildingRefInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'building_ref') || '');
  if (refs.advancedToggle) refs.advancedToggle.checked = state.advancedMode === true;
  if (refs.advancedPanel) refs.advancedPanel.hidden = state.advancedMode !== true;

  renderTagList(refs, feature);

  if (refs.entrancesList) {
    refs.entrancesList.innerHTML = feature?.threeD?.entrances?.length
      ? feature.threeD.entrances.map((entry, index) => `
          <button type="button" class="editorListRow" data-editor-entrance-index="${index}">
            <span>${escapeHtml(sanitizeText(entry.label || `Entrance ${index + 1}`, 80))}</span>
            <span>${escapeHtml(sanitizeText(entry.kind || 'entrance', 40))}</span>
          </button>
        `).join('')
      : '<div class="editorEmptyState">No entrance anchors added yet.</div>';
  }

  refs.workspacePane?.classList.toggle('active', state.tab === 'workspace');
  refs.minePane?.classList.toggle('active', state.tab === 'mine');
  refs.moderationPane?.classList.toggle('active', state.tab === 'moderation' && state.userIsAdmin);
  refs.workspaceTabBtn?.classList.toggle('active', state.tab === 'workspace');
  refs.mineTabBtn?.classList.toggle('active', state.tab === 'mine');
  refs.moderationTabBtn?.classList.toggle('active', state.tab === 'moderation');
  if (refs.moderationTabBtn) refs.moderationTabBtn.hidden = !state.userIsAdmin;

  if (refs.previewDrawer) {
    refs.previewDrawer.classList.toggle('show', state.previewOpen);
    if (refs.previewSummary) {
      refs.previewSummary.textContent = feature
        ? buildSubmissionSummary(feature).description
        : 'Select a feature to preview submission details.';
    }
    if (refs.previewHighlights) {
      const summary = feature ? buildSubmissionSummary(feature) : null;
      refs.previewHighlights.innerHTML = summary?.highlights?.length
        ? summary.highlights.map((entry) => `<div class="editorPreviewChip">${escapeHtml(entry)}</div>`).join('')
        : '';
    }
    if (refs.previewValidation) {
      refs.previewValidation.innerHTML = feature?.validation?.issues?.length
        ? feature.validation.issues.map((entry) => {
            const guidance = buildValidationIssueGuidance(entry);
            return `<div class="editorIssue ${escapeHtml(guidance.severity)}">${escapeHtml(guidance.message)}${guidance.hint ? `<div class="editorIssueHint">${escapeHtml(guidance.hint)}</div>` : ''}</div>`;
          }).join('')
        : '<div class="editorIssue ok">Validation is clean enough to submit.</div>';
    }
    if (refs.previewChecklist) {
      const summary = feature ? buildSubmissionSummary(feature) : null;
      const noteHtml = state.previewNote ? `<div class="editorPreviewChip">${escapeHtml(state.previewNote)}</div>` : '';
      const checklistHtml = summary?.reviewerChecklist?.length
        ? summary.reviewerChecklist.map((entry) => `<div class="editorPreviewChip">${escapeHtml(entry)}</div>`).join('')
        : '';
      refs.previewChecklist.innerHTML = noteHtml + checklistHtml;
    }
    updateFieldValue(refs.submissionNoteInput, state.previewNote);
  }

  if (refs.toolbar instanceof HTMLElement) {
    refs.toolbar.querySelectorAll('[data-editor-tool]').forEach((button) => {
      const active = button.getAttribute('data-editor-tool') === state.tool;
      button.classList.toggle('active', active);
    });
    const addVertexButton = refs.toolbar.querySelector('[data-editor-tool="add_vertex"]');
    const deleteVertexButton = refs.toolbar.querySelector('[data-editor-tool="delete_vertex"]');
    const splitLineButton = refs.toolbar.querySelector('[data-editor-tool="split_line"]');
    const mergeButton = refs.toolbar.querySelector('[data-editor-action="merge"]');
    const validateButton = refs.toolbar.querySelector('[data-editor-action="validate"]');
    const previewButton = refs.toolbar.querySelector('[data-editor-action="preview"]');
    if (addVertexButton instanceof HTMLElement) addVertexButton.hidden = !feature;
    if (deleteVertexButton instanceof HTMLElement) deleteVertexButton.hidden = !feature;
    if (splitLineButton instanceof HTMLElement) splitLineButton.hidden = !feature || feature.geometryType !== 'LineString';
    if (mergeButton instanceof HTMLElement) mergeButton.hidden = state.workspaceFeatures.length < 2;
    if (validateButton instanceof HTMLElement) validateButton.hidden = !feature;
    if (previewButton instanceof HTMLElement) previewButton.hidden = !feature;
  }
}

function bindRefEvents() {
  if (state.refsBound) return;
  const refs = getRefs();
  refs.helpBtn?.addEventListener('click', () => openHelpDrawer());
  refs.viewModeBtn?.addEventListener('click', () => applyEditorViewMode(state.viewMode === '2d' ? '3d' : '2d'));
  refs.helpCloseBtn?.addEventListener('click', () => closeHelpDrawer());
  refs.peekBtn?.addEventListener('click', () => {
    state.peekWorld = state.peekWorld !== true;
    if (state.peekWorld) {
      state.helpOpen = false;
      state.helpContext = null;
      state.previewOpen = false;
      setStatus('Peek mode enabled. Side panels are hidden so you can inspect the live world while editing.', 'info');
      return;
    }
    setStatus('Editor panels restored.', 'info');
  });
  refs.closeBtn?.addEventListener('click', () => closeEditorSession());
  refs.workspaceTabBtn?.addEventListener('click', () => {
    state.tab = 'workspace';
    renderUi();
  });
  refs.sidebarStartBtn?.addEventListener('click', () => setWorkspaceSidebarView('start'));
  refs.sidebarPresetsBtn?.addEventListener('click', () => setWorkspaceSidebarView('presets'));
  refs.sidebarSelectionBtn?.addEventListener('click', () => {
    if (state.workspaceFeatures.length > 0) setWorkspaceSidebarView('selection');
  });
  refs.mineTabBtn?.addEventListener('click', () => {
    state.tab = 'mine';
    renderUi();
  });
  refs.moderationTabBtn?.addEventListener('click', () => {
    if (state.userIsAdmin) {
      state.tab = 'moderation';
      renderUi();
    }
  });
  refs.toolbar?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-tool],[data-editor-action]') : null;
    if (!(button instanceof HTMLElement)) return;
    const tool = sanitizeText(button.dataset.editorTool || '', 40);
    if (tool) {
      setTool(tool);
      return;
    }
    const action = sanitizeText(button.dataset.editorAction || '', 40);
    if (action === 'undo') {
      const snapshot = state.history.undo(editorSnapshot());
      if (snapshot) applyHistorySnapshot(snapshot);
    } else if (action === 'redo') {
      const snapshot = state.history.redo(editorSnapshot());
      if (snapshot) applyHistorySnapshot(snapshot);
    } else if (action === 'validate') {
      const result = selectedFeatureValidation();
      setStatus(result.valid ? 'Selected overlay feature validated.' : 'Validation found issues on the selected feature.', result.valid ? 'ok' : 'warning');
      renderUi();
    } else if (action === 'preview') {
      openPreviewDrawer();
    } else if (action === 'merge') {
      mergeSelectedFeatures();
    }
  });

  refs.presetSearchInput?.addEventListener('input', () => {
    state.presetQuery = sanitizeText(refs.presetSearchInput.value, 80);
    renderUi();
  });
  refs.presetList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-preset]') : null;
    if (!(button instanceof HTMLElement)) return;
    setToolForPreset(button.dataset.editorPreset);
  });
  refs.presetSummary?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-help-topic],[data-editor-related-preset]') : null;
    if (!(button instanceof HTMLElement)) return;
    const relatedPreset = sanitizeText(button.dataset.editorRelatedPreset || '', 80).toLowerCase();
    if (relatedPreset) {
      setActivePreset(relatedPreset);
      return;
    }
    const helpTopic = sanitizeText(button.dataset.editorHelpTopic || '', 80).toLowerCase();
    if (helpTopic) openHelpDrawer(helpTopic);
  });
  refs.onboardingCard?.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-editor-sidebar-view],[data-editor-start-draw],[data-editor-help-topic]') : null;
    if (!(target instanceof HTMLElement)) return;
    const sidebarView = sanitizeText(target.dataset.editorSidebarView || '', 24).toLowerCase();
    if (sidebarView) {
      setWorkspaceSidebarView(sidebarView);
      return;
    }
    if (target.dataset.editorStartDraw === '1') {
      setToolForPreset(state.activePresetId);
      setStatus(`Click in the world to draw a ${getOverlayPreset(state.activePresetId).label.toLowerCase()}.`, 'info');
      return;
    }
    const helpTopic = sanitizeText(target.dataset.editorHelpTopic || '', 80).toLowerCase();
    if (helpTopic) openHelpDrawer(helpTopic);
  });
  refs.workspaceFeatureList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-workspace-id]') : null;
    if (!(button instanceof HTMLElement)) return;
    setSelectedFeature(button.dataset.editorWorkspaceId);
  });
  refs.cloneBaseBtn?.addEventListener('click', () => {
    if (!state.selectedBaseFeature) {
      setStatus('Select a base feature in the world first.', 'warning');
      return;
    }
    const draft = createOverlayDraftFromBaseFeature(state.selectedBaseFeature);
    addWorkspaceFeature(draft);
    state.selectedBaseFeature = null;
    pushHistory();
    setStatus('Base feature cloned into overlay workspace.', 'ok');
  });
  refs.centerFeatureBtn?.addEventListener('click', () => focusFeatureInWorld());
  refs.deleteFeatureBtn?.addEventListener('click', () => {
    deleteSelectedFeature();
  });
  refs.advancedToggle?.addEventListener('change', () => {
    state.advancedMode = refs.advancedToggle.checked;
    if (state.advancedMode) {
      openHelpDrawer('power_user');
      return;
    }
    renderUi();
  });
  const bindSchemaFieldPanel = (panel) => {
    panel?.addEventListener('change', (event) => {
      const input = event.target instanceof HTMLElement ? event.target.closest('[data-editor-guided-field]') : null;
      if (!(input instanceof HTMLElement)) return;
      const fieldId = sanitizeText(input.dataset.editorGuidedField || '', 80).toLowerCase();
      if (!fieldId) return;
      const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
      updateSelectedFeature((feature) => {
        applyOverlayFieldValue(feature, fieldId, value);
      });
    });
    panel?.addEventListener('click', (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-help-field]') : null;
      if (!(button instanceof HTMLElement)) return;
      const fieldId = sanitizeText(button.dataset.editorHelpField || '', 80).toLowerCase();
      if (!fieldId) return;
      openHelpDrawer('field', { fieldId });
    });
  };
  bindSchemaFieldPanel(refs.guidedFieldPanel);
  bindSchemaFieldPanel(refs.advancedFieldPanel);
  refs.validationIssues?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-validation-help]') : null;
    if (!(button instanceof HTMLElement)) return;
    const code = sanitizeText(button.dataset.editorValidationHelp || '', 80);
    const issue = selectedFeature()?.validation?.issues?.find((entry) => entry.code === code) || null;
    if (issue) openHelpDrawer('validation_issue', { issue });
  });
  refs.helpTopicList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-help-topic]') : null;
    if (!(button instanceof HTMLElement)) return;
    const topicId = sanitizeText(button.dataset.editorHelpTopic || '', 80).toLowerCase();
    if (!topicId) return;
    if (topicId === 'validation_issue' && state.helpContext?.issue) {
      openHelpDrawer(topicId, { issue: state.helpContext.issue });
      return;
    }
    if (topicId === 'field' && state.helpContext?.fieldId) {
      openHelpDrawer(topicId, { fieldId: state.helpContext.fieldId });
      return;
    }
    openHelpDrawer(topicId);
  });
  refs.tagList?.addEventListener('input', (event) => {
    const input = event.target instanceof HTMLElement ? event.target.closest('[data-editor-tag]') : null;
    if (!(input instanceof HTMLInputElement)) return;
    const key = sanitizeText(input.dataset.editorTag || '', 64).toLowerCase();
    if (!key) return;
    updateSelectedFeature((feature) => {
      if (!feature.tags) feature.tags = {};
      feature.tags[key] = sanitizeText(input.value, 180);
    });
  });
  refs.addTagBtn?.addEventListener('click', () => {
    const key = sanitizeText(refs.newTagKeyInput?.value || '', 64).toLowerCase();
    const value = sanitizeText(refs.newTagValueInput?.value || '', 180);
    if (!key || !value) {
      setStatus('Provide both a tag key and value.', 'warning');
      return;
    }
    updateSelectedFeature((feature) => {
      if (!feature.tags) feature.tags = {};
      feature.tags[key] = value;
    });
    if (refs.newTagKeyInput) refs.newTagKeyInput.value = '';
    if (refs.newTagValueInput) refs.newTagValueInput.value = '';
  });
  refs.heightInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'height', refs.heightInput.value);
    });
  });
  refs.levelsInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'building_levels', refs.levelsInput.value);
    });
  });
  refs.minHeightInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'min_height', refs.minHeightInput.value);
    });
  });
  refs.roofShapeSelect?.addEventListener('change', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'roof_shape', refs.roofShapeSelect.value);
    });
  });
  refs.layerInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'layer', refs.layerInput.value);
    });
  });
  refs.bridgeCheckbox?.addEventListener('change', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'bridge', refs.bridgeCheckbox.checked);
    });
  });
  refs.tunnelCheckbox?.addEventListener('change', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'tunnel', refs.tunnelCheckbox.checked);
    });
  });
  refs.surfaceInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'surface', refs.surfaceInput.value);
    });
  });
  refs.levelRefInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'level', refs.levelRefInput.value);
    });
  });
  refs.buildingRefInput?.addEventListener('input', () => {
    updateSelectedFeature((feature) => {
      applyOverlayFieldValue(feature, 'building_ref', refs.buildingRefInput.value);
    });
  });
  refs.addEntranceBtn?.addEventListener('click', () => addEntranceAtCurrentPoint());
  refs.entrancesList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-entrance-index]') : null;
    if (!(button instanceof HTMLElement)) return;
    const index = Number(button.dataset.editorEntranceIndex);
    if (!Number.isFinite(index)) return;
    updateSelectedFeature((feature) => {
      feature.threeD.entrances.splice(index, 1);
    });
    pushHistory();
    setStatus('Entrance removed from building overlay.', 'ok');
  });
  refs.previewBtn?.addEventListener('click', () => openPreviewDrawer());
  refs.saveDraftBtn?.addEventListener('click', () => {
    saveSelectedFeature();
  });
  refs.submitBtn?.addEventListener('click', () => {
    submitSelectedFeatureForReview();
  });
  refs.submissionNoteInput?.addEventListener('input', () => {
    state.previewNote = sanitizeText(refs.submissionNoteInput.value, 320);
    updateSelectedFeature((feature) => {
      applySubmissionMetadata(feature);
    });
  });
  refs.ownFeatureList?.addEventListener('click', async (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-own-action]') : null;
    if (!(button instanceof HTMLElement)) return;
    const action = sanitizeText(button.dataset.editorOwnAction || '', 24);
    const featureId = sanitizeText(button.dataset.editorOwnId || '', 180);
    const feature = state.ownFeatures.find((entry) => entry.featureId === featureId);
    if (!feature) return;
    if (action === 'load') {
      resetWorkspace();
      addWorkspaceFeature(feature);
      pushHistory();
      state.tab = 'workspace';
      setStatus('Saved overlay draft loaded into the workspace.', 'ok');
    } else if (action === 'focus') {
      focusFeatureInWorld(feature);
    } else if (action === 'submit') {
      resetWorkspace();
      addWorkspaceFeature(feature);
      await submitSelectedFeatureForReview();
    } else if (action === 'delete') {
      resetWorkspace();
      addWorkspaceFeature(feature);
      await deleteSelectedFeature();
    }
  });
  refs.moderationList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-moderation-id]') : null;
    if (!(button instanceof HTMLElement)) return;
    state.selectedFeatureId = sanitizeText(button.dataset.editorModerationId || '', 180);
    renderUi();
  });
  refs.moderationApproveBtn?.addEventListener('click', async () => {
    const feature = selectedModerationFeature();
    if (!feature) return;
    try {
      await moderateOverlayDraft(feature.featureId, 'approve', sanitizeText(refs.moderationNoteInput?.value || '', 320));
      setStatus(`Approved and published ${overlayFeatureLabel(feature)}.`, 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not approve this overlay feature.', 'error');
    }
  });
  refs.moderationNeedsBtn?.addEventListener('click', async () => {
    const feature = selectedModerationFeature();
    if (!feature) return;
    try {
      await moderateOverlayDraft(feature.featureId, 'needs_changes', sanitizeText(refs.moderationNoteInput?.value || '', 320));
      setStatus(`Returned ${overlayFeatureLabel(feature)} for changes.`, 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not return this overlay feature.', 'error');
    }
  });
  refs.moderationRejectBtn?.addEventListener('click', async () => {
    const feature = selectedModerationFeature();
    if (!feature) return;
    try {
      await moderateOverlayDraft(feature.featureId, 'reject', sanitizeText(refs.moderationNoteInput?.value || '', 320));
      setStatus(`Rejected ${overlayFeatureLabel(feature)}.`, 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not reject this overlay feature.', 'error');
    }
  });
  refs.tutorialStartBtn?.addEventListener('click', () => {
    refs.tutorial?.classList.remove('show');
  });
  refs.tutorialCancelBtn?.addEventListener('click', () => {
    refs.tutorial?.classList.remove('show');
    closeEditorSession();
  });
  document.getElementById('mainMenuBtn')?.addEventListener('click', () => closeEditorSession());
  state.refsBound = true;
}

function handleAuthChanged(user) {
  state.authUser = user || null;
  state.userIsAdmin = readAdminState(user || null);
  updateSubmissionListeners();
  renderUi();
}

function openEditorSession(options = {}) {
  if (!isEditorWorldSupported()) {
    setStatus('Overlay editor is supported only in the active Earth runtime.', 'error');
    return false;
  }
  bindCanvasEvents();
  bindRefEvents();
  ensureAuthObserver();
  collapseRuntimeUiForEditor();
  enterEditorPerformanceMode();
  state.active = true;
  state.viewMode = '3d';
  state.editorViewRestore = null;
  state.workspaceSidebarView = state.selectedFeatureId ? 'selection' : state.workspaceFeatures.length ? 'presets' : 'start';
  state.tab = sanitizeText(options.initialTab || 'workspace', 24).toLowerCase();
  if (state.tab === 'moderation' && !state.userIsAdmin) state.tab = 'workspace';
  if (options.resetWorkspace !== false && state.workspaceFeatures.length === 0) {
    resetWorkspace();
  }
  if (options.captureWorkspace !== false) {
    captureEditorWorkspaceSnapshot(options.workspaceSnapshot || {});
  }
  updateSubmissionListeners();
  refreshWorkspacePreview();
  state.peekWorld = false;
  state.helpOpen = false;
  state.helpContext = null;
  renderUi();
  if (options.initialView) applyEditorViewMode(options.initialView);
  const refs = getRefs();
  if (state.workspaceSnapshot) {
    const km = (Number(state.workspaceSnapshot.widthWorld || 0) / 1000).toFixed(1);
    setStatus(`Workspace snapshot captured (${km} km x ${km} km).`, 'ok');
  }
  if (!options.skipTutorial) refs.tutorial?.classList.add('show');
  return true;
}

function closeEditorSession(options = {}) {
  state.active = false;
  state.tab = 'workspace';
  state.workspaceSidebarView = 'start';
  state.selectedBaseFeature = null;
  state.pendingDraw = { type: '', points: [] };
  state.snapPoint = null;
  state.drag = null;
  state.drawGesture = null;
  state.drawGestureCandidate = null;
  state.previewRefreshQueued = false;
  state.previewOpen = false;
  state.peekWorld = false;
  state.helpOpen = false;
  state.helpContext = null;
  pauseEditorObservers();
  unbindCanvasEvents();
  restoreEditorViewMode();
  restoreEditorPerformanceMode();
  if (options.preserveTarget !== true) state.legacyCapturedTarget = null;
  if (options.preserveDraft !== true) state.legacyDraft = null;
  if (options.preserveSnapshot !== true) state.workspaceSnapshot = null;
  getRefs().tutorial?.classList.remove('show');
  refreshWorkspacePreview();
  renderUi();
  restoreRuntimeUiAfterEditor();
  return true;
}

function getEditorSnapshot() {
  return {
    active: state.active,
    tab: state.tab,
    tool: state.tool,
    activePresetId: state.activePresetId,
    workspaceCount: state.workspaceFeatures.length,
    selectedFeatureId: state.selectedFeatureId,
    ownFeatureCount: state.ownFeatures.length,
    moderationCount: state.moderationQueue.length,
    userIsAdmin: state.userIsAdmin,
    previewOpen: state.previewOpen,
    peekWorld: state.peekWorld,
    backendReady: overlayBackendReady(),
    capturedTarget: !!state.legacyCapturedTarget,
    workspaceSnapshotCaptured: !!state.workspaceSnapshot,
    workspaceSnapshotWidthWorld: Number(state.workspaceSnapshot?.widthWorld || 0),
    workspaceSnapshotHeightWorld: Number(state.workspaceSnapshot?.heightWorld || 0),
    draftEditType: sanitizeText(state.legacyDraft?.editType || '', 40).toLowerCase(),
    draftPreviewVisible: state.previewOpen && state.workspaceFeatures.length > 0,
    supportedEditTypes: LEGACY_EDITOR_EDIT_TYPES.slice()
  };
}

function initEditorSession() {
  bindRefEvents();
  resetWorkspace();
  Object.assign(appCtx, {
    captureEditorHereTarget,
    captureEditorWorkspaceSnapshot,
    closeEditorSession,
    getEditorSnapshot,
    openEditorSession,
    previewEditorDraft,
    setEditorDraft,
    toggleEditorSession() {
      return state.active ? closeEditorSession() : openEditorSession();
    }
  });
  renderUi();
}

export {
  captureEditorHereTarget,
  closeEditorSession,
  getEditorSnapshot,
  initEditorSession,
  openEditorSession,
  previewEditorDraft,
  setEditorDraft
};
