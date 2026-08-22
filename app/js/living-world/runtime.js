import {
  createLivingWorldPublication,
  createLivingWorldPublicationStore,
  createStableWorldIdentity,
  createWorldRandom,
  isLivingWorldPublicationActive
} from './model.js?v=1';
import { compileEntranceCatalog } from './entrance-catalog.js?v=6';
import { compilePedestrianGraph, compileTrafficGraph, resolveDrivingSide } from './navigation-graphs.js?v=9';
import { createLivingWorldPopulation } from './population.js?v=12';

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
  const catalog = appCtx.buildingEntranceCatalog || compileEntranceCatalog({
    buildings: appCtx.buildings,
    mappedEntrances: appCtx.mappedBuildingEntrances,
    nearestRoad: appCtx.findNearestRoad,
    sampleGround: (x, z) => appCtx.GroundHeight?.walkSurfaceY?.(x, z) ?? appCtx.elevationWorldYAtWorldXZ?.(x, z),
    tier
  });
  const entranceByBuilding = appCtx.buildingEntranceByBuilding || new Map(
    catalog.entrances.map((entrance) => [String(entrance.buildingSourceId), entrance])
  );
  const facades = appCtx.buildingFacadeEntrances || Object.freeze({
    renderedEntrances: catalog.entrances,
    diagnostics: Object.freeze({
      ...catalog.diagnostics,
      addedDrawCalls: 0,
      retainedDecorativeMeshes: 0,
      facadeIntegration: 'semantic-only-fallback',
      renderOwner: 'engine/building-facade-materials',
      interactionOwner: 'building-entry'
    })
  });
  const traversal = appCtx.buildTraversalNetworks?.() || { walk: null, drive: null };
  const pedestrianCompilation = compilePedestrianGraph({
    traversal: traversal.walk,
    entrances: catalog.entrances,
    sampleSurface: appCtx.sampleFeatureSurfaceY,
    isBlockedPoint: (x, z) => pedestrianPointBlocked(appCtx, x, z),
    tier
  });
  const drivingSide = resolveDrivingSide(request.selection || request.location || {});
  const trafficCompilation = compileTrafficGraph({
    traversal: traversal.drive,
    sampleSurface: appCtx.sampleFeatureSurfaceY,
    driveOnLeft: drivingSide.driveOnLeft,
    tier
  });
  const sampleVehicleSurface = (edge, x, z) => {
    const feature = trafficCompilation.runtimeFeatureByEdge.get(edge?.id);
    const surfaceY = Number(appCtx.sampleFeatureSurfaceY?.(feature, x, z));
    // Traffic graph nodes historically carry this small presentation clearance;
    // keep it while replacing the endpoint plane with final-surface sampling.
    return Number.isFinite(surfaceY) ? surfaceY + 0.08 : NaN;
  };
  const population = createLivingWorldPopulation({
    pedestrianGraph: pedestrianCompilation.publication,
    trafficGraph: trafficCompilation.publication,
    random: createWorldRandom(worldIdentity, 0x4c495645),
    getReferencePosition: () => appCtx.Walk?.state?.mode === 'walk'
      ? appCtx.Walk.state.walker
      : appCtx.droneMode ? appCtx.drone : appCtx.car,
    getTimePhase: () => appCtx.timeOfDay,
    sampleVehicleSurface,
    hasPedestrianLineOfSight(from, to) {
      const samples = [.33, .66];
      return samples.every((amount) => appCtx.checkBuildingCollision?.(
        from.x + (to.x - from.x) * amount,
        from.z + (to.z - from.z) * amount,
        .22,
        { actorBaseY: Math.min(from.y, to.y), actorHeight: 1.7 }
      )?.collision !== true);
    },
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
      facadeInstances: Number(facades.diagnostics.published || catalog.diagnostics.published),
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
    sampleVehicleSurface,
    catalog,
    entranceByBuilding,
    tier,
    drivingSide,
    disposed: false,
    reason: null
  };
  appCtx.livingWorldPublication = publication;
  appCtx.livingWorldRuntime = state;
  appCtx.registerRuntimeSystem?.({
    id: `${owner}:presentation`,
    owner,
    phase: 'presentation',
    priority: 30,
    critical: false,
    enabled: () => !state.disposed && publicationIsActive(appCtx, publication),
    fixedUpdate(frame) {
      population.fixedUpdate(frame.dt);
    }
  });
  appCtx.setPerfLiveStat?.('livingWorld', {
    entrances: catalog.diagnostics.published,
    facadeDrawCalls: facades.diagnostics.addedDrawCalls,
    facadeInstances: publication.semanticDensity.facadeInstances,
    pedestrians: population.diagnostics.pedestrians,
    vehicles: population.diagnostics.vehicles
  });
  return state;
}

export function livingWorldRuntimeSnapshot(appCtx) {
  const state = appCtx?.livingWorldRuntime;
  if (!state) return Object.freeze({ active: false });
  const pedestrianMotorwayEdges = state.publication.pedestrianGraph.edges.filter((edge) => {
    const feature = state.pedestrianCompilation.runtimeFeatureByEdge.get(edge.id);
    const roadClass = String(
      feature?.transportRecord?.sourceTags?.highway ||
      feature?.transportRecord?.rawTags?.highway ||
      feature?.type ||
      ''
    ).toLowerCase();
    return /^(?:motorway|motorway_link)$/.test(roadClass);
  }).length;
  const pedestrianVehicleTransportEdges = state.publication.pedestrianGraph.edges.filter((edge) => {
    const feature = state.pedestrianCompilation.runtimeFeatureByEdge.get(edge.id);
    return String(feature?.networkKind || feature?.kind || '').toLowerCase() === 'road' ||
      edge.provenance === 'inferred_sidewalk' || edge.provenance === 'inferred_crossing';
  }).length;
  const pedestrianEngineeredTransportEdges = state.publication.pedestrianGraph.edges.filter((edge) => {
    const structure = edge?.structure || {};
    const structureKind = String(structure.structureKind || 'none');
    return String(structure.terrainMode || 'at_grade') !== 'at_grade' ||
      !['none', 'at_grade'].includes(structureKind);
  }).length;
  const trafficDirectionViolations = state.publication.trafficGraph.edges.filter((edge) =>
    (edge.sourceDirection === 'forward' && edge.direction !== 'forward') ||
    (edge.sourceDirection === 'reverse' && edge.direction !== 'reverse')
  ).length;
  const trafficLaneSideViolations = state.publication.trafficGraph.edges.filter((edge) => {
    const expectedSign = edge.direction === 'forward'
      ? state.drivingSide.driveOnLeft ? 1 : -1
      : state.drivingSide.driveOnLeft ? -1 : 1;
    return Math.sign(Number(edge.centerlineOffset) || 0) !== expectedSign;
  }).length;
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
      provenance: state.publication.pedestrianGraph.provenance,
      diagnostics: state.publication.pedestrianGraph.diagnostics,
      prohibitedMotorwayEdges: pedestrianMotorwayEdges,
      vehicleTransportEdges: pedestrianVehicleTransportEdges,
      engineeredTransportEdges: pedestrianEngineeredTransportEdges
    }),
    trafficGraph: Object.freeze({
      nodes: state.publication.trafficGraph.nodes.length,
      edges: state.publication.trafficGraph.edges.length,
      provenance: state.publication.trafficGraph.provenance,
      diagnostics: state.publication.trafficGraph.diagnostics,
      drivingSide: state.drivingSide,
      directionViolations: trafficDirectionViolations,
      laneSideViolations: trafficLaneSideViolations
    }),
    generatedWithAdditionalProviderQueries: false
  });
}
