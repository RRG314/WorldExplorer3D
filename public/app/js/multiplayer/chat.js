import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from './rooms.js?v=55';

const ROOM_COLLECTION = 'rooms';
const CHAT_COLLECTION = 'chat';
const CHAT_STATE_COLLECTION = 'chatState';
const CHAT_MAX_LENGTH = 500;
const CHAT_LIMIT = 50;
const CHAT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHAT_STATE_TTL_MS = 24 * 60 * 60 * 1000;
const CLIENT_MIN_INTERVAL_MS = 1200;
const CLIENT_BURST_WINDOW_MS = 20 * 1000;
const CLIENT_BURST_LIMIT = 5;
const CLIENT_DUPLICATE_WINDOW_MS = 15 * 1000;
const SERVER_MIN_INTERVAL_MS = 2000;
const SERVER_BURST_WINDOW_MS = 20 * 1000;
const SERVER_BURST_LIMIT = 5;

const PROFANITY_PATTERNS = [
  /\bf+u+c+k+\w*\b/ig,
  /\bs+h+i+t+\w*\b/ig,
  /\bb+i+t+c+h+\w*\b/ig,
  /\ba+s+s+h+o+l+e+\w*\b/ig,
  /\bm+o+t+h+e+r+f+u+c+k+e*r*\w*\b/ig
];

const roomRateState = new Map();

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Multiplayer chat is unavailable.');
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

  return 'Explorer';
}

function clampMessage(rawText) {
  const normalized = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    throw new Error('Type a message first.');
  }
  if (normalized.length > CHAT_MAX_LENGTH) {
    throw new Error(`Messages are limited to ${CHAT_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function duplicateKey(text) {
  return String(text || '').toLowerCase().trim();
}

function checkClientRateLimit(roomId, text) {
  const key = normalizeCode(roomId);
  const now = Date.now();
  const state = roomRateState.get(key) || {
    lastSentAt: 0,
    windowStartedAt: 0,
    windowCount: 0,
    lastMessageKey: '',
    lastMessageAt: 0
  };

  if (state.lastSentAt && now - state.lastSentAt < CLIENT_MIN_INTERVAL_MS) {
    throw new Error('You are sending messages too fast. Please wait a second.');
  }

  if (!state.windowStartedAt || now - state.windowStartedAt > CLIENT_BURST_WINDOW_MS) {
    state.windowStartedAt = now;
    state.windowCount = 0;
  }

  if (state.windowCount >= CLIENT_BURST_LIMIT) {
    throw new Error('Chat burst limit reached. Please wait a few seconds.');
  }

  const nextKey = duplicateKey(text);
  if (nextKey && state.lastMessageKey === nextKey && now - state.lastMessageAt < CLIENT_DUPLICATE_WINDOW_MS) {
    throw new Error('Duplicate message blocked. Please avoid repeated spam.');
  }

  state.lastSentAt = now;
  state.windowCount += 1;
  state.lastMessageKey = nextKey;
  state.lastMessageAt = now;
  roomRateState.set(key, state);
}

function readMs(timestampValue) {
  if (!timestampValue) return null;
  if (typeof timestampValue.toMillis === 'function') return timestampValue.toMillis();
  if (typeof timestampValue.seconds === 'number') return timestampValue.seconds * 1000;
  return null;
}

function applyProfanityFilter(text) {
  let output = text;
  let touched = false;

  for (const pattern of PROFANITY_PATTERNS) {
    output = output.replace(pattern, (match) => {
      touched = true;
      const safeLength = Math.max(match.length, 3);
      return '*'.repeat(Math.min(safeLength, 12));
    });
  }

  return {
    text: output,
    wasFiltered: touched
  };
}

async function sendMessage(roomId, text) {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Sign in is required to chat.');
  }

  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) {
    throw new Error('Join a room before sending messages.');
  }

  const clampedText = clampMessage(text);
  const filtered = applyProfanityFilter(clampedText);
  checkClientRateLimit(normalizedRoomId, filtered.text);

  const { db } = getServices();
  const stateRef = doc(db, ROOM_COLLECTION, normalizedRoomId, CHAT_STATE_COLLECTION, user.uid);
  const roomRef = doc(db, ROOM_COLLECTION, normalizedRoomId);
  const msgRef = doc(collection(db, ROOM_COLLECTION, normalizedRoomId, CHAT_COLLECTION));

  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) {
    throw new Error('Room not found.');
  }

  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const nowMs = Date.now();

    let nextWindowCount = 1;
    let nextWindowStartedAt = serverTimestamp();

    if (stateSnap.exists()) {
      const current = stateSnap.data() || {};
      const lastMessageAtMs = readMs(current.lastMessageAt);
      const windowStartedAtMs = readMs(current.windowStartedAt);
      const currentCount = Number.isFinite(Number(current.windowCount)) ? Number(current.windowCount) : 0;

      if (Number.isFinite(lastMessageAtMs) && nowMs - lastMessageAtMs < SERVER_MIN_INTERVAL_MS) {
        throw new Error('Server chat cooldown active. Wait before sending another message.');
      }

      if (Number.isFinite(windowStartedAtMs) && nowMs - windowStartedAtMs <= SERVER_BURST_WINDOW_MS) {
        nextWindowStartedAt = current.windowStartedAt;
        nextWindowCount = currentCount + 1;
        if (nextWindowCount > SERVER_BURST_LIMIT) {
          throw new Error('Server burst limit reached. Wait before sending more messages.');
        }
      } else {
        nextWindowStartedAt = serverTimestamp();
        nextWindowCount = 1;
      }
    }

    tx.set(msgRef, {
      uid: user.uid,
      displayName: getDisplayName(user),
      text: filtered.text,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(nowMs + CHAT_TTL_MS),
      flags: {
        reported: false,
        autoFiltered: filtered.wasFiltered
      }
    });

    tx.set(stateRef, {
      uid: user.uid,
      lastMessageAt: serverTimestamp(),
      windowStartedAt: nextWindowStartedAt,
      windowCount: nextWindowCount,
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(nowMs + CHAT_STATE_TTL_MS)
    });
  });

  return filtered;
}

function listenChat(roomId, callback) {
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

  const chatQuery = query(
    collection(db, ROOM_COLLECTION, normalizedRoomId, CHAT_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(CHAT_LIMIT)
  );

  return onSnapshot(chatQuery, (snap) => {
    const messages = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      messages.push({
        id: docSnap.id,
        uid: String(data.uid || ''),
        displayName: String(data.displayName || 'Explorer'),
        text: String(data.text || ''),
        createdAt: data.createdAt || null,
        flags: {
          reported: !!data.flags?.reported,
          autoFiltered: !!data.flags?.autoFiltered
        }
      });
    });

    callback(messages.reverse());
  }, (err) => {
    console.warn('[multiplayer][chat] listenChat failed:', err);
    callback([]);
  });
}

async function reportMessage(roomId, messageId, reason = '') {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Sign in is required to report chat messages.');
  }

  const normalizedRoomId = normalizeCode(roomId);
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedRoomId || !normalizedMessageId) {
    throw new Error('Missing room or message reference.');
  }

  const { db } = getServices();
  const ref = doc(db, ROOM_COLLECTION, normalizedRoomId, CHAT_COLLECTION, normalizedMessageId);
  await setDoc(ref, {
    flags: {
      reported: true,
      reportReason: String(reason || '').trim().slice(0, 120),
      reportedBy: user.uid,
      reportedAt: serverTimestamp()
    }
  }, { merge: true });
}

export {
  listenChat,
  reportMessage,
  sendMessage,
  CHAT_MAX_LENGTH
};
