import { ctx as appCtx } from '../shared-context.js?v=55';
import { EditorHistoryStack } from '../editor/history.js?v=1';
import {
  buildActivitySummary,
  buildTemplateChecklist,
  countAnchorsByType,
  createDefaultAnchorDraft,
  defaultAnchorTypeForTemplate,
  defaultTemplateForTraversalMode,
  getActivityAnchorType,
  getActivityTemplate,
  listActivityTemplateGroups,
  listAnchorTypesForTemplate,
  orderedRouteAnchors,
  sanitizeText
} from './schema.js?v=2';
import { validateActivityDraft } from './validation.js?v=2';
import { resolvePlacementCandidateFromPointer } from './environment.js?v=2';
import { ensureSceneGroups, refreshActivityScene } from './renderer.js?v=2';
import { listStoredActivities, saveCreatorActivityDraft } from '../activity-discovery/library.js?v=2';
import { getCurrentCreatorIdentity, syncOwnCreatorActivityStats } from '../../../js/creator-profile-api.js?v=1';

const CREATOR_GUIDE_STORAGE_KEY = 'worldExplorer3D.activityCreatorGuide.v1';

function defaultCreatorGuideState() {
  return {
    started: false,
    tested: false,
    saved: false,
    completed: false,
    lastSavedActivityId: ''
  };
}

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

function loadCreatorGuideState() {
  if (typeof localStorage === 'undefined') return defaultCreatorGuideState();
  try {
    const raw = localStorage.getItem(CREATOR_GUIDE_STORAGE_KEY);
    if (!raw) return defaultCreatorGuideState();
    const parsed = JSON.parse(raw);
    return {
      started: parsed?.started === true,
      tested: parsed?.tested === true,
      saved: parsed?.saved === true,
      completed: parsed?.completed === true,
      lastSavedActivityId: sanitizeText(parsed?.lastSavedActivityId || '', 120).toLowerCase()
    };
  } catch (_) {
    return defaultCreatorGuideState();
  }
}

function saveCreatorGuideState() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CREATOR_GUIDE_STORAGE_KEY, JSON.stringify({
      started: state.guide.started === true,
      tested: state.guide.tested === true,
      saved: state.guide.saved === true,
      completed: state.guide.completed === true,
      lastSavedActivityId: sanitizeText(state.guide.lastSavedActivityId || '', 120).toLowerCase()
    }));
  } catch (_) {
    // Guide persistence should never interrupt creation.
  }
}

function uniqueId(prefix = 'activity') {
  return `${sanitizeText(prefix, 24).toLowerCase()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getRefs() {
  return {
    panel: document.getElementById('activityCreatorPanel'),
    title: document.getElementById('activityCreatorTitle'),
    subline: document.getElementById('activityCreatorSubline'),
    status: document.getElementById('activityCreatorStatus'),
    templateSelect: document.getElementById('activityCreatorTemplateSelect'),
    templateHelp: document.getElementById('activityCreatorTemplateHelp'),
    titleInput: document.getElementById('activityCreatorTitleInput'),
    descriptionInput: document.getElementById('activityCreatorDescriptionInput'),
    audienceSelect: document.getElementById('activityCreatorAudienceSelect'),
    audienceHelp: document.getElementById('activityCreatorAudienceHelp'),
    checklist: document.getElementById('activityCreatorChecklist'),
    validation: document.getElementById('activityCreatorValidation'),
    anchorPalette: document.getElementById('activityCreatorAnchorPalette'),
    anchorList: document.getElementById('activityCreatorAnchorList'),
    summary: document.getElementById('activityCreatorSummary'),
    inspector: document.getElementById('activityCreatorInspectorBody'),
    snapToggle: document.getElementById('activityCreatorSnapToggle'),
    placementOffsetInput: document.getElementById('activityCreatorPlacementOffset'),
    viewModeBtn: document.getElementById('activityCreatorViewModeBtn'),
    saveBtn: document.getElementById('activityCreatorSaveBtn'),
    closeBtn: document.getElementById('activityCreatorCloseBtn'),
    resetBtn: document.getElementById('activityCreatorResetBtn'),
    guideBtn: document.getElementById('activityCreatorGuideBtn'),
    testBtn: document.getElementById('activityCreatorTestBtn'),
    testBar: document.getElementById('activityCreatorTestBar'),
    testSummary: document.getElementById('activityCreatorTestSummary'),
    testStopBtn: document.getElementById('activityCreatorStopTestBtn'),
    toolDock: document.getElementById('activityCreatorToolDock'),
    guideCard: document.getElementById('activityCreatorGuideCard'),
    guideProgress: document.getElementById('activityCreatorGuideProgress'),
    guideTitle: document.getElementById('activityCreatorGuideTitle'),
    guideBody: document.getElementById('activityCreatorGuideBody'),
    guideActionBtn: document.getElementById('activityCreatorGuideActionBtn'),
    guideDismissBtn: document.getElementById('activityCreatorGuideDismissBtn'),
    guideRestartBtn: document.getElementById('activityCreatorGuideRestartBtn')
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

function markCreatorGuideProgress(patch = {}) {
  state.guide = {
    ...state.guide,
    ...patch
  };
  saveCreatorGuideState();
}

function creatorGuideStepIds() {
  const steps = [
    { id: 'intro' },
    { id: 'start', anchorTypeId: 'start', label: 'Start Point', min: 1 }
  ];
  selectedTemplate().requiredAnchors
    .filter((entry) => entry.id !== 'start' && (entry.min || 0) > 0)
    .forEach((entry) => {
      steps.push({
        id: `anchor_${entry.id}`,
        anchorTypeId: entry.id,
        label: entry.label,
        min: entry.min
      });
    });
  steps.push({ id: 'test' }, { id: 'save' });
  return steps;
}

function currentCreatorGuideStep() {
  const steps = creatorGuideStepIds();
  if (!state.guide.started) {
    return { ...steps[0], index: 1, total: steps.length };
  }
  for (let index = 1; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step.anchorTypeId) continue;
    if (!hasAnchorType(step.anchorTypeId, step.min || 1)) {
      return { ...step, index: index + 1, total: steps.length };
    }
  }
  if (!state.guide.tested) {
    const stepIndex = steps.findIndex((entry) => entry.id === 'test');
    return { ...steps[stepIndex], index: stepIndex + 1, total: steps.length };
  }
  if (!state.guide.saved) {
    const stepIndex = steps.findIndex((entry) => entry.id === 'save');
    return { ...steps[stepIndex], index: stepIndex + 1, total: steps.length };
  }
  return { id: 'complete', index: steps.length, total: steps.length };
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

function captureRuntimeState() {
  const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
  if (mode === 'boat') {
    return {
      mode,
      x: finiteNumber(appCtx.boat?.x, 0),
      y: finiteNumber(appCtx.boat?.y, 0),
      z: finiteNumber(appCtx.boat?.z, 0),
      angle: finiteNumber(appCtx.boat?.angle, 0)
    };
  }
  if (mode === 'drone') {
    return {
      mode,
      x: finiteNumber(appCtx.drone?.x, 0),
      y: finiteNumber(appCtx.drone?.y, 12),
      z: finiteNumber(appCtx.drone?.z, 0),
      angle: finiteNumber(appCtx.drone?.yaw, 0)
    };
  }
  if (mode === 'walk' && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    return {
      mode,
      x: finiteNumber(walker.x, 0),
      y: finiteNumber(walker.y, 1.7),
      z: finiteNumber(walker.z, 0),
      angle: finiteNumber(walker.angle || walker.yaw, 0)
    };
  }
  return {
    mode: 'drive',
    x: finiteNumber(appCtx.car?.x, 0),
    y: finiteNumber(appCtx.car?.y, 1.2),
    z: finiteNumber(appCtx.car?.z, 0),
    angle: finiteNumber(appCtx.car?.angle, 0)
  };
}

function applyDirectWalkPose(anchor) {
  if (!appCtx.Walk) return false;
  appCtx.Walk.setModeWalk();
  const walker = appCtx.Walk.state?.walker;
  if (!walker) return false;
  walker.x = anchor.x;
  walker.z = anchor.z;
  walker.y = anchor.y + 1.7;
  walker.vy = 0;
  walker.angle = anchor.yaw || 0;
  walker.yaw = anchor.yaw || 0;
  if (appCtx.Walk.state.characterMesh) {
    appCtx.Walk.state.characterMesh.position.set(anchor.x, anchor.y, anchor.z);
    appCtx.Walk.state.characterMesh.rotation.y = anchor.yaw || 0;
    appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
  }
  return true;
}

function applyDirectDrivePose(anchor) {
  if (typeof appCtx.setTravelMode === 'function') appCtx.setTravelMode('drive', { source: 'activity_creator_test', force: true });
  const resolved = typeof appCtx.resolveSafeWorldSpawn === 'function'
    ? appCtx.resolveSafeWorldSpawn(anchor.x, anchor.z, { mode: 'drive', angle: anchor.yaw || 0, source: 'activity_creator_test' })
    : null;
  if (resolved && typeof appCtx.applyResolvedWorldSpawn === 'function') {
    appCtx.applyResolvedWorldSpawn(resolved, { mode: 'drive' });
    appCtx.car.angle = anchor.yaw || appCtx.car.angle;
    if (appCtx.carMesh) appCtx.carMesh.rotation.y = appCtx.car.angle;
    return true;
  }
  appCtx.car.x = anchor.x;
  appCtx.car.z = anchor.z;
  appCtx.car.y = anchor.y + 1.1;
  appCtx.car.angle = anchor.yaw || 0;
  if (appCtx.carMesh) {
    appCtx.carMesh.position.set(appCtx.car.x, appCtx.car.y, appCtx.car.z);
    appCtx.carMesh.rotation.y = appCtx.car.angle;
    appCtx.carMesh.visible = true;
  }
  return true;
}

function applyDirectDronePose(anchor) {
  if (typeof appCtx.setTravelMode === 'function') appCtx.setTravelMode('drone', { source: 'activity_creator_test', force: true });
  if (!appCtx.drone) return false;
  appCtx.drone.x = anchor.x;
  appCtx.drone.z = anchor.z;
  appCtx.drone.y = anchor.y + Math.max(8, state.placementHeightOffset || 10);
  appCtx.drone.yaw = anchor.yaw || 0;
  appCtx.drone.roll = 0;
  return true;
}

function applyDirectBoatPose(anchor) {
  if (typeof appCtx.setTravelMode !== 'function') return false;
  const candidate = typeof appCtx.inspectBoatCandidate === 'function'
    ? appCtx.inspectBoatCandidate(anchor.x, anchor.z, 260, { allowSynthetic: true, waterKind: 'coastal' })
    : null;
  appCtx.setTravelMode('boat', {
    source: 'activity_creator_test',
    force: true,
    spawnX: anchor.x,
    spawnZ: anchor.z,
    yaw: anchor.yaw || 0,
    candidate: candidate || undefined
  });
  return true;
}

function applyRuntimeState(snapshot) {
  if (!snapshot) return false;
  const anchor = {
    x: finiteNumber(snapshot.x, 0),
    y: finiteNumber(snapshot.y, 0),
    z: finiteNumber(snapshot.z, 0),
    yaw: finiteNumber(snapshot.angle, 0)
  };
  if (snapshot.mode === 'boat') return applyDirectBoatPose(anchor);
  if (snapshot.mode === 'drone') return applyDirectDronePose(anchor);
  if (snapshot.mode === 'walk') return applyDirectWalkPose(anchor);
  return applyDirectDrivePose(anchor);
}

function applyTestSpawn(anchor) {
  const traversal = selectedTemplate().traversalMode;
  if (traversal === 'boat') return applyDirectBoatPose(anchor);
  if (traversal === 'drone') return applyDirectDronePose(anchor);
  if (traversal === 'submarine') return false;
  if (traversal === 'walk') return applyDirectWalkPose(anchor);
  return applyDirectDrivePose(anchor);
}

function currentReferencePose() {
  const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
  if (mode === 'boat') {
    return { x: finiteNumber(appCtx.boat?.x, 0), y: finiteNumber(appCtx.boat?.y, 0), z: finiteNumber(appCtx.boat?.z, 0) };
  }
  if (mode === 'drone') {
    return { x: finiteNumber(appCtx.drone?.x, 0), y: finiteNumber(appCtx.drone?.y, 0), z: finiteNumber(appCtx.drone?.z, 0) };
  }
  if (mode === 'walk' && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    return { x: finiteNumber(walker.x, 0), y: finiteNumber(walker.y, 0) - 1.7, z: finiteNumber(walker.z, 0) };
  }
  return { x: finiteNumber(appCtx.car?.x, 0), y: finiteNumber(appCtx.car?.y, 0), z: finiteNumber(appCtx.car?.z, 0) };
}

function anchorCaptureDistance(anchor) {
  if (!anchor) return 8;
  if (anchor.typeId === 'trigger_zone') return Math.max(3, Math.max(finiteNumber(anchor.sizeX, 12), finiteNumber(anchor.sizeZ, 12)) * 0.45);
  if (anchor.typeId === 'hazard_zone') return Math.max(4, Math.max(finiteNumber(anchor.sizeX, 16), finiteNumber(anchor.sizeZ, 16)) * 0.42);
  if (anchor.typeId === 'boost_ring') return Math.max(4, finiteNumber(anchor.radius, 6) * 0.72);
  if (anchor.typeId === 'buoy_gate') return Math.max(5, finiteNumber(anchor.radius, 10) * 0.7);
  if (anchor.typeId === 'fishing_zone') return Math.max(5, finiteNumber(anchor.radius, 18));
  if (anchor.typeId === 'dock_point' || anchor.typeId === 'finish') return 10;
  return 8;
}

function updateTestingState() {
  if (!state.testing.active) return;
  const sequence = Array.isArray(state.testing.sequence) ? state.testing.sequence : [];
  const target = sequence[state.testing.currentIndex] || null;
  if (!target) {
    state.testing.message = 'Activity complete. Return to creator when you are ready to refine it.';
    state.testing.currentTargetId = '';
    renderUi();
    return;
  }
  state.testing.currentTargetId = target.id;
  const pose = currentReferencePose();
  const distance = Math.hypot(target.x - pose.x, target.z - pose.z, target.y - pose.y);
  state.testing.message = `Target ${state.testing.currentIndex + 1}/${sequence.length}: ${target.label} • ${Math.round(distance)}m`;
  if (performance.now() - finiteNumber(state.testing.lastUiAt, 0) > 180) {
    state.testing.lastUiAt = performance.now();
    renderUi();
  }
  if (distance <= anchorCaptureDistance(target)) {
    state.testing.completed.push(target.id);
    state.testing.currentIndex += 1;
    const next = sequence[state.testing.currentIndex] || null;
    state.testing.currentTargetId = next?.id || '';
    state.testing.message = next
      ? `Checkpoint reached. Next target: ${next.label}`
      : 'Activity complete. Return to creator when you are ready to refine it.';
    refreshScenePreview();
    renderUi();
  }
}

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

function collapseRuntimeUiForCreator() {
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

function restoreRuntimeUiAfterCreator() {
  if (!appCtx.gameStarted) return;
  if (typeof appCtx.updateHUD === 'function') appCtx.updateHUD();
  if (typeof appCtx.drawMinimap === 'function') appCtx.drawMinimap();
  if (appCtx.showLargeMap && typeof appCtx.drawLargeMap === 'function') appCtx.drawLargeMap();
}

function captureCreatorViewRestoreState() {
  if (state.creatorViewRestore) return state.creatorViewRestore;
  state.creatorViewRestore = {
    walkView: sanitizeText(appCtx.Walk?.state?.view || '', 24).toLowerCase(),
    camMode: Number.isFinite(appCtx.camMode) ? appCtx.camMode : null
  };
  return state.creatorViewRestore;
}

function applyCreatorViewMode(mode = '3d') {
  const nextMode = sanitizeText(mode || '3d', 8).toLowerCase() === '2d' ? '2d' : '3d';
  state.viewMode = nextMode;
  if (nextMode === '2d') {
    captureCreatorViewRestoreState();
    if (appCtx.Walk?.state) {
      appCtx.Walk.state.view = 'overhead';
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
    } else if (Number.isFinite(appCtx.camMode)) {
      appCtx.camMode = 2;
    }
    setStatus('2D plan view enabled for anchor layout and route ordering.', 'ok');
  } else if (state.creatorViewRestore) {
    if (appCtx.Walk?.state && state.creatorViewRestore.walkView) {
      appCtx.Walk.state.view = state.creatorViewRestore.walkView;
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
    } else if (Number.isFinite(state.creatorViewRestore.camMode)) {
      appCtx.camMode = state.creatorViewRestore.camMode;
    }
    state.creatorViewRestore = null;
    setStatus('3D creator view restored.', 'ok');
  }
  renderUi();
}

function restoreCreatorViewMode() {
  if (!state.creatorViewRestore) {
    state.viewMode = '3d';
    return;
  }
  if (appCtx.Walk?.state && state.creatorViewRestore.walkView) {
    appCtx.Walk.state.view = state.creatorViewRestore.walkView;
    if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
  } else if (Number.isFinite(state.creatorViewRestore.camMode)) {
    appCtx.camMode = state.creatorViewRestore.camMode;
  }
  state.creatorViewRestore = null;
  state.viewMode = '3d';
}

function enterCreatorPerformanceMode() {
  const currentTier = typeof appCtx.getPerfAutoQualityTier === 'function' ? appCtx.getPerfAutoQualityTier() : '';
  const autoEnabled = typeof appCtx.getPerfAutoQualityEnabled === 'function' ? appCtx.getPerfAutoQualityEnabled() : false;
  state.creatorPerfRestore = {
    autoEnabled,
    tier: sanitizeText(currentTier || '', 24).toLowerCase()
  };
  const performanceTier = sanitizeText(appCtx.PERF_QUALITY_TIER_PERFORMANCE || 'performance', 24).toLowerCase();
  if (autoEnabled && performanceTier && currentTier !== performanceTier && typeof appCtx.setPerfAutoQualityTier === 'function') {
    appCtx.setPerfAutoQualityTier(performanceTier, { reason: 'activity_creator' });
  }
  const renderQuality = typeof appCtx.getRenderQualityLevel === 'function' ? appCtx.getRenderQualityLevel() : appCtx.renderQualityLevel;
  state.creatorRenderQualityRestore = sanitizeText(renderQuality || '', 24).toLowerCase();
  if (state.creatorRenderQualityRestore && state.creatorRenderQualityRestore !== 'low' && typeof appCtx.setRenderQualityLevel === 'function') {
    appCtx.setRenderQualityLevel('low', { persist: false });
  }
}

function restoreCreatorPerformanceMode() {
  const restore = state.creatorPerfRestore;
  const renderRestore = sanitizeText(state.creatorRenderQualityRestore || '', 24).toLowerCase();
  state.creatorPerfRestore = null;
  state.creatorRenderQualityRestore = '';
  if (restore?.autoEnabled === true && restore.tier && typeof appCtx.getPerfAutoQualityTier === 'function' && typeof appCtx.setPerfAutoQualityTier === 'function') {
    if (appCtx.getPerfAutoQualityTier() !== restore.tier) appCtx.setPerfAutoQualityTier(restore.tier, { reason: 'activity_creator_restore' });
  }
  if (renderRestore && typeof appCtx.getRenderQualityLevel === 'function' && typeof appCtx.setRenderQualityLevel === 'function') {
    if (appCtx.getRenderQualityLevel() !== renderRestore) appCtx.setRenderQualityLevel(renderRestore, { persist: false });
  }
}

function updateCursor(event) {
  if (!state.active || state.testing.active) return;
  const selected = selectedAnchor();
  const anchorTypeId = state.tool === 'place' ? state.anchorTypeId : selected?.typeId || state.anchorTypeId;
  const offset = state.tool === 'move' && selected ? finiteNumber(selected.heightOffset, 0) : finiteNumber(state.placementHeightOffset, 0);
  const candidate = resolvePlacementCandidateFromPointer(event, {
    templateId: state.templateId,
    anchorTypeId,
    heightOffset: offset,
    anchors: state.anchors,
    excludeAnchorId: selected?.id || '',
    snapEnabled: state.snapEnabled
  });
  state.cursor = candidate;
  scheduleSceneRefresh();
}

function handleCanvasPointerDown(event) {
  if (!state.active || state.testing.active || event.button !== 0) return;
  updateCursor(event);
  const hitAnchorId = pickAnchorFromPointer(event);
  if (state.tool === 'select') {
    setAnchorSelection(hitAnchorId);
    if (!hitAnchorId && state.cursor?.valid) setStatus('Nothing selected. Click an anchor to inspect or edit it.', 'info');
    return;
  }
  if (state.tool === 'place') {
    placeAnchorFromCursor();
    return;
  }
  const selected = hitAnchorId ? state.anchors.find((anchor) => anchor.id === hitAnchorId) || null : selectedAnchor();
  if (!selected) {
    setStatus('Select an anchor before using transform tools.', 'warning');
    return;
  }
  setAnchorSelection(selected.id);
  if (state.tool === 'move') {
    state.drag = {
      mode: 'move',
      anchorId: selected.id
    };
  } else if (state.tool === 'height') {
    state.drag = {
      mode: 'height',
      anchorId: selected.id,
      startClientY: event.clientY,
      startHeightOffset: finiteNumber(selected.heightOffset, 0)
    };
  } else if (state.tool === 'rotate') {
    state.drag = {
      mode: 'rotate',
      anchorId: selected.id,
      startClientX: event.clientX,
      startYaw: finiteNumber(selected.yaw, 0)
    };
  } else if (state.tool === 'scale') {
    state.drag = {
      mode: 'scale',
      anchorId: selected.id,
      startClientX: event.clientX,
      startRadius: finiteNumber(selected.radius, 18),
      startSizeX: finiteNumber(selected.sizeX, 12),
      startSizeY: finiteNumber(selected.sizeY, 6),
      startSizeZ: finiteNumber(selected.sizeZ, 12)
    };
  }
}

function handleCanvasPointerMove(event) {
  if (!state.active || state.testing.active) return;
  updateCursor(event);
  const selected = selectedAnchor();
  if (!state.drag || !selected) return;

  if (state.drag.mode === 'move' && state.cursor) {
    updateAnchor(state.drag.anchorId, (anchor) => {
      applyCandidateToAnchor(anchor, state.cursor, { keepHeightOffset: true });
    });
    return;
  }

  if (state.drag.mode === 'height') {
    const delta = (state.drag.startClientY - event.clientY) * 0.05;
    const nextOffset = clamp(state.drag.startHeightOffset + delta, -120, 320);
    updateAnchor(state.drag.anchorId, (anchor) => {
      anchor.heightOffset = nextOffset;
      anchor.y = anchor.baseY + nextOffset;
    });
    return;
  }

  if (state.drag.mode === 'rotate') {
    const delta = (event.clientX - state.drag.startClientX) * 0.01;
    updateAnchor(state.drag.anchorId, (anchor) => {
      anchor.yaw = state.drag.startYaw + delta;
    });
    return;
  }

  if (state.drag.mode === 'scale') {
    const delta = (event.clientX - state.drag.startClientX) * 0.05;
    updateAnchor(state.drag.anchorId, (anchor) => {
      if (anchor.typeId === 'fishing_zone') {
        anchor.radius = Math.max(4, state.drag.startRadius + delta);
      } else if (anchor.typeId === 'trigger_zone') {
        anchor.sizeX = Math.max(1.2, state.drag.startSizeX + delta);
        anchor.sizeZ = Math.max(1.2, state.drag.startSizeZ + delta);
        anchor.sizeY = Math.max(1, state.drag.startSizeY + delta * 0.3);
      }
    });
  }
}

function handleCanvasPointerUp() {
  if (!state.drag) return;
  state.drag = null;
  revalidateAnchors();
  pushHistory();
  refreshScenePreview();
  renderUi();
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
    const snapshot = state.history.undo(currentActivitySnapshot());
    if (snapshot) applyHistorySnapshot(snapshot);
    return;
  }
  if (((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'z') || ((event.metaKey || event.ctrlKey) && key === 'y')) {
    event.preventDefault();
    const snapshot = state.history.redo(currentActivitySnapshot());
    if (snapshot) applyHistorySnapshot(snapshot);
    return;
  }
  if (key === 'escape') {
    if (state.testing.active) {
      stopTestMode();
      return;
    }
    closeActivityCreator();
    return;
  }
  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    deleteSelectedAnchor();
    return;
  }
  if (key === '1') state.tool = 'select';
  else if (key === '2') state.tool = 'place';
  else if (key === '3') state.tool = 'move';
  else if (key === '4') state.tool = 'height';
  else if (key === '5') state.tool = 'rotate';
  else if (key === '6') state.tool = 'scale';
  else if (key === 'enter') {
    if (state.testing.active) stopTestMode();
    else startTestMode();
  } else {
    return;
  }
  event.preventDefault();
  renderUi();
  refreshScenePreview();
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

function handlePanelClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;

  const closeBtn = target.closest('#activityCreatorCloseBtn');
  if (closeBtn) {
    closeActivityCreator();
    return;
  }

  const stopBtn = target.closest('#activityCreatorStopTestBtn');
  if (stopBtn) {
    stopTestMode();
    return;
  }

  const resetBtn = target.closest('#activityCreatorResetBtn');
  if (resetBtn) {
    resetDraft();
    return;
  }

  const saveBtn = target.closest('#activityCreatorSaveBtn');
  if (saveBtn) {
    void saveCurrentActivity();
    return;
  }

  const guideBtn = target.closest('#activityCreatorGuideBtn');
  if (guideBtn) {
    state.guideOpen = true;
    renderUi();
    return;
  }

  const guideDismissBtn = target.closest('#activityCreatorGuideDismissBtn');
  if (guideDismissBtn) {
    state.guideOpen = false;
    renderUi();
    return;
  }

  const guideRestartBtn = target.closest('#activityCreatorGuideRestartBtn');
  if (guideRestartBtn) {
    restartCreatorGuide();
    return;
  }

  const guideActionBtn = target.closest('#activityCreatorGuideActionBtn');
  if (guideActionBtn) {
    void handleCreatorGuideAction();
    return;
  }

  const viewBtn = target.closest('#activityCreatorViewModeBtn');
  if (viewBtn) {
    applyCreatorViewMode(state.viewMode === '2d' ? '3d' : '2d');
    return;
  }

  const toolBtn = target.closest('[data-activity-tool]');
  if (toolBtn) {
    state.tool = sanitizeText(toolBtn.dataset.activityTool || 'place', 24).toLowerCase();
    renderUi();
    refreshScenePreview();
    return;
  }

  const actionBtn = target.closest('[data-activity-action]');
  if (actionBtn) {
    const action = sanitizeText(actionBtn.dataset.activityAction || '', 32).toLowerCase();
    if (action === 'undo') {
      const snapshot = state.history.undo(currentActivitySnapshot());
      if (snapshot) applyHistorySnapshot(snapshot);
    } else if (action === 'redo') {
      const snapshot = state.history.redo(currentActivitySnapshot());
      if (snapshot) applyHistorySnapshot(snapshot);
    } else if (action === 'test') {
      startTestMode();
    } else if (action === 'delete') {
      deleteSelectedAnchor();
    }
    return;
  }

  const anchorTypeBtn = target.closest('[data-activity-anchor-type]');
  if (anchorTypeBtn) {
    state.anchorTypeId = sanitizeText(anchorTypeBtn.dataset.activityAnchorType || 'start', 80).toLowerCase();
    state.tool = 'place';
    renderUi();
    refreshScenePreview();
    return;
  }

  const reorderBtn = target.closest('[data-activity-reorder]');
  if (reorderBtn) {
    moveCheckpoint(
      sanitizeText(reorderBtn.dataset.activityAnchorId || '', 80).toLowerCase(),
      sanitizeText(reorderBtn.dataset.activityReorder || '', 8).toLowerCase()
    );
    return;
  }

  const anchorRow = target.closest('[data-activity-anchor-id]');
  if (anchorRow) {
    setAnchorSelection(anchorRow.dataset.activityAnchorId || '');
    return;
  }
}

function handlePanelInput(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;

  if (target.id === 'activityCreatorTemplateSelect') {
    const previousTemplate = selectedTemplate();
    state.templateId = sanitizeText(target.value || state.templateId, 80).toLowerCase();
    if (!listAnchorTypesForTemplate(state.templateId).some((entry) => entry.id === state.anchorTypeId)) {
      state.anchorTypeId = defaultAnchorTypeForTemplate(state.templateId).id;
    }
    const previousTitle = sanitizeText(state.draftTitle || '', 120);
    if (!previousTitle || previousTitle === sanitizeText(previousTemplate.label || '', 120)) {
      state.draftTitle = defaultDraftTitleForTemplate();
    }
    if (!state.guide.started) markCreatorGuideProgress({ started: true });
    revalidateAnchors();
    pushHistory();
    ensureDraftMetadata();
    renderUi();
    refreshScenePreview();
    setStatus(`${selectedTemplate().label} template active.`, 'ok');
    return;
  }

  if (target.id === 'activityCreatorSnapToggle') {
    state.snapEnabled = target.checked !== false;
    renderUi();
    return;
  }

  if (target.id === 'activityCreatorPlacementOffset') {
    state.placementHeightOffset = finiteNumber(target.value, 0);
    renderUi();
    return;
  }

  if (target.id === 'activityCreatorTitleInput') {
    state.draftTitle = sanitizeText(target.value || '', 120);
    renderUi();
    return;
  }

  if (target.id === 'activityCreatorDescriptionInput') {
    state.draftDescription = sanitizeText(target.value || '', 220);
    renderUi();
    return;
  }
  if (target.id === 'activityCreatorAudienceSelect') {
    const next = sanitizeText(target.value || 'library', 24).toLowerCase();
    state.audience = next === 'room' ? 'room' : 'library';
    renderUi();
    return;
  }

  const fieldTarget = target.closest('[data-activity-field]');
  if (!fieldTarget) return;
  const field = sanitizeText(fieldTarget.dataset.activityField || '', 40).toLowerCase();
  const anchor = selectedAnchor();
  if (!anchor) return;
  updateAnchor(anchor.id, (entry) => {
    if (field === 'label') entry.label = sanitizeText(target.value || '', 80) || getActivityAnchorType(entry.typeId).label;
    else if (field === 'type_id') {
      entry.typeId = sanitizeText(target.value || entry.typeId, 80).toLowerCase();
      const anchorType = getActivityAnchorType(entry.typeId);
      if ((entry.typeId === 'fishing_zone' || entry.typeId === 'boost_ring' || entry.typeId === 'buoy_gate') && !(entry.radius > 0)) {
        entry.radius = anchorType.defaultRadius || 18;
      }
      if (entry.typeId === 'trigger_zone' || entry.typeId === 'hazard_zone') {
        entry.sizeX = anchorType.defaultSize?.x || entry.sizeX || 12;
        entry.sizeY = anchorType.defaultSize?.y || entry.sizeY || 6;
        entry.sizeZ = anchorType.defaultSize?.z || entry.sizeZ || 12;
      }
    } else if (field === 'yaw') entry.yaw = finiteNumber(target.value, 0);
    else if (field === 'height_offset') {
      entry.heightOffset = finiteNumber(target.value, 0);
      entry.y = entry.baseY + entry.heightOffset;
    } else if (field === 'radius') entry.radius = Math.max(4, finiteNumber(target.value, 18));
    else if (field === 'size_x') entry.sizeX = Math.max(1.2, finiteNumber(target.value, 12));
    else if (field === 'size_y') entry.sizeY = Math.max(1, finiteNumber(target.value, 6));
    else if (field === 'size_z') entry.sizeZ = Math.max(1.2, finiteNumber(target.value, 12));
  });
  if (event.type === 'change') pushHistory();
}

function bindRefEvents() {
  if (state.refsBound) return;
  const refs = getRefs();
  refs.panel?.addEventListener('click', handlePanelClick);
  refs.panel?.addEventListener('input', handlePanelInput);
  refs.panel?.addEventListener('change', handlePanelInput);
  state.refsBound = true;
}

function inspectorHtml(anchor) {
  if (!anchor) {
    return `
      <div class="activityCreatorEmptyState">
        Select an anchor in the world or from the anchor list to inspect it, move it, and adjust its properties.
      </div>
    `;
  }
  const allowedAnchorTypes = listAnchorTypesForTemplate(state.templateId);
  const anchorType = getActivityAnchorType(anchor.typeId);
  const sizeFields = anchor.typeId === 'fishing_zone' || anchor.typeId === 'boost_ring' || anchor.typeId === 'buoy_gate'
    ? `
      <label class="activityCreatorField">
        <span>${escapeHtml(anchor.typeId === 'fishing_zone' ? 'Zone Radius' : anchor.typeId === 'boost_ring' ? 'Ring Radius' : 'Gate Width')}</span>
        <input data-activity-field="radius" type="number" step="0.5" value="${escapeHtml(anchor.radius)}">
      </label>
    `
    : anchor.typeId === 'trigger_zone' || anchor.typeId === 'hazard_zone'
      ? `
        <div class="activityCreatorFieldGrid">
          <label class="activityCreatorField">
            <span>Size X</span>
            <input data-activity-field="size_x" type="number" step="0.5" value="${escapeHtml(anchor.sizeX)}">
          </label>
          <label class="activityCreatorField">
            <span>Size Y</span>
            <input data-activity-field="size_y" type="number" step="0.5" value="${escapeHtml(anchor.sizeY)}">
          </label>
          <label class="activityCreatorField">
            <span>Size Z</span>
            <input data-activity-field="size_z" type="number" step="0.5" value="${escapeHtml(anchor.sizeZ)}">
          </label>
        </div>
      `
      : '';
  const checkpointControls = anchor.typeId === 'checkpoint'
    ? `
      <div class="activityCreatorMiniRow">
        <button type="button" data-activity-reorder="up" data-activity-anchor-id="${escapeHtml(anchor.id)}">Move Earlier</button>
        <button type="button" data-activity-reorder="down" data-activity-anchor-id="${escapeHtml(anchor.id)}">Move Later</button>
      </div>
    `
    : '';
  return `
    <div class="activityCreatorInspectorTitle">${escapeHtml(anchor.label)}</div>
    <div class="activityCreatorInspectorMeta">${escapeHtml(anchorType.description)}</div>
    <div class="activityCreatorFieldStack">
      <label class="activityCreatorField">
        <span>Label</span>
        <input data-activity-field="label" type="text" maxlength="80" value="${escapeHtml(anchor.label)}">
      </label>
      <label class="activityCreatorField">
        <span>Anchor Type</span>
        <select data-activity-field="type_id">
          ${allowedAnchorTypes.map((entry) => `<option value="${escapeHtml(entry.id)}"${entry.id === anchor.typeId ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}
        </select>
      </label>
      <div class="activityCreatorFieldGrid">
        <label class="activityCreatorField">
          <span>Yaw</span>
          <input data-activity-field="yaw" type="number" step="0.05" value="${escapeHtml(anchor.yaw || 0)}">
        </label>
        <label class="activityCreatorField">
          <span>Height Offset</span>
          <input data-activity-field="height_offset" type="number" step="0.25" value="${escapeHtml(anchor.heightOffset || 0)}">
        </label>
      </div>
      ${sizeFields}
      ${checkpointControls}
    </div>
    <div class="activityCreatorMetaCard ${anchor.valid === false ? 'invalid' : ''}">
      <div><strong>Environment</strong> ${escapeHtml((anchor.environment || 'unresolved').replace(/_/g, ' '))}</div>
      <div><strong>World</strong> X ${anchor.x.toFixed(1)} • Y ${anchor.y.toFixed(1)} • Z ${anchor.z.toFixed(1)}</div>
      ${anchor.invalidReason ? `<div><strong>Issue</strong> ${escapeHtml(anchor.invalidReason)}</div>` : ''}
    </div>
    <div class="activityCreatorMiniRow">
      <button type="button" data-activity-action="delete">Delete Anchor</button>
    </div>
  `;
}

function selectCreatorAnchorType(anchorTypeId = '') {
  const nextId = sanitizeText(anchorTypeId || '', 48).toLowerCase();
  if (!nextId || !listAnchorTypesForTemplate(state.templateId).some((entry) => entry.id === nextId)) return false;
  state.anchorTypeId = nextId;
  state.tool = 'place';
  renderUi();
  refreshScenePreview();
  return true;
}

function creatorGuideConfig() {
  const template = selectedTemplate();
  const validation = activityIssues();
  const step = currentCreatorGuideStep();
  const roomContext = currentRoomCreationContext();
  const saveTargetLabel = state.audience === 'room' && roomContext.available
    ? `the current room (${roomContext.room?.code || 'room'})`
    : 'your creator library';
  const anchorType = step.anchorTypeId ? getActivityAnchorType(step.anchorTypeId) : null;
  const requirementCount = Math.max(1, Number(step.min || 1));
  const anchorRequirementCopy = anchorType
    ? {
      title: requirementCount > 1 ? `Add ${step.label}` : `Add ${anchorType.label}`,
      body: `${anchorType.description} Place ${requirementCount > 1 ? `at least ${requirementCount}` : 'one'} ${step.label.toLowerCase()} in the world so players know what to do next.`,
      actionLabel: `Select ${step.label}`
    }
    : null;
  const stepMap = {
    intro: {
      title: `Start with ${template.label}`,
      body: 'Pick a template for the kind of game you want to make. Then place a start point in the world. This beta creator saves to your local creator library so you can inspect and replay what you build.',
      actionLabel: "Let's Build"
    },
    test: {
      title: validation.valid ? 'Test the Activity' : 'Clear the Last Issues',
      body: validation.valid
        ? 'Your anchor setup is valid. Run Test Activity to spawn at the start and play through the route like a player would.'
        : 'Use the validation panel on the left to clear missing anchors or invalid placements. Once the draft is valid, run Test Activity.',
      actionLabel: validation.valid ? 'Start Test' : 'Show Validation'
    },
    save: {
      title: 'Save the Game',
      body: `Give the activity a clear title, then save it to ${saveTargetLabel}. You can inspect it from the Games browser after it saves.`,
      actionLabel: 'Save Activity'
    },
    complete: {
      title: 'Creator Walkthrough Complete',
      body: `This activity is now saved in ${saveTargetLabel}. You can keep refining it, or open the browser to inspect what you just made.`,
      actionLabel: 'Open Saved Activity'
    }
  };
  if (step.id === 'start' && anchorRequirementCopy) {
    return {
      ...step,
      title: 'Place the Start Point',
      body: `Choose Start Point from the anchor palette, then click in the world where players should begin the activity. Use 2D Plan if you want a top-down layout first.`,
      actionLabel: 'Select Start'
    };
  }
  if (step.anchorTypeId && step.id !== 'start' && anchorRequirementCopy) {
    return {
      ...step,
      ...anchorRequirementCopy
    };
  }
  return {
    ...step,
    ...(stepMap[step.id] || stepMap.intro)
  };
}

function renderCreatorGuide(refs) {
  if (!refs.guideCard || !state.active) return;
  const config = creatorGuideConfig();
  refs.guideCard.hidden = state.guideOpen !== true;
  if (refs.guideProgress) refs.guideProgress.textContent = config.id === 'complete' ? `Complete • ${config.total}/${config.total}` : `Step ${config.index} of ${config.total}`;
  if (refs.guideTitle) refs.guideTitle.textContent = config.title;
  if (refs.guideBody) refs.guideBody.textContent = config.body;
  if (refs.guideActionBtn) {
    refs.guideActionBtn.textContent = config.actionLabel;
    refs.guideActionBtn.disabled = config.id === 'complete' && !state.guide.lastSavedActivityId;
  }
}

async function saveCurrentActivity(options = {}) {
  const validation = activityIssues();
  if (!validation.valid) {
    setStatus('Fix validation issues before saving this activity.', 'error');
    return null;
  }
  if (!Array.isArray(state.anchors) || state.anchors.length === 0) {
    setStatus('Place at least one anchor before saving.', 'warning');
    return null;
  }
  ensureDraftMetadata();
  try {
    const creator = await getCurrentCreatorIdentity({
      fallbackName: appCtx.authUser?.displayName || 'Explorer'
    });
    const template = selectedTemplate();
    const roomContext = currentRoomCreationContext();
    const savingToRoom = state.audience === 'room' && roomContext.available;
    let saved = null;
    if (savingToRoom) {
      if (typeof appCtx.saveCurrentRoomActivity !== 'function') {
        throw new Error('Room game saving is unavailable right now.');
      }
      saved = await appCtx.saveCurrentRoomActivity({
        id: `room_${Date.now().toString(36)}`,
        templateId: state.templateId,
        title: state.draftTitle || template.label,
        description: state.draftDescription || template.description,
        traversalMode: template.traversalMode,
        preferredSurface: template.preferredSurface,
        creatorId: creator.creatorId,
        creatorName: creator.creatorName,
        creatorAvatar: creator.creatorAvatar,
        visibility: 'room',
        status: 'published',
        difficulty: activityIssues().issues.some((issue) => issue.severity === 'error') ? 'Needs Fixes' : 'Moderate',
        estimatedMinutes: Math.max(2, Math.min(45, Math.round(Math.max(2, state.anchors.length * 1.4)))),
        locationLabel: currentLocationLabel(),
        anchors: state.anchors
      });
    } else {
      saved = saveCreatorActivityDraft({
        templateId: state.templateId,
        anchors: state.anchors,
        name: state.draftTitle || template.label,
        description: state.draftDescription || '',
        creatorId: creator.creatorId,
        creatorAvatar: creator.creatorAvatar
      }, {
        title: state.draftTitle || template.label,
        description: state.draftDescription || '',
        creatorId: creator.creatorId,
        creatorName: creator.creatorName,
        creatorAvatar: creator.creatorAvatar,
        visibility: 'private',
        status: 'draft',
        locationLabel: currentLocationLabel()
      });
      await syncOwnCreatorActivityStats(listStoredActivities().filter((entry) => entry.creatorId === creator.creatorId));
    }
    markCreatorGuideProgress({
      saved: true,
      completed: state.guide.tested === true,
      lastSavedActivityId: saved.id
    });
    state.guideOpen = true;
    renderUi();
    setStatus(savingToRoom ? `Saved ${saved.title} as a room game.` : `Saved ${saved.title} to your creator library.`, 'ok');
    if (options.openBrowser === true && typeof appCtx.openActivityBrowser === 'function') {
      closeActivityCreator();
      await appCtx.openActivityBrowser({
        activityId: saved.id,
        scope: savingToRoom ? 'rooms' : 'creator'
      });
    }
    return saved;
  } catch (error) {
    setStatus(error?.message || 'Could not save this creator activity right now.', 'error');
    return null;
  }
}

function restartCreatorGuide() {
  state.guide = defaultCreatorGuideState();
  state.guideOpen = true;
  saveCreatorGuideState();
  renderUi();
  setStatus('Creator walkthrough restarted.', 'ok');
  return true;
}

async function handleCreatorGuideAction() {
  const step = currentCreatorGuideStep();
  if (step.id === 'intro') {
    markCreatorGuideProgress({ started: true });
    renderUi();
    setStatus('Pick a template and place the start point in the world.', 'ok');
    return true;
  }
  if (step.id === 'start') {
    setStatus('Start Point is selected. Click in the world to place it.', 'ok');
    return selectCreatorAnchorType('start');
  }
  if (step.anchorTypeId) {
    const anchorType = getActivityAnchorType(step.anchorTypeId);
    setStatus(`${anchorType.label} is selected. Click in the world to place it.`, 'ok');
    return selectCreatorAnchorType(step.anchorTypeId);
  }
  if (step.id === 'test') {
    if (!activityIssues().valid) {
      setStatus('Use the validation panel on the left to clear the remaining issues, then test again.', 'warning');
      return false;
    }
    return startTestMode();
  }
  if (step.id === 'save') {
    return !!(await saveCurrentActivity());
  }
  if (step.id === 'complete' && state.guide.lastSavedActivityId) {
    if (typeof appCtx.openActivityBrowser === 'function') {
      closeActivityCreator();
      await appCtx.openActivityBrowser({ activityId: state.guide.lastSavedActivityId });
      return true;
    }
  }
  return false;
}

function renderUi() {
  const refs = getRefs();
  if (!(refs.panel instanceof HTMLElement)) return;
  const template = selectedTemplate();
  const summary = buildActivitySummary({ templateId: state.templateId, anchors: state.anchors });
  const validation = activityIssues();
  const checklist = buildTemplateChecklist(state.templateId, state.anchors);
  const roomContext = currentRoomCreationContext();
  if (state.audience === 'room' && !roomContext.available) {
    state.audience = 'library';
  }
  const saveTargetLabel = state.audience === 'room' && roomContext.available
    ? `Current Room • ${sanitizeText(roomContext.room?.name || roomContext.room?.code || 'Room', 80)}`
    : 'Creator Library';

  refs.panel.classList.toggle('show', state.active);
  refs.panel.classList.toggle('activityCreatorTesting', state.testing.active === true);
  document.body.classList.toggle('activity-creator-open', state.active);
  document.body.classList.toggle('activity-creator-testing', state.active && state.testing.active === true);

  if (refs.title) refs.title.textContent = 'Activity Creator Beta';
  if (refs.subline) refs.subline.textContent = `${template.label} • ${template.description} • Beta local creator demo`;
  if (refs.status) {
    refs.status.textContent = state.status.text;
    refs.status.dataset.tone = state.status.tone;
  }
  if (refs.guideBtn) refs.guideBtn.textContent = state.guide.completed ? 'Guide' : 'Start Here';

  if (refs.templateSelect) {
    refs.templateSelect.innerHTML = listActivityTemplateGroups().map((group) => `
      <optgroup label="${escapeHtml(group.label)}">
        ${group.templates.map((entry) => `<option value="${escapeHtml(entry.id)}"${entry.id === state.templateId ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}
      </optgroup>
    `).join('');
  }
  if (refs.templateHelp) {
    refs.templateHelp.innerHTML = `
      <div>${escapeHtml(summary.description)}</div>
      <div>${template.help.map((entry) => escapeHtml(entry)).join('<br>')}</div>
      <div>${escapeHtml(state.audience === 'room' && roomContext.available
        ? 'Room games publish into the current multiplayer room so everyone in that room can start or join them together.'
        : 'Saved activities stay in your creator library on this browser until you publish them through a later backend workflow.')}</div>
    `;
  }
  if (refs.summary) {
    refs.summary.innerHTML = `
      <div class="activityCreatorSummaryTitle">${escapeHtml(state.draftTitle || summary.title)}</div>
      <div class="activityCreatorSummaryMeta">${escapeHtml(template.traversalMode)} • ${escapeHtml(template.preferredSurface.replace(/_/g, ' '))}</div>
      <div class="activityCreatorSummaryText">${escapeHtml(state.draftDescription || template.description)}</div>
    `;
  }
  if (refs.titleInput && document.activeElement !== refs.titleInput) refs.titleInput.value = state.draftTitle || '';
  if (refs.descriptionInput && document.activeElement !== refs.descriptionInput) refs.descriptionInput.value = state.draftDescription || '';
  if (refs.audienceSelect) {
    refs.audienceSelect.innerHTML = [
      '<option value="library">Creator Library</option>',
      roomContext.available
        ? `<option value="room">Current Room • ${escapeHtml(roomContext.room?.code || '')}</option>`
        : ''
    ].join('');
    refs.audienceSelect.value = state.audience === 'room' && roomContext.available ? 'room' : 'library';
    refs.audienceSelect.disabled = roomContext.available !== true && state.audience !== 'library';
  }
  if (refs.audienceHelp) {
    refs.audienceHelp.innerHTML = state.audience === 'room' && roomContext.available
      ? `Save this as a shared multiplayer game for <strong>${escapeHtml(roomContext.room?.name || roomContext.room?.code || 'your current room')}</strong>. Everyone in that room can join once the host starts it.`
      : roomContext.room
        ? `You are in room <strong>${escapeHtml(roomContext.room.name || roomContext.room.code || 'room')}</strong>. Switch Save To if you want to publish this draft as a shared room game.`
        : `Save to <strong>${escapeHtml(saveTargetLabel)}</strong> to keep a private creator draft on this device. Join and manage a multiplayer room if you want to publish a shared room game.`;
  }
  if (refs.checklist) {
    refs.checklist.innerHTML = checklist.map((entry) => `
      <div class="activityCreatorChecklistItem ${entry.satisfied ? 'ok' : 'warn'}">
        <span>${escapeHtml(entry.label)}</span>
        <strong>${entry.count}/${entry.min}${Number.isFinite(entry.max) ? `-${entry.max}` : '+'}</strong>
      </div>
    `).join('');
  }
  if (refs.validation) {
    refs.validation.innerHTML = validation.issues.length
      ? validation.issues.slice(0, 6).map((issue) => `
          <div class="activityCreatorIssue ${escapeHtml(issue.severity)}">
            <strong>${escapeHtml(issue.message)}</strong>
            ${issue.hint ? `<span>${escapeHtml(issue.hint)}</span>` : ''}
          </div>
        `).join('')
      : '<div class="activityCreatorIssue ok"><strong>Validation is clean.</strong><span>This draft is ready to test.</span></div>';
  }
  if (refs.anchorPalette) {
    refs.anchorPalette.innerHTML = listAnchorTypesForTemplate(state.templateId).map((anchorType) => `
      <button type="button" class="activityCreatorAnchorBtn ${anchorType.id === state.anchorTypeId ? 'active' : ''}" data-activity-anchor-type="${escapeHtml(anchorType.id)}">
        <span>${escapeHtml(anchorType.icon)}</span>
        <strong>${escapeHtml(anchorType.label)}</strong>
        <small>${escapeHtml(anchorType.description)}</small>
      </button>
    `).join('');
  }
  if (refs.anchorList) {
    refs.anchorList.innerHTML = state.anchors.length
      ? state.anchors.map((anchor) => `
          <div class="activityCreatorAnchorRow ${anchor.id === state.selectedAnchorId ? 'selected' : ''}" data-activity-anchor-id="${escapeHtml(anchor.id)}">
            <div>
              <strong>${escapeHtml(anchor.label)}</strong>
              <span>${escapeHtml(getActivityAnchorType(anchor.typeId).label)} • ${escapeHtml((anchor.environment || 'unresolved').replace(/_/g, ' '))}</span>
            </div>
            ${anchor.typeId === 'checkpoint' ? `
              <div class="activityCreatorRowActions">
                <button type="button" data-activity-reorder="up" data-activity-anchor-id="${escapeHtml(anchor.id)}">↑</button>
                <button type="button" data-activity-reorder="down" data-activity-anchor-id="${escapeHtml(anchor.id)}">↓</button>
              </div>
            ` : ''}
          </div>
        `).join('')
      : '<div class="activityCreatorEmptyState">No anchors yet. Pick an anchor type and click in the world to place it.</div>';
  }
  if (refs.inspector) refs.inspector.innerHTML = inspectorHtml(selectedAnchor());
  if (refs.snapToggle) refs.snapToggle.checked = state.snapEnabled;
  if (refs.placementOffsetInput && refs.placementOffsetInput.value !== String(state.placementHeightOffset)) refs.placementOffsetInput.value = String(state.placementHeightOffset);
  if (refs.viewModeBtn) refs.viewModeBtn.textContent = state.viewMode === '2d' ? '3D View' : '2D Plan';
  if (refs.testBtn) refs.testBtn.disabled = validation.valid !== true;
  if (refs.toolDock) {
    refs.toolDock.querySelectorAll('[data-activity-tool]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-activity-tool') === state.tool);
    });
  }
  if (refs.testBar) refs.testBar.hidden = state.testing.active !== true;
  if (refs.testSummary) refs.testSummary.textContent = state.testing.message || 'Testing activity';
  renderCreatorGuide(refs);
}

function startTestMode() {
  if (state.testing.active) return true;
  const validation = activityIssues();
  if (!validation.valid) {
    setStatus('Fix validation issues before entering test mode.', 'error');
    return false;
  }
  const sequence = routeSequenceForTesting();
  const startAnchor = sequence[0] || state.anchors.find((anchor) => anchor.typeId === 'start') || state.anchors[0] || null;
  if (!startAnchor) {
    setStatus('Add at least a start anchor before testing.', 'warning');
    return false;
  }
  state.testing.restore = captureRuntimeState();
  state.testing.active = true;
  state.testing.sequence = sequence.slice(1);
  state.testing.currentIndex = 0;
  state.testing.completed = startAnchor ? [startAnchor.id] : [];
  state.testing.startedAt = performance.now();
  state.testing.lastUiAt = 0;
  state.testing.currentTargetId = state.testing.sequence[0]?.id || '';
  const applied = applyTestSpawn(startAnchor);
  if (!applied) {
    state.testing.active = false;
    setStatus('Could not enter test mode for this template in the current runtime.', 'error');
    return false;
  }
  state.testing.message = state.testing.sequence[0]
    ? `Testing ${selectedTemplate().label}. First target: ${state.testing.sequence[0].label}`
    : `Testing ${selectedTemplate().label}. No follow-up anchors were placed yet.`;
  if (!state.guide.tested || state.guide.saved) {
    markCreatorGuideProgress({
      tested: true,
      completed: state.guide.saved === true
    });
  }
  state.guideOpen = true;
  refreshScenePreview();
  renderUi();
  setStatus('Test mode active. Play the route, then return to the creator.', 'ok');
  return true;
}

function stopTestMode(options = {}) {
  if (!state.testing.active) return false;
  const restore = state.testing.restore;
  state.testing.active = false;
  state.testing.sequence = [];
  state.testing.currentIndex = 0;
  state.testing.currentTargetId = '';
  state.testing.completed = [];
  state.testing.message = '';
  state.testing.lastUiAt = 0;
  state.testing.restore = null;
  if (options.restoreRuntime !== false) applyRuntimeState(restore);
  refreshScenePreview();
  renderUi();
  setStatus('Returned from test mode to the activity creator.', 'ok');
  return true;
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
