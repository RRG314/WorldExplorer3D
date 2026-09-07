'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CAPTURE_LIMITS,
  canTransitionCapture,
  createCaptureDraft,
  imageSignatureMatches,
  isDeletableByOwner,
  normalizeReviewedAlignment,
  resolveSpaceAccess,
  validateUploadedPhotoSet
} = require('../functions/reality-capture-authority.js');

const building = Object.freeze({
  sourceBuildingId: 'osm:way:424242',
  worldId: 'earth:39.2904:-76.6122',
  sourceAuthority: 'osm',
  label: 'Test building',
  locationLabel: 'Baltimore',
  lat: 39.2904,
  lon: -76.6122
});

test('facade scope is explicit and legacy captures keep whole-building semantics', () => {
  assert.equal(createCaptureDraft({ captureKind: 'exterior', exteriorScope: 'facade', building }, { uid: 'owner' }).exteriorScope, 'facade');
  assert.equal(createCaptureDraft({ captureKind: 'exterior', building }, { uid: 'owner' }).exteriorScope, 'building');
});

test('building measurements remain optional unverified evidence and cannot rewrite mapped geometry', () => {
  const details = {floors:'2', units:5, roofShape:'gabled', referenceLabel:'Brick-to-brick door frame', referenceWidthMeters:1.016, referenceHeightMeters:2.0828, authority:'mapped'};
  const draft = createCaptureDraft({captureKind:'exterior',building,buildingDetails:details},{uid:'owner'});
  assert.equal(draft.buildingDetails.floors,2);
  assert.equal(draft.buildingDetails.evidence,'user-reported-unverified');
  assert.equal(draft.buildingDetails.referenceWidthMeters,1.016);
  assert.equal(draft.buildingDetails.heightMeters,null);
  assert.equal(draft.buildingDetails.authority,undefined);
  assert.equal(draft.building.sourceBuildingId,building.sourceBuildingId);
  for (const invalid of [{floors:2.5},{units:-1},{heightMeters:Infinity},{roofShape:'invented'},{floors:true}]) {
    assert.throws(()=>createCaptureDraft({captureKind:'exterior',building,buildingDetails:invalid},{uid:'owner'}),/invalid_building_details/);
  }
});

test('capture preserves bounded local world context without promoting it to trusted geography', () => {
  const context = { schemaVersion: 1, frame: 'building-local-x-east-y-up-z-south', authority: 'trusted-server',
    footprint: [{ x: -4, z: -3 }, { x: 4, z: -3 }, { x: 4, z: 3 }],
    height: { meters: 12, evidence: 'inferred' }, entrance: { x: 0, z: -3 } };
  const draft = createCaptureDraft({ captureKind: 'exterior', building: { ...building, spatialContext: context } }, { uid: 'owner' });
  assert.deepEqual(draft.building.spatialContext.footprint, context.footprint);
  assert.equal(draft.building.spatialContext.height.evidence, 'inferred');
  assert.equal(draft.building.spatialContext.authority, 'client-snapshot-of-existing-building');
  context.footprint[0].x = Infinity;
  assert.equal(createCaptureDraft({ captureKind: 'exterior', building: { ...building, spatialContext: context } }, { uid: 'owner' }).building.spatialContext, null);
});

test('reviewed transforms are finite and bounded before publication', () => {
  assert.deepEqual(normalizeReviewedAlignment({
    positionOffset: { x: 500, y: -500, z: 'not-a-number' },
    rotationYDegrees: 900,
    scale: 0
  }, 'interior_room'), {
    positionOffset: { x: 20, y: -20, z: 0 },
    rotationYDegrees: 360,
    scale: 1
  });
});

function jpeg(index, overrides = {}) {
  return {
    name: `photo-${String(index).padStart(3, '0')}.jpg`,
    size: 2_000_000,
    contentType: 'image/jpeg',
    width: 3024,
    height: 4032,
    ...overrides
  };
}

test('new interior captures require permission and are always private owner-only', () => {
  assert.throws(() => createCaptureDraft({ captureKind: 'interior_room', building }, { uid: 'owner' }, 1000), /interior_permission/);
  const draft = createCaptureDraft({
    captureKind: 'interior_room',
    building,
    permissionConfirmed: true,
    publicContributionRequested: true,
    accessMode: 'PUBLIC',
    room: { label: 'Living room', widthMeters: 4, lengthMeters: 6, heightMeters: 2.7 }
  }, { uid: 'owner', displayName: 'Owner' }, 1000);
  assert.equal(draft.capturePrivacy, 'PRIVATE');
  assert.equal(draft.accessMode, 'PRIVATE');
  assert.equal(draft.publicContributionRequested, true);
  assert.ok(draft.spaceId.startsWith('space_'));
});

test('procedural, dynamic, and overlay objects cannot become capture targets', () => {
  for (const sourceBuildingId of ['fallback-1-2-3', 'dynamic:ship', 'overlay:fake', 'destination:listing']) {
    assert.throws(() => createCaptureDraft({
      captureKind: 'exterior', building: { ...building, sourceBuildingId }
    }, { uid: 'owner' }, 1000), /mapped_building_required/);
  }
  assert.throws(() => createCaptureDraft({
    captureKind: 'exterior',
    building: { ...building, sourceBuildingId: 'synthetic-looking-id', sourceAuthority: 'inferred_road_frontage' }
  }, { uid: 'owner' }, 1000), /mapped_building_required/);
});

test('capture state machine prevents self-approval and skipped processing states', () => {
  assert.equal(canTransitionCapture('draft', 'uploading'), true);
  assert.equal(canTransitionCapture('uploading', 'uploaded'), true);
  assert.equal(canTransitionCapture('uploaded', 'approved'), false);
  assert.equal(canTransitionCapture('draft', 'approved'), false);
  assert.equal(canTransitionCapture('review_required', 'approved'), true);
  assert.equal(canTransitionCapture('approved', 'processing'), false);
});

test('photo set validation enforces count, type, per-file, resolution, and total limits', () => {
  const capture = { captureKind: 'exterior' };
  assert.throws(() => validateUploadedPhotoSet(capture, Array.from({ length: 19 }, (_, i) => jpeg(i))), /too_few/);
  assert.throws(() => validateUploadedPhotoSet(capture, Array.from({ length: 49 }, (_, i) => jpeg(i))), /too_many/);
  assert.throws(() => validateUploadedPhotoSet(capture, Array.from({ length: 20 }, (_, i) => jpeg(i, i === 0 ? { contentType: 'image/svg+xml' } : {}))), /unsupported/);
  assert.throws(() => validateUploadedPhotoSet(capture, Array.from({ length: 20 }, (_, i) => jpeg(i, i === 0 ? { size: CAPTURE_LIMITS.maxFileBytes + 1 } : {}))), /photo_size/);
  assert.throws(() => validateUploadedPhotoSet(capture, Array.from({ length: 20 }, (_, i) => jpeg(i, i === 0 ? { width: 640, height: 480 } : {}))), /resolution/);
  assert.deepEqual(validateUploadedPhotoSet(capture, Array.from({ length: 24 }, (_, i) => jpeg(i))), {
    photoCount: 24,
    totalBytes: 48_000_000
  });
});

test('magic-byte validation does not trust the supplied MIME type', () => {
  assert.equal(imageSignatureMatches(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg'), true);
  assert.equal(imageSignatureMatches(Buffer.from('not really jpeg'), 'image/jpeg'), false);
  assert.equal(imageSignatureMatches(Buffer.from('RIFF0000WEBPpayload'), 'image/webp'), true);
});

test('space access keeps public exterior visibility separate from private interior entry', () => {
  const space = { ownerUid: 'owner', accessMode: 'PRIVATE' };
  assert.deepEqual(resolveSpaceAccess({ space, requesterUid: 'owner' }), { allowed: true, reason: 'owner', scope: 'persistent' });
  assert.deepEqual(resolveSpaceAccess({ space, requesterUid: 'visitor', ownerOnline: true }), {
    allowed: false, reason: 'private_residence', requestable: false
  });
  assert.equal(resolveSpaceAccess({ space: { ...space, accessMode: 'PUBLIC' }, requesterUid: '' }).allowed, true);
  assert.deepEqual(resolveSpaceAccess({
    space: { ...space, accessMode: 'INVITE_ONLY' },
    requesterUid: 'visitor', ownerOnline: false
  }), { allowed: false, reason: 'request_access', requestable: false });
  assert.deepEqual(resolveSpaceAccess({
    space: { ...space, accessMode: 'INVITE_ONLY' },
    requesterUid: 'visitor', ownerOnline: true
  }), { allowed: false, reason: 'request_access', requestable: true });
  assert.equal(resolveSpaceAccess({
    space: { ...space, accessMode: 'GUEST_LIST' },
    requesterUid: 'visitor',
    member: { uid: 'visitor', role: 'guest', active: true }
  }).allowed, true);
  assert.equal(resolveSpaceAccess({
    space: { ...space, accessMode: 'SESSION_GUESTS' },
    requesterUid: 'visitor', roomId: 'ROOM1', ownerOnline: true, nowMs: 500,
    sessionGrant: { uid: 'visitor', roomId: 'ROOM1', active: true, createdAtMs: 100, expiresAtMs: 1000 }
  }).allowed, true);
});

test('owners may delete private/unapproved work but approval requires admin workflow', () => {
  assert.equal(isDeletableByOwner({ ownerUid: 'owner', status: 'draft' }, 'owner'), true);
  assert.equal(isDeletableByOwner({ ownerUid: 'owner', status: 'review_required' }, 'owner'), true);
  assert.equal(isDeletableByOwner({ ownerUid: 'owner', status: 'approved' }, 'owner'), false);
  assert.equal(isDeletableByOwner({ ownerUid: 'owner', status: 'draft' }, 'attacker'), false);
});

test('temporary interior grants expire, respect revocation and cannot bypass owner-only mode', () => {
  const grant = { uid: 'guest', active: true, createdAtMs: 100, expiresAtMs: 1000, roomId: 'room' };
  const input = { space: { ownerUid: 'owner', accessMode: 'SESSION_GUESTS' }, requesterUid: 'guest',
    sessionGrant: grant, roomId: 'room', ownerOnline: true, nowMs: 500 };
  assert.equal(resolveSpaceAccess(input).allowed, true);
  assert.equal(resolveSpaceAccess({ ...input, nowMs: 1000 }).allowed, false);
  assert.equal(resolveSpaceAccess({ ...input, ownerOnline: false }).allowed, false);
  assert.equal(resolveSpaceAccess({ ...input, member: { revokedAtMs: 200 } }).allowed, false);
  assert.equal(resolveSpaceAccess({ ...input, space: { ...input.space, accessMode: 'PRIVATE' }, oneTimeGrant: grant }).allowed, false);
  assert.equal(resolveSpaceAccess({ ...input, sessionGrant: { ...grant, expiresAtMs: undefined } }).allowed, false);
});
