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
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore';

const ROOM_ID = 'AB12CD';
const OWNER_UID = 'owner_user';
const MEMBER_UID = 'member_user';
const ATTACKER_UID = 'attacker_user';
const INVITEE_UID = 'invitee_user';

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

async function seedData(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, 'users', OWNER_UID), userDoc(OWNER_UID, 'Owner'));
    await setDoc(doc(db, 'users', MEMBER_UID), userDoc(MEMBER_UID, 'Member'));
    await setDoc(doc(db, 'users', ATTACKER_UID), userDoc(ATTACKER_UID, 'Attacker'));
    await setDoc(doc(db, 'users', INVITEE_UID), userDoc(INVITEE_UID, 'Invitee'));

    await setDoc(doc(db, 'rooms', ROOM_ID), privateRoomDoc());
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

const failed = checks.filter((c) => !c.ok);
console.log(`\nSecurity checks complete: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) {
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.message}`);
  }
}

await testEnv.cleanup();
assert.equal(failed.length, 0, 'One or more Firestore security checks failed.');
