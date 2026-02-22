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
      allowGhosts: true
    }
  };
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
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    billingCycleAnchorAt: null,
    cancelAtPeriodEnd: false
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

const failed = checks.filter((c) => !c.ok);
console.log(`\nSecurity checks complete: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) {
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.message}`);
  }
}

await testEnv.cleanup();
assert.equal(failed.length, 0, 'One or more Firestore security checks failed.');
