import { ctx as appCtx } from "./shared-context.js?v=55";
import { diagnoseRuntimeBudgets } from "./runtime/budget-diagnostics.js?v=1";
import { createLifecycleScope } from './runtime/lifecycle-scope.js?v=2';

function numberOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function vectorSnapshot(vector) {
  if (!vector) return null;
  return {
    x: numberOrNull(vector.x),
    y: numberOrNull(vector.y),
    z: numberOrNull(vector.z)
  };
}

function rendererSnapshot() {
  const renderer = appCtx.renderer;
  if (!renderer) return null;

  let contextLost = null;
  let glError = null;
  try {
    const gl = renderer.getContext?.();
    contextLost = gl?.isContextLost?.() ?? null;
    glError = gl?.getError?.() ?? null;
  } catch {
    contextLost = null;
  }

  return {
    contextLost,
    glError,
    pixelRatio: numberOrNull(renderer.getPixelRatio?.()),
    width: numberOrNull(renderer.domElement?.width),
    height: numberOrNull(renderer.domElement?.height),
    calls: numberOrNull(renderer.info?.render?.calls),
    triangles: numberOrNull(renderer.info?.render?.triangles),
    geometries: numberOrNull(renderer.info?.memory?.geometries),
    textures: numberOrNull(renderer.info?.memory?.textures),
    programs: Array.isArray(renderer.info?.programs) ? renderer.info.programs.length : null
  };
}

function browserMemorySnapshot() {
  const memory = globalThis.performance?.memory;
  if (!memory) return null;
  return {
    usedBytes: numberOrNull(memory.usedJSHeapSize),
    totalBytes: numberOrNull(memory.totalJSHeapSize),
    limitBytes: numberOrNull(memory.jsHeapSizeLimit)
  };
}

function spaceCatalogSnapshot() {
  const scene = appCtx.spaceFlight?.scene;
  const group = scene?.getObjectByName?.('solarSystemGroup') || null;
  const asteroidBelt = group?.getObjectByName?.('asteroidBelt') || null;
  const kuiperBelt = group?.getObjectByName?.('kuiperBelt') || null;
  const directChildren = group?.children || [];
  return {
    groupAttached: !!group && group.parent === scene,
    planets: directChildren.filter((object) => object?.userData?.isPlanet === true).length,
    namedAsteroids: directChildren.filter((object) => object?.userData?.isAsteroid === true).length,
    spacecraft: scene?.children?.filter((object) => object?.userData?.isSpacecraft === true).length || 0,
    deepSpaceSpacecraft: directChildren.filter((object) => object?.userData?.isSpacecraft === true).length,
    galaxies: directChildren.filter((object) => object?.userData?.isGalaxy === true).length,
    asteroidParticles: asteroidBelt?.geometry?.attributes?.position?.count || 0,
    kuiperParticles: kuiperBelt?.geometry?.attributes?.position?.count || 0
  };
}

function composerSnapshot() {
  const composer = appCtx.composer;
  if (!composer) return null;
  return {
    readWidth: numberOrNull(composer.readBuffer?.width),
    readHeight: numberOrNull(composer.readBuffer?.height),
    writeWidth: numberOrNull(composer.writeBuffer?.width),
    writeHeight: numberOrNull(composer.writeBuffer?.height),
    passes: Array.isArray(composer.passes)
      ? composer.passes.map((pass) => ({
          name: pass?.constructor?.name || "unknown",
          enabled: pass?.enabled !== false,
          renderToScreen: !!pass?.renderToScreen
        }))
      : []
  };
}

function getWorldExplorerRuntimeDiagnostics() {
  const snapshot = {
    frameOwnership: appCtx.getFrameOwnershipSnapshot?.() || null,
    runtimeKernel: appCtx.getRuntimeKernelSnapshot?.() || null,
    sessionLifecycle: appCtx.getSessionCoordinatorDebugState?.() || null,
    account: appCtx.getAccountSnapshot?.() || null,
    platformServices: appCtx.getPlatformServicesSnapshot?.() || null,
    gameplayPlugins: appCtx.getGameplayRegistrySnapshot?.() || null,
    transportControllers: appCtx.getEarthTransportControllerSnapshot?.() || null,
    activeActor: appCtx.activeTransportActor?.() || null,
    environment: appCtx.getEnv?.() || null,
    gameStarted: !!appCtx.gameStarted,
    paused: !!appCtx.paused,
    worldLoading: !!appCtx.worldLoading,
    earthResumePending: !!appCtx.earthResumePending,
    worldDetail: appCtx.worldDetailState || null,
    modes: {
      boat: !!appCtx.boatMode?.active,
      drone: !!appCtx.droneMode,
      plane: !!appCtx.planeMode?.active,
      ocean: !!appCtx.oceanMode?.active,
      space: !!appCtx.spaceFlight?.active,
      walking: appCtx.Walk?.state?.mode === "walk"
    },
    planetary: {
      flightDestination: appCtx.spaceFlight?.destination || null,
      flightMode: appCtx.spaceFlight?.mode || null,
      flightSessionId: numberOrNull(appCtx.spaceFlight?._sessionId),
      landingTarget: appCtx.spaceFlight?._landingTarget || null,
      manualLandingTarget: appCtx.spaceFlight?._manualLandingTarget || null,
      nearestBody: appCtx.spaceFlight?._nearestBody?.name || null,
      onMars: !!appCtx.onMars,
      onMoon: !!appCtx.onMoon,
      traveling: !!appCtx.travelingToMoon
    },
    spaceCatalog: spaceCatalogSnapshot(),
    curatedLandmarks: appCtx.curatedLandmarkMetrics || null,
    titleVisible: !!document.getElementById("titleScreen") &&
      !document.getElementById("titleScreen").classList.contains("hidden"),
    camera: appCtx.camera
      ? {
          position: vectorSnapshot(appCtx.camera.position),
          rotation: vectorSnapshot(appCtx.camera.rotation),
          up: vectorSnapshot(appCtx.camera.up),
          near: numberOrNull(appCtx.camera.near),
          far: numberOrNull(appCtx.camera.far),
          aspect: numberOrNull(appCtx.camera.aspect)
        }
      : null,
    drone: appCtx.drone
      ? {
          position: {
            x: numberOrNull(appCtx.drone.x),
            y: numberOrNull(appCtx.drone.y),
            z: numberOrNull(appCtx.drone.z)
          },
          yaw: numberOrNull(appCtx.drone.yaw),
          pitch: numberOrNull(appCtx.drone.pitch),
          roll: numberOrNull(appCtx.drone.roll)
        }
      : null,
    scene: appCtx.scene
      ? {
          children: appCtx.scene.children.length,
          background: appCtx.scene.background?.getHexString?.() || null,
          fogColor: appCtx.scene.fog?.color?.getHexString?.() || null,
          fogDensity: numberOrNull(appCtx.scene.fog?.density)
        }
      : null,
    renderer: rendererSnapshot(),
    browserMemory: browserMemorySnapshot(),
    streamingResources: appCtx.getStreamingVectorResourceSnapshot?.() || null,
    lastLoad: appCtx.perfStats?.lastLoad || null,
    renderReadiness: appCtx._lastWorldRenderReadiness || null,
    composer: composerSnapshot(),
    quality: appCtx.renderQualityLevel || null,
    earthStreaming: appCtx.getEarthStreamingSnapshot?.() || null,
    earthOrigin: {
      lat: numberOrNull(appCtx.LOC?.lat),
      lon: numberOrNull(appCtx.LOC?.lon),
      rebases: numberOrNull(appCtx.earthOriginRebaseCount || 0),
      initialWorldRetired: !!appCtx.initialEarthWorldRetired
    },
    terrainCache: appCtx.terrainTileCacheSnapshot?.() || null,
    worldCounts: {
      buildings: appCtx.buildings?.length ?? null,
      buildingMeshes: appCtx.buildingMeshes?.length ?? null,
      landuseMeshes: appCtx.landuseMeshes?.length ?? null,
      roadMeshes: appCtx.roadMeshes?.length ?? null,
      roads: appCtx.roads?.length ?? null,
      terrainTiles: appCtx.terrainTileCache?.size ?? null,
      visibleBuildingMeshes: Array.isArray(appCtx.buildingMeshes)
        ? appCtx.buildingMeshes.filter((mesh) => mesh?.visible && mesh?.parent === appCtx.scene).length
        : null,
      guardedRoads: Array.isArray(appCtx.roads)
        ? appCtx.roads.filter((road) => road?.guardrailColliders?.length > 0).length
        : null,
      guardrailColliders: Array.isArray(appCtx.buildings)
        ? appCtx.buildings.filter((building) => building?.buildingType === 'bridge_guardrail').length
        : null,
      guardrailVisualInstances: Array.isArray(appCtx.structureVisualMeshes)
        ? appCtx.structureVisualMeshes
            .filter((mesh) => mesh?.userData?.structureVisualType === 'guardrails')
            .reduce((sum, mesh) => sum + (Number(mesh?.count) || 0), 0)
        : null
    }
  };
  snapshot.budgetStatus = diagnoseRuntimeBudgets(snapshot);
  return snapshot;
}

globalThis.getWorldExplorerRuntimeDiagnostics = getWorldExplorerRuntimeDiagnostics;

function publishRuntimeDiagnostics() {
  if (!document?.documentElement) return;
  let output = document.getElementById("we3dRuntimeDiagnostics");
  if (!output) {
    output = document.createElement("script");
    output.id = "we3dRuntimeDiagnostics";
    output.type = "application/json";
    document.documentElement.appendChild(output);
  }
  output.textContent = JSON.stringify(getWorldExplorerRuntimeDiagnostics());
}

publishRuntimeDiagnostics();
const runtimeDiagnosticsScope = createLifecycleScope('runtime-diagnostics');
let diagnosticsPublishPending = false;
function scheduleRuntimeDiagnosticsPublish() {
  if (diagnosticsPublishPending || document.hidden) return;
  diagnosticsPublishPending = true;
  runtimeDiagnosticsScope.idle(() => {
    diagnosticsPublishPending = false;
    if (!document.hidden) publishRuntimeDiagnostics();
  }, 2500);
}
runtimeDiagnosticsScope.interval(() => {
  scheduleRuntimeDiagnosticsPublish();
}, 5000);
runtimeDiagnosticsScope.listen(document, 'visibilitychange', () => {
  if (!document.hidden) scheduleRuntimeDiagnosticsPublish();
});

Object.assign(appCtx, {
  getRuntimeDiagnosticsLifecycleSnapshot: () => runtimeDiagnosticsScope.snapshot(),
  stopRuntimeDiagnostics: (reason = 'stopped') => runtimeDiagnosticsScope.dispose(reason)
});

export { getWorldExplorerRuntimeDiagnostics };
