import { ctx as appCtx } from './shared-context.js?v=55';

const CAMERA_MODE_COUNT = 3;

function normalizeCameraMode(mode, fallback = 0) {
  const numeric = Number(mode);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < CAMERA_MODE_COUNT) return numeric;
  return Number.isInteger(fallback) && fallback >= 0 && fallback < CAMERA_MODE_COUNT ? fallback : 0;
}

export function getCameraMode() {
  return normalizeCameraMode(appCtx.camMode);
}

export function setCameraMode(mode, options = {}) {
  appCtx.camMode = normalizeCameraMode(mode, options.fallback);
  return appCtx.camMode;
}

export function cycleCameraMode() {
  return setCameraMode((getCameraMode() + 1) % CAMERA_MODE_COUNT);
}

Object.assign(appCtx, { cycleCameraMode, getCameraMode, setCameraMode });
