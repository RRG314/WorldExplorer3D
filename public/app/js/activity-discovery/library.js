import {
  buildActivitySummary,
  countAnchorsByType,
  getActivityTemplate,
  orderedRouteAnchors,
  sanitizeText
} from '../activity-editor/schema.js?v=2';

const STORAGE_KEY = 'worldExplorer3D.activityLibrary.v1';
const STORAGE_LIMIT = 80;

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

function uniqueId(prefix = 'activity') {
  return `${sanitizeText(prefix, 24).toLowerCase()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAnchor(raw = {}) {
  return {
    id: sanitizeText(raw.id || uniqueId('anchor'), 80).toLowerCase(),
    typeId: sanitizeText(raw.typeId || 'checkpoint', 48).toLowerCase(),
    label: sanitizeText(raw.label || 'Anchor', 80),
    x: finiteNumber(raw.x, 0),
    y: finiteNumber(raw.y, 0),
    z: finiteNumber(raw.z, 0),
    baseY: finiteNumber(raw.baseY, raw.y),
    heightOffset: finiteNumber(raw.heightOffset, 0),
    yaw: finiteNumber(raw.yaw, 0),
    radius: clamp(finiteNumber(raw.radius, 8), 1, 600),
    sizeX: clamp(finiteNumber(raw.sizeX, 12), 1, 600),
    sizeY: clamp(finiteNumber(raw.sizeY, 6), 1, 600),
    sizeZ: clamp(finiteNumber(raw.sizeZ, 12), 1, 600),
    environment: sanitizeText(raw.environment || '', 48).toLowerCase(),
    valid: raw.valid !== false
  };
}

function anchorCenter(anchors = []) {
  if (!Array.isArray(anchors) || anchors.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const sum = anchors.reduce((acc, anchor) => {
    acc.x += finiteNumber(anchor.x, 0);
    acc.y += finiteNumber(anchor.y, 0);
    acc.z += finiteNumber(anchor.z, 0);
    return acc;
  }, { x: 0, y: 0, z: 0 });
  return {
    x: sum.x / anchors.length,
    y: sum.y / anchors.length,
    z: sum.z / anchors.length
  };
}

function estimateDurationMinutes(templateId = '', anchors = []) {
  const route = orderedRouteAnchors(anchors);
  if (route.length < 2) return 3;
  let distanceMeters = 0;
  for (let i = 1; i < route.length; i += 1) {
    distanceMeters += Math.hypot(
      finiteNumber(route[i].x, 0) - finiteNumber(route[i - 1].x, 0),
      finiteNumber(route[i].z, 0) - finiteNumber(route[i - 1].z, 0),
      finiteNumber(route[i].y, 0) - finiteNumber(route[i - 1].y, 0)
    );
  }
  const template = getActivityTemplate(templateId);
  const paceMetersPerMinute =
    template.traversalMode === 'boat' ? 520 :
    template.traversalMode === 'drone' ? 760 :
    template.traversalMode === 'walk' ? 110 :
    template.traversalMode === 'submarine' ? 320 :
    680;
  return clamp(Math.round(Math.max(2, distanceMeters / Math.max(paceMetersPerMinute, 1))), 2, 45);
}

function estimateDifficulty(templateId = '', anchors = []) {
  const counts = countAnchorsByType(anchors);
  const route = orderedRouteAnchors(anchors);
  const checkpointCount = Number(counts.checkpoint || 0);
  let distanceMeters = 0;
  for (let i = 1; i < route.length; i += 1) {
    distanceMeters += Math.hypot(
      finiteNumber(route[i].x, 0) - finiteNumber(route[i - 1].x, 0),
      finiteNumber(route[i].z, 0) - finiteNumber(route[i - 1].z, 0),
      finiteNumber(route[i].y, 0) - finiteNumber(route[i - 1].y, 0)
    );
  }
  const template = getActivityTemplate(templateId);
  const verticalBias = template.preferredSurface === 'rooftop' || template.preferredSurface === 'air' ? 1 : 0;
  const score = checkpointCount + distanceMeters / 280 + verticalBias * 1.6;
  if (score >= 9) return 'Hard';
  if (score >= 5) return 'Moderate';
  return 'Easy';
}

function normalizeStoredActivity(raw = {}) {
  const anchors = Array.isArray(raw.anchors) ? raw.anchors.map(normalizeAnchor) : [];
  const summary = buildActivitySummary({
    templateId: sanitizeText(raw.templateId || '', 80).toLowerCase(),
    name: sanitizeText(raw.name || raw.title || '', 120),
    anchors
  });
  const center = raw.center && typeof raw.center === 'object' ? {
    x: finiteNumber(raw.center.x, 0),
    y: finiteNumber(raw.center.y, 0),
    z: finiteNumber(raw.center.z, 0)
  } : anchorCenter(anchors);
  return {
    id: sanitizeText(raw.id || uniqueId('activity'), 120).toLowerCase(),
    sourceType: 'creator',
    templateId: sanitizeText(raw.templateId || '', 80).toLowerCase(),
    title: sanitizeText(raw.title || raw.name || summary.title, 120),
    description: sanitizeText(raw.description || summary.description, 220),
    creatorId: sanitizeText(raw.creatorId || '', 160),
    creatorName: sanitizeText(raw.creatorName || 'You', 80),
    creatorAvatar: sanitizeText(raw.creatorAvatar || '🌍', 12) || '🌍',
    visibility: sanitizeText(raw.visibility || 'private', 24).toLowerCase() === 'public' ? 'public' : 'private',
    status: sanitizeText(raw.status || (sanitizeText(raw.visibility || '', 24).toLowerCase() === 'public' ? 'published' : 'draft'), 24).toLowerCase(),
    locationLabel: sanitizeText(raw.locationLabel || '', 120),
    createdAt: finiteNumber(raw.createdAt, Date.now()),
    updatedAt: finiteNumber(raw.updatedAt, Date.now()),
    estimatedMinutes: clamp(finiteNumber(raw.estimatedMinutes, estimateDurationMinutes(raw.templateId, anchors)), 2, 45),
    difficulty: sanitizeText(raw.difficulty || estimateDifficulty(raw.templateId, anchors), 24),
    anchors,
    center,
    startPoint: cloneJson(orderedRouteAnchors(anchors)[0] || anchors[0] || center)
  };
}

function readRawLibrary() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRawLibrary(items) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, STORAGE_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

function listStoredActivities() {
  return readRawLibrary()
    .map(normalizeStoredActivity)
    .sort((a, b) => finiteNumber(b.updatedAt, 0) - finiteNumber(a.updatedAt, 0));
}

function getStoredActivityById(activityId = '') {
  const key = sanitizeText(activityId, 120).toLowerCase();
  return listStoredActivities().find((entry) => entry.id === key) || null;
}

function saveStoredActivity(record = {}) {
  const normalized = normalizeStoredActivity(record);
  const items = readRawLibrary().filter((entry) => sanitizeText(entry?.id || '', 120).toLowerCase() !== normalized.id);
  items.unshift({
    ...normalized,
    anchors: cloneJson(normalized.anchors),
    center: cloneJson(normalized.center),
    startPoint: cloneJson(normalized.startPoint)
  });
  writeRawLibrary(items);
  return normalized;
}

function saveCreatorActivityDraft(draft = {}, options = {}) {
  const summary = buildActivitySummary(draft);
  const title = sanitizeText(options.title || draft.name || `${summary.title}${options.locationLabel ? ` • ${options.locationLabel}` : ''}`, 120);
  return saveStoredActivity({
    id: options.id || draft.id || uniqueId('creator'),
    templateId: draft.templateId,
    title,
    description: options.description || summary.description,
    creatorId: options.creatorId || draft.creatorId || '',
    creatorName: options.creatorName || 'You',
    creatorAvatar: options.creatorAvatar || draft.creatorAvatar || '🌍',
    visibility: options.visibility || 'private',
    status: options.status || (sanitizeText(options.visibility || draft.visibility || 'private', 24).toLowerCase() === 'public' ? 'published' : 'draft'),
    locationLabel: options.locationLabel || '',
    createdAt: finiteNumber(options.createdAt, Date.now()),
    updatedAt: Date.now(),
    anchors: Array.isArray(draft.anchors) ? draft.anchors : [],
    estimatedMinutes: options.estimatedMinutes,
    difficulty: options.difficulty
  });
}

function removeStoredActivity(activityId = '') {
  const key = sanitizeText(activityId, 120).toLowerCase();
  const items = readRawLibrary().filter((entry) => sanitizeText(entry?.id || '', 120).toLowerCase() !== key);
  return writeRawLibrary(items);
}

export {
  getStoredActivityById,
  listStoredActivities,
  removeStoredActivity,
  saveCreatorActivityDraft,
  saveStoredActivity
};
