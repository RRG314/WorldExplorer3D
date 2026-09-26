'use strict';

const crypto = require('node:crypto');

const CAPTURE_SCHEMA_VERSION = 1;
const PROCESSING_PIPELINE_VERSION = 'we3d-meshroom-blender-v1';

const CAPTURE_KINDS = Object.freeze(['exterior', 'interior_room']);
const ACCESS_MODES = Object.freeze(['PRIVATE', 'INVITE_ONLY', 'GUEST_LIST', 'SESSION_GUESTS', 'PUBLIC']);
const CAPTURE_STATES = Object.freeze([
  'draft',
  'uploading',
  'uploaded',
  'queued',
  'processing',
  'processing_failed',
  'review_required',
  'approved',
  'rejected'
]);

const STATE_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['uploading']),
  uploading: Object.freeze(['draft', 'uploaded', 'processing_failed']),
  // Reopening is additionally restricted by the reservation endpoint to manual
  // sets without a review submission, processed result or queued attempt.
  uploaded: Object.freeze(['queued', 'uploading']),
  queued: Object.freeze(['processing', 'processing_failed']),
  processing: Object.freeze(['review_required', 'processing_failed']),
  processing_failed: Object.freeze(['queued', 'rejected']),
  review_required: Object.freeze(['processing', 'approved', 'rejected']),
  approved: Object.freeze([]),
  rejected: Object.freeze([])
});

// These are deliberately bounded V1 safety limits. Reconstruction quality is
// still determined by overlap and coverage, not by accepting unlimited files.
const CAPTURE_LIMITS = Object.freeze({
  exterior: Object.freeze({ minPhotos: 20, maxPhotos: 48, maxTotalBytes: 384 * 1024 * 1024 }),
  interior_room: Object.freeze({ minPhotos: 18, maxPhotos: 48, maxTotalBytes: 320 * 1024 * 1024 }),
  maxFileBytes: 12 * 1024 * 1024,
  minLongEdge: 1280,
  maxLongEdge: 12000,
  maxPixels: 60_000_000,
  allowedMimeTypes: Object.freeze(['image/jpeg', 'image/webp'])
});

function cleanText(value, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function normalizeCaptureKind(value) {
  const kind = cleanText(value, 32).toLowerCase();
  if (!CAPTURE_KINDS.includes(kind)) throw new Error('invalid_capture_kind');
  return kind;
}

function normalizeAccessMode(value, captureKind = 'interior_room') {
  const requested = cleanText(value || 'PRIVATE', 32).toUpperCase();
  if (!ACCESS_MODES.includes(requested)) throw new Error('invalid_access_mode');
  // Every new interior begins owner-only. Broader access is a separate,
  // authenticated owner action after the space exists.
  return captureKind === 'interior_room' ? 'PRIVATE' : requested;
}

function normalizeSpatialContext(raw) {
  if (!raw || raw.schemaVersion !== 1 || raw.frame !== 'building-local-x-east-y-up-z-south') return null;
  const validPoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.z) && Math.abs(p.x) <= 2000 && Math.abs(p.z) <= 2000;
  if (!Array.isArray(raw.footprint) || raw.footprint.length < 3 || raw.footprint.length > 256 || !raw.footprint.every(validPoint)) return null;
  const height = raw.height;
  return {
    schemaVersion: 1, frame: raw.frame, authority: 'client-snapshot-of-existing-building',
    footprint: raw.footprint.map(({ x, z }) => ({ x, z })),
    wallHeightMeters: Number.isFinite(raw.wallHeightMeters) && raw.wallHeightMeters > 0 && raw.wallHeightMeters <= 1212 ? raw.wallHeightMeters : null,
    height: height && Number.isFinite(height.meters) && height.meters > 0 && height.meters <= 1200 && ['mapped', 'inferred'].includes(height.evidence)
      ? { meters: height.meters, evidence: height.evidence } : null,
    entrance: validPoint(raw.entrance) ? { x: raw.entrance.x, z: raw.entrance.z } : null
  };
}

function normalizeCanonicalBuilding(raw = {}) {
  const sourceBuildingId = cleanText(raw.sourceBuildingId, 220);
  const worldId = cleanText(raw.worldId, 220);
  const sourceAuthority = cleanText(raw.sourceAuthority || raw.geometrySource || 'mapped', 80).toLowerCase();
  const lat = clamp(finite(raw.lat, 0), -90, 90);
  const lon = clamp(finite(raw.lon, 0), -180, 180);
  if (!sourceBuildingId || !worldId) throw new Error('canonical_building_required');
  if (/^(fallback-|dynamic:|overlay:|destination:)/i.test(sourceBuildingId)) {
    throw new Error('mapped_building_required');
  }
  if (/^(generated|synthetic|inferred|fallback|dynamic|overlay)/i.test(sourceAuthority)) {
    throw new Error('mapped_building_required');
  }
  const footprintGeo = (Array.isArray(raw.footprintGeo) ? raw.footprintGeo : [])
    .slice(0, 64)
    .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon)))
    .map((point) => ({ lat: clamp(point?.lat, -90, 90), lon: clamp(point?.lon, -180, 180) }));
  const entranceGeo = raw.entranceGeo && typeof raw.entranceGeo === 'object' &&
    Number.isFinite(Number(raw.entranceGeo.lat)) && Number.isFinite(Number(raw.entranceGeo.lon)) ? {
    lat: clamp(raw.entranceGeo.lat, -90, 90),
    lon: clamp(raw.entranceGeo.lon, -180, 180)
  } : null;
  return Object.freeze({
    sourceBuildingId,
    worldId,
    sourceAuthority,
    label: cleanText(raw.label || 'Mapped building', 140),
    locationLabel: cleanText(raw.locationLabel || '', 140),
    lat,
    lon,
    footprintGeo: Object.freeze(footprintGeo),
    entranceGeo: entranceGeo ? Object.freeze(entranceGeo) : null,
    spatialContext: normalizeSpatialContext(raw.spatialContext)
  });
}

function normalizeReviewedAlignment(raw = {}, captureKind = 'exterior') {
  const kind = normalizeCaptureKind(captureKind);
  const offsetLimit = kind === 'exterior' ? 100 : 20;
  const offset = raw.positionOffset || raw.offset || {};
  return Object.freeze({
    positionOffset: Object.freeze({
      x: clamp(finite(offset.x, 0), -offsetLimit, offsetLimit),
      y: clamp(finite(offset.y, 0), -offsetLimit, offsetLimit),
      z: clamp(finite(offset.z, 0), -offsetLimit, offsetLimit)
    }),
    rotationYDegrees: clamp(finite(raw.rotationYDegrees, 0), -360, 360),
    scale: clamp(finite(raw.scale, 1) || 1, 0.05, 20)
  });
}

function stableId(prefix, ...parts) {
  const digest = crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u001f')).digest('hex');
  return `${prefix}_${digest.slice(0, 32)}`;
}

function spaceIdForCapture(ownerUid, building, captureKind, roomLabel = '') {
  const kind = normalizeCaptureKind(captureKind);
  if (kind !== 'interior_room') return '';
  return stableId('space', building.worldId, building.sourceBuildingId, cleanText(roomLabel, 100).toLowerCase(), ownerUid);
}

function createCaptureDraft(input = {}, actor = {}, nowMs = Date.now()) {
  const ownerUid = cleanText(actor.uid, 180);
  if (!ownerUid) throw new Error('authentication_required');
  const captureKind = normalizeCaptureKind(input.captureKind);
  const building = normalizeCanonicalBuilding(input.building);
  const room = captureKind === 'interior_room' ? {
    label: cleanText(input.room?.label || 'Room', 100),
    type: cleanText(input.room?.type || 'room', 50).toLowerCase(),
    widthMeters: clamp(input.room?.widthMeters, 1.5, 80),
    lengthMeters: clamp(input.room?.lengthMeters, 1.5, 80),
    heightMeters: clamp(input.room?.heightMeters, 1.8, 12),
    entranceDirectionDegrees: clamp(input.room?.entranceDirectionDegrees, 0, 359.999)
  } : null;
  if (captureKind === 'interior_room' && input.permissionConfirmed !== true) {
    throw new Error('interior_permission_confirmation_required');
  }
  const captureId = stableId('capture', ownerUid, building.worldId, building.sourceBuildingId, captureKind, nowMs, crypto.randomBytes(8).toString('hex'));
  // A new unit has an opaque identity. Renaming rooms cannot create a different
  // home; continuations explicitly retain their source spaceId.
  const spaceId = captureKind==='interior_room'?stableId('space',ownerUid,captureId):'';
  return Object.freeze({
    captureId,
    captureSchemaVersion: CAPTURE_SCHEMA_VERSION,
    processingPipelineVersion: PROCESSING_PIPELINE_VERSION,
    ownerUid,
    ownerDisplayName: cleanText(actor.displayName || actor.email || 'Explorer', 80),
    captureKind,
    exteriorScope: captureKind === 'exterior' && input.exteriorScope === 'facade' ? 'facade' : 'building',
    building,
    buildingDetails: normalizeBuildingDetails(input.buildingDetails),
    room,
    spaceId,
    status: 'draft',
    capturePrivacy: 'PRIVATE',
    accessMode: normalizeAccessMode('PRIVATE', captureKind),
    publicContributionRequested: input.publicContributionRequested === true,
    consent: Object.freeze({
      propertyPermissionConfirmed: captureKind === 'interior_room' ? true : input.propertyPermissionConfirmed === true,
      publicContributionExplicit: input.publicContributionRequested === true,
      termsVersion: cleanText(input.termsVersion || 'reality-capture-v1', 60)
    }),
    limits: CAPTURE_LIMITS[captureKind],
    createdAtMs: Math.floor(finite(nowMs, Date.now())),
    updatedAtMs: Math.floor(finite(nowMs, Date.now()))
  });
}

function normalizeBuildingDetails(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('invalid_building_details');
  const optionalNumber = (key, min, max, integer = false) => {
    if (raw[key] === '' || raw[key] === undefined || raw[key] === null) return null;
    if (!['number', 'string'].includes(typeof raw[key])) throw Error('invalid_building_details');
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw Error('invalid_building_details');
    return value;
  };
  const roofShape = cleanText(raw.roofShape || 'unknown', 30);
  if (!['unknown', 'flat', 'gabled', 'hipped', 'other'].includes(roofShape)) throw Error('invalid_building_details');
  return { schemaVersion: 1, evidence: 'user-reported-unverified',
    floors: optionalNumber('floors', 1, 200, true), units: optionalNumber('units', 1, 2000, true),
    heightMeters: optionalNumber('heightMeters', 1, 1200), roofShape,
    referenceLabel: cleanText(raw.referenceLabel, 100),
    referenceWidthMeters: optionalNumber('referenceWidthMeters', .01, 2000),
    referenceHeightMeters: optionalNumber('referenceHeightMeters', .01, 2000) };
}

function canTransitionCapture(from, to) {
  const source = cleanText(from, 40).toLowerCase();
  const target = cleanText(to, 40).toLowerCase();
  return CAPTURE_STATES.includes(source) && CAPTURE_STATES.includes(target) &&
    (STATE_TRANSITIONS[source] || []).includes(target);
}

function assertCaptureTransition(from, to) {
  if (!canTransitionCapture(from, to)) throw new Error('invalid_capture_state_transition');
  return to;
}

function validateUploadedPhotoSet(capture = {}, files = [], options = {}) {
  const kind = normalizeCaptureKind(capture.captureKind);
  const limits = CAPTURE_LIMITS[kind];
  const rows = Array.isArray(files) ? files : [];
  const minimum = options.manual === true ? 1 : limits.minPhotos;
  if (rows.length < minimum) throw new Error('too_few_photos');
  if (rows.length > limits.maxPhotos) throw new Error('too_many_photos');
  let totalBytes = 0;
  const seenNames = new Set();
  for (const file of rows) {
    const name = cleanText(file.name || file.path, 260);
    const size = Math.floor(finite(file.size, -1));
    const contentType = cleanText(file.contentType, 80).toLowerCase();
    const width = Math.floor(finite(file.width, 0));
    const height = Math.floor(finite(file.height, 0));
    if (!name || seenNames.has(name)) throw new Error('duplicate_or_invalid_photo_name');
    seenNames.add(name);
    if (!CAPTURE_LIMITS.allowedMimeTypes.includes(contentType)) throw new Error('unsupported_photo_type');
    if (size <= 0 || size > CAPTURE_LIMITS.maxFileBytes) throw new Error('photo_size_out_of_range');
    if (width > 0 && height > 0) {
      const longEdge = Math.max(width, height);
      if (longEdge < CAPTURE_LIMITS.minLongEdge || longEdge > CAPTURE_LIMITS.maxLongEdge || width * height > CAPTURE_LIMITS.maxPixels) {
        throw new Error('photo_resolution_out_of_range');
      }
    }
    totalBytes += size;
  }
  if (totalBytes > limits.maxTotalBytes) throw new Error('capture_total_size_exceeded');
  return Object.freeze({ photoCount: rows.length, totalBytes });
}

function imageSignatureMatches(buffer, contentType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const mime = cleanText(contentType, 80).toLowerCase();
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function resolveSpaceAccess(input = {}) {
  const space = input.space || {};
  const requesterUid = cleanText(input.requesterUid, 180);
  const ownerUid = cleanText(space.ownerUid, 180);
  const mode = cleanText(space.accessMode || 'PRIVATE', 32).toUpperCase();
  if (!ACCESS_MODES.includes(mode)) return Object.freeze({ allowed: false, reason: 'invalid_policy' });
  if (requesterUid && requesterUid === ownerUid) return Object.freeze({ allowed: true, reason: 'owner', scope: 'persistent' });
  if (input.isAdmin === true) return Object.freeze({ allowed: true, reason: 'moderator', scope: 'review' });
  if (mode === 'PUBLIC') {
    // Sharing preference is not publication authority. A reviewed interior
    // must be the exact capture currently installed in this private space.
    const installed=space.installedRepresentation,approval=space.publicApproval;
    const reviewed = !!space.captureId && approval?.captureId === space.captureId && (!installed || (
      installed.modelPath===approval.modelPath && installed.modelGeneration===approval.modelGeneration && installed.revision===approval.revision
    ));
    return Object.freeze(reviewed
      ? { allowed: true, reason: 'public', scope: 'public' }
      : { allowed: false, reason: 'public_review_required', requestable: false });
  }
  if (!requesterUid) return Object.freeze({ allowed: false, reason: 'authentication_required' });
  if (mode === 'PRIVATE') return Object.freeze({ allowed: false, reason: 'private_residence', requestable: false });
  const now = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const freshGrant = grant => grant?.active === true && grant?.uid === requesterUid &&
    Number(grant.expiresAtMs) > now && Number(grant.createdAtMs) > Number(input.member?.revokedAtMs || 0);
  if (freshGrant(input.oneTimeGrant)) {
    return Object.freeze({ allowed: true, reason: 'allow_once', scope: 'one_time' });
  }
  if (['INVITE_ONLY', 'GUEST_LIST', 'SESSION_GUESTS'].includes(mode) &&
      input.member?.active === true && input.member?.uid === requesterUid &&
      ['co_owner', 'household', 'guest'].includes(cleanText(input.member.role, 24).toLowerCase())) {
    return Object.freeze({ allowed: true, reason: input.member.role, scope: 'persistent' });
  }
  if (mode === 'SESSION_GUESTS' && freshGrant(input.sessionGrant) && input.ownerOnline === true &&
      input.sessionGrant?.roomId === input.roomId) {
    return Object.freeze({ allowed: true, reason: 'session_guest', scope: 'session' });
  }
  return Object.freeze({
    allowed: false,
    reason: mode === 'PRIVATE' ? 'private_residence' : 'request_access',
    requestable: mode !== 'PRIVATE' && input.ownerOnline === true
  });
}

function isDeletableByOwner(capture = {}, uid = '') {
  return cleanText(capture.ownerUid, 180) === cleanText(uid, 180) &&
    capture.status !== 'approved';
}

module.exports = {
  ACCESS_MODES,
  CAPTURE_KINDS,
  CAPTURE_LIMITS,
  CAPTURE_SCHEMA_VERSION,
  CAPTURE_STATES,
  PROCESSING_PIPELINE_VERSION,
  STATE_TRANSITIONS,
  assertCaptureTransition,
  canTransitionCapture,
  createCaptureDraft,
  imageSignatureMatches,
  isDeletableByOwner,
  normalizeAccessMode,
  normalizeCanonicalBuilding,
  normalizeBuildingDetails,
  normalizeReviewedAlignment,
  resolveSpaceAccess,
  spaceIdForCapture,
  stableId,
  validateUploadedPhotoSet
};
