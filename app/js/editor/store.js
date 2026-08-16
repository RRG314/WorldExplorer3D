import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import {
  deleteOverlayFeatureDraft,
  moderateOverlayFeature,
  saveOverlayFeatureDraft,
  submitOverlayFeature
} from '../../../js/overlay-api.js?v=1';
import { OVERLAY_REVIEW_STATES } from './config.js?v=1';
import { computeOverlayAreaKey, normalizeOverlayFeature } from './schema.js?v=1';
import {
  listLocalOverlayDrafts,
  removeLocalOverlayDraft,
  upsertLocalOverlayDraft
} from './local-drafts.js?v=1';

const OVERLAY_FEATURES_COLLECTION = 'overlayFeatures';
const OVERLAY_PUBLISHED_COLLECTION = 'overlayPublished';
const MAX_OWN_RESULTS = 90;
const MAX_MODERATION_RESULTS = 140;
const MAX_PUBLISHED_RESULTS = 120;

function requireUser() {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error('Sign in is required for overlay editing.');
  return user;
}

function getServices() {
  const services = initFirebase();
  if (!services?.db) {
    throw new Error('Missing Firebase config. Overlay storage is unavailable until Firebase is configured.');
  }
  return services;
}

function sanitizeText(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compareNewestFirst(a, b) {
  return (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0);
}

function mergeDraftLists(primary = [], secondary = []) {
  const seen = new Set();
  const items = [];
  [...primary, ...secondary].forEach((item) => {
    const feature = normalizeOverlayFeature(item);
    if (!feature.featureId || seen.has(feature.featureId)) return;
    seen.add(feature.featureId);
    items.push(feature);
  });
  items.sort(compareNewestFirst);
  return items;
}

function normalizeDoc(row) {
  return normalizeOverlayFeature(typeof row.data === 'function' ? { featureId: row.id, ...row.data() } : row);
}

function normalizePublishedDoc(row) {
  return normalizeOverlayFeature(typeof row.data === 'function' ? { featureId: row.id, ...row.data() } : row, {
    reviewState: 'approved',
    publicationState: 'published'
  });
}

function overlayBackendReady() {
  try {
    return !!getServices().db;
  } catch {
    return false;
  }
}

async function createOrUpdateOverlayDraft(feature) {
  const normalized = normalizeOverlayFeature(feature);
  try {
    requireUser();
    getServices();
    const payload = await saveOverlayFeatureDraft(normalized);
    const saved = normalizeOverlayFeature({ ...(payload?.item || normalized), storageMode: 'cloud' });
    removeLocalOverlayDraft(saved.featureId);
    return saved;
  } catch (error) {
    console.warn('[overlay-editor] falling back to local draft storage:', error);
    return upsertLocalOverlayDraft(normalized);
  }
}

async function submitOverlayDraft(featureId) {
  requireUser();
  getServices();
  const payload = await submitOverlayFeature(featureId);
  return normalizeOverlayFeature(payload?.item || { featureId, reviewState: 'submitted' });
}

async function moderateOverlayDraft(featureId, action, note = '') {
  requireUser();
  getServices();
  const payload = await moderateOverlayFeature(featureId, action, note);
  return normalizeOverlayFeature(payload?.item || { featureId });
}

async function removeOverlayDraft(featureId) {
  const localRemoved = removeLocalOverlayDraft(featureId);
  try {
    requireUser();
    getServices();
    return deleteOverlayFeatureDraft(featureId);
  } catch {
    return localRemoved;
  }
}

function listenOwnOverlayFeatures(callback) {
  if (typeof callback !== 'function') return () => {};
  const localItems = listLocalOverlayDrafts();
  let user;
  let db;
  try {
    user = requireUser();
    ({ db } = getServices());
  } catch {
    callback(localItems);
    return () => {};
  }

  const q = query(
    collection(db, OVERLAY_FEATURES_COLLECTION),
    where('createdBy', '==', user.uid),
    orderBy('updatedAt', 'desc'),
    limit(MAX_OWN_RESULTS)
  );

  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((row) => items.push(normalizeDoc(row)));
    callback(mergeDraftLists(items, listLocalOverlayDrafts()));
  }, (err) => {
    console.warn('[overlay-editor] own feature listener failed:', err);
    callback(listLocalOverlayDrafts());
  });
}

function listenOverlayModerationQueue(options = {}, callback) {
  const handler = typeof options === 'function' ? options : callback;
  if (typeof handler !== 'function') return () => {};
  let db;
  try {
    ({ db } = getServices());
  } catch {
    handler([]);
    return () => {};
  }

  const q = query(
    collection(db, OVERLAY_FEATURES_COLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(MAX_MODERATION_RESULTS)
  );

  const requestedState = sanitizeText(options?.reviewState || '', 40).toLowerCase();

  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((row) => items.push(normalizeDoc(row)));
    items.sort(compareNewestFirst);
    const filtered = requestedState && OVERLAY_REVIEW_STATES.includes(requestedState)
      ? items.filter((item) => item.reviewState === requestedState)
      : items;
    handler(filtered);
  }, (err) => {
    console.warn('[overlay-editor] moderation listener failed:', err);
    handler([]);
  });
}

function listenPublishedOverlayFeatures(options = {}, callback) {
  if (typeof callback !== 'function') return () => {};
  const onError = typeof options.onError === 'function' ? options.onError : null;
  let db;
  try {
    ({ db } = getServices());
  } catch {
    callback([]);
    return () => {};
  }

  const worldKind = sanitizeText(options.worldKind || 'earth', 24).toLowerCase() || 'earth';
  const areaKeys = [...new Set(
    (Array.isArray(options.areaKeys) ? options.areaKeys : [])
      .map((value) => sanitizeText(value, 64))
      .filter(Boolean)
  )].slice(0, 10);
  if (!areaKeys.length) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, OVERLAY_PUBLISHED_COLLECTION),
    where('worldKind', '==', worldKind),
    where('areaKey', 'in', areaKeys),
    orderBy('publishedAt', 'desc'),
    limit(MAX_PUBLISHED_RESULTS)
  );

  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((row) => items.push(normalizePublishedDoc(row)));
    items.sort(compareNewestFirst);
    callback(items);
  }, (err) => {
    console.warn('[overlay-editor] published overlay listener failed:', err);
    callback([]);
    if (onError) onError(err);
  });
}

export {
  MAX_MODERATION_RESULTS,
  MAX_OWN_RESULTS,
  MAX_PUBLISHED_RESULTS,
  OVERLAY_FEATURES_COLLECTION,
  OVERLAY_PUBLISHED_COLLECTION,
  computeOverlayAreaKey,
  createOrUpdateOverlayDraft,
  listenOverlayModerationQueue,
  listenOwnOverlayFeatures,
  listenPublishedOverlayFeatures,
  moderateOverlayDraft,
  overlayBackendReady,
  removeOverlayDraft,
  submitOverlayDraft
};
