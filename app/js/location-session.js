import { ctx as appCtx } from './shared-context.js?v=55';

let loadedSelection = null;

function cloneCustomLocation(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat: Math.max(-90, Math.min(90, lat)),
    lon: ((lon + 180) % 360 + 360) % 360 - 180,
    name: String(location?.name || 'Custom Location').trim().slice(0, 80) || 'Custom Location',
    arrivalMode: location?.arrivalMode === 'walk' || location?.arrivalMode === 'boat'
      ? location.arrivalMode
      : 'auto'
  };
}

function syncCustomInputs(location) {
  if (!location || typeof document === 'undefined') return;
  const latInput = document.getElementById('customLat');
  const lonInput = document.getElementById('customLon');
  if (latInput) latInput.value = location.lat.toFixed(6);
  if (lonInput) lonInput.value = location.lon.toFixed(6);
}

export function activateCustomLocation(options = {}) {
  appCtx.selLoc = 'custom';
  if (typeof options.transient === 'boolean') appCtx.customLocTransient = options.transient;
  return true;
}

export function setCustomLocation(location, options = {}) {
  const normalized = cloneCustomLocation(location);
  if (!normalized) return false;
  appCtx.customLoc = normalized;
  appCtx.selLoc = 'custom';
  appCtx.customLocTransient = options.transient === true;
  if (options.syncInputs !== false) syncCustomInputs(normalized);
  return true;
}

export function selectPresetLocation(key) {
  const normalized = String(key || '').trim();
  if (!normalized || !appCtx.LOCS?.[normalized]) return false;
  appCtx.selLoc = normalized;
  appCtx.customLocTransient = false;
  return true;
}

export function setCustomLocationTransient(transient) {
  appCtx.customLocTransient = transient === true;
  return appCtx.customLocTransient;
}

export function normalizeLocationSelection(fallback = 'baltimore') {
  if (appCtx.selLoc === 'custom') {
    const custom = cloneCustomLocation(appCtx.customLoc);
    if (custom) {
      setCustomLocation(custom, { transient: false, syncInputs: false });
      return 'custom';
    }
  }
  if (selectPresetLocation(appCtx.selLoc)) return appCtx.selLoc;
  selectPresetLocation(appCtx.LOCS?.[fallback] ? fallback : Object.keys(appCtx.LOCS || {})[0]);
  return appCtx.selLoc;
}

export function getLocationSelectionSnapshot() {
  const selLoc = appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || '');
  return {
    selLoc,
    customLoc: selLoc === 'custom' ? cloneCustomLocation(appCtx.customLoc) : null,
    transient: appCtx.customLocTransient === true
  };
}

export function resolveLocationSelection() {
  if (appCtx.selLoc === 'custom') {
    const custom = cloneCustomLocation(appCtx.customLoc);
    if (!custom) return null;
    return { key: 'custom', ...custom };
  }

  const key = String(appCtx.selLoc || '').trim();
  const preset = appCtx.LOCS?.[key];
  const lat = Number(preset?.lat);
  const lon = Number(preset?.lon);
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    key,
    lat: Math.max(-90, Math.min(90, lat)),
    lon: ((lon + 180) % 360 + 360) % 360 - 180,
    name: String(preset?.name || key).trim() || key
  };
}

export function getLocationSelectionSignature() {
  const selection = getLocationSelectionSnapshot();
  if (selection.selLoc === 'custom' && selection.customLoc) {
    return `custom:${selection.customLoc.lat.toFixed(6)}:${selection.customLoc.lon.toFixed(6)}`;
  }
  return `preset:${selection.selLoc || 'baltimore'}`;
}

export function markLocationSelectionLoaded() {
  loadedSelection = {
    ...getLocationSelectionSnapshot(),
    signature: getLocationSelectionSignature()
  };
  return getLoadedLocationSelection();
}

export function getLoadedLocationSelection() {
  if (!loadedSelection) return null;
  return {
    ...loadedSelection,
    customLoc: loadedSelection.customLoc ? { ...loadedSelection.customLoc } : null
  };
}

export function isLoadedLocationSelectionCurrent() {
  return !!loadedSelection && loadedSelection.signature === getLocationSelectionSignature();
}

export function restoreLoadedLocationSelection() {
  if (!loadedSelection) return normalizeLocationSelection();
  if (loadedSelection.selLoc === 'custom' && loadedSelection.customLoc) {
    setCustomLocation(loadedSelection.customLoc, { transient: false });
    return 'custom';
  }
  if (selectPresetLocation(loadedSelection.selLoc)) return loadedSelection.selLoc;
  return normalizeLocationSelection();
}

Object.assign(appCtx, {
  activateCustomLocation,
  getLocationSelectionSignature,
  getLocationSelectionSnapshot,
  getLoadedLocationSelection,
  isLoadedLocationSelectionCurrent,
  markLocationSelectionLoaded,
  normalizeLocationSelection,
  resolveLocationSelection,
  restoreLoadedLocationSelection,
  selectPresetLocation,
  setCustomLocation,
  setCustomLocationTransient
});
