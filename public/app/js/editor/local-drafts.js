import { normalizeOverlayFeature } from './schema.js?v=1';

const LOCAL_DRAFTS_STORAGE_KEY = 'world_explorer_overlay_local_drafts_v1';

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizeText(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compareNewestFirst(a, b) {
  return (Number(b?.updatedAtMs) || Number(b?.createdAtMs) || 0) - (Number(a?.updatedAtMs) || Number(a?.createdAtMs) || 0);
}

function canUseLocalStorage() {
  return typeof globalThis.localStorage !== 'undefined';
}

function readRows() {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = globalThis.localStorage.getItem(LOCAL_DRAFTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  if (!canUseLocalStorage()) return false;
  try {
    globalThis.localStorage.setItem(LOCAL_DRAFTS_STORAGE_KEY, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

function listLocalOverlayDrafts() {
  return readRows()
    .map((row) => normalizeOverlayFeature({ ...cloneJson(row), storageMode: 'local' }))
    .sort(compareNewestFirst);
}

function upsertLocalOverlayDraft(feature = {}) {
  const normalized = normalizeOverlayFeature({
    ...cloneJson(feature),
    reviewState: 'draft',
    publicationState: 'unpublished',
    storageMode: 'local'
  });
  const rows = readRows().filter((row) => sanitizeText(row?.featureId || '', 180) !== normalized.featureId);
  rows.unshift(cloneJson(normalized));
  writeRows(rows);
  return normalized;
}

function removeLocalOverlayDraft(featureId = '') {
  const cleanId = sanitizeText(featureId, 180);
  if (!cleanId) return false;
  const rows = readRows();
  const nextRows = rows.filter((row) => sanitizeText(row?.featureId || '', 180) !== cleanId);
  if (nextRows.length === rows.length) return false;
  writeRows(nextRows);
  return true;
}

export {
  listLocalOverlayDrafts,
  removeLocalOverlayDraft,
  upsertLocalOverlayDraft
};
