import { normalizeOverlayFeature } from './schema.js?v=1';

const LOCAL_DRAFTS_STORAGE_KEY = 'world_explorer_overlay_local_drafts_v1';
const LOCAL_DRAFTS_BACKUP_STORAGE_KEY = 'world_explorer_overlay_local_drafts_backup_v1';

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

function parseRows(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredRows(key) {
  if (!canUseLocalStorage()) return null;
  try {
    return parseRows(globalThis.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function restorePrimaryRows(rows) {
  if (!canUseLocalStorage() || !Array.isArray(rows)) return rows;
  try {
    globalThis.localStorage.setItem(LOCAL_DRAFTS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Best effort only.
  }
  return rows;
}

function readRows() {
  const primary = readStoredRows(LOCAL_DRAFTS_STORAGE_KEY);
  if (Array.isArray(primary)) return primary;

  const backup = readStoredRows(LOCAL_DRAFTS_BACKUP_STORAGE_KEY);
  if (Array.isArray(backup)) return restorePrimaryRows(backup);
  return [];
}

function writeRows(rows) {
  if (!canUseLocalStorage()) return false;
  const payload = JSON.stringify(rows);
  try {
    globalThis.localStorage.setItem(LOCAL_DRAFTS_STORAGE_KEY, payload);
    globalThis.localStorage.setItem(LOCAL_DRAFTS_BACKUP_STORAGE_KEY, payload);
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
