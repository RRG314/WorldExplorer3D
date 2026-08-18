import {
  createLivingWorldPublication,
  createLivingWorldPublicationStore,
  createStableWorldIdentity,
  createWorldRandom,
  isLivingWorldPublicationActive
} from './model.js?v=1';
import { compileEntranceCatalog } from './entrance-catalog.js?v=1';
import { createFacadeDepthPresentation } from './facade-depth.js?v=1';
import { compilePedestrianGraph, compileTrafficGraph } from './navigation-graphs.js?v=1';
import { createLivingWorldPopulation } from './population.js?v=2';

function livingWorldTier(appCtx) {
  const requested = String(appCtx?.getDynamicBudgetState?.().tier || 'balanced').toLowerCase();
  if (requested === 'low' || requested === 'performance' || requested === 'quality') return requested;
  return 'balanced';
}

function publicationIsActive(appCtx, publication) {
  return isLivingWorldPublicationActive(publication, {
    activeRequestId: appCtx?.worldPublication?.requestId,
    activeSequence: appCtx?.worldPublication?.sequence,
    suppressed: appCtx?.onMoon === true || appCtx?.travelingToMoon === true
  });
}

function pedestrianPointBlocked(appCtx, x, z) {
  if (Array.isArray(appCtx.waterAreas)) {
    for (const area of appCtx.waterAreas) {
      if (Array.isArray(area?.pts) && appCtx.pointInPolygon?.(x, z, area.pts)) return true;
    }
  }
  const nearby = appCtx.getNearbyBuildings?.(x, z, 5) || [];
  for (const building of nearby) {
    if (Array.isArray(building?.pts) && appCtx.pointInPolygon?.(x, z, building.pts)) return true;
  }
  return false;
}

function disposeRuntimeState(appCtx, state, reason = 'disposed') {
  if (!state || state.disposed) return false;
  state.disposed = true;
  state.reason = String(reason || 'disposed');
  appCtx?.unregisterRuntimeOwner?.(state.owner);
  state.population?.dispose?.();
  state.facades?.dispose?.();
  if (appCtx?.livingWorldRuntime === state) appCtx.livingWorldRuntime = null;
  return true;
}

export function disposeLivingWorldRuntime(appCtx, reason = 'world-reload') {
  const state = appCtx?.livingWorldRuntime || null;
  const disposed = disposeRuntimeState(appCtx, state, reason);
  appCtx?.livingWorldPublicationStore?.clear?.(reason);
  appCtx.livingWorldPublication = null;
  return disposed;
}

export function startLivingWorldRuntime(appCtx, options = {}) {
  appCtx.disposeLivingWorldRuntime = (reason = 'disposed') => disposeLivingWorldRuntime(appCtx, reason);
  appCtx.livingWorldRuntimeSnapshot = () => livingWorldRuntimeSnapshot(appCtx);
  if (!globalThis.THREE) return null;
  const snapshot = options.snapshot;
  const request = options.request;
  if (!appCtx || snapshot?.type !== 'WorldSnapshot' || !request?.id) return null;
  if (
    snapshot.requestId !== request.id ||
    appCtx.worldPublication?.requestId !== request.id ||
    appCtx.worldPublication?.sequence !== snapshot.sequence
  ) return null;

  disposeLivingWorldRuntime(appCtx, 'replacement');
  const tier = livingWorldTier(appCtx);
  const worldIdentity = createStableWorldIdentity(request, {
    locationKey: request.selection?.key,
    dataProfile: 'fixed-earth-living-world-v1'
  });
  const catalog = compileEntranceCatalog({
    buildings: appCtx.buildings,
    mappedEntrances: appCtx.mappedBuildingEntrances,
    nearestRoad: appCtx.findNearestRoad,
    tier
  });
  const facades = createFacadeDepthPresentation({
    entrances: catalog.entrances,
    tier
  });
  appCtx.addEarthWorldObject?.(facades.group);
  const traversal = appCtx.buildTraversalNetworks?.() || { walk: null, drive: null };
  const pedestrianCompilation = compilePedestrianGraph({
    traversal: traversal.walk,
    entrances: catalog.entrances,
    sampleSurface: appCtx.sampleFeatureSurfaceY,
    isBlockedPoint: (x, z) => pedestrianPointBlocked(appCtx, x, z),
    tier
  });
  const locationName = String(request.location?.name || request.selection?.name || '').toLowerCase();
  const driveOnLeft = /london|england|united kingdom|australia|japan|new zealand|singapore/.test(locationName);
  const trafficCompilation = compileTrafficGraph({
    traversal: traversal.drive,
    sampleSurface: appCtx.sampleFeatureSurfaceY,
    driveOnLeft,
    tier
  });
  const population = createLivingWorldPopulation({
    pedestrianGraph: pedestrianCompilation.publication,
    trafficGraph: trafficCompilation.publication,
    random: createWorldRandom(worldIdentity, 0x4c495645),
    getReferencePosition: () => appCtx.Walk?.state?.mode === 'walk'
      ? appCtx.Walk.state.walker
      : appCtx.droneMode ? appCtx.drone : appCtx.car,
    getTimePhase: () => appCtx.timeOfDay,
    tier
  });
  appCtx.addEarthWorldObject?.(population.group);
  const publication = createLivingWorldPublication({
    snapshot,
    worldIdentity,
    entrances: catalog.entrances,
    pedestrianGraph: pedestrianCompilation.publication,
    trafficGraph: trafficCompilation.publication,
    semanticDensity: {
      tier,
      buildingCandidates: catalog.diagnostics.considered,
      facadeInstances: facades.diagnostics.doors + facades.diagnostics.storefronts + facades.diagnostics.windows,
      pedestrians: population.diagnostics.pedestrians,
      vehicles: population.diagnostics.vehicles
    },
    provenance: {
      baseSnapshotRequestId: snapshot.requestId,
      mappedEntrances: catalog.diagnostics.mapped,
      inferredEntrances: catalog.diagnostics.inferred,
      generatedWithAdditionalProviderQueries: false
    },
    diagnostics: {
      entrances: catalog.diagnostics,
      facades: facades.diagnostics,
      population: population.diagnostics
    }
  });
  if (!appCtx.livingWorldPublicationStore) {
    appCtx.livingWorldPublicationStore = createLivingWorldPublicationStore();
  }
  const result = appCtx.livingWorldPublicationStore.publish(publication, {
    expectedRequestId: request.id
  });
  if (!result.published) {
    population.dispose();
    facades.dispose();
    return null;
  }

  const owner = `living-world:${publication.sequence}`;
  const state = {
    type: 'LivingWorldRuntime',
    owner,
    publication,
    facades,
    population,
    pedestrianCompilation,
    trafficCompilation,
    catalog,
    tier,
    disposed: false,
    reason: null
  };
  appCtx.livingWorldPublication = publication;
  appCtx.livingWorldRuntime = state;
  facades.updateNightLighting(appCtx.timeOfDay);
  appCtx.registerRuntimeSystem?.({
    id: `${owner}:presentation`,
    owner,
    phase: 'presentation',
    priority: 30,
    critical: false,
    enabled: () => !state.disposed && publicationIsActive(appCtx, publication),
    update() {
      facades.updateNightLighting(appCtx.timeOfDay);
    },
    fixedUpdate(frame) {
      population.fixedUpdate(frame.dt);
    }
  });
  appCtx.setPerfLiveStat?.('livingWorld', {
    entrances: catalog.diagnostics.published,
    facadeDrawCalls: facades.diagnostics.drawCalls,
    facadeInstances: publication.semanticDensity.facadeInstances,
    pedestrians: population.diagnostics.pedestrians,
    vehicles: population.diagnostics.vehicles
  });
  return state;
}

export function livingWorldRuntimeSnapshot(appCtx) {
  const state = appCtx?.livingWorldRuntime;
  if (!state) return Object.freeze({ active: false });
  return Object.freeze({
    active: publicationIsActive(appCtx, state.publication),
    requestId: state.publication.requestId,
    sequence: state.publication.sequence,
    worldIdentity: state.publication.worldIdentity.id,
    tier: state.tier,
    entrances: state.catalog.diagnostics,
    facades: state.facades.diagnostics,
    population: state.population.diagnostics,
    activePopulation: state.population.activeCounts(),
    pedestrianGraph: Object.freeze({
      nodes: state.publication.pedestrianGraph.nodes.length,
      edges: state.publication.pedestrianGraph.edges.length,
      provenance: state.publication.pedestrianGraph.provenance
    }),
    trafficGraph: Object.freeze({
      nodes: state.publication.trafficGraph.nodes.length,
      edges: state.publication.trafficGraph.edges.length,
      provenance: state.publication.trafficGraph.provenance
    }),
    generatedWithAdditionalProviderQueries: false
  });
}
