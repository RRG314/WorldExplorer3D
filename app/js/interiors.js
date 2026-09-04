import { ctx as appCtx } from "./shared-context.js?v=55";
import { buildInteriorScene, canPublishInteriorConnector } from "./interiors/scene-builder.js?v=13";
import {
  INTERIOR_ENTRY_RADIUS,
  INTERIOR_INTERACTION_MOVE_EPSILON,
  INTERIOR_INTERACTION_REFRESH_MS,
  INTERIOR_NOTICE_MS
} from "./interiors/constants.js?v=1";
import {
  finiteNumber,
  isWalkModeActive,
  pointInPolygonSafe,
  sampleSurfaceY
} from "./interiors/core.js?v=4";
import {
  resolveInteriorDefinitionForEntry,
  warmMappedInteriorDefinition
} from "./interiors/mapped-data.js?v=3";
import {
  clearActiveInterior as clearActiveInteriorRuntime,
  enterInteriorForSupport as enterInteriorForSupportRuntime,
  handleInteriorAction as handleInteriorActionRuntime,
  listSupportedInteriorsNear as listSupportedInteriorsNearRuntime,
  sampleInteriorWalkSurface as sampleInteriorWalkSurfaceRuntime,
  scanNearbyInteriorSupport as scanNearbyInteriorSupportRuntime,
  updateInteriorInteraction as updateInteriorInteractionRuntime
} from "./interiors/runtime.js?v=17";

const interiorCache = new Map();
const mappedInteriorWarmPromises = new Map();

const interiorRuntimeDeps = {
  INTERIOR_ENTRY_RADIUS,
  INTERIOR_INTERACTION_MOVE_EPSILON,
  INTERIOR_INTERACTION_REFRESH_MS,
  INTERIOR_NOTICE_MS,
  buildInteriorScene,
  canPublishInteriorConnector,
  finiteNumber,
  interiorCache,
  isWalkModeActive,
  pointInPolygonSafe,
  resolveInteriorDefinitionForEntry: (support) =>
    resolveInteriorDefinitionForEntry(support, interiorCache, mappedInteriorWarmPromises),
  sampleSurfaceY,
  warmMappedInteriorDefinition: (support) =>
    warmMappedInteriorDefinition(support, interiorCache, mappedInteriorWarmPromises)
};

function sampleInteriorWalkSurface(x, z, currentY = NaN) {
  return sampleInteriorWalkSurfaceRuntime(x, z, currentY, interiorRuntimeDeps);
}

function listSupportedInteriorsNear(x, z, radius = 220, limit = 8) {
  return listSupportedInteriorsNearRuntime(x, z, radius, limit, interiorRuntimeDeps);
}

interiorRuntimeDeps.listSupportedInteriorsNear = (x, z, radius = 220, limit = 8) =>
  listSupportedInteriorsNearRuntime(x, z, radius, limit, interiorRuntimeDeps);

function scanNearbyInteriorSupport(options = {}) {
  return scanNearbyInteriorSupportRuntime(options, interiorRuntimeDeps);
}

function enterInteriorForSupport(support) {
  return enterInteriorForSupportRuntime(support, interiorRuntimeDeps);
}

function clearActiveInterior(options = {}) {
  return clearActiveInteriorRuntime(options, interiorRuntimeDeps);
}

function handleInteriorAction() {
  return handleInteriorActionRuntime(interiorRuntimeDeps);
}

function updateInteriorInteraction() {
  return updateInteriorInteractionRuntime(interiorRuntimeDeps);
}

Object.assign(appCtx, {
  clearActiveInterior,
  enterInteriorForSupport,
  handleInteriorAction,
  listSupportedInteriorsNear,
  scanNearbyInteriorSupport,
  sampleInteriorWalkSurface,
  updateInteriorInteraction
});

export {
  clearActiveInterior,
  enterInteriorForSupport,
  handleInteriorAction,
  listSupportedInteriorsNear,
  scanNearbyInteriorSupport,
  sampleInteriorWalkSurface,
  updateInteriorInteraction
};
