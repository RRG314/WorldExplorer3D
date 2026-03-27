import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';

const ROOM_ID = 'AB12CD';
const PUBLIC_ROOM_ID = 'PB12CD';
const OWNER_UID = 'owner_user';
const MEMBER_UID = 'member_user';
const ATTACKER_UID = 'attacker_user';
const INVITEE_UID = 'invitee_user';
const FRESH_UID = 'fresh_user';

const JOINED_AT = Timestamp.fromMillis(Date.now() - 60_000);
const OLD_LAST_SEEN = Timestamp.fromMillis(Date.now() - 10_000);
const FUTURE_PRESENCE = Timestamp.fromMillis(Date.now() + 90_000);
const FUTURE_CHAT = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
const FUTURE_INVITE = Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);

function playerDoc(uid, displayName, role = 'member') {
  return {
    uid,
    displayName,
    joinedAt: JOINED_AT,
    lastSeenAt: OLD_LAST_SEEN,
    expiresAt: FUTURE_PRESENCE,
    role,
    mode: 'walk',
    frame: {
      kind: 'earth',
      locLat: 0,
      locLon: 0
    },
    pose: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      vx: 0,
      vy: 0,
      vz: 0
    },
    joinCode: ROOM_ID
  };
}

function privateRoomDoc() {
  return {
    code: ROOM_ID,
    createdAt: Timestamp.fromMillis(Date.now() - 120_000),
    createdBy: OWNER_UID,
    name: 'Security Test Room',
    visibility: 'private',
    featured: false,
    maxPlayers: 12,
    ownerUid: OWNER_UID,
    mods: {
      [OWNER_UID]: true
    },
    cityKey: '',
    world: {
      kind: 'earth',
      seed: 'latlon:0,0',
      lat: 0,
      lon: 0
    },
    rules: {
      allowChat: true,
      allowGhosts: true,
      paintTimeLimitSec: 120,
      paintTouchMode: 'any',
      allowPaintballGun: true,
      allowRoofAutoPaint: true
    }
  };
}

function publicRoomDoc() {
  return {
    ...privateRoomDoc(),
    code: PUBLIC_ROOM_ID,
    visibility: 'public',
    cityKey: 'baltimore',
    locationTag: {
      label: 'Baltimore',
      city: 'Baltimore',
      cityKey: 'baltimore',
      kind: 'earth'
    }
  };
}

function roomCreateDoc(roomCode, ownerUid, overrides = {}) {
  const base = {
    code: roomCode,
    createdAt: serverTimestamp(),
    createdBy: ownerUid,
    name: 'Quota Test Room',
    visibility: 'private',
    featured: false,
    maxPlayers: 12,
    ownerUid,
    mods: {
      [ownerUid]: true
    },
    cityKey: '',
    world: {
      kind: 'earth',
      seed: 'latlon:0,0',
      lat: 0,
      lon: 0
    },
    rules: {
      allowChat: true,
      allowGhosts: true,
      paintTimeLimitSec: 120,
      paintTouchMode: 'any',
      allowPaintballGun: true,
      allowRoofAutoPaint: true
    }
  };
  const normalized = { ...base, ...overrides };
  if (overrides.world) {
    normalized.world = { ...base.world, ...overrides.world };
  }
  if (overrides.rules) {
    normalized.rules = { ...base.rules, ...overrides.rules };
  }
  if (overrides.mods) {
    normalized.mods = { ...base.mods, ...overrides.mods };
  }
  if (overrides.locationTag) {
    normalized.locationTag = { ...overrides.locationTag };
  }
  return normalized;
}

function userDoc(uid, displayName) {
  const ts = Timestamp.fromMillis(Date.now() - 120_000);
  return {
    uid,
    email: `${uid}@example.test`,
    displayName,
    createdAt: ts,
    updatedAt: ts,
    plan: 'support',
    subscriptionStatus: 'active',
    trialStartsAt: null,
    trialEndsAt: null,
    trialConsumedAt: null,
    entitlements: {
      multiplayer: true,
      earlyAccess: false
    },
    roomCreateCount: 0,
    roomCreateLimit: 3,
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    billingCycleAnchorAt: null,
    cancelAtPeriodEnd: false
  };
}

function creatorProfileDoc(uid, username = 'Explorer', overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 120_000);
  const base = {
    userId: uid,
    username,
    bio: '',
    avatar: '🌍',
    discoverable: true,
    stats: {
      activitiesCreated: 0,
      activitiesPublished: 0,
      totalPlays: 0,
      contributionsCount: 0,
      publishedContributions: 0
    },
    spaces: {
      primaryRoomCode: '',
      hubActivityId: '',
      hubLabel: ''
    },
    createdAt: ts,
    createdAtMs: ts.toMillis(),
    updatedAt: ts,
    updatedAtMs: ts.toMillis()
  };
  const next = { ...base, ...overrides };
  if (overrides.stats) next.stats = { ...base.stats, ...overrides.stats };
  if (overrides.spaces) next.spaces = { ...base.spaces, ...overrides.spaces };
  return next;
}

function savedRoomDoc(roomCode, ownerUid, role = 'owner') {
  const ts = Timestamp.fromMillis(Date.now() - 30_000);
  return {
    code: roomCode,
    name: 'Saved Room',
    ownerUid,
    visibility: 'private',
    role,
    world: {
      kind: 'earth',
      seed: 'latlon:0,0',
      lat: 0,
      lon: 0
    },
    locationTag: {
      label: 'Baltimore',
      city: 'Baltimore',
      cityKey: 'baltimore',
      kind: 'earth'
    },
    createdAt: ts,
    updatedAt: ts,
    lastJoinedAt: ts
  };
}

function roomActivityDocData(roomCode = ROOM_ID, creatorUid = OWNER_UID, overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 30_000);
  const base = {
    id: 'room_drive_loop',
    roomCode,
    title: 'Harbor Sprint',
    description: 'A shared room race.',
    templateId: 'driving_route',
    traversalMode: 'drive',
    preferredSurface: 'road',
    creatorId: creatorUid,
    creatorName: creatorUid === OWNER_UID ? 'Owner' : 'Explorer',
    creatorAvatar: '🏁',
    visibility: 'room',
    status: 'published',
    playerMode: 'multiplayer',
    multiplayerEnabled: true,
    estimatedMinutes: 6,
    difficulty: 'Moderate',
    locationLabel: 'Baltimore',
    anchors: [
      { id: 'start_a', typeId: 'start', label: 'Start', x: 0, y: 0, z: 0 },
      { id: 'finish_a', typeId: 'finish', label: 'Finish', x: 20, y: 0, z: 20 }
    ],
    startPoint: { x: 0, y: 0, z: 0 },
    center: { x: 10, y: 0, z: 10 },
    createdAt: ts,
    createdAtMs: ts.toMillis(),
    updatedAt: ts,
    updatedAtMs: ts.toMillis()
  };
  return {
    ...base,
    ...overrides
  };
}

function roomActivityStateDocData(roomCode = ROOM_ID, actorUid = OWNER_UID, overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 15_000);
  const base = {
    roomCode,
    activityId: 'room_drive_loop',
    title: 'Harbor Sprint',
    templateId: 'driving_route',
    status: 'running',
    startedByUid: actorUid,
    startedByName: actorUid === OWNER_UID ? 'Owner' : 'Explorer',
    replayCount: 1,
    startedAt: ts,
    startedAtMs: ts.toMillis(),
    updatedAt: ts,
    updatedAtMs: ts.toMillis()
  };
  return {
    ...base,
    ...overrides
  };
}

function editorSubmissionDoc(ownerUid, overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 45_000);
  const target = {
    anchorKind: 'building',
    lat: 39.2904,
    lon: -76.6122,
    x: 12.5,
    y: 1.7,
    z: -8.25,
    locationLabel: 'Baltimore',
    buildingKey: 'building:123',
    buildingLabel: 'Sample Building',
    destinationKey: '',
    destinationLabel: ''
  };
  const payload = {
    title: 'Add place info',
    subtitle: '',
    note: 'Contributor note',
    category: 'place',
    icon: '📍',
    markerStyle: 'info-pin',
    tagsText: '',
    placeKind: '',
    website: '',
    phone: '',
    hours: '',
    accessNotes: '',
    buildingUse: '',
    entranceLabel: '',
    floorLabel: '',
    roomLabel: '',
    photoUrl: '',
    photoCaption: '',
    photoAttribution: ''
  };
  const moderation = {
    moderatedBy: OWNER_UID,
    moderatedByName: 'Owner',
    moderatedAt: ts,
    decisionNote: 'Looks good'
  };
  const base = {
    editType: 'place_info',
    status: 'pending',
    worldKind: 'earth',
    areaKey: 'earth:2154:1723',
    userId: ownerUid,
    userDisplayName: ownerUid === OWNER_UID ? 'Owner' : 'Member',
    source: 'editor-v1',
    target,
    payload,
    createdAt: ts,
    updatedAt: ts
  };
  const next = { ...base, ...overrides };
  if (overrides.target) next.target = { ...target, ...overrides.target };
  if (overrides.payload) next.payload = { ...payload, ...overrides.payload };
  if (overrides.moderation) next.moderation = { ...moderation, ...overrides.moderation };
  return next;
}

function overlayFeatureDoc(ownerUid = OWNER_UID, overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 45_000);
  const outerRing = [
    { lat: 39.2904, lon: -76.6122 },
    { lat: 39.2907, lon: -76.6119 },
    { lat: 39.2905, lon: -76.6115 },
    { lat: 39.2904, lon: -76.6122 }
  ];
  const geometry = {
    type: 'Polygon',
    coordinates: outerRing,
    rings: [
      {
        role: 'outer',
        points: outerRing
      }
    ]
  };
  const baseFeatureRef = {
    source: 'osm',
    featureType: 'building',
    featureId: 'way/12345',
    areaKey: 'earth:2154:1723',
    displayName: 'Seed Building'
  };
  const threeD = {
    height: 24,
    buildingLevels: 6,
    minHeight: 0,
    roofShape: 'flat',
    layer: 0,
    bridge: false,
    tunnel: false,
    surface: '',
    entrances: [
      {
        lat: 39.2904,
        lon: -76.6122,
        label: 'Main entrance',
        kind: 'main'
      }
    ],
    stairs: [],
    elevators: []
  };
  const relations = {
    level: '',
    buildingRef: '',
    parentFeatureId: '',
    indoorShell: {
      enabled: true,
      levels: [
        { level: '0', label: 'Ground' },
        { level: '1', label: 'Level 1' }
      ]
    }
  };
  const validation = {
    severity: 'ok',
    issues: []
  };
  const moderation = {
    note: '',
    actorUid: '',
    actorName: ''
  };
  const base = {
    featureId: 'overlay_seed_feature',
    worldKind: 'earth',
    areaKey: 'earth:2154:1723',
    presetId: 'building',
    featureClass: 'building',
    sourceType: 'base_patch',
    mergeMode: 'local_replace',
    baseFeatureRef,
    geometryType: 'Polygon',
    geometry,
    tags: {
      building: 'yes',
      name: 'Overlay Building'
    },
    threeD,
    relations,
    level: '',
    buildingRef: '',
    reviewState: 'draft',
    publicationState: 'unpublished',
    validation,
    moderation,
    summary: 'Overlay Building',
    searchText: 'overlay building building yes',
    bbox: {
      minLat: 39.2904,
      minLon: -76.6122,
      maxLat: 39.2907,
      maxLon: -76.6115
    },
    center: {
      lat: 39.2905,
      lon: -76.6119
    },
    version: 1,
    headRevisionId: 'rev_initial',
    createdBy: ownerUid,
    updatedBy: ownerUid,
    createdAt: ts,
    createdAtMs: ts.toMillis(),
    updatedAt: ts,
    updatedAtMs: ts.toMillis(),
    submittedAtMs: 0,
    approvedAtMs: 0,
    publishedAtMs: 0,
    supersedes: '',
    supersededBy: ''
  };
  const next = { ...base, ...overrides };
  if (overrides.baseFeatureRef) next.baseFeatureRef = { ...baseFeatureRef, ...overrides.baseFeatureRef };
  if (overrides.geometry) next.geometry = overrides.geometry;
  if (overrides.tags) next.tags = { ...base.tags, ...overrides.tags };
  if (overrides.threeD) next.threeD = { ...threeD, ...overrides.threeD };
  if (overrides.relations) {
    const relationOverrides = overrides.relations;
    next.relations = {
      ...relations,
      ...relationOverrides,
      indoorShell: {
        ...relations.indoorShell,
        ...(relationOverrides.indoorShell || {})
      }
    };
  }
  if (overrides.validation) next.validation = { ...validation, ...overrides.validation };
  if (overrides.moderation) next.moderation = { ...moderation, ...overrides.moderation };
  if (overrides.bbox) next.bbox = { ...base.bbox, ...overrides.bbox };
  if (overrides.center) next.center = { ...base.center, ...overrides.center };
  return next;
}

function overlayRevisionDoc(ownerUid = OWNER_UID, featureId = 'overlay_seed_feature', overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 30_000);
  const base = {
    featureId,
    revisionId: 'rev_initial',
    version: 1,
    createdBy: ownerUid,
    createdAt: ts,
    createdAtMs: ts.toMillis(),
    reviewState: 'draft',
    changeSummary: 'Initial draft',
    snapshot: overlayFeatureDoc(ownerUid, {
      featureId,
      headRevisionId: 'rev_initial'
    })
  };
  const next = { ...base, ...overrides };
  if (overrides.snapshot) next.snapshot = { ...base.snapshot, ...overrides.snapshot };
  return next;
}

function overlayModerationEventDoc(ownerUid = OWNER_UID, featureId = 'overlay_seed_feature', overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 15_000);
  const actorUid = overrides.actorUid || OWNER_UID;
  const base = {
    featureId,
    action: 'submit',
    fromState: 'draft',
    toState: 'submitted',
    note: 'Ready for review',
    actorUid,
    actorName: actorUid === OWNER_UID ? 'Owner' : 'Moderator',
    createdAt: ts,
    createdAtMs: ts.toMillis(),
    ownerUid
  };
  return { ...base, ...overrides };
}

function overlayPublishedDoc(ownerUid = OWNER_UID, overrides = {}) {
  const ts = Timestamp.fromMillis(Date.now() - 10_000);
  const base = overlayFeatureDoc(ownerUid, {
    reviewState: 'approved',
    publicationState: 'published',
    version: 2,
    headRevisionId: 'rev_approved',
    approvedAt: ts,
    approvedAtMs: ts.toMillis(),
    publishedAt: ts,
    publishedAtMs: ts.toMillis(),
    moderation: {
      note: 'Approved for runtime merge',
      actorUid: OWNER_UID,
      actorName: 'Owner'
    }
  });
  return { ...base, ...overrides };
}

async function seedData(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, 'users', OWNER_UID), userDoc(OWNER_UID, 'Owner'));
    await setDoc(doc(db, 'users', MEMBER_UID), userDoc(MEMBER_UID, 'Member'));
    await setDoc(doc(db, 'users', ATTACKER_UID), userDoc(ATTACKER_UID, 'Attacker'));
    await setDoc(doc(db, 'users', INVITEE_UID), userDoc(INVITEE_UID, 'Invitee'));
    await setDoc(doc(db, 'users', FRESH_UID), {
      uid: FRESH_UID,
      email: `${FRESH_UID}@example.test`,
      displayName: 'Fresh',
      createdAt: Timestamp.fromMillis(Date.now() - 120_000),
      updatedAt: Timestamp.fromMillis(Date.now() - 120_000),
      roomCreateCount: 0,
      roomCreateLimit: 0
    });

    await setDoc(doc(db, 'rooms', ROOM_ID), privateRoomDoc());
    await setDoc(doc(db, 'rooms', PUBLIC_ROOM_ID), publicRoomDoc());
    await setDoc(doc(db, 'rooms', ROOM_ID, 'players', OWNER_UID), playerDoc(OWNER_UID, 'Owner', 'owner'));
    await setDoc(doc(db, 'rooms', ROOM_ID, 'players', MEMBER_UID), playerDoc(MEMBER_UID, 'Member', 'member'));

    await setDoc(doc(db, 'users', OWNER_UID, 'friends', INVITEE_UID), {
      uid: INVITEE_UID,
      displayName: 'Invitee',
      source: 'manual',
      addedAt: Timestamp.fromMillis(Date.now() - 50_000),
      updatedAt: Timestamp.fromMillis(Date.now() - 50_000)
    });

    await setDoc(doc(db, 'users', ATTACKER_UID, 'friends', INVITEE_UID), {
      uid: INVITEE_UID,
      displayName: 'Invitee',
      source: 'manual',
      addedAt: Timestamp.fromMillis(Date.now() - 50_000),
      updatedAt: Timestamp.fromMillis(Date.now() - 50_000)
    });
  });
}

const hostPort = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, portRaw] = hostPort.split(':');
const port = Number.parseInt(portRaw || '8080', 10);

const rules = await fs.readFile(path.resolve('firestore.rules'), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: `worldexplorer-rules-${Date.now()}`,
  firestore: {
    host,
    port,
    rules
  }
});

await seedData(testEnv);

const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
const adminClaimsDb = testEnv.authenticatedContext(OWNER_UID, { admin: true, role: 'admin' }).firestore();
const memberDb = testEnv.authenticatedContext(MEMBER_UID).firestore();
const attackerDb = testEnv.authenticatedContext(ATTACKER_UID).firestore();
const inviteeDb = testEnv.authenticatedContext(INVITEE_UID).firestore();
const freshDb = testEnv.authenticatedContext(FRESH_UID).firestore();
const anonDb = testEnv.unauthenticatedContext().firestore();

const checks = [];

async function runCheck(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    checks.push({ name, ok: false, message: err?.message || String(err) });
    console.error(`FAIL ${name}: ${err?.message || err}`);
  }
}

await runCheck('anon cannot read private room doc', async () => {
  await assertFails(getDoc(doc(anonDb, 'rooms', ROOM_ID)));
});

await runCheck('anon can read public room doc', async () => {
  await assertSucceeds(getDoc(doc(anonDb, 'rooms', PUBLIC_ROOM_ID)));
});

await runCheck('anon can query featured public rooms', async () => {
  const q = query(
    collection(anonDb, 'rooms'),
    where('visibility', '==', 'public'),
    where('featured', '==', true),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  await assertSucceeds(getDocs(q));
});

await runCheck('non-member cannot read private room doc', async () => {
  await assertFails(getDoc(doc(attackerDb, 'rooms', ROOM_ID)));
});

await runCheck('non-owner cannot delete room', async () => {
  await assertFails(deleteDoc(doc(memberDb, 'rooms', ROOM_ID)));
});

await runCheck('owner can delete room they created', async () => {
  const removableRoomCode = 'RM1DEL';
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rooms', removableRoomCode), {
      ...privateRoomDoc(),
      code: removableRoomCode
    });
    await setDoc(
      doc(db, 'rooms', removableRoomCode, 'players', OWNER_UID),
      {
        ...playerDoc(OWNER_UID, 'Owner', 'owner'),
        joinCode: removableRoomCode
      }
    );
  });

  await assertSucceeds(deleteDoc(doc(ownerDb, 'rooms', removableRoomCode)));
});

await runCheck('member cannot write other player presence', async () => {
  await assertFails(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'players', OWNER_UID), playerDoc(OWNER_UID, 'Owner', 'owner')));
});

await runCheck('member can update own presence with valid payload', async () => {
  const payload = {
    ...playerDoc(MEMBER_UID, 'Member', 'member'),
    lastSeenAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 90_000),
    pose: {
      x: 2,
      y: 0,
      z: 0,
      yaw: 0.2,
      pitch: 0,
      vx: 0,
      vy: 0,
      vz: 0
    }
  };
  await assertSucceeds(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'players', MEMBER_UID), payload));
});

await runCheck('room owner can create room activity', async () => {
  await assertSucceeds(setDoc(doc(ownerDb, 'rooms', ROOM_ID, 'activities', 'room_drive_loop'), {
    ...roomActivityDocData(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('room member can read room activity', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rooms', ROOM_ID, 'activities', 'member_read_test'), roomActivityDocData(ROOM_ID, OWNER_UID, {
      id: 'member_read_test'
    }));
  });
  await assertSucceeds(getDoc(doc(memberDb, 'rooms', ROOM_ID, 'activities', 'member_read_test')));
});

await runCheck('attacker cannot create room activity in private room', async () => {
  await assertFails(setDoc(doc(attackerDb, 'rooms', ROOM_ID, 'activities', 'attack_activity'), {
    ...roomActivityDocData(ROOM_ID, ATTACKER_UID, { id: 'attack_activity' }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('room member cannot publish room activity without manager rights', async () => {
  await assertFails(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'activities', 'member_activity'), {
    ...roomActivityDocData(ROOM_ID, MEMBER_UID, { id: 'member_activity' }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('room owner can start shared room activity state', async () => {
  await assertSucceeds(setDoc(doc(ownerDb, 'rooms', ROOM_ID, 'activityState', 'active'), {
    ...roomActivityStateDocData(),
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('room member can read shared room activity state', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rooms', ROOM_ID, 'activityState', 'active'), roomActivityStateDocData());
  });
  await assertSucceeds(getDoc(doc(memberDb, 'rooms', ROOM_ID, 'activityState', 'active')));
});

await runCheck('room member cannot start shared room activity state', async () => {
  await assertFails(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'activityState', 'active'), {
    ...roomActivityStateDocData(ROOM_ID, MEMBER_UID),
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('fresh user can self-update minimal profile doc', async () => {
  await assertSucceeds(setDoc(doc(freshDb, 'users', FRESH_UID), {
    email: `${FRESH_UID}@example.test`,
    displayName: 'Fresh',
    roomCreateCount: 0,
    roomCreateLimit: 0,
    updatedAt: serverTimestamp()
  }, { merge: true }));
});

await runCheck('anon can read public creator profile', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'creatorProfiles', OWNER_UID), creatorProfileDoc(OWNER_UID, 'Owner'));
  });
  await assertSucceeds(getDoc(doc(anonDb, 'creatorProfiles', OWNER_UID)));
});

await runCheck('fresh user can create and update own creator profile', async () => {
  const ref = doc(freshDb, 'creatorProfiles', FRESH_UID);
  await assertSucceeds(setDoc(ref, {
    userId: FRESH_UID,
    username: 'Fresh Creator',
    bio: 'Builds routes and scenic challenges.',
    avatar: '🏁',
    discoverable: true,
    stats: {
      activitiesCreated: 1,
      activitiesPublished: 0,
      totalPlays: 0,
      contributionsCount: 0,
      publishedContributions: 0
    },
    spaces: {
      primaryRoomCode: '',
      hubActivityId: '',
      hubLabel: ''
    },
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  }));
  await assertSucceeds(updateDoc(ref, {
    bio: 'Builds routes, scenic challenges, and rooftop runs.',
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    stats: {
      activitiesCreated: 2,
      activitiesPublished: 1,
      totalPlays: 0,
      contributionsCount: 0,
      publishedContributions: 0
    }
  }));
});

await runCheck('attacker cannot modify another creator profile', async () => {
  await assertFails(updateDoc(doc(attackerDb, 'creatorProfiles', OWNER_UID), {
    bio: 'Hijacked bio',
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  }));
});

await runCheck('owner cannot create room without consuming quota', async () => {
  const roomCode = 'QT12AB';
  await assertFails(setDoc(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID)));
});

await runCheck('owner can create room with quota increment in same batch', async () => {
  const roomCode = 'QT12AC';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('owner can create room when stored limit is stale but plan limit is valid', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_UID), {
      roomCreateCount: 0,
      roomCreateLimit: 0
    }, { merge: true });
  });

  const roomCode = 'QT12AD';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('owner can create moon room with quota increment', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'support',
      subscriptionStatus: 'active',
      roomCreateCount: 0,
      roomCreateLimit: 3
    }, { merge: true });
  });

  const roomCode = 'QT12MH';
  const batch = writeBatch(ownerDb);
  batch.set(
    doc(ownerDb, 'rooms', roomCode),
    roomCreateDoc(roomCode, OWNER_UID, {
      name: 'Moon Session',
      world: {
        kind: 'moon',
        seed: 'latlon:0.67408,23.47297',
        lat: 0.67408,
        lon: 23.47297
      }
    })
  );
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('owner can create space room with quota increment', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'support',
      subscriptionStatus: 'active',
      roomCreateCount: 0,
      roomCreateLimit: 3
    }, { merge: true });
  });

  const roomCode = 'QT12SP';
  const batch = writeBatch(ownerDb);
  batch.set(
    doc(ownerDb, 'rooms', roomCode),
    roomCreateDoc(roomCode, OWNER_UID, {
      name: 'Space Session',
      world: {
        kind: 'space',
        seed: 'latlon:0.00000,0.00000',
        lat: 0,
        lon: 0
      }
    })
  );
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('owner can create public city-tagged room with quota increment', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'support',
      subscriptionStatus: 'active',
      roomCreateCount: 0,
      roomCreateLimit: 3
    }, { merge: true });
  });

  const roomCode = 'QT12PB';
  const batch = writeBatch(ownerDb);
  batch.set(
    doc(ownerDb, 'rooms', roomCode),
    roomCreateDoc(roomCode, OWNER_UID, {
      name: 'Baltimore Public',
      visibility: 'public',
      cityKey: 'baltimore',
      locationTag: {
        label: 'Baltimore',
        city: 'Baltimore',
        cityKey: 'baltimore',
        kind: 'earth'
      }
    })
  );
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('trial user with timestamp trialEndsAt can create room with quota increment', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const trialStart = Timestamp.fromMillis(Date.now() - 30_000);
    const trialEnd = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'trial',
      subscriptionStatus: 'none',
      trialStartsAt: trialStart,
      trialEndsAt: trialEnd,
      trialConsumedAt: trialStart,
      entitlements: {
        multiplayer: true,
        earlyAccess: false
      },
      roomCreateCount: 0,
      roomCreateLimit: 3
    }, { merge: true });
  });

  const roomCode = 'QT12AK';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('trial user with legacy numeric trialEndsAt can create room with quota increment', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const nowMs = Date.now();
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'trial',
      subscriptionStatus: 'none',
      trialStartsAt: Timestamp.fromMillis(nowMs - 30_000),
      trialEndsAt: nowMs + 24 * 60 * 60 * 1000,
      trialConsumedAt: Timestamp.fromMillis(nowMs - 30_000),
      entitlements: {
        multiplayer: true,
        earlyAccess: false
      },
      roomCreateCount: 0,
      roomCreateLimit: 3
    }, { merge: true });
  });

  const roomCode = 'QT12AL';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('trial user with legacy trialEndsAtMs can create room with quota increment', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const nowMs = Date.now();
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'trial',
      subscriptionStatus: 'none',
      trialStartsAt: Timestamp.fromMillis(nowMs - 30_000),
      trialEndsAt: null,
      trialEndsAtMs: nowMs + 24 * 60 * 60 * 1000,
      trialConsumedAt: Timestamp.fromMillis(nowMs - 30_000),
      entitlements: {
        multiplayer: true,
        earlyAccess: false
      },
      roomCreateCount: 0,
      roomCreateLimit: 3
    }, { merge: true });
  });

  const roomCode = 'QT12AM';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('owner can create room when profile includes legacy fields', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_UID), {
      roomCreateCount: 1,
      roomCreateLimit: 3,
      legacyTheme: 'nebula',
      profileVersion: 2,
      updatedAt: Timestamp.fromMillis(Date.now() - 15_000)
    }, { merge: true });
  });

  const roomCode = 'QT12AE';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    roomCreateCount: 2,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('owner can create room when legacy profile is missing uid field', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ts = Timestamp.fromMillis(Date.now() - 120_000);
    await setDoc(doc(db, 'users', OWNER_UID), {
      email: `${OWNER_UID}@example.test`,
      displayName: 'Owner',
      createdAt: ts,
      updatedAt: ts,
      plan: 'support',
      subscriptionStatus: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      trialConsumedAt: null,
      entitlements: {
        multiplayer: true,
        earlyAccess: false
      },
      roomCreateCount: 0,
      roomCreateLimit: 3,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      billingCycleAnchorAt: null,
      cancelAtPeriodEnd: false
    });
  });

  const roomCode = 'QT12AG';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    uid: OWNER_UID,
    email: `${OWNER_UID}@example.test`,
    displayName: 'Owner',
    roomCreateCount: 1,
    roomCreateLimit: 3,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('admin status can create room even if plan field is stale free', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'free',
      subscriptionStatus: 'admin',
      roomCreateCount: 0,
      roomCreateLimit: 10000
    }, { merge: true });
  });

  const roomCode = 'QT12AF';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    uid: OWNER_UID,
    email: `${OWNER_UID}@example.test`,
    displayName: 'Owner',
    roomCreateCount: 1,
    roomCreateLimit: 10000,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('admin status without admin token claim cannot inflate room limit in quota write', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ts = Timestamp.fromMillis(Date.now() - 120_000);
    await setDoc(doc(db, 'users', OWNER_UID), {
      uid: OWNER_UID,
      email: `${OWNER_UID}@example.test`,
      displayName: 'Owner',
      createdAt: ts,
      updatedAt: ts,
      plan: 'free',
      subscriptionStatus: 'admin',
      trialStartsAt: null,
      trialEndsAt: null,
      trialConsumedAt: null,
      entitlements: {
        multiplayer: true,
        earlyAccess: true
      },
      roomCreateCount: 0,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      billingCycleAnchorAt: null,
      cancelAtPeriodEnd: false
    });
  });

  const roomCode = 'QT12AI';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    uid: OWNER_UID,
    email: `${OWNER_UID}@example.test`,
    displayName: 'Owner',
    roomCreateCount: 1,
    roomCreateLimit: 10000,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertFails(batch.commit());
});

await runCheck('admin status without admin token claim can create room with rules-derived quota limit', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ts = Timestamp.fromMillis(Date.now() - 120_000);
    await setDoc(doc(db, 'users', OWNER_UID), {
      uid: OWNER_UID,
      email: `${OWNER_UID}@example.test`,
      displayName: 'Owner',
      createdAt: ts,
      updatedAt: ts,
      plan: 'free',
      subscriptionStatus: 'admin',
      trialStartsAt: null,
      trialEndsAt: null,
      trialConsumedAt: null,
      entitlements: {
        multiplayer: true,
        earlyAccess: true
      },
      roomCreateCount: 0,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      billingCycleAnchorAt: null,
      cancelAtPeriodEnd: false
    });
  });

  const roomCode = 'QT12AJ';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(ownerDb, 'users', OWNER_UID), {
    uid: OWNER_UID,
    email: `${OWNER_UID}@example.test`,
    displayName: 'Owner',
    roomCreateCount: 1,
    roomCreateLimit: 10,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('admin custom claim can create room even when profile plan is free and limit is zero', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ts = Timestamp.fromMillis(Date.now() - 120_000);
    await setDoc(doc(db, 'users', OWNER_UID), {
      uid: OWNER_UID,
      email: `${OWNER_UID}@example.test`,
      displayName: 'Owner',
      createdAt: ts,
      updatedAt: ts,
      plan: 'free',
      subscriptionStatus: 'none',
      trialStartsAt: null,
      trialEndsAt: null,
      trialConsumedAt: null,
      entitlements: {
        multiplayer: false,
        earlyAccess: false
      },
      roomCreateCount: 0,
      roomCreateLimit: 0,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      billingCycleAnchorAt: null,
      cancelAtPeriodEnd: false
    });
  });

  const roomCode = 'QT12AH';
  const batch = writeBatch(adminClaimsDb);
  batch.set(doc(adminClaimsDb, 'rooms', roomCode), roomCreateDoc(roomCode, OWNER_UID));
  batch.set(doc(adminClaimsDb, 'users', OWNER_UID), {
    roomCreateCount: 1,
    roomCreateLimit: 10000,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await assertSucceeds(batch.commit());
});

await runCheck('member can upsert own paint claim in room', async () => {
  await assertSucceeds(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'paintClaims', 'building_001'), {
    key: 'building-001',
    colorHex: '#1D4ED8',
    colorName: 'Blue',
    method: 'gun',
    uid: MEMBER_UID,
    displayName: 'Member',
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }));
});

await runCheck('non-member cannot write room paint claim', async () => {
  await assertFails(setDoc(doc(attackerDb, 'rooms', ROOM_ID, 'paintClaims', 'building_002'), {
    key: 'building-002',
    colorHex: '#16A34A',
    colorName: 'Green',
    method: 'touch-any',
    uid: ATTACKER_UID,
    displayName: 'Attacker',
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }));
});

await runCheck('member can create shared room block', async () => {
  await assertSucceeds(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'blocks', '10_2_4'), {
    id: '10_2_4',
    gx: 10,
    gy: 2,
    gz: 4,
    materialIndex: 1,
    createdBy: MEMBER_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('non-member cannot create shared room block', async () => {
  await assertFails(setDoc(doc(attackerDb, 'rooms', ROOM_ID, 'blocks', '3_1_2'), {
    id: '3_1_2',
    gx: 3,
    gy: 1,
    gz: 2,
    materialIndex: 0,
    createdBy: ATTACKER_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('member cannot overwrite shared block owned by another user', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rooms', ROOM_ID, 'blocks', '8_4_2'), {
      id: '8_4_2',
      gx: 8,
      gy: 4,
      gz: 2,
      materialIndex: 2,
      createdBy: OWNER_UID,
      createdAt: Timestamp.fromMillis(Date.now() - 10_000),
      updatedAt: Timestamp.fromMillis(Date.now() - 10_000)
    });
  });

  await assertFails(setDoc(doc(memberDb, 'rooms', ROOM_ID, 'blocks', '8_4_2'), {
    id: '8_4_2',
    gx: 8,
    gy: 4,
    gz: 2,
    materialIndex: 3,
    createdBy: MEMBER_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true }));
});

await runCheck('user can save own room shortcut entry', async () => {
  await assertSucceeds(setDoc(doc(ownerDb, 'users', OWNER_UID, 'myRooms', ROOM_ID), savedRoomDoc(ROOM_ID, OWNER_UID, 'owner')));
});

await runCheck('attacker cannot read another user saved room shortcuts', async () => {
  await assertFails(getDoc(doc(attackerDb, 'users', OWNER_UID, 'myRooms', ROOM_ID)));
});

await runCheck('attacker cannot write another user saved room shortcuts', async () => {
  await assertFails(setDoc(doc(attackerDb, 'users', OWNER_UID, 'myRooms', ROOM_ID), savedRoomDoc(ROOM_ID, OWNER_UID, 'member')));
});

await runCheck('owner oversize chat message blocked', async () => {
  const msgRef = doc(collection(ownerDb, 'rooms', ROOM_ID, 'chat'));
  const stateRef = doc(ownerDb, 'rooms', ROOM_ID, 'chatState', OWNER_UID);
  const batch = writeBatch(ownerDb);
  batch.set(msgRef, {
    uid: OWNER_UID,
    displayName: 'Owner',
    text: 'x'.repeat(501),
    createdAt: serverTimestamp(),
    expiresAt: FUTURE_CHAT,
    flags: {
      reported: false
    }
  });
  batch.set(stateRef, {
    uid: OWNER_UID,
    lastMessageAt: serverTimestamp(),
    windowStartedAt: serverTimestamp(),
    windowCount: 1,
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
  });
  await assertFails(batch.commit());
});

await runCheck('owner chat with external link is blocked', async () => {
  const msgRef = doc(collection(ownerDb, 'rooms', ROOM_ID, 'chat'));
  const stateRef = doc(ownerDb, 'rooms', ROOM_ID, 'chatState', OWNER_UID);
  const batch = writeBatch(ownerDb);
  batch.set(msgRef, {
    uid: OWNER_UID,
    displayName: 'Owner',
    text: 'join me at https://example.test',
    createdAt: serverTimestamp(),
    expiresAt: FUTURE_CHAT,
    flags: {
      reported: false
    }
  });
  batch.set(stateRef, {
    uid: OWNER_UID,
    lastMessageAt: serverTimestamp(),
    windowStartedAt: serverTimestamp(),
    windowCount: 1,
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
  });
  await assertFails(batch.commit());
});

await runCheck('member valid chat write with state transition succeeds', async () => {
  const msgRef = doc(collection(memberDb, 'rooms', ROOM_ID, 'chat'));
  const stateRef = doc(memberDb, 'rooms', ROOM_ID, 'chatState', MEMBER_UID);
  const batch = writeBatch(memberDb);
  batch.set(msgRef, {
    uid: MEMBER_UID,
    displayName: 'Member',
    text: 'hello from member',
    createdAt: serverTimestamp(),
    expiresAt: FUTURE_CHAT,
    flags: {
      reported: false,
      autoFiltered: false
    }
  });
  batch.set(stateRef, {
    uid: MEMBER_UID,
    lastMessageAt: serverTimestamp(),
    windowStartedAt: serverTimestamp(),
    windowCount: 1,
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
  });
  await assertSucceeds(batch.commit());
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', OWNER_UID), userDoc(OWNER_UID, 'Owner'));
  await setDoc(doc(db, 'users', ATTACKER_UID), userDoc(ATTACKER_UID, 'Attacker'));
});

await runCheck('attacker cannot create invite even if they add friend', async () => {
  await assertFails(setDoc(doc(attackerDb, 'users', INVITEE_UID, 'incomingInvites', `${ATTACKER_UID}_${ROOM_ID}`), {
    fromUid: ATTACKER_UID,
    fromDisplayName: 'Attacker',
    toUid: INVITEE_UID,
    roomCode: ROOM_ID,
    roomName: 'Security Test Room',
    inviteLink: 'https://example.test/app/?room=AB12CD',
    message: 'join now',
    seen: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: FUTURE_INVITE
  }));
});

await runCheck('owner invite with wrong doc id is blocked', async () => {
  await assertFails(setDoc(doc(ownerDb, 'users', INVITEE_UID, 'incomingInvites', 'wrong_doc_id'), {
    fromUid: OWNER_UID,
    fromDisplayName: 'Owner',
    toUid: INVITEE_UID,
    roomCode: ROOM_ID,
    roomName: 'Security Test Room',
    inviteLink: 'https://example.test/app/?room=AB12CD',
    message: 'join now',
    seen: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: FUTURE_INVITE
  }));
});

await runCheck('owner invite with valid id and friendship succeeds', async () => {
  const inviteId = `${OWNER_UID}_${ROOM_ID}`;
  await assertSucceeds(setDoc(doc(ownerDb, 'users', INVITEE_UID, 'incomingInvites', inviteId), {
    fromUid: OWNER_UID,
    fromDisplayName: 'Owner',
    toUid: INVITEE_UID,
    roomCode: ROOM_ID,
    roomName: 'Security Test Room',
    inviteLink: 'https://example.test/app/?room=AB12CD',
    message: 'join now',
    seen: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: FUTURE_INVITE
  }));
});

await runCheck('invitee can mark invite seen', async () => {
  const inviteId = `${OWNER_UID}_${ROOM_ID}`;
  await assertSucceeds(setDoc(doc(inviteeDb, 'users', INVITEE_UID, 'incomingInvites', inviteId), {
    seen: true,
    updatedAt: serverTimestamp()
  }, { merge: true }));
});

await runCheck('anon cannot post activity feed', async () => {
  await assertFails(setDoc(doc(collection(anonDb, 'activityFeed')), {
    uid: 'anon',
    displayName: 'Anon',
    type: 'room-joined',
    roomCode: ROOM_ID,
    roomName: 'Security Test Room',
    cityKey: 'tokyo',
    text: 'joined',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000)
  }));
});

await runCheck('owner can post valid activity feed', async () => {
  await assertSucceeds(setDoc(doc(collection(ownerDb, 'activityFeed')), {
    uid: OWNER_UID,
    displayName: 'Owner',
    type: 'room-created',
    roomCode: ROOM_ID,
    roomName: 'Security Test Room',
    cityKey: 'tokyo',
    text: 'created room',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000)
  }));
});

await runCheck('room owner can delete their room even without active multiplayer entitlement', async () => {
  const roomCode = 'QT12AK';

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rooms', roomCode), {
      ...privateRoomDoc(),
      code: roomCode,
      ownerUid: OWNER_UID,
      createdBy: OWNER_UID
    });
    await setDoc(doc(db, 'users', OWNER_UID), {
      plan: 'free',
      subscriptionStatus: 'none',
      roomCreateCount: 0,
      roomCreateLimit: 0,
      entitlements: {
        multiplayer: false,
        earlyAccess: false
      }
    }, { merge: true });
  });

  await assertSucceeds(deleteDoc(doc(ownerDb, 'rooms', roomCode)));
});

await runCheck('signed-in user cannot create pending editor submission directly', async () => {
  const submissionRef = doc(collection(ownerDb, 'editorSubmissions'));
  await assertFails(setDoc(submissionRef, {
    ...editorSubmissionDoc(OWNER_UID),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('signed-in user cannot create building and photo editor submissions directly', async () => {
  const buildingRef = doc(collection(ownerDb, 'editorSubmissions'));
  await assertFails(setDoc(buildingRef, {
    ...editorSubmissionDoc(OWNER_UID, {
      editType: 'building_note',
      target: {
        anchorKind: 'building',
        lat: 39.2904,
        lon: -76.6122,
        x: 12.5,
        y: 1.7,
        z: -8.25,
        locationLabel: 'Baltimore',
        buildingKey: 'building:123',
        buildingLabel: 'Sample Building',
        interiorKey: '',
        destinationKey: '',
        destinationLabel: ''
      },
      payload: {
        title: 'Lobby access update',
        subtitle: 'Main tower',
        note: 'Front lobby is public during business hours.',
        category: 'building',
        icon: '🏢',
        markerStyle: 'building-outline',
        tagsText: 'lobby,access',
        placeKind: '',
        website: 'https://example.test/building',
        phone: '',
        hours: 'Mon-Fri 8am-6pm',
        accessNotes: 'Badge required after hours.',
        buildingUse: 'office',
        entranceLabel: 'Main entrance',
        floorLabel: '',
        roomLabel: '',
        photoUrl: '',
        photoCaption: '',
        photoAttribution: ''
      }
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));

  const photoRef = doc(collection(ownerDb, 'editorSubmissions'));
  await assertFails(setDoc(photoRef, {
    ...editorSubmissionDoc(OWNER_UID, {
      editType: 'photo_point',
      payload: {
        title: 'Harbor frontage photo',
        subtitle: '',
        note: 'Use this as the waterfront reference image.',
        category: 'photo',
        icon: '📷',
        markerStyle: 'photo-frame',
        tagsText: 'waterfront,reference',
        placeKind: 'viewpoint',
        website: '',
        phone: '',
        hours: '',
        accessNotes: '',
        buildingUse: '',
        entranceLabel: '',
        floorLabel: '',
        roomLabel: '',
        photoUrl: 'https://example.test/photo.jpg',
        photoCaption: 'Street-facing harbor frontage',
        photoAttribution: 'Owner'
      }
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('user cannot spoof another owner on editor submission create', async () => {
  const submissionRef = doc(collection(attackerDb, 'editorSubmissions'));
  await assertFails(setDoc(submissionRef, {
    ...editorSubmissionDoc(OWNER_UID),
    userId: OWNER_UID,
    userDisplayName: 'Owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('user cannot create approved editor submission directly', async () => {
  const submissionRef = doc(collection(ownerDb, 'editorSubmissions'));
  await assertFails(setDoc(submissionRef, {
    ...editorSubmissionDoc(OWNER_UID, {
      status: 'approved'
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'editorSubmissions', 'pending_editor_seed'), editorSubmissionDoc(OWNER_UID));
  await setDoc(doc(db, 'editorSubmissions', 'approved_editor_seed'), editorSubmissionDoc(OWNER_UID, {
    status: 'approved',
    moderation: {
      moderatedBy: OWNER_UID,
      moderatedByName: 'Owner',
      moderatedAt: Timestamp.fromMillis(Date.now() - 30_000),
      decisionNote: 'Approved'
    }
  }));
});

await runCheck('submission owner can read own pending editor submission', async () => {
  await assertSucceeds(getDoc(doc(ownerDb, 'editorSubmissions', 'pending_editor_seed')));
});

await runCheck('other signed-in user cannot read someone else pending editor submission', async () => {
  await assertFails(getDoc(doc(attackerDb, 'editorSubmissions', 'pending_editor_seed')));
});

await runCheck('admin cannot approve pending editor submission directly', async () => {
  await assertFails(updateDoc(doc(adminClaimsDb, 'editorSubmissions', 'pending_editor_seed'), {
    status: 'approved',
    updatedAt: serverTimestamp(),
    moderation: {
      moderatedBy: OWNER_UID,
      moderatedByName: 'Owner',
      moderatedAt: serverTimestamp(),
      decisionNote: 'Approved'
    }
  }));
});

await runCheck('admin can read pending editor submission', async () => {
  await assertSucceeds(getDoc(doc(adminClaimsDb, 'editorSubmissions', 'pending_editor_seed')));
});

await runCheck('anon can read approved editor submission', async () => {
  await assertSucceeds(getDoc(doc(anonDb, 'editorSubmissions', 'approved_editor_seed')));
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'editorSubmissions', 'pending_editor_seed_user'), editorSubmissionDoc(OWNER_UID));
});

await runCheck('non-admin cannot approve pending editor submission', async () => {
  await assertFails(updateDoc(doc(ownerDb, 'editorSubmissions', 'pending_editor_seed_user'), {
    status: 'approved',
    updatedAt: serverTimestamp(),
    moderation: {
      moderatedBy: OWNER_UID,
      moderatedByName: 'Owner',
      moderatedAt: serverTimestamp(),
      decisionNote: 'Nope'
    }
  }));
});

await runCheck('signed-in user cannot create overlay feature head directly', async () => {
  const featureRef = doc(collection(ownerDb, 'overlayFeatures'));
  await assertFails(setDoc(featureRef, {
    ...overlayFeatureDoc(OWNER_UID, {
      featureId: featureRef.id
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

await runCheck('signed-in user cannot create published overlay directly', async () => {
  const publishedRef = doc(collection(ownerDb, 'overlayPublished'));
  await assertFails(setDoc(publishedRef, {
    ...overlayPublishedDoc(OWNER_UID, {
      featureId: publishedRef.id
    }),
    publishedAt: serverTimestamp()
  }));
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'overlayFeatures', 'overlay_draft_seed'), overlayFeatureDoc(OWNER_UID, {
    featureId: 'overlay_draft_seed',
    headRevisionId: 'rev_seed',
    reviewState: 'draft'
  }));
  await setDoc(doc(db, 'overlayFeatures', 'overlay_draft_seed', 'revisions', 'rev_seed'), overlayRevisionDoc(OWNER_UID, 'overlay_draft_seed', {
    revisionId: 'rev_seed'
  }));
  await setDoc(doc(db, 'overlayFeatures', 'overlay_draft_seed', 'moderation', 'event_submit'), overlayModerationEventDoc(OWNER_UID, 'overlay_draft_seed'));
  await setDoc(doc(db, 'overlayPublished', 'overlay_published_seed'), overlayPublishedDoc(OWNER_UID, {
    featureId: 'overlay_published_seed',
    headRevisionId: 'rev_published',
    areaKey: 'earth:2154:1723'
  }));
  await setDoc(doc(db, 'siteContentPublished', 'landingPage'), {
    entryId: 'landingPage',
    content: {
      hero: {
        headline: 'Published by admin'
      }
    },
    publishedAt: Timestamp.fromMillis(Date.now() - 5_000)
  });
  await setDoc(doc(db, 'adminActivity', 'seed_action'), {
    actorUid: OWNER_UID,
    actionType: 'overlay.approve',
    targetType: 'overlay_feature',
    targetId: 'overlay_published_seed',
    title: 'Seed admin action',
    summary: 'Seed moderation log',
    createdAt: Timestamp.fromMillis(Date.now() - 5_000),
    createdAtMs: Date.now() - 5_000
  });
});

await runCheck('overlay owner can read own overlay draft head', async () => {
  await assertSucceeds(getDoc(doc(ownerDb, 'overlayFeatures', 'overlay_draft_seed')));
});

await runCheck('other signed-in user cannot read another owner overlay draft head', async () => {
  await assertFails(getDoc(doc(attackerDb, 'overlayFeatures', 'overlay_draft_seed')));
});

await runCheck('admin can read overlay draft head', async () => {
  await assertSucceeds(getDoc(doc(adminClaimsDb, 'overlayFeatures', 'overlay_draft_seed')));
});

await runCheck('overlay owner can read own revision history', async () => {
  await assertSucceeds(getDoc(doc(ownerDb, 'overlayFeatures', 'overlay_draft_seed', 'revisions', 'rev_seed')));
});

await runCheck('other signed-in user cannot read another owner overlay revision history', async () => {
  await assertFails(getDoc(doc(attackerDb, 'overlayFeatures', 'overlay_draft_seed', 'revisions', 'rev_seed')));
});

await runCheck('overlay owner can read own moderation history', async () => {
  await assertSucceeds(getDoc(doc(ownerDb, 'overlayFeatures', 'overlay_draft_seed', 'moderation', 'event_submit')));
});

await runCheck('other signed-in user cannot read another owner overlay moderation history', async () => {
  await assertFails(getDoc(doc(attackerDb, 'overlayFeatures', 'overlay_draft_seed', 'moderation', 'event_submit')));
});

await runCheck('anon can read published overlay feature', async () => {
  await assertSucceeds(getDoc(doc(anonDb, 'overlayPublished', 'overlay_published_seed')));
});

await runCheck('anon can read published landing page content', async () => {
  await assertSucceeds(getDoc(doc(anonDb, 'siteContentPublished', 'landingPage')));
});

await runCheck('signed-in user cannot write site content draft directly', async () => {
  await assertFails(setDoc(doc(ownerDb, 'siteContent', 'landingPage'), {
    draft: {
      hero: {
        headline: 'Bad direct write'
      }
    }
  }));
});

await runCheck('signed-in user cannot read admin activity directly', async () => {
  await assertFails(getDoc(doc(ownerDb, 'adminActivity', 'seed_action')));
});

await runCheck('signed-in user cannot delete overlay draft head directly', async () => {
  await assertFails(deleteDoc(doc(ownerDb, 'overlayFeatures', 'overlay_draft_seed')));
});

const failed = checks.filter((c) => !c.ok);
console.log(`\nSecurity checks complete: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) {
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.message}`);
  }
}

await testEnv.cleanup();
assert.equal(failed.length, 0, 'One or more Firestore security checks failed.');
