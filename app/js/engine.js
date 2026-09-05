import { ctx as appCtx } from "./shared-context.js?v=55";
import {
  applyRenderQuality as applyEngineRenderQuality,
  canUseSsao as engineCanUseSsao,
  createProceduralEnvironmentMap as createEngineProceduralEnvironmentMap,
  ensureHdrEnvironment as ensureEngineHdrEnvironment,
  getEnvironmentLightingSnapshot as getEngineEnvironmentLightingSnapshot,
  getHighQualityEnabled as engineGetHighQualityEnabled,
  getShadowMapResolution as getEngineShadowMapResolution,
  getSsaoEnabled as engineGetSsaoEnabled,
  setHighQualityEnabled as engineSetHighQualityEnabled,
  setRenderQualityLevel as setEngineRenderQualityLevel,
  setSsaoEnabled as engineSetSsaoEnabled,
  setupPostProcessingPipeline as setupEnginePostProcessingPipeline,
  refreshProceduralEnvironment as refreshEngineProceduralEnvironment,
  tryEnablePostProcessing as tryEnableEnginePostProcessing
} from "./engine/quality.js?v=2";
import {
  createBuildingGroundPatch as createBuildingGroundPatchRuntime,
  ensureEnginePbrTextures as ensureEnginePbrTexturesRuntime,
  getBuildingMaterial as getBuildingMaterialRuntime,
  initEngineTextures as initEngineTexturesRuntime,
  syncTextureGlobals as syncTextureGlobalsRuntime
} from "./engine/materials-runtime.js?v=22";
import { initEngineRuntime } from "./engine/scene-bootstrap.js?v=25";
import { ROAD_CAR_CONFIG } from './physics/vehicle-config.js?v=1';

const RENDER_QUALITY_LOW = 'low';
const RENDER_QUALITY_MED = 'med';
const RENDER_QUALITY_HIGH = 'high';
const RENDER_QUALITY_STORAGE_KEY = 'worldExplorerRenderQualityLevel';
const SSAO_STORAGE_KEY = 'worldExplorerSsaoEnabled';

const engineState = {
  asphaltTex: null,
  asphaltNormal: null,
  asphaltRoughness: null,
  currentGpuTier: 'high',
  renderQualityLevel: RENDER_QUALITY_MED,
  hdrEnvMap: null,
  fallbackEnvMap: null,
  fallbackEnvTarget: null,
  fallbackEnvSignature: '',
  hdrLoadRequested: false,
  carPaintMaterial: null,
  ssaoEnabled: false,
  grassDiffuse: null,
  grassNormal: null,
  grassRoughness: null,
  pavementDiffuse: null,
  pavementNormal: null,
  pavementRoughness: null,
  concreteDiffuse: null,
  concreteNormal: null,
  concreteRoughness: null,
  brickDiffuse: null,
  brickNormal: null,
  brickRoughness: null,
  surfaceTextureSets: {},
  pbrTexturesLoaded: {
    grass: false,
    forest: false,
    pavement: false,
    concrete: false,
    brick: false,
    sand: false,
    soil: false,
    rock: false,
    snow: false
  },
  pbrTextureLoadStarted: false,
  textureMaxAnisotropy: 1
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures.
  }
}

function normalizeRenderQualityLevel(level) {
  const raw = String(level || '').toLowerCase();
  if (raw === RENDER_QUALITY_LOW || raw === 'performance') return RENDER_QUALITY_LOW;
  if (raw === RENDER_QUALITY_HIGH || raw === 'quality') return RENDER_QUALITY_HIGH;
  return RENDER_QUALITY_MED;
}

function isLikelyMobileDevice() {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = String(navigator.userAgent || '').toLowerCase();
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    return /android|iphone|ipad|mobile/.test(ua) || touchPoints >= 3;
  } catch {
    return false;
  }
}

function getRenderQualityLevel() {
  return engineState.renderQualityLevel;
}

const CFG = ROAD_CAR_CONFIG;

Object.assign(appCtx, { CFG });

function buildEngineModuleContext() {
  return {
    RENDER_QUALITY_LOW,
    RENDER_QUALITY_MED,
    RENDER_QUALITY_HIGH,
    RENDER_QUALITY_STORAGE_KEY,
    SSAO_STORAGE_KEY,
    appCtx,
    applyRenderQuality,
    createProceduralEnvironmentMap,
    ensureHdrEnvironment,
    initEngineTextures,
    isLikelyMobileDevice,
    normalizeRenderQualityLevel,
    readStorage,
    setRenderQualityLevel,
    setSsaoEnabled,
    setupPostProcessingPipeline,
    syncTextureGlobals,
    writeStorage,
    state: engineState
  };
}

function syncTextureGlobals() {
  return syncTextureGlobalsRuntime(buildEngineModuleContext());
}

function createProceduralEnvironmentMap(pmremGenerator) {
  return createEngineProceduralEnvironmentMap(buildEngineModuleContext(), pmremGenerator);
}

function getShadowMapResolution(level) {
  return getEngineShadowMapResolution(buildEngineModuleContext(), level);
}

function applyRenderQuality(level, options = {}) {
  return applyEngineRenderQuality(buildEngineModuleContext(), level, options);
}

function ensureHdrEnvironment() {
  return ensureEngineHdrEnvironment(buildEngineModuleContext());
}

function refreshEarthEnvironmentMap(profile = null, options = {}) {
  return refreshEngineProceduralEnvironment(buildEngineModuleContext(), profile, options);
}

function getEnvironmentLightingSnapshot() {
  return getEngineEnvironmentLightingSnapshot(buildEngineModuleContext());
}

function setRenderQualityLevel(level, options = {}) {
  return setEngineRenderQualityLevel(buildEngineModuleContext(), level, options);
}

function getHighQualityEnabled() {
  return engineGetHighQualityEnabled(buildEngineModuleContext());
}

function setHighQualityEnabled(enabled, options = {}) {
  return engineSetHighQualityEnabled(buildEngineModuleContext(), enabled, options);
}

function canUseSsao() {
  return engineCanUseSsao(buildEngineModuleContext());
}

function getSsaoEnabled() {
  return engineGetSsaoEnabled(buildEngineModuleContext());
}

function setSsaoEnabled(enabled, options = {}) {
  return engineSetSsaoEnabled(buildEngineModuleContext(), enabled, options);
}

function setupPostProcessingPipeline() {
  return setupEnginePostProcessingPipeline(buildEngineModuleContext());
}

function tryEnablePostProcessing() {
  return tryEnableEnginePostProcessing(buildEngineModuleContext());
}

function initEngineTextures(renderer) {
  return initEngineTexturesRuntime(buildEngineModuleContext(), renderer);
}

function ensureEnginePbrTextures() {
  return ensureEnginePbrTexturesRuntime(buildEngineModuleContext());
}

function createBuildingGroundPatch(pts, avgElevation, options = {}) {
  return createBuildingGroundPatchRuntime(buildEngineModuleContext(), pts, avgElevation, options);
}

function getBuildingMaterial(buildingType, bSeed, baseColorHex, options = {}) {
  return getBuildingMaterialRuntime(buildEngineModuleContext(), buildingType, bSeed, baseColorHex, options);
}

function init() {
  return initEngineRuntime(buildEngineModuleContext());
}

syncTextureGlobals();

Object.assign(appCtx, {
  canUseSsao,
  createBuildingGroundPatch,
  ensureEnginePbrTextures,
  getHighQualityEnabled,
  getEnvironmentLightingSnapshot,
  getBuildingMaterial,
  getRenderQualityLevel,
  getShadowMapResolution,
  getSsaoEnabled,
  init,
  isLikelyMobileDevice,
  refreshEarthEnvironmentMap,
  setSsaoEnabled,
  setHighQualityEnabled,
  setRenderQualityLevel,
  tryEnablePostProcessing
});

export {
  canUseSsao,
  createBuildingGroundPatch,
  ensureEnginePbrTextures,
  getHighQualityEnabled,
  getEnvironmentLightingSnapshot,
  getBuildingMaterial,
  getRenderQualityLevel,
  getShadowMapResolution,
  getSsaoEnabled,
  init,
  refreshEarthEnvironmentMap,
  setSsaoEnabled,
  setHighQualityEnabled,
  setRenderQualityLevel,
  tryEnablePostProcessing
};
