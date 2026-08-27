import { observeAuth } from '../../../js/auth-ui.js?v=55';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { featureWorldCenter, sampleSurfaceY, worldToGeoPoint } from './geometry.js?v=1';
import { EditorHistoryStack } from './history.js?v=1';
import { DEFAULT_EDITOR_HELP_TOPIC } from './help.js?v=1';
import { overlayBackendReady } from './store.js?v=1';
import { overlayFeatureLabel } from './schema.js?v=1';
import {
  applyEditorViewMode as applyEditorSessionViewMode,
  closeHelpDrawer as closeEditorHelpDrawer,
  collapseRuntimeUiForEditor as collapseEditorRuntimeUi,
  enterEditorPerformanceMode as enterEditorSessionPerformanceMode,
  openHelpDrawer as openEditorHelpDrawer,
  restoreEditorPerformanceMode as restoreEditorSessionPerformanceMode,
  restoreEditorViewMode as restoreEditorSessionViewMode,
  restoreRuntimeUiAfterEditor as restoreEditorRuntimeUi
} from './session-runtime-ui.js?v=2';
import {
  scheduleWorkspacePreviewRefresh as scheduleEditorWorkspacePreviewRefresh,
  refreshWorkspacePreview as refreshEditorWorkspacePreview
} from './session-scene.js?v=1';
import { bindRefEvents as bindEditorSessionRefEvents } from './session-events.js?v=3';
import { renderUi as renderEditorSessionUi } from './session-ui.js?v=2';
import {
  addWorkspaceFeature as addEditorWorkspaceFeature,
  applyHistorySnapshot as applyEditorHistorySnapshot,
  applySubmissionMetadata as applyEditorSubmissionMetadata,
  currentWorldKind as currentEditorWorldKind,
  deleteSelectedFeature as deleteEditorSelectedFeature,
  editorSnapshot as buildEditorSnapshot,
  focusFeatureInWorld as focusEditorFeatureInWorld,
  isEditorWorldSupported as isEditorSessionWorldSupported,
  pushHistory as pushEditorHistory,
  readAdminState as readEditorAdminState,
  removeWorkspaceFeature as removeEditorWorkspaceFeature,
  resetWorkspace as resetEditorWorkspace,
  resolveWorkspaceSidebarView as resolveEditorWorkspaceSidebarView,
  saveSelectedFeature as saveEditorSelectedFeature,
  selectedFeature as selectedEditorFeature,
  selectedFeatureValidation as selectedEditorFeatureValidation,
  selectedModerationFeature as selectedEditorModerationFeature,
  setSelectedFeature as setEditorSelectedFeature,
  setStatus as setEditorStatus,
  setWorkspaceSidebarView as setEditorWorkspaceSidebarView,
  submitSelectedFeatureForReview as submitEditorSelectedFeatureForReview,
  updateFeatureAtIndex as updateEditorFeatureAtIndex,
  updateSubmissionListeners as updateEditorSubmissionListeners,
  workspaceStage as resolveEditorWorkspaceStage
} from './session-workspace.js?v=1';
import {
  addEntranceAtCurrentPoint as addEditorEntranceAtCurrentPoint,
  bindCanvasEvents as bindEditorCanvasEvents,
  bindCanvasHandlers as bindEditorCanvasHandlers,
  mergeSelectedFeatures as mergeEditorSelectedFeatures,
  setActivePreset as setEditorActivePreset,
  setTool as setEditorTool,
  setToolForPreset as setEditorToolForPreset,
  unbindCanvasEvents as unbindEditorCanvasEvents
} from './session-canvas.js?v=1';
import {
  captureEditorHereTarget as captureEditorLegacyTarget,
  previewEditorDraft as previewEditorLegacyDraft,
  setEditorDraft as setEditorLegacyDraft
} from './session-legacy.js?v=1';

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
  legacyDraft: null
};

const sceneState = {
  group: null,
  handleGroup: null,
  helperGroup: null
};

const sessionContext = {};

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
    blocksTabBtn: document.getElementById('editorTabBlocks'),
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

function buildEditorSessionContext() {
  Object.assign(sessionContext, {
    EDITOR_RENDER_GROUP_NAME,
    EDITOR_HANDLE_GROUP_NAME,
    EDITOR_HELP_GROUP_NAME,
    SNAP_DISTANCE,
    VERTEX_DISTANCE,
    FEATURE_SELECT_DISTANCE,
    appCtx,
    sceneState,
    state,
    overlayFeatureLabel,
    featureWorldCenter,
    sampleSurfaceY,
    worldToGeoPoint,
    cloneJson,
    sanitizeText,
    escapeHtml,
    getRefs,
    addEntranceAtCurrentPoint,
    addWorkspaceFeature,
    applyHistorySnapshot,
    applySubmissionMetadata,
    applyEditorViewMode,
    closeEditorSession,
    closeHelpDrawer,
    closePreviewDrawer,
    deleteSelectedFeature,
    editorSnapshot,
    focusFeatureInWorld,
    mergeSelectedFeatures,
    openEditorSession,
    openHelpDrawer,
    openPreviewDrawer,
    pushHistory,
    refreshWorkspacePreview,
    renderUi,
    resolveWorkspaceSidebarView,
    resetWorkspace,
    removeWorkspaceFeature,
    saveSelectedFeature,
    scheduleWorkspacePreviewRefresh,
    selectedFeature,
    selectedFeatureValidation,
    selectedModerationFeature,
    setActivePreset,
    setSelectedFeature,
    setStatus,
    setTool,
    setToolForPreset,
    setWorkspaceSidebarView,
    submitSelectedFeatureForReview,
    updateFeatureAtIndex,
    updateSubmissionListeners,
    workspaceStage
  });
  return sessionContext;
}

function selectedFeature() { return selectedEditorFeature(buildEditorSessionContext()); }
function selectedModerationFeature() { return selectedEditorModerationFeature(buildEditorSessionContext()); }
function setStatus(text, tone = 'info') { setEditorStatus(buildEditorSessionContext(), text, tone); }
function workspaceStage(feature = selectedFeature()) { return resolveEditorWorkspaceStage(buildEditorSessionContext(), feature); }
function resolveWorkspaceSidebarView(feature = selectedFeature()) { return resolveEditorWorkspaceSidebarView(buildEditorSessionContext(), feature); }
function setWorkspaceSidebarView(viewId) { return setEditorWorkspaceSidebarView(buildEditorSessionContext(), viewId); }
function editorSnapshot() { return buildEditorSnapshot(buildEditorSessionContext()); }
function pushHistory() { return pushEditorHistory(buildEditorSessionContext()); }
function applyHistorySnapshot(snapshot) { return applyEditorHistorySnapshot(buildEditorSessionContext(), snapshot); }
function resetWorkspace() { return resetEditorWorkspace(buildEditorSessionContext()); }
function currentWorldKind() { return currentEditorWorldKind(buildEditorSessionContext()); }
function isEditorWorldSupported() { return isEditorSessionWorldSupported(buildEditorSessionContext()); }
function readAdminState(user = state.authUser) { return readEditorAdminState(buildEditorSessionContext(), user); }
function selectedFeatureValidation() { return selectedEditorFeatureValidation(buildEditorSessionContext()); }
function applySubmissionMetadata(feature) { return applyEditorSubmissionMetadata(buildEditorSessionContext(), feature); }
function updateFeatureAtIndex(index, feature) { return updateEditorFeatureAtIndex(buildEditorSessionContext(), index, feature); }
function setSelectedFeature(featureId, options = {}) { return setEditorSelectedFeature(buildEditorSessionContext(), featureId, options); }
function addWorkspaceFeature(feature, options = {}) { return addEditorWorkspaceFeature(buildEditorSessionContext(), feature, options); }
function removeWorkspaceFeature(featureId) { return removeEditorWorkspaceFeature(buildEditorSessionContext(), featureId); }
function updateSubmissionListeners() { return updateEditorSubmissionListeners(buildEditorSessionContext()); }
async function saveSelectedFeature() { return saveEditorSelectedFeature(buildEditorSessionContext()); }
async function submitSelectedFeatureForReview() { return submitEditorSelectedFeatureForReview(buildEditorSessionContext()); }
async function deleteSelectedFeature() { return deleteEditorSelectedFeature(buildEditorSessionContext()); }
function focusFeatureInWorld(feature = selectedFeature()) { return focusEditorFeatureInWorld(buildEditorSessionContext(), feature); }
function captureEditorHereTarget() { return captureEditorLegacyTarget(buildEditorSessionContext()); }
function setEditorDraft(input = {}) { return setEditorLegacyDraft(buildEditorSessionContext(), input); }
function previewEditorDraft() { return previewEditorLegacyDraft(buildEditorSessionContext()); }
function setTool(toolId) { return setEditorTool(buildEditorSessionContext(), toolId); }
function setActivePreset(presetId) { return setEditorActivePreset(buildEditorSessionContext(), presetId); }
function setToolForPreset(presetId) { return setEditorToolForPreset(buildEditorSessionContext(), presetId); }
function mergeSelectedFeatures() { return mergeEditorSelectedFeatures(buildEditorSessionContext()); }
function addEntranceAtCurrentPoint() { return addEditorEntranceAtCurrentPoint(buildEditorSessionContext()); }
function bindCanvasEvents() { return bindEditorCanvasEvents(buildEditorSessionContext()); }
function unbindCanvasEvents() { return unbindEditorCanvasEvents(buildEditorSessionContext()); }

function scheduleWorkspacePreviewRefresh() {
  scheduleEditorWorkspacePreviewRefresh(buildEditorSessionContext());
}

function refreshWorkspacePreview() {
  refreshEditorWorkspacePreview(buildEditorSessionContext());
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

function openHelpDrawer(topicId = DEFAULT_EDITOR_HELP_TOPIC, context = null) {
  openEditorHelpDrawer(buildEditorSessionContext(), topicId, context);
}

function closeHelpDrawer() {
  closeEditorHelpDrawer(buildEditorSessionContext());
}

function applyEditorViewMode(mode = '3d') {
  applyEditorSessionViewMode(buildEditorSessionContext(), mode);
}

function renderUi() {
  renderEditorSessionUi(buildEditorSessionContext());
}

function bindRefEvents() {
  bindEditorSessionRefEvents(buildEditorSessionContext());
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
  bindEditorCanvasHandlers(buildEditorSessionContext());
  bindCanvasEvents();
  bindRefEvents();
  ensureAuthObserver();
  state.userIsAdmin = readAdminState(state.authUser);
  collapseEditorRuntimeUi(buildEditorSessionContext());
  enterEditorSessionPerformanceMode(buildEditorSessionContext());
  state.active = true;
  state.viewMode = '3d';
  state.editorViewRestore = null;
  state.workspaceSidebarView = state.selectedFeatureId ? 'selection' : state.workspaceFeatures.length ? 'presets' : 'start';
  state.tab = sanitizeText(options.initialTab || 'workspace', 24).toLowerCase();
  if (state.tab === 'moderation' && !state.userIsAdmin) state.tab = 'workspace';
  if (options.resetWorkspace !== false && state.workspaceFeatures.length === 0) {
    resetWorkspace();
  }
  updateSubmissionListeners();
  refreshWorkspacePreview();
  state.peekWorld = false;
  state.helpOpen = false;
  state.helpContext = null;
  renderUi();
  const refs = getRefs();
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
  restoreEditorSessionViewMode(buildEditorSessionContext());
  restoreEditorSessionPerformanceMode(buildEditorSessionContext());
  if (options.preserveTarget !== true) state.legacyCapturedTarget = null;
  if (options.preserveDraft !== true) state.legacyDraft = null;
  getRefs().tutorial?.classList.remove('show');
  refreshWorkspacePreview();
  renderUi();
  restoreEditorRuntimeUi(buildEditorSessionContext());
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
    draftEditType: sanitizeText(state.legacyDraft?.editType || '', 40).toLowerCase(),
    draftPreviewVisible: state.previewOpen && state.workspaceFeatures.length > 0,
    supportedEditTypes: LEGACY_EDITOR_EDIT_TYPES.slice(),
    worldKind: currentWorldKind()
  };
}

function initEditorSession() {
  bindRefEvents();
  resetWorkspace();
  Object.assign(appCtx, {
    captureEditorHereTarget,
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
