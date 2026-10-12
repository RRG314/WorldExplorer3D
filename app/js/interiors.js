import {resolveAquariumInterior} from './interiors/aquarium-content.js';
import {attachAquarium,disposeAquarium,updateAquarium,handleAquariumAction} from './interiors/aquarium-runtime.js';
import {resolveCuratedInterior} from './interiors/content-resolver.js';
import {attachGallery,disposeGallery,handleGalleryAction} from './interiors/gallery-runtime.js';
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
  attachCuratedHomeFurnishing,
  disposeCuratedHomeFurnishing,
  findOwnedHomeForInteriorSupport
} from "./interiors/curated-home-furnishing.js?v=1";
import {
  clearActiveInterior as clearActiveInteriorRuntime,
  enterInteriorForSupport as enterInteriorForSupportRuntime,
  handleInteriorAction as handleInteriorActionRuntime,
  listSupportedInteriorsNear as listSupportedInteriorsNearRuntime,
  sampleInteriorWalkSurface as sampleInteriorWalkSurfaceRuntime,
  scanNearbyInteriorSupport as scanNearbyInteriorSupportRuntime,
  updateInteriorInteraction as updateInteriorInteractionRuntime
} from "./interiors/runtime.js?v=20";
import {
  attachCommunityInteriorRepresentation,
  requestCommunityInteriorAccess,
  resolveCommunityInteriorDefinition
} from './reality-capture/interior-runtime.js?v=2';

const interiorCache = new Map();
const mappedInteriorWarmPromises = new Map();

const interiorRuntimeDeps = {
  INTERIOR_ENTRY_RADIUS,
  INTERIOR_INTERACTION_MOVE_EPSILON,
  INTERIOR_INTERACTION_REFRESH_MS,
  INTERIOR_NOTICE_MS,
  buildInteriorScene,
  attachAquarium: active => attachAquarium(appCtx,THREE,active),
  disposeAquarium: active => disposeAquarium(appCtx,active),
  handleAquariumAction: (active,interaction) => handleAquariumAction(appCtx,active,interaction),
  canPublishInteriorConnector,
  attachGallery: active => attachGallery(appCtx,THREE,active),
  disposeGallery: active => disposeGallery(appCtx,active),
  handleGalleryAction: (active,interaction) => handleGalleryAction(appCtx,active,interaction),
  attachCuratedHomeFurnishing: (active) => attachCuratedHomeFurnishing(THREE, active, {
    isCurrent: (candidate) => appCtx.activeInterior === candidate && candidate.group?.parent === appCtx.scene
  }),
  disposeCuratedHomeFurnishing,
  attachCommunityInteriorRepresentation: (active) => attachCommunityInteriorRepresentation(appCtx, active),
  findOwnedHomeForInteriorSupport: (support) => findOwnedHomeForInteriorSupport(
    support,
    appCtx.getExplorerPropertySnapshot?.()
  ),
  finiteNumber,
  interiorCache,
  isWalkModeActive,
  pointInPolygonSafe,
  requestCommunityInteriorAccess: (definition) => requestCommunityInteriorAccess(appCtx, definition),
  resolveInteriorDefinitionForEntry: async (support) => {
    const definition = await resolveCommunityInteriorDefinition(appCtx, support,
      candidate => resolveInteriorDefinitionForEntry(candidate, interiorCache, mappedInteriorWarmPromises));
    if (findOwnedHomeForInteriorSupport(support, appCtx.getExplorerPropertySnapshot?.())) return definition;
    return resolveAquariumInterior(appCtx,support,resolveCuratedInterior(appCtx, support, definition));
  },
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

function updateInteriorInteraction(dt=0) {
  if(!appCtx.paused)updateAquarium(appCtx.activeInterior,dt);
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
