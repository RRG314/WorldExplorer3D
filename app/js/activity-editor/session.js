import { ctx as appCtx } from '../shared-context.js?v=55';
import { EditorHistoryStack } from '../editor/history.js?v=1';
import {
  createDefaultAnchorDraft,
  defaultAnchorTypeForTemplate,
  defaultTemplateForTraversalMode,
  getActivityAnchorType,
  getActivityTemplate,
  orderedRouteAnchors,
  sanitizeText
} from './schema.js?v=2';
import { validateActivityDraft } from './validation.js?v=2';
import { resolvePlacementCandidateFromPointer } from './environment.js?v=9';
import { ensureSceneGroups, refreshActivityScene } from './renderer.js?v=2';
import { createActivityCreatorCanvasApi } from './session-canvas.js?v=1';
import {
  bindRefEvents as bindActivityCreatorRefEvents,
  renderUi as renderActivityCreatorUi
} from './session-ui.js?v=3';
import { createActivityCreatorTestingApi } from './session-testing.js?v=1';
import { createActivityCreatorGuideApi, defaultCreatorGuideState } from './session-guide.js?v=1';
import { getRefs } from './session-refs.js?v=1';
import { createActivityCreatorViewApi } from './session-view.js?v=1';

const state = {
  active: false,
  templateId: 'driving_route',
  anchorTypeId: 'start',
  draftTitle: '',
  draftDescription: '',
  audience: 'library',
  tool: 'place',
  anchors: [],
  selectedAnchorId: '',
  snapEnabled: true,
  placementHeightOffset: 0,
  viewMode: '3d',
  creatorViewRestore: null,
  creatorPerfRestore: null,
  creatorRenderQualityRestore: '',
  status: { text: 'Activity creator is ready.', tone: 'info' },
  history: new EditorHistoryStack(120),
  cursor: null,
  drag: null,
  testing: {
    active: false,
    restore: null,
    currentTargetId: '',
    currentIndex: 0,
    sequence: [],
    completed: [],
    startedAt: 0,
    message: '',
    lastUiAt: 0
  },
  guide: defaultCreatorGuideState(),
  guideOpen: true,
  sceneRefreshQueued: false,
  canvasBound: false,
  refsBound: false,
  canvasElement: null
};

const sceneState = {
  initialized: false,
  routeGroup: null,
  anchorGroup: null,
  ghostGroup: null,
  handleGroup: null
};
const creatorGuideApi = createActivityCreatorGuideApi({ state, sanitizeText, selectedTemplate, hasAnchorType });
const { currentCreatorGuideStep, loadCreatorGuideState, markCreatorGuideProgress, saveCreatorGuideState } = creatorGuideApi;


function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function uniqueId(prefix = 'activity') {
  return `${sanitizeText(prefix, 24).toLowerCase()}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildActivityCreatorUiContext() {
  return {
    appCtx,
    state,
    activityIssues,
    applyCreatorViewMode,
    applyHistorySnapshot,
    closeActivityCreator,
    currentActivitySnapshot,
    currentCreatorGuideStep,
    currentLocationLabel,
    currentRoomCreationContext,
    defaultCreatorGuideState,
    defaultDraftTitleForTemplate,
    deleteSelectedAnchor,
    ensureDraftMetadata,
    escapeHtml,
    finiteNumber,
    getRefs,
    markCreatorGuideProgress,
    moveCheckpoint,
    pushHistory,
    refreshScenePreview,
    renderUi,
    revalidateAnchors,
    resetDraft,
    saveCreatorGuideState,
    selectedAnchor,
    selectedTemplate,
    setAnchorSelection,
    setStatus,
    startTestMode,
    stopTestMode,
    updateAnchor
  };
}

function selectedAnchor() {
  return state.anchors.find((anchor) => anchor.id === state.selectedAnchorId) || null;
}

function selectedTemplate() {
  return getActivityTemplate(state.templateId);
}

function currentRoomCreationContext() {
  const room = typeof appCtx.getCurrentMultiplayerRoom === 'function'
    ? appCtx.getCurrentMultiplayerRoom()
    : null;
  const canManage = typeof appCtx.canManageCurrentRoomActivities === 'function'
    ? appCtx.canManageCurrentRoomActivities()
    : false;
  return {
    room,
    canManage,
    available: !!(room && room.code && canManage)
  };
}

function requiredAnchorRule(anchorTypeId = '') {
  return selectedTemplate().requiredAnchors.find((entry) => entry.id === sanitizeText(anchorTypeId, 48).toLowerCase()) || null;
}

function hasAnchorType(anchorTypeId = '', min = 1) {
  return state.anchors.filter((anchor) => anchor.typeId === sanitizeText(anchorTypeId, 48).toLowerCase()).length >= min;
}

function defaultDraftTitleForTemplate(template = selectedTemplate()) {
  return sanitizeText(template?.label || 'Creator Activity', 120) || 'Creator Activity';
}

function ensureDraftMetadata(options = {}) {
  const forceTitle = options.forceTitle === true;
  const nextTitle = sanitizeText(state.draftTitle || '', 120);
  if (forceTitle || !nextTitle) {
    state.draftTitle = defaultDraftTitleForTemplate();
  } else {
    state.draftTitle = nextTitle;
  }
  state.draftDescription = sanitizeText(state.draftDescription || '', 220);
}

function defaultTemplateFromRuntime() {
  if (appCtx.activeInterior) return getActivityTemplate('interior_route');
  const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : '';
  if (mode === 'boat') return getActivityTemplate('boat_course');
  if (mode === 'drone') return getActivityTemplate('drone_course');
  if (mode === 'walk') return getActivityTemplate('walking_route');
  return defaultTemplateForTraversalMode(mode || 'drive');
}

function setStatus(text, tone = 'info') {
  state.status = {
    text: sanitizeText(text || 'Activity creator is ready.', 220),
    tone: sanitizeText(tone || 'info', 16).toLowerCase()
  };
  renderUi();
}

function currentActivitySnapshot() {
  return {
    templateId: state.templateId,
    anchorTypeId: state.anchorTypeId,
    tool: state.tool,
    anchors: cloneJson(state.anchors),
    selectedAnchorId: state.selectedAnchorId,
    snapEnabled: state.snapEnabled,
    placementHeightOffset: state.placementHeightOffset
  };
}

function pushHistory() {
  state.history.push(currentActivitySnapshot());
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot) return false;
  state.templateId = sanitizeText(snapshot.templateId || state.templateId, 80).toLowerCase();
  state.anchorTypeId = sanitizeText(snapshot.anchorTypeId || state.anchorTypeId, 80).toLowerCase();
  state.tool = sanitizeText(snapshot.tool || state.tool, 24).toLowerCase();
  state.anchors = Array.isArray(snapshot.anchors) ? cloneJson(snapshot.anchors) : [];
  state.selectedAnchorId = sanitizeText(snapshot.selectedAnchorId || '', 80).toLowerCase();
  state.snapEnabled = snapshot.snapEnabled !== false;
  state.placementHeightOffset = finiteNumber(snapshot.placementHeightOffset, 0);
  revalidateAnchors();
  refreshScenePreview();
  renderUi();
  return true;
}

function activityIssues() {
  return validateActivityDraft({ templateId: state.templateId, anchors: state.anchors });
}

function currentLocationLabel() {
  return sanitizeText(appCtx.customLoc?.name || appCtx.LOCS?.[appCtx.selLoc]?.name || 'Current Location', 120);
}

function expectedPlacementModeForAnchor(anchor) {
  const template = selectedTemplate();
  const anchorType = getActivityAnchorType(anchor.typeId);
  if (anchorType.placementMode && anchorType.placementMode !== 'template_default') return anchorType.placementMode;
  return template.preferredSurface || 'walk';
}

function anchorEnvironmentMatches(anchor) {
  const mode = expectedPlacementModeForAnchor(anchor);
  const env = sanitizeText(anchor.environment || '', 48).toLowerCase();
  if (mode === 'road') return env === 'road';
  if (mode === 'walk') return env === 'terrain' || env === 'road' || env === 'path' || env === 'urban_surface' || env === 'interior';
  if (mode === 'rooftop') return env === 'rooftop';
  if (mode === 'interior') return env === 'interior';
  if (mode === 'water_surface') return env === 'water_surface' || env === 'dock';
  if (mode === 'dock') return env === 'dock' || env === 'water_surface';
  if (mode === 'underwater') return env === 'underwater';
  if (mode === 'air') return env === 'air';
  return true;
}

function revalidateAnchors() {
  state.anchors = state.anchors.map((anchor) => {
    const valid = anchor.valid !== false && anchorEnvironmentMatches(anchor);
    return {
      ...anchor,
      valid,
      invalidReason: valid ? '' : anchor.invalidReason || 'Move this anchor onto a valid surface for the active template.'
    };
  });
}

function defaultLabelForAnchorType(anchorTypeId) {
  const anchorType = getActivityAnchorType(anchorTypeId);
  const existing = state.anchors.filter((anchor) => anchor.typeId === anchorTypeId).length;
  return `${anchorType.label} ${existing + 1}`;
}

function routeSequenceForTesting() {
  const template = selectedTemplate();
  if (template.id === 'collectible_hunt') {
    const start = state.anchors.find((anchor) => anchor.typeId === 'start') || null;
    const collectibles = state.anchors.filter((anchor) => anchor.typeId === 'collectible');
    const finish = state.anchors.find((anchor) => anchor.typeId === 'finish') || null;
    return [start, ...collectibles, finish].filter(Boolean);
  }
  if (template.id === 'fishing_trip') {
    const start = state.anchors.find((anchor) => anchor.typeId === 'start') || null;
    const zones = state.anchors.filter((anchor) => anchor.typeId === 'fishing_zone');
    const dockPoint = state.anchors.find((anchor) => anchor.typeId === 'dock_point') || null;
    const finish = state.anchors.find((anchor) => anchor.typeId === 'finish') || null;
    return [start, ...zones, dockPoint || finish].filter(Boolean);
  }
  return orderedRouteAnchors(state.anchors);
}

const testingApi = createActivityCreatorTestingApi({
  appCtx,
  state,
  selectedTemplate,
  activityIssues,
  routeSequenceForTesting,
  markCreatorGuideProgress,
  refreshScenePreview,
  renderUi,
  setStatus,
  finiteNumber
});
const {
  applyRuntimeState,
  startTestMode,
  stopTestMode,
  updateTestingState
} = testingApi;

function setAnchorSelection(anchorId = '') {
  state.selectedAnchorId = sanitizeText(anchorId || '', 80).toLowerCase();
  renderUi();
  refreshScenePreview();
}

function updateAnchor(anchorId, mutator) {
  const index = state.anchors.findIndex((anchor) => anchor.id === anchorId);
  if (index < 0) return false;
  const next = cloneJson(state.anchors[index]);
  mutator(next);
  state.anchors.splice(index, 1, next);
  revalidateAnchors();
  scheduleSceneRefresh();
  if (!state.drag) renderUi();
  return true;
}

function applyCandidateToAnchor(anchor, candidate, options = {}) {
  const keepHeightOffset = options.keepHeightOffset === true;
  anchor.x = candidate.x;
  anchor.z = candidate.z;
  anchor.baseY = finiteNumber(candidate.baseY, anchor.baseY);
  if (keepHeightOffset) {
    anchor.y = anchor.baseY + finiteNumber(anchor.heightOffset, 0);
  } else {
    anchor.heightOffset = finiteNumber(candidate.heightOffset, anchor.heightOffset);
    anchor.y = finiteNumber(candidate.y, anchor.baseY + anchor.heightOffset);
  }
  anchor.environment = sanitizeText(candidate.surfaceType || anchor.environment, 48).toLowerCase();
  anchor.valid = candidate.valid !== false && anchorEnvironmentMatches(anchor);
  anchor.invalidReason = candidate.invalidReason || '';
  anchor.support = cloneJson(candidate.support || null);
}

function placeAnchorFromCursor() {
  if (!state.cursor) {
    setStatus('Move the cursor into the world before placing an anchor.', 'warning');
    return false;
  }
  if (state.cursor.valid === false) {
    setStatus(state.cursor.invalidReason || 'That anchor placement is invalid here.', 'error');
    return false;
  }
  const anchorType = getActivityAnchorType(state.anchorTypeId);
  const anchor = createDefaultAnchorDraft(anchorType.id, {
    id: uniqueId(anchorType.id),
    label: defaultLabelForAnchorType(anchorType.id),
    x: state.cursor.x,
    y: state.cursor.y,
    z: state.cursor.z,
    baseY: state.cursor.baseY,
    heightOffset: state.cursor.heightOffset,
    environment: state.cursor.surfaceType,
    valid: state.cursor.valid !== false,
    invalidReason: state.cursor.invalidReason,
    support: state.cursor.support,
    yaw: 0
  });
  state.anchors.push(anchor);
  if (!state.guide.started) markCreatorGuideProgress({ started: true });
  revalidateAnchors();
  setAnchorSelection(anchor.id);
  pushHistory();
  if (anchorType.id === 'start') state.anchorTypeId = 'checkpoint';
  setStatus(`${anchorType.label} placed.`, 'ok');
  return true;
}

function deleteSelectedAnchor() {
  const anchor = selectedAnchor();
  if (!anchor) {
    setStatus('Select an anchor before deleting it.', 'warning');
    return false;
  }
  state.anchors = state.anchors.filter((entry) => entry.id !== anchor.id);
  state.selectedAnchorId = '';
  revalidateAnchors();
  pushHistory();
  refreshScenePreview();
  renderUi();
  setStatus(`${getActivityAnchorType(anchor.typeId).label} removed.`, 'ok');
  return true;
}

function moveCheckpoint(anchorId, direction) {
  const checkpoints = state.anchors.filter((anchor) => anchor.typeId === 'checkpoint');
  const checkpointIndex = checkpoints.findIndex((anchor) => anchor.id === anchorId);
  if (checkpointIndex < 0) return false;
  const nextIndex = direction === 'up' ? checkpointIndex - 1 : checkpointIndex + 1;
  if (nextIndex < 0 || nextIndex >= checkpoints.length) return false;
  const currentId = checkpoints[checkpointIndex].id;
  const swapId = checkpoints[nextIndex].id;
  const currentPos = state.anchors.findIndex((anchor) => anchor.id === currentId);
  const swapPos = state.anchors.findIndex((anchor) => anchor.id === swapId);
  if (currentPos < 0 || swapPos < 0) return false;
  const next = state.anchors.slice();
  [next[currentPos], next[swapPos]] = [next[swapPos], next[currentPos]];
  state.anchors = next;
  pushHistory();
  refreshScenePreview();
  renderUi();
  return true;
}

function resetDraft() {
  state.anchors = [];
  state.selectedAnchorId = '';
  state.anchorTypeId = defaultAnchorTypeForTemplate(state.templateId).id;
  state.draftTitle = defaultDraftTitleForTemplate();
  state.draftDescription = '';
  state.cursor = null;
  state.drag = null;
  state.history.clear();
  pushHistory();
  refreshScenePreview();
  renderUi();
  setStatus('Activity draft cleared.', 'ok');
}

function pickAnchorFromPointer(event) {
  if (typeof THREE === 'undefined' || !sceneState.anchorGroup || !appCtx.camera || !appCtx.renderer?.domElement) return '';
  const rect = appCtx.renderer.domElement.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return '';
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, appCtx.camera);
  const hits = raycaster.intersectObjects(sceneState.anchorGroup.children, true);
  const hit = hits.find((entry) => entry.object?.userData?.activityAnchorId || entry.object?.parent?.userData?.activityAnchorId);
  if (!hit) return '';
  return sanitizeText(hit.object?.userData?.activityAnchorId || hit.object?.parent?.userData?.activityAnchorId || '', 80).toLowerCase();
}

function scheduleSceneRefresh() {
  if (state.sceneRefreshQueued) return;
  state.sceneRefreshQueued = true;
  requestAnimationFrame(() => {
    state.sceneRefreshQueued = false;
    refreshScenePreview();
  });
}

function refreshScenePreview() {
  ensureSceneGroups(sceneState);
  refreshActivityScene(sceneState, {
    active: state.active,
    anchors: state.anchors,
    selectedAnchorId: state.selectedAnchorId,
    tool: state.tool,
    cursor: state.cursor,
    anchorTypeId: state.anchorTypeId,
    testing: state.testing,
    cursorRadius: getActivityAnchorType(state.anchorTypeId).defaultRadius || 18,
    cursorSizeX: getActivityAnchorType(state.anchorTypeId).defaultSize?.x || 14,
    cursorSizeY: getActivityAnchorType(state.anchorTypeId).defaultSize?.y || 6,
    cursorSizeZ: getActivityAnchorType(state.anchorTypeId).defaultSize?.z || 14
  });
}

const creatorViewApi = createActivityCreatorViewApi({
  appCtx,
  state,
  sanitizeText,
  setStatus: (...args) => setStatus(...args),
  renderUi: () => renderUi()
});
const { collapseRuntimeUiForCreator, restoreRuntimeUiAfterCreator, captureCreatorViewRestoreState, applyCreatorViewMode, restoreCreatorViewMode, enterCreatorPerformanceMode, restoreCreatorPerformanceMode } = creatorViewApi;

const canvasApi = createActivityCreatorCanvasApi({
  appCtx,
  state,
  selectedAnchor,
  resolvePlacementCandidateFromPointer,
  setStatus,
  setAnchorSelection,
  placeAnchorFromCursor,
  updateAnchor,
  applyCandidateToAnchor,
  clamp,
  finiteNumber,
  revalidateAnchors,
  pushHistory,
  refreshScenePreview,
  renderUi,
  deleteSelectedAnchor,
  closeActivityCreator,
  startTestMode,
  stopTestMode,
  currentActivitySnapshot,
  applyHistorySnapshot,
  pickAnchorFromPointer,
  scheduleSceneRefresh
});
const { bindCanvasEvents, unbindCanvasEvents } = canvasApi;

function bindRefEvents() {
  bindActivityCreatorRefEvents(buildActivityCreatorUiContext());
}

function renderUi() {
  renderActivityCreatorUi(buildActivityCreatorUiContext());
}

function updateActivityCreator() {
  if (!state.active || !state.testing.active) return;
  updateTestingState();
}

function isActivityCreatorSupported() {
  if (!appCtx.gameStarted) return false;
  if (appCtx.oceanMode?.active || appCtx.spaceFlight?.active || appCtx.onMoon) return false;
  if (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH)) return false;
  return !!appCtx.scene && !!appCtx.camera && !!appCtx.renderer?.domElement;
}

function openActivityCreator(options = {}) {
  if (!isActivityCreatorSupported()) {
    setStatus('Activity creator currently runs in the active Earth world runtime.', 'error');
    return false;
  }
  const editorSnapshot = typeof appCtx.getEditorSnapshot === 'function' ? appCtx.getEditorSnapshot() : null;
  if (editorSnapshot?.active && typeof appCtx.closeEditorSession === 'function') {
    appCtx.closeEditorSession({ preserveDraft: true, preserveTarget: true });
  }
  if (typeof appCtx.closeActivityBrowser === 'function') {
    appCtx.closeActivityBrowser();
  }
  bindCanvasEvents();
  bindRefEvents();
  collapseRuntimeUiForCreator();
  enterCreatorPerformanceMode();
  state.active = true;
  if (options.resetDraft === true) {
    state.anchors = [];
    state.selectedAnchorId = '';
  }
  if (!state.anchors.length) {
    const template = defaultTemplateFromRuntime();
    state.templateId = template.id;
    state.anchorTypeId = defaultAnchorTypeForTemplate(template.id).id;
  }
  ensureDraftMetadata({ forceTitle: !state.draftTitle });
  state.guideOpen = state.guide.completed !== true;
  revalidateAnchors();
  state.testing.active = false;
  state.cursor = null;
  state.drag = null;
  pushHistory();
  refreshScenePreview();
  renderUi();
  setStatus('Activity creator is ready. Pick an anchor type and place it in the world.', 'ok');
  return true;
}

function closeActivityCreator() {
  if (state.testing.active) stopTestMode();
  state.active = false;
  state.cursor = null;
  state.drag = null;
  unbindCanvasEvents();
  restoreCreatorViewMode();
  restoreCreatorPerformanceMode();
  refreshScenePreview();
  renderUi();
  restoreRuntimeUiAfterCreator();
  return true;
}

function getActivityCreatorSnapshot() {
  return {
    active: state.active,
    templateId: state.templateId,
    anchorTypeId: state.anchorTypeId,
    tool: state.tool,
    anchorCount: state.anchors.length,
    selectedAnchorId: state.selectedAnchorId,
    testing: state.testing.active,
    valid: activityIssues().valid
  };
}

function initActivityCreator() {
  bindRefEvents();
  const template = defaultTemplateFromRuntime();
  state.templateId = template.id;
  state.anchorTypeId = defaultAnchorTypeForTemplate(template.id).id;
  state.draftTitle = defaultDraftTitleForTemplate(template);
  state.draftDescription = '';
  state.guide = loadCreatorGuideState();
  state.guideOpen = state.guide.completed !== true;
  state.history.clear();
  pushHistory();
  Object.assign(appCtx, {
    closeActivityCreator,
    getActivityCreatorSnapshot,
    openActivityCreator,
    updateActivityCreator
  });
  renderUi();
}

export {
  closeActivityCreator,
  getActivityCreatorSnapshot,
  initActivityCreator,
  openActivityCreator,
  updateActivityCreator
};
