import { ctx as appCtx } from './shared-context.js?v=55';

const pauseReasons = new Set();

function syncPausedState() {
  appCtx.paused = pauseReasons.size > 0;
  return appCtx.paused;
}

export function setPauseReason(reason, active = true) {
  const key = String(reason || '').trim();
  if (!key) throw new Error('A pause reason is required.');
  if (active) pauseReasons.add(key);
  else pauseReasons.delete(key);
  return syncPausedState();
}

export function togglePauseReason(reason) {
  const key = String(reason || '').trim();
  if (!key) throw new Error('A pause reason is required.');
  return setPauseReason(key, !pauseReasons.has(key));
}

export function clearPauseReasons() {
  pauseReasons.clear();
  return syncPausedState();
}

export function hasPauseReason(reason) {
  return pauseReasons.has(String(reason || '').trim());
}

export function getPauseReasons() {
  return [...pauseReasons];
}

Object.assign(appCtx, {
  clearPauseReasons,
  getPauseReasons,
  hasPauseReason,
  setPauseReason,
  togglePauseReason
});
