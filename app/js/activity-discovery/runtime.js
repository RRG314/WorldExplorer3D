import { ctx as appCtx } from '../shared-context.js?v=55';
import { orderedRouteAnchors, sanitizeText } from '../activity-editor/schema.js?v=2';
import { getStoredActivityById } from './library.js?v=2';

const COMPLETION_STORAGE_KEY = 'worldExplorer3D.activityCompletions.v1';

const state = {
  active: false,
  activity: null,
  lastActivity: null,
  targetIndex: 0,
  completedIds: [],
  startedAt: 0,
  lastPose: null,
  message: '',
  lastCompletedAt: 0,
  lastMessage: ''
};

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function completionStore() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COMPLETION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCompletionStore(store) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COMPLETION_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

function getCompletionState(activityId = '') {
  const key = sanitizeText(activityId, 120).toLowerCase();
  const store = completionStore();
  return key ? store[key] || null : null;
}

function markCompleted(activity = {}, durationMs = 0) {
  const key = sanitizeText(activity.id || '', 120).toLowerCase();
  if (!key) return;
  const store = completionStore();
  const current = store[key] && typeof store[key] === 'object' ? store[key] : {};
  store[key] = {
    count: Math.max(0, finiteNumber(current.count, 0)) + 1,
    lastCompletedAt: Date.now(),
    bestTimeMs: !finiteNumber(current.bestTimeMs, 0) || (durationMs > 0 && durationMs < finiteNumber(current.bestTimeMs, Infinity))
      ? durationMs
      : finiteNumber(current.bestTimeMs, 0)
  };
  writeCompletionStore(store);
}

function currentPose() {
  const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
  if (mode === 'boat') {
    return { mode, x: finiteNumber(appCtx.boat?.x, 0), y: finiteNumber(appCtx.boat?.y, 0), z: finiteNumber(appCtx.boat?.z, 0) };
  }
  if (mode === 'drone') {
    return { mode, x: finiteNumber(appCtx.drone?.x, 0), y: finiteNumber(appCtx.drone?.y, 12), z: finiteNumber(appCtx.drone?.z, 0) };
  }
  if (mode === 'walk' && appCtx.Walk?.state?.walker) {
    return { mode, x: finiteNumber(appCtx.Walk.state.walker.x, 0), y: finiteNumber(appCtx.Walk.state.walker.y, 1.7), z: finiteNumber(appCtx.Walk.state.walker.z, 0) };
  }
  return { mode: 'drive', x: finiteNumber(appCtx.car?.x, 0), y: finiteNumber(appCtx.car?.y, 1.2), z: finiteNumber(appCtx.car?.z, 0) };
}

function anchorCaptureDistance(anchor = {}) {
  if (anchor.typeId === 'trigger_zone') {
    return Math.max(5, Math.max(finiteNumber(anchor.sizeX, 14), finiteNumber(anchor.sizeZ, 14)) * 0.45);
  }
  if (anchor.typeId === 'fishing_zone') {
    return Math.max(10, finiteNumber(anchor.radius, 18) * 0.82);
  }
  if (anchor.typeId === 'dock_point') {
    return 10;
  }
  if (anchor.typeId === 'collectible') {
    return 6;
  }
  if (anchor.typeId === 'finish') {
    return 14;
  }
  if (anchor.typeId === 'checkpoint' || anchor.typeId === 'start') {
    return 12;
  }
  return Math.max(8, finiteNumber(anchor.radius, 0));
}

function resolveSequence(activity = {}) {
  const anchors = Array.isArray(activity.anchors) ? activity.anchors.slice() : [];
  const byType = (typeId) => anchors.filter((entry) => entry?.typeId === typeId);
  const firstByType = (typeId) => anchors.find((entry) => entry?.typeId === typeId) || null;
  const templateId = sanitizeText(activity.templateId || '', 80).toLowerCase();
  if (templateId === 'collectible_hunt') {
    return [firstByType('start'), ...byType('collectible'), firstByType('finish')].filter(Boolean);
  }
  if (templateId === 'fishing_trip') {
    return [firstByType('start'), ...byType('fishing_zone'), firstByType('dock_point') || firstByType('finish')].filter(Boolean);
  }
  const ordered = orderedRouteAnchors(anchors);
  if (ordered.length > 0) return ordered;
  return [
    firstByType('start'),
    ...byType('collectible'),
    ...byType('fishing_zone'),
    ...byType('dock_point'),
    firstByType('finish')
  ].filter(Boolean);
}

function activityDistanceToAnchor(activity = {}, pose = currentPose(), anchor = null) {
  if (!anchor) return Infinity;
  const dx = finiteNumber(anchor.x, 0) - pose.x;
  const dz = finiteNumber(anchor.z, 0) - pose.z;
  const dy = finiteNumber(anchor.y, 0) - pose.y;
  const horizontal = Math.hypot(dx, dz);
  const verticalWeight = activityVerticalWeight(activity, pose);
  return horizontal + Math.abs(dy) * verticalWeight;
}

function activityVerticalWeight(activity = {}, pose = currentPose()) {
  const mode = sanitizeText(activity.traversalMode || pose.mode || 'drive', 32).toLowerCase();
  return mode === 'drone' || mode === 'submarine' ? 0.8 : mode === 'boat' ? 0.18 : 0.28;
}

function weightedPoint(point = {}, verticalWeight = 0.28) {
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0) * verticalWeight,
    z: finiteNumber(point.z, 0)
  };
}

function distancePointToSegment(point = {}, start = {}, end = {}) {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const abz = end.z - start.z;
  const apx = point.x - start.x;
  const apy = point.y - start.y;
  const apz = point.z - start.z;
  const abLengthSq = abx * abx + aby * aby + abz * abz;
  if (abLengthSq <= 1e-6) {
    return Math.hypot(apx, apy, apz);
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLengthSq));
  const closestX = start.x + abx * t;
  const closestY = start.y + aby * t;
  const closestZ = start.z + abz * t;
  return Math.hypot(point.x - closestX, point.y - closestY, point.z - closestZ);
}

function sweptDistanceToAnchor(activity = {}, fromPose = null, toPose = null, anchor = null) {
  if (!fromPose || !toPose || !anchor) return Infinity;
  const verticalWeight = activityVerticalWeight(activity, toPose);
  const point = weightedPoint(anchor, verticalWeight);
  const start = weightedPoint(fromPose, verticalWeight);
  const end = weightedPoint(toPose, verticalWeight);
  return distancePointToSegment(point, start, end);
}

function activityReachedAnchor(activity = {}, fromPose = null, toPose = currentPose(), anchor = null) {
  if (!anchor || !toPose) return false;
  const threshold = anchorCaptureDistance(anchor);
  if (activityDistanceToAnchor(activity, toPose, anchor) <= threshold) return true;
  if (fromPose && activityDistanceToAnchor(activity, fromPose, anchor) <= threshold) return true;
  return sweptDistanceToAnchor(activity, fromPose, toPose, anchor) <= threshold;
}

function distanceToStart(activity = {}) {
  const pose = currentPose();
  const start = activity.startPoint || resolveSequence(activity)[0] || null;
  if (!start) return Infinity;
  return activityDistanceToAnchor(activity, pose, start);
}

function navigateToActivityStart(activity = {}) {
  const start = activity.startPoint || resolveSequence(activity)[0] || null;
  if (!start) return false;
  if (typeof appCtx.createNavigationRoute === 'function') {
    const pose = currentPose();
    appCtx.showNavigation = true;
    appCtx.createNavigationRoute(pose.x, pose.z, start.x, start.z, true);
    return true;
  }
  return false;
}

function applySpawnForActivity(activity = {}) {
  const start = activity.startPoint || resolveSequence(activity)[0] || null;
  if (!start) return false;
  const mode = sanitizeText(activity.traversalMode || 'drive', 32).toLowerCase();
  if (mode === 'boat') {
    if (typeof appCtx.setTravelMode === 'function') {
      const candidate = typeof appCtx.inspectBoatCandidate === 'function'
        ? appCtx.inspectBoatCandidate(start.x, start.z, 420, { allowSynthetic: true, waterKind: 'coastal' })
        : null;
      appCtx.setTravelMode('boat', {
        source: 'activity_runtime',
        force: true,
        spawnX: start.x,
        spawnZ: start.z,
        yaw: finiteNumber(start.yaw, 0),
        candidate: candidate || undefined
      });
      return true;
    }
    return false;
  }
  if (mode === 'drone') {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode('drone', { source: 'activity_runtime', force: true });
    }
    if (appCtx.drone) {
      appCtx.drone.x = start.x;
      appCtx.drone.z = start.z;
      appCtx.drone.y = Math.max(start.y + 12, finiteNumber(start.baseY, start.y) + 12);
      appCtx.drone.yaw = finiteNumber(start.yaw, 0);
      return true;
    }
    return false;
  }
  if (mode === 'walk') {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode('walk', { source: 'activity_runtime', force: true });
    }
    if (appCtx.Walk?.state?.walker) {
      const walker = appCtx.Walk.state.walker;
      walker.x = start.x;
      walker.z = start.z;
      walker.y = start.y + 1.7;
      walker.yaw = finiteNumber(start.yaw, 0);
      walker.angle = walker.yaw;
      return true;
    }
    return false;
  }
  if (typeof appCtx.setTravelMode === 'function') {
    appCtx.setTravelMode('drive', { source: 'activity_runtime', force: true });
  }
  if (typeof appCtx.resolveSafeWorldSpawn === 'function' && typeof appCtx.applyResolvedWorldSpawn === 'function') {
    const resolved = appCtx.resolveSafeWorldSpawn(start.x, start.z, { mode: 'drive', angle: finiteNumber(start.yaw, 0), source: 'activity_runtime' });
    if (resolved) {
      appCtx.applyResolvedWorldSpawn(resolved, { mode: 'drive' });
      return true;
    }
  }
  if (appCtx.car) {
    appCtx.car.x = start.x;
    appCtx.car.z = start.z;
    appCtx.car.y = start.y + 1.2;
    appCtx.car.angle = finiteNumber(start.yaw, 0);
    return true;
  }
  return false;
}

function clearRuntimeNavigation() {
  appCtx.showNavigation = false;
  appCtx.navigationRoute = null;
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;
}

async function joinRoomActivity(activity = {}) {
  if (typeof appCtx.ensureMultiplayerPlatformReady !== 'function') return false;
  const api = await appCtx.ensureMultiplayerPlatformReady();
  if (!api || typeof api.joinRoomByCode !== 'function') return false;
  await api.joinRoomByCode(activity.roomCode || '');
  return true;
}

function startLegacyModeActivity(activity = {}) {
  const legacyGameMode = sanitizeText(activity.legacyGameMode || '', 40).toLowerCase();
  if (!legacyGameMode || typeof appCtx.startMode !== 'function') return false;
  stopActivity({ clearNavigation: true, keepMessage: false });
  if (typeof appCtx.clearObjectives === 'function') appCtx.clearObjectives();
  if (typeof appCtx.clearPolice === 'function') appCtx.clearPolice();
  if (typeof appCtx.stopFlowerChallenge === 'function') appCtx.stopFlowerChallenge();
  appCtx.gameMode = legacyGameMode;
  appCtx.gameStarted = true;
  appCtx.paused = false;
  appCtx.startMode();
  state.lastActivity = cloneJson(activity);
  state.lastMessage = `${sanitizeText(activity.title || 'Game', 120)} started.`;
  state.message = state.lastMessage;
  return true;
}

async function startActivity(activity = {}) {
  if (sanitizeText(activity.subtype, 32).toLowerCase() === 'legacy_mode') {
    return startLegacyModeActivity(activity);
  }
  if (sanitizeText(activity.sourceType, 24).toLowerCase() === 'room') {
    return joinRoomActivity(activity);
  }
  const distance = distanceToStart(activity);
  if (activity.requiresNearbyStart !== false && distance > 90) {
    navigateToActivityStart(activity);
    state.message = 'Navigate to the activity start, then start again.';
    return false;
  }
  if (!applySpawnForActivity(activity)) return false;
  const sequence = resolveSequence(activity);
  const startsWithStart = sequence[0]?.typeId === 'start';
  const initialTargetIndex = startsWithStart
    ? Math.min(1, Math.max(0, sequence.length - 1))
    : 0;
  state.active = true;
  state.activity = cloneJson(activity);
  state.lastActivity = cloneJson(activity);
  state.targetIndex = initialTargetIndex;
  state.completedIds = startsWithStart && sequence[0]?.id ? [sequence[0].id] : [];
  state.startedAt = performance.now();
  state.lastPose = currentPose();
  state.lastCompletedAt = 0;
  state.message = sequence[initialTargetIndex]
    ? `Go to ${sequence[initialTargetIndex].label}.`
    : 'Activity started.';
  state.lastMessage = state.message;
  clearRuntimeNavigation();
  if (sequence[initialTargetIndex] && typeof appCtx.createNavigationRoute === 'function') {
    const pose = state.lastPose || currentPose();
    appCtx.showNavigation = true;
    appCtx.createNavigationRoute(pose.x, pose.z, sequence[initialTargetIndex].x, sequence[initialTargetIndex].z, true);
  }
  return true;
}

function stopActivity(options = {}) {
  state.active = false;
  state.activity = null;
  state.targetIndex = 0;
  state.completedIds = [];
  state.startedAt = 0;
  state.lastPose = null;
  if (options.keepMessage !== true) {
    state.message = '';
  }
  if (options.clearNavigation !== false) {
    clearRuntimeNavigation();
  }
  return true;
}

function replayLastActivity() {
  const last = state.activity
    || state.lastActivity
    || (typeof appCtx.findActivityById === 'function' ? appCtx.findActivityById(appCtx.activityDiscoverySelectedId) : null)
    || (appCtx.activityDiscoverySelectedId ? getStoredActivityById(appCtx.activityDiscoverySelectedId) : null);
  if (!last) return false;
  stopActivity();
  return startActivity(last);
}

function updateActivityRuntime() {
  if (!state.active || !state.activity) return;
  const sequence = resolveSequence(state.activity);
  const target = sequence[state.targetIndex] || null;
  if (!target) {
    const durationMs = Math.max(0, performance.now() - finiteNumber(state.startedAt, performance.now()));
    markCompleted(state.activity, durationMs);
    state.lastCompletedAt = Date.now();
    state.message = 'Activity complete. Replay when ready.';
    state.lastMessage = state.message;
    stopActivity({ clearNavigation: true, keepMessage: true });
    return;
  }
  const pose = currentPose();
  const previousPose = state.lastPose;
  const distance = activityDistanceToAnchor(state.activity, pose, target);
  state.message = `${target.label} • ${Math.round(distance)}m`;
  state.lastMessage = state.message;
  if (activityReachedAnchor(state.activity, previousPose, pose, target)) {
    state.completedIds.push(target.id);
    state.targetIndex += 1;
    const next = sequence[state.targetIndex] || null;
    state.message = next ? `Checkpoint reached. Next: ${next.label}.` : 'Activity complete.';
    state.lastMessage = state.message;
    if (next && typeof appCtx.createNavigationRoute === 'function') {
      appCtx.showNavigation = true;
      appCtx.createNavigationRoute(pose.x, pose.z, next.x, next.z, true);
    }
  }
  state.lastPose = pose;
}

function getRuntimeSnapshot() {
  const sequence = state.activity ? resolveSequence(state.activity) : [];
  const target = sequence[state.targetIndex] || null;
  return {
    active: state.active,
    activityId: sanitizeText(state.activity?.id || '', 120).toLowerCase(),
    activityTitle: sanitizeText(state.activity?.title || '', 120),
    sourceType: sanitizeText(state.activity?.sourceType || '', 32).toLowerCase(),
    targetIndex: state.targetIndex,
    currentTargetId: sanitizeText(target?.id || '', 120).toLowerCase(),
    completedCount: state.completedIds.length,
    message: state.message || state.lastMessage,
    lastCompletedAt: state.lastCompletedAt,
    lastMessage: state.lastMessage
  };
}

export {
  distanceToStart,
  getCompletionState,
  getRuntimeSnapshot,
  navigateToActivityStart,
  replayLastActivity,
  startActivity,
  stopActivity,
  updateActivityRuntime
};
