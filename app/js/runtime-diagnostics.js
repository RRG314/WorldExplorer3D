import { ctx as appCtx } from "./shared-context.js?v=55";

const runtimeErrors = [];
function recordRuntimeError(kind, value) {
  const message = value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value?.message || value || "Unknown runtime error");
  const entry = { kind, message, at: Date.now() };
  if (runtimeErrors.some((existing) => existing.kind === kind && existing.message === message)) return;
  runtimeErrors.push(entry);
  if (runtimeErrors.length > 12) runtimeErrors.shift();
}
globalThis.addEventListener?.("error", (event) => recordRuntimeError("error", event.error || event.message));
globalThis.addEventListener?.("unhandledrejection", (event) => recordRuntimeError("unhandledrejection", event.reason));

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

function safeCall(callback, fallback = null) {
  try {
    return callback();
  } catch {
    return fallback;
  }
}

function surfaceSampleSnapshot(sample) {
  if (!sample) return null;
  return {
    kind: String(sample.kind || ""),
    y: numberOrNull(sample.position?.y),
    source: String(sample.provenance?.source || ""),
    dataset: String(sample.provenance?.dataset || ""),
    fallback: sample.provenance?.fallback === true,
    feature: sample.feature
      ? {
          id: String(sample.feature.id || sample.feature.sourceFeatureId || ""),
          kind: String(sample.feature.kind || sample.feature.networkKind || sample.feature.type || ""),
          name: String(sample.feature.name || sample.feature.tags?.name || ""),
          terrainMode: String(sample.feature.structureSemantics?.terrainMode || ""),
          structureKind: String(sample.feature.structureSemantics?.structureKind || ""),
          verticalOrder: numberOrNull(sample.feature.structureSemantics?.verticalOrder),
          cutDepth: numberOrNull(sample.feature.structureSemantics?.cutDepth),
          structureTags: sample.feature.structureTags || null
        }
      : null
  };
}

function terrainSourceSampleSnapshot(sample) {
  if (!sample) return null;
  return {
    type: String(sample.type || ''),
    schemaVersion: numberOrNull(sample.schemaVersion),
    status: String(sample.status || ''),
    available: sample.available === true,
    reason: sample.reason == null ? null : String(sample.reason),
    elevationMeters: numberOrNull(sample.elevationMeters),
    confidence: numberOrNull(sample.confidence),
    deliveryResolutionMeters:
      numberOrNull(sample.deliveryResolutionMeters),
    tile: sample.tile || null,
    provenance: sample.provenance || null
  };
}

function buildingSnapshot(building) {
  if (!building) return null;
  return {
    id: String(building.id || building.sourceFeatureId || ""),
    name: String(building.name || building.tags?.name || ""),
    type: String(building.buildingType || building.type || ""),
    collisionKind: String(building.collisionKind || ""),
    colliderDetail: String(building.colliderDetail || ""),
    baseY: numberOrNull(building.baseY),
    minY: numberOrNull(building.minY),
    maxY: numberOrNull(building.maxY),
    height: numberOrNull(building.height),
    allowsPassageBelow: building.allowsPassageBelow === true,
    collisionDisabled: building.collisionDisabled === true
  };
}

function buildingOccupancySnapshot(x, z, feetY, actorHeight) {
  const nearby = safeCall(() => appCtx.getNearbyBuildings?.(x, z, 12), []);
  if (!Array.isArray(nearby)) return null;
  const containing = nearby.filter((building) => {
    if (!building) return false;
    if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
    if (!Array.isArray(building.pts) || building.pts.length < 3) return true;
    return safeCall(() => appCtx.pointInPolygon?.(x, z, building.pts), false);
  }).slice(0, 8);
  const entry = safeCall(() => appCtx.pickNearbyEnterableBuildingSupport?.(x, z, {
    radius: 8,
    actorBaseY: feetY,
    actorHeight
  }), null);
  return {
    nearbyCount: nearby.length,
    containingFootprints: containing.map((building) => {
      const minY = Number.isFinite(building?.minY)
        ? Number(building.minY)
        : Number(building?.baseY);
      const maxY = Number.isFinite(building?.maxY)
        ? Number(building.maxY)
        : Number.isFinite(minY) ? minY + (Number(building?.height) || 0) : NaN;
      const topY = Number(feetY) + (Number(actorHeight) || 1.7);
      return {
        ...buildingSnapshot(building),
        actorVerticalOverlap: Number.isFinite(feetY) && Number.isFinite(minY) && Number.isFinite(maxY)
          ? !(topY < minY - 0.45 || feetY > maxY + 0.45)
          : null
      };
    }),
    entryCandidate: entry?.support
      ? {
          label: String(entry.support.label || ""),
          distance: numberOrNull(entry.distance),
          inside: entry.inside === true,
          building: buildingSnapshot(entry.support.building)
        }
      : null
  };
}

function actorFeetY(actor) {
  if (!actor) return null;
  const offset = {
    walk: 1.7,
    drive: 1.2,
    plane: 0.85,
    drone: 0.25,
    boat: 1.1
  }[actor.mode] ?? 0;
  const y = Number(actor.position?.y);
  return Number.isFinite(y) ? y - offset : null;
}

function terrainNeighborhoodSnapshot(centerX, centerZ) {
  const offsets = [-40, 0, 40];
  const samples = [];
  for (const offsetZ of offsets) {
    for (const offsetX of offsets) {
      const x = centerX + offsetX;
      const z = centerZ + offsetZ;
      const sourceY = safeCall(() => appCtx.elevationWorldYAtWorldXZ?.(x, z), null);
      const renderedY = safeCall(() => appCtx.terrainMeshHeightAt?.(x, z), null);
      samples.push({
        offsetX,
        offsetZ,
        sourceY: numberOrNull(sourceY),
        renderedY: numberOrNull(renderedY),
        renderedMinusSource: Number.isFinite(Number(sourceY)) && Number.isFinite(Number(renderedY))
          ? Number(renderedY) - Number(sourceY)
          : null
      });
    }
  }
  const rendered = samples.map((sample) => sample.renderedY).filter(Number.isFinite);
  const deltas = samples.map((sample) => sample.renderedMinusSource).filter(Number.isFinite);
  return {
    radius: 40,
    samples,
    renderedRange: rendered.length > 0 ? Math.max(...rendered) - Math.min(...rendered) : null,
    maxAbsoluteRenderedMinusSource: deltas.length > 0
      ? Math.max(...deltas.map(Math.abs))
      : null
  };
}

function surfaceChainSnapshot(actor = appCtx.activeTransportActor?.() || null) {
  if (!actor || ["ocean", "rocket"].includes(actor.mode)) return null;
  const x = Number(actor.position?.x);
  const z = Number(actor.position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  const feetY = actorFeetY(actor);
  const geographic = safeCall(() => appCtx.worldToLatLon?.(x, z), null);
  const lat = Number(geographic?.lat);
  const lon = Number(geographic?.lon);
  const sourceElevationMeters = Number.isFinite(lat) && Number.isFinite(lon)
    ? safeCall(() => appCtx.elevationMetersAtLatLon?.(lat, lon), null)
    : null;
  const terrainSourceSample = Number.isFinite(lat) && Number.isFinite(lon)
    ? safeCall(() => appCtx.terrainSourceSampleAtLatLon?.(lat, lon), null)
    : null;
  const sourceWorldY = safeCall(() => appCtx.elevationWorldYAtWorldXZ?.(x, z), null);
  const renderedTerrainY = safeCall(() => appCtx.terrainMeshHeightAt?.(x, z), null);
  const terrain = safeCall(() => appCtx.SurfaceQuery?.terrainAt?.(x, z), null);
  const walk = safeCall(() => appCtx.SurfaceQuery?.walkAt?.(x, z, { currentY: feetY }), null);
  const drive = safeCall(() => appCtx.SurfaceQuery?.driveAt?.(x, z, {
    currentY: feetY,
    preferRoad: true
  }), null);
  const collision = safeCall(() => appCtx.checkBuildingCollision?.(
    x,
    z,
    actor.mode === "walk" ? 0.35 : Number(actor.bounds?.radius) || 1,
    {
      actorBaseY: feetY,
      actorHeight: Number(actor.bounds?.height) || 1.7
    }
  ), null);

  const renderedY = Number(renderedTerrainY);
  const walkY = Number(walk?.position?.y);
  return {
    coordinateSystem: "local tangent world; +x east, +y up, +z south",
    world: { x, z },
    geographic: {
      lat: numberOrNull(lat),
      lon: numberOrNull(lon)
    },
    actor: {
      mode: actor.mode,
      centerY: numberOrNull(actor.position?.y),
      feetY: numberOrNull(feetY),
      grounded: actor.contact?.grounded ?? null,
      contactKind: String(actor.contact?.kind || "")
    },
    sourceElevationMeters: numberOrNull(sourceElevationMeters),
    terrainSourceSample:
      terrainSourceSampleSnapshot(terrainSourceSample),
    sourceWorldY: numberOrNull(sourceWorldY),
    renderedTerrainY: numberOrNull(renderedTerrainY),
    surfaces: {
      terrain: surfaceSampleSnapshot(terrain),
      walk: surfaceSampleSnapshot(walk),
      drive: surfaceSampleSnapshot(drive)
    },
    deltas: {
      feetMinusRenderedTerrain: Number.isFinite(feetY) && Number.isFinite(renderedY)
        ? feetY - renderedY
        : null,
      feetMinusWalkSurface: Number.isFinite(feetY) && Number.isFinite(walkY)
        ? feetY - walkY
        : null,
      renderedMinusSourceWorld: Number.isFinite(renderedY) && Number.isFinite(Number(sourceWorldY))
        ? renderedY - Number(sourceWorldY)
        : null
    },
    buildingCollision: collision
      ? {
          collision: collision.collision === true,
          inside: collision.inside === true,
          penetration: numberOrNull(collision.penetration),
          building: buildingSnapshot(collision.building)
        }
      : null,
    buildingOccupancy: buildingOccupancySnapshot(
      x,
      z,
      feetY,
      Number(actor.bounds?.height) || 1.7
    ),
    terrainNeighborhood: terrainNeighborhoodSnapshot(x, z)
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
    programs: Array.isArray(renderer.info?.programs) ? renderer.info.programs.length : null
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

function worldCompositionSnapshot() {
  const result = {
    aerialReplacementMeshes: 0,
    farTerrainClipmaps: 0,
    farMappedContexts: 0,
    mappedTerrainMeshes: 0,
    suppressedTerrainMeshes: 0,
    terrainMeshes: 0
  };
  appCtx.scene?.traverse?.((object) => {
    if (object?.userData?.aerialSurfaceContext) result.aerialReplacementMeshes += 1;
    if (object?.userData?.isFarTerrainClipmap) result.farTerrainClipmaps += 1;
    if (object?.userData?.isFarMappedContext) result.farMappedContexts += 1;
    if (!object?.userData?.isTerrainMesh) return;
    result.terrainMeshes += 1;
    if (object.material && !Array.isArray(object.material) && object.material.map) {
      result.mappedTerrainMeshes += 1;
    }
    if (object.userData.terrainAerialDetailSuppressed === true) {
      result.suppressedTerrainMeshes += 1;
    }
  });
  return result;
}

function getWorldExplorerRuntimeDiagnostics() {
  const activeActor = appCtx.activeTransportActor?.() || null;
  return {
    runtimeKernel: appCtx.getRuntimeKernelSnapshot?.() || null,
    runtimeErrors: [...runtimeErrors],
    sessionLifecycle: appCtx.getSessionCoordinatorDebugState?.() || null,
    account: appCtx.getAccountSnapshot?.() || null,
    platformServices: appCtx.getPlatformServicesSnapshot?.() || null,
    gameplayPlugins: appCtx.getGameplayRegistrySnapshot?.() || null,
    transportControllers: appCtx.getEarthTransportControllerSnapshot?.() || null,
    activeActor,
    surfaceChain: surfaceChainSnapshot(activeActor),
    environment: appCtx.getEnv?.() || null,
    gameStarted: !!appCtx.gameStarted,
    paused: !!appCtx.paused,
    worldLoading: !!appCtx.worldLoading,
    worldLoad: appCtx.worldLoadRuntimeState || null,
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
    composer: composerSnapshot(),
    worldComposition: worldCompositionSnapshot(),
    farTerrainClipmap: appCtx.farTerrainClipmapState || null,
    quality: appCtx.renderQualityLevel || null,
    earthOrigin: {
      lat: numberOrNull(appCtx.LOC?.lat),
      lon: numberOrNull(appCtx.LOC?.lon)
    },
    terrainCache: appCtx.terrainTileCacheSnapshot?.() || null,
    mapTileCache: appCtx.mapTileCacheSnapshot?.() || null,
    minimapView: appCtx.getMinimapViewSnapshot?.() || null,
    groundProviderCatalog:
      appCtx.getGroundProviderCatalogSnapshot?.() || null,
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
    },
    groundFallback: appCtx.groundFallbackMesh
      ? {
          exists: true,
          attached: !!appCtx.groundFallbackMesh.parent,
          visible: appCtx.groundFallbackMesh.visible !== false,
          loadingPlaceholder: appCtx.groundFallbackMesh.userData?.isLoadingPlaceholder === true
        }
      : { exists: false, attached: false, visible: false, loadingPlaceholder: false }
  };
}

globalThis.getWorldExplorerRuntimeDiagnostics = getWorldExplorerRuntimeDiagnostics;
globalThis.render_game_to_text = () => JSON.stringify({
  environment: appCtx.getEnv?.() || null,
  gameStarted: !!appCtx.gameStarted,
  paused: !!appCtx.paused,
  worldLoading: !!appCtx.worldLoading,
  titleVisible: !!document.getElementById("titleScreen") &&
    !document.getElementById("titleScreen").classList.contains("hidden"),
  surfaceChain: surfaceChainSnapshot(),
  terrainCache: appCtx.terrainTileCacheSnapshot?.() || null,
  mapTileCache: appCtx.mapTileCacheSnapshot?.() || null,
  minimapView: appCtx.getMinimapViewSnapshot?.() || null,
  worldCounts: {
    buildings: appCtx.buildings?.length ?? null,
    roads: appCtx.roads?.length ?? null,
    terrainTiles: appCtx.terrainTileCache?.size ?? null
  }
});
globalThis.advanceTime = (milliseconds = 0) => new Promise((resolve) => {
  const duration = Math.max(0, Number(milliseconds) || 0);
  if (duration === 0) {
    resolve();
    return;
  }
  // The runtime owns a continuously scheduled render loop. One requested
  // animation frame therefore advances one observable game frame; waiting for
  // wall-clock duration here double-counts frames in automated clients.
  globalThis.requestAnimationFrame(() => resolve());
});

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
globalThis.setInterval(publishRuntimeDiagnostics, 1000);

export { getWorldExplorerRuntimeDiagnostics };
