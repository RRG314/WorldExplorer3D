#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getIdToken, signInAnonymously } from 'firebase/auth';
import {
  Timestamp,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc
} from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { urbanEntityDocumentId } = require('../functions/urban-sandbox.js');
const rootDir = process.cwd();
const projectId = 'we3d-urban-authority';
const childFlag = '--inside-emulators';

function parseHostPort(raw, fallbackPort) {
  const [host, port] = String(raw || `127.0.0.1:${fallbackPort}`).replace(/^https?:\/\//, '').split(':');
  return { host: host || '127.0.0.1', port: Number.parseInt(port || String(fallbackPort), 10) };
}

function runCommand(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: rootDir, env, stdio: 'inherit', shell: false });
    child.once('error', (error) => resolve({ code: 1, error }));
    child.once('exit', (code) => resolve({ code: Number.isInteger(code) ? code : 1 }));
  });
}

async function runEmulators() {
  const env = { ...process.env };
  const parameterPath = path.join(rootDir, 'functions', `.env.${projectId}`);
  let previousParameters = null;
  try {
    previousParameters = await fs.readFile(parameterPath, 'utf8');
  } catch (_) {}
  const localParameters = [
    'WE3D_STRIPE_SECRET=local_test_stripe_secret',
    'WE3D_STRIPE_WEBHOOK_SECRET=local_test_webhook_secret',
    'WE3D_STRIPE_PRICE_SUPPORTER=price_local_supporter',
    'WE3D_STRIPE_PRICE_PRO=price_local_pro',
    'WE3D_ADMIN_ALLOWED_EMAILS=admin@example.test',
    'WE3D_ADMIN_ALLOWED_UIDS=local-admin',
    'WE3D_ALLOWED_ORIGINS=http://127.0.0.1:4192',
    'WE3D_RESEND_API_KEY=local_test_resend_key',
    'WE3D_EMAIL_FROM=test@example.test',
    'WE3D_ADMIN_NOTIFICATION_EMAIL=admin@example.test',
    'WE3D_MODERATION_PANEL_URL=http://127.0.0.1:4192/account/admin.html?view=moderation',
    ''
  ].join('\n');
  await fs.writeFile(parameterPath, localParameters, { encoding: 'utf8', mode: 0o600 });
  if (!String(env.JAVA_HOME || '').trim()) {
    for (const candidate of ['/opt/homebrew/opt/openjdk@21', '/usr/local/opt/openjdk@21']) {
      try {
        await fs.access(path.join(candidate, 'bin', 'java'));
        env.JAVA_HOME = candidate;
        env.PATH = `${path.join(candidate, 'bin')}:${env.PATH || ''}`;
        break;
      } catch (_) {}
    }
  }
  const command = `node scripts/test-urban-authority-integration.mjs ${childFlag}`;
  const args = ['emulators:exec', '--project', projectId, '--only', 'auth,firestore,functions', command];
  try {
    const direct = await runCommand('firebase', args, env);
    if (!direct.error || direct.error.code !== 'ENOENT') return direct.code;
    const fallback = await runCommand(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'firebase-tools', ...args], env);
    return fallback.code;
  } finally {
    if (previousParameters == null) await fs.rm(parameterPath, { force: true });
    else await fs.writeFile(parameterPath, previousParameters, { encoding: 'utf8', mode: 0o600 });
  }
}

async function createClient(name, authHost, firestoreHost) {
  const app = initializeApp({
    apiKey: 'demo-key',
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    appId: `1:123:web:${name}`
  }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost.host}:${authHost.port}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost.host, firestoreHost.port);
  const credential = await signInAnonymously(auth);
  return { app, auth, db, user: credential.user, token: await getIdToken(credential.user, true) };
}

async function postFunction(origin, name, token, body) {
  const response = await fetch(`${origin}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${name} ${response.status}: ${payload.error || 'request failed'}`);
  return payload;
}

async function runIntegration() {
  const authHost = parseHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099);
  const firestoreHost = parseHostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
  const functionsHost = parseHostPort(process.env.CLOUD_FUNCTIONS_EMULATOR_HOST, 5001);
  const functionOrigin = `http://${functionsHost.host}:${functionsHost.port}/${projectId}/us-central1`;
  const rules = await fs.readFile(path.join(rootDir, 'firestore.rules'), 'utf8');
  const testEnv = await initializeTestEnvironment({ projectId, firestore: { ...firestoreHost, rules } });
  const owner = await createClient(`urban-owner-${Date.now()}`, authHost, firestoreHost);
  const member = await createClient(`urban-member-${Date.now()}`, authHost, firestoreHost);
  const roomCode = 'URB234';
  const worldSeed = 'baltimore-room-world';
  const now = Date.now();

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'rooms', roomCode), {
        code: roomCode,
        ownerUid: owner.user.uid,
        visibility: 'private',
        world: { kind: 'earth', seed: worldSeed, lat: 39.2904, lon: -76.6122 }
      });
      for (const client of [owner, member]) {
        await setDoc(doc(db, 'rooms', roomCode, 'players', client.user.uid), {
          uid: client.user.uid,
          displayName: client === owner ? 'Owner Explorer' : 'Member Explorer',
          joinedAt: Timestamp.fromMillis(now - 5_000),
          lastSeenAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(now + 90_000),
          role: client === owner ? 'owner' : 'member',
          mode: 'walk',
          frame: { kind: 'earth', locLat: 39.2904, locLon: -76.6122 },
          pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 },
          joinCode: roomCode
        });
      }
    });

    const entityId = 'urban-vehicle:integration-van';
    const vehicle = {
      roomCode,
      worldSeed,
      entityId,
      label: 'Integration delivery van',
      style: 'van',
      color: 0x426255,
      pose: { x: 5, y: 0, z: 0, yaw: 0 }
    };
    const [ownerClaim, memberClaim] = await Promise.all([
      postFunction(functionOrigin, 'claimUrbanVehicle', owner.token, vehicle),
      postFunction(functionOrigin, 'claimUrbanVehicle', member.token, vehicle)
    ]);
    const accepted = [ownerClaim, memberClaim].filter((result) => result.accepted);
    if (accepted.length !== 1) throw new Error(`Expected one accepted lease, received ${accepted.length}.`);
    const winner = ownerClaim.accepted ? owner : member;
    const loser = winner === owner ? member : owner;
    const loserUpdate = await postFunction(functionOrigin, 'updateUrbanVehicle', loser.token, {
      ...vehicle,
      pose: { x: 7, y: 0, z: 0, yaw: .1 }
    });
    if (loserUpdate.accepted || loserUpdate.reason !== 'not_owner') throw new Error('Non-owner vehicle update was not rejected.');
    const winnerUpdate = await postFunction(functionOrigin, 'updateUrbanVehicle', winner.token, {
      ...vehicle,
      pose: { x: 7, y: 0, z: 0, yaw: .1 }
    });
    if (!winnerUpdate.accepted) throw new Error('Lease owner vehicle update was rejected.');
    const released = await postFunction(functionOrigin, 'releaseUrbanVehicle', winner.token, {
      ...vehicle,
      pose: { x: 7, y: 0, z: 0, yaw: .1 }
    });
    if (!released.accepted || !released.released) throw new Error('Vehicle release failed.');
    const reclaimed = await postFunction(functionOrigin, 'claimUrbanVehicle', loser.token, {
      ...vehicle,
      pose: { x: 7, y: 0, z: 0, yaw: .1 }
    });
    if (!reclaimed.accepted) throw new Error('Released vehicle could not be reclaimed.');

    const npcId = 'urban-npc:integration:pedestrian:1';
    const impact = await postFunction(functionOrigin, 'commitUrbanImpacts', loser.token, {
      roomCode,
      worldSeed,
      equipmentId: 'baton',
      impactPosition: { x: 1.4, y: 0, z: 0, yaw: 0 },
      targets: [{ entityId: npcId, kind: 'npc', pose: { x: 1.6, y: 0, z: 0, yaw: 0 } }]
    });
    if (!impact.accepted || impact.results?.[0]?.after >= 1) throw new Error('Server impact did not reduce condition.');

    const vehicleDocId = urbanEntityDocumentId(entityId);
    const npcDocId = urbanEntityDocumentId(npcId);
    const [ownerVehicle, memberVehicle, ownerNpc, memberNpc] = await Promise.all([
      getDoc(doc(owner.db, 'rooms', roomCode, 'urbanEntities', vehicleDocId)),
      getDoc(doc(member.db, 'rooms', roomCode, 'urbanEntities', vehicleDocId)),
      getDoc(doc(owner.db, 'rooms', roomCode, 'urbanEntities', npcDocId)),
      getDoc(doc(member.db, 'rooms', roomCode, 'urbanEntities', npcDocId))
    ]);
    if (![ownerVehicle, memberVehicle, ownerNpc, memberNpc].every((snapshot) => snapshot.exists())) {
      throw new Error('Both clients did not receive server-owned entity state.');
    }
    let directWriteDenied = false;
    try {
      await setDoc(doc(loser.db, 'rooms', roomCode, 'urbanEntities', 'forged'), {
        entityId: 'urban-vehicle:forged', condition: 0, leaseOwnerUid: loser.user.uid
      });
    } catch (error) {
      directWriteDenied = String(error?.code || '').includes('permission-denied');
    }
    if (!directWriteDenied) throw new Error('A normal room client could write server-owned urban state.');

    console.log(JSON.stringify({
      ok: true,
      contract: 'urban-room-authority-integration-v1',
      independentUsers: owner.user.uid !== member.user.uid,
      winningUid: winner.user.uid,
      losingUpdateReason: loserUpdate.reason,
      reclaimedBy: loser.user.uid,
      synchronizedVehicleRevision: ownerVehicle.data().revision,
      synchronizedNpcCondition: ownerNpc.data().condition,
      directWriteDenied
    }, null, 2));
  } finally {
    await Promise.allSettled([deleteApp(owner.app), deleteApp(member.app)]);
    await testEnv.cleanup();
  }
}

if (process.argv.includes(childFlag)) {
  runIntegration().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  const code = await runEmulators();
  process.exit(code);
}
