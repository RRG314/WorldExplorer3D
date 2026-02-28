import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from './rooms.js?v=66';

const ROOM_COLLECTION = 'rooms';
const PLAYER_COLLECTION = 'players';
const PRESENCE_TTL_MS = 90 * 1000;
const HEARTBEAT_INTERVAL_MS = 2000;
const MIN_WRITE_INTERVAL_MS = 2000;
const MOVE_THRESHOLD_METERS = 0.5;
const ROTATE_THRESHOLD_RAD = 0.05;
const STALE_LAST_SEEN_MS = 45 * 1000;
const STALE_CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;
const MAX_PLAYER_DOCS_READ = 24;

let activeRoomId = null;
let getPose = null;
let heartbeatTimer = null;
let lastWriteAt = 0;
let lastSentPose = null;
let lastSamplePose = null;
let lastSampleAt = 0;
let inFlightWrite = false;
let releaseVisibilityListener = null;

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Multiplayer presence is unavailable.');
  }
  return services;
}

function getDisplayName(user) {
  const direct = String(user?.displayName || '').trim();
  if (direct) return direct.slice(0, 48);

  try {
    const fallback = localStorage.getItem('worldExplorer3D.flowerChallenge.playerName');
    if (fallback && fallback.trim()) return fallback.trim().slice(0, 48);
  } catch (_) {
    // ignore
  }

  const input = document.getElementById('flowerPlayerName');
  const inputValue = String(input?.value || '').trim();
  return (inputValue || 'Explorer').slice(0, 48);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFrame(rawFrame = {}, fallbackKind = 'earth') {
  const kindRaw = String(rawFrame.kind || fallbackKind || 'earth').toLowerCase();
  const kind = kindRaw === 'moon' || kindRaw === 'space' ? kindRaw : 'earth';
  return {
    kind,
    locLat: finiteNumber(rawFrame.locLat, 0),
    locLon: finiteNumber(rawFrame.locLon, 0)
  };
}

function normalizePosePayload(rawPose = {}) {
  const pose = rawPose.pose || {};
  const frame = normalizeFrame(rawPose.frame || {}, rawPose.mode === 'space' ? 'space' : rawPose.mode === 'moon' ? 'moon' : 'earth');
  const modeRaw = String(rawPose.mode || '').toLowerCase();
  const mode = ['drive', 'walk', 'drone', 'space', 'moon'].includes(modeRaw) ? modeRaw : 'drive';

  return {
    mode,
    frame,
    pose: {
      x: finiteNumber(pose.x, 0),
      y: finiteNumber(pose.y, 0),
      z: finiteNumber(pose.z, 0),
      yaw: finiteNumber(pose.yaw, 0),
      pitch: finiteNumber(pose.pitch, 0),
      vx: finiteNumber(pose.vx, 0),
      vy: finiteNumber(pose.vy, 0),
      vz: finiteNumber(pose.vz, 0)
    }
  };
}

function clampVelocity(v, max = 120) {
  const n = finiteNumber(v, 0);
  if (n > max) return max;
  if (n < -max) return -max;
  return n;
}

function enrichPoseVelocity(normalizedPose, nowMs) {
  if (!normalizedPose || !normalizedPose.pose) return normalizedPose;

  const pose = normalizedPose.pose;
  const incomingSpeed = Math.hypot(
    finiteNumber(pose.vx, 0),
    finiteNumber(pose.vy, 0),
    finiteNumber(pose.vz, 0)
  );

  if (incomingSpeed < 0.01 && lastSamplePose && nowMs > lastSampleAt) {
    const dt = (nowMs - lastSampleAt) / 1000;
    if (dt > 0.016) {
      pose.vx = clampVelocity((finiteNumber(pose.x, 0) - finiteNumber(lastSamplePose.x, 0)) / dt);
      pose.vy = clampVelocity((finiteNumber(pose.y, 0) - finiteNumber(lastSamplePose.y, 0)) / dt);
      pose.vz = clampVelocity((finiteNumber(pose.z, 0) - finiteNumber(lastSamplePose.z, 0)) / dt);
    }
  }

  lastSamplePose = {
    x: finiteNumber(pose.x, 0),
    y: finiteNumber(pose.y, 0),
    z: finiteNumber(pose.z, 0)
  };
  lastSampleAt = nowMs;
  return normalizedPose;
}

function angularDistance(a, b) {
  const delta = (finiteNumber(a, 0) - finiteNumber(b, 0)) % (Math.PI * 2);
  if (delta > Math.PI) return delta - Math.PI * 2;
  if (delta < -Math.PI) return delta + Math.PI * 2;
  return Math.abs(delta);
}

function movedBeyondThreshold(prevPose, nextPose) {
  if (!prevPose || !nextPose) return true;
  const dx = finiteNumber(nextPose.x) - finiteNumber(prevPose.x);
  const dy = finiteNumber(nextPose.y) - finiteNumber(prevPose.y);
  const dz = finiteNumber(nextPose.z) - finiteNumber(prevPose.z);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance >= MOVE_THRESHOLD_METERS) return true;

  const yawDelta = angularDistance(nextPose.yaw, prevPose.yaw);
  const pitchDelta = angularDistance(nextPose.pitch, prevPose.pitch);
  return yawDelta >= ROTATE_THRESHOLD_RAD || pitchDelta >= ROTATE_THRESHOLD_RAD;
}

async function writePresence(force = false) {
  if (!activeRoomId || typeof getPose !== 'function' || inFlightWrite) return;

  const user = getCurrentUser();
  if (!user || !user.uid) return;

  const now = Date.now();
  if (!force && now - lastWriteAt < MIN_WRITE_INTERVAL_MS) return;

  const normalized = enrichPoseVelocity(
    normalizePosePayload(getPose() || {}),
    now
  );
  const intervalReached = now - lastWriteAt >= HEARTBEAT_INTERVAL_MS;
  const movementReached = movedBeyondThreshold(lastSentPose?.pose, normalized.pose);
  if (!force && !intervalReached && !movementReached) return;

  inFlightWrite = true;
  try {
    const { db } = getServices();
    const playerRef = doc(db, ROOM_COLLECTION, activeRoomId, PLAYER_COLLECTION, user.uid);
    await setDoc(playerRef, {
      uid: user.uid,
      displayName: getDisplayName(user),
      lastSeenAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + PRESENCE_TTL_MS),
      mode: normalized.mode,
      frame: normalized.frame,
      pose: normalized.pose,
      joinCode: activeRoomId
    }, { merge: true });

    lastWriteAt = now;
    lastSentPose = normalized;
  } catch (err) {
    console.warn('[multiplayer][presence] write failed:', err);
  } finally {
    inFlightWrite = false;
  }
}

async function stopPresence() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (releaseVisibilityListener) {
    releaseVisibilityListener();
    releaseVisibilityListener = null;
  }

  const roomId = activeRoomId;
  const user = getCurrentUser();

  activeRoomId = null;
  getPose = null;
  lastSentPose = null;
  lastSamplePose = null;
  lastSampleAt = 0;
  lastWriteAt = 0;

  if (!roomId || !user || !user.uid) return;

  try {
    const { db } = getServices();
    const playerRef = doc(db, ROOM_COLLECTION, roomId, PLAYER_COLLECTION, user.uid);
    await setDoc(playerRef, {
      expiresAt: Timestamp.fromMillis(Date.now() + 1000)
    }, { merge: true });
  } catch (_) {
    // Best effort only.
  }
}

function installVisibilityHooks() {
  const onVisibility = () => {
    if (document.hidden) {
      writePresence(true);
      return;
    }
    writePresence(true);
  };

  const onBeforeUnload = () => {
    writePresence(true);
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onBeforeUnload);

  releaseVisibilityListener = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

function startPresence(roomId, getPoseFn) {
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) {
    throw new Error('A valid room code is required to start presence.');
  }

  if (typeof getPoseFn !== 'function') {
    throw new Error('startPresence requires a pose provider function.');
  }

  stopPresence();

  activeRoomId = normalizedRoomId;
  getPose = getPoseFn;
  lastSamplePose = null;
  lastSampleAt = 0;
  heartbeatTimer = setInterval(() => {
    writePresence(false);
  }, HEARTBEAT_INTERVAL_MS);

  installVisibilityHooks();
  // The room create/join flow already writes presence. Waiting for the first heartbeat
  // avoids immediate server-side throttle denials on lastSeenAt.
  lastWriteAt = Date.now();
}

function listenPlayers(roomId, callback) {
  if (typeof callback !== 'function') return () => {};

  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) {
    callback([]);
    return () => {};
  }

  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback([]);
    return () => {};
  }

  const playersRef = collection(db, ROOM_COLLECTION, normalizedRoomId, PLAYER_COLLECTION);
  const playersQuery = query(playersRef, orderBy('lastSeenAt', 'desc'), limit(MAX_PLAYER_DOCS_READ));
  return onSnapshot(playersQuery, (snap) => {
    const now = Date.now();
    const players = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const expiresAt = data.expiresAt;
      const expiresAtMs = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : null;
      if (
        Number.isFinite(expiresAtMs) &&
        expiresAtMs < now - STALE_CLOCK_SKEW_TOLERANCE_MS
      ) {
        return;
      }

      const lastSeenAt = data.lastSeenAt;
      const lastSeenAtMs = typeof lastSeenAt?.toMillis === 'function' ? lastSeenAt.toMillis() : null;
      if (
        Number.isFinite(lastSeenAtMs) &&
        now - lastSeenAtMs > STALE_LAST_SEEN_MS + STALE_CLOCK_SKEW_TOLERANCE_MS
      ) {
        return;
      }

      players.push({
        uid: String(data.uid || docSnap.id),
        displayName: String(data.displayName || 'Explorer'),
        role: String(data.role || 'member'),
        mode: String(data.mode || 'drive'),
        frame: {
          kind: String(data.frame?.kind || 'earth'),
          locLat: finiteNumber(data.frame?.locLat, 0),
          locLon: finiteNumber(data.frame?.locLon, 0)
        },
        pose: {
          x: finiteNumber(data.pose?.x, 0),
          y: finiteNumber(data.pose?.y, 0),
          z: finiteNumber(data.pose?.z, 0),
          yaw: finiteNumber(data.pose?.yaw, 0),
          pitch: finiteNumber(data.pose?.pitch, 0),
          vx: finiteNumber(data.pose?.vx, 0),
          vy: finiteNumber(data.pose?.vy, 0),
          vz: finiteNumber(data.pose?.vz, 0)
        },
        joinedAt: data.joinedAt || null,
        lastSeenAt: data.lastSeenAt || null,
        expiresAt: data.expiresAt || null
      });
    });

    players.sort((a, b) => a.displayName.localeCompare(b.displayName));
    callback(players);
  }, (err) => {
    console.warn('[multiplayer][presence] listenPlayers failed:', err);
    callback([]);
  });
}

export {
  listenPlayers,
  startPresence,
  stopPresence
};
