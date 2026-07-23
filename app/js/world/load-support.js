import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendUpwardRibbonGeometry } from "../road-render.js?v=2";
import { generateStreetFurniture } from "./furniture.js?v=10";

export function recordWorldLoadWarning(loadMetrics, label, err) {
  const message = `${label}: ${err?.message || err}`;
  if (!Array.isArray(loadMetrics.warnings)) loadMetrics.warnings = [];
  if (loadMetrics.warnings.length < 10) loadMetrics.warnings.push(message);
  console.warn(`[WorldLoad] ${label} failed:`, err);
}

export function safeWorldLoadCall(loadMetrics, label, fn) {
  try {
    return fn();
  } catch (err) {
    recordWorldLoadWarning(loadMetrics, label, err);
    return null;
  }
}

export async function finalizeLoadedWorld(options = {}) {
  const reason = options.reason || 'primary';
  const loadMetrics = options.loadMetrics || {};
  const markLoaded = typeof options.markLoaded === 'function' ? options.markLoaded : () => {};
  const earthSceneSuppressed = typeof options.earthSceneSuppressed === 'function' ? options.earthSceneSuppressed : () => false;
  const hideEarthSceneMeshes = typeof options.hideEarthSceneMeshes === 'function' ? options.hideEarthSceneMeshes : () => {};
  const buildTraversalNetworks = typeof options.buildTraversalNetworks === 'function' ? options.buildTraversalNetworks : () => {};
  const spawnOnRoad = typeof options.spawnOnRoad === 'function' ? options.spawnOnRoad : () => {};
  const updateWorldLod = typeof options.updateWorldLod === 'function' ? options.updateWorldLod : null;
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const runFinalStep = (label, fn) => {
    startLoadPhase(label);
    try {
      return safeWorldLoadCall(loadMetrics, label, fn);
    } finally {
      endLoadPhase(label);
    }
  };

  if (earthSceneSuppressed()) {
    markLoaded();
    loadMetrics.recoveryReason = 'env_changed_during_load';
    loadMetrics.partialRecovery = true;
    hideEarthSceneMeshes();
    appCtx.hideLoad();
    return;
  }

  markLoaded();
  if (reason && reason !== 'primary') {
    loadMetrics.recoveryReason = reason;
    loadMetrics.partialRecovery = true;
  }

  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.updateTerrainAround === 'function') {
    runFinalStep('updateTerrainAround', () => appCtx.updateTerrainAround(0, 0));
  }
  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.requestWorldSurfaceSync === 'function') {
    runFinalStep('requestWorldSurfaceSync', () => appCtx.requestWorldSurfaceSync({
      force: true,
      source: 'world_load_finalize'
    }));
  }
  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.refreshTerrainSurfaceProfiles === 'function') {
    runFinalStep('refreshTerrainSurfaceProfiles', () => appCtx.refreshTerrainSurfaceProfiles());
  }
  runFinalStep('buildTraversalNetworks', () => buildTraversalNetworks());
  runFinalStep('spawnOnRoad', () => spawnOnRoad());
  if (typeof appCtx.refreshMemoryMarkersForCurrentLocation === 'function') {
    runFinalStep('refreshMemoryMarkersForCurrentLocation', () => appCtx.refreshMemoryMarkersForCurrentLocation());
  }
  if (typeof appCtx.refreshBlockBuilderForCurrentLocation === 'function') {
    runFinalStep('refreshBlockBuilderForCurrentLocation', () => appCtx.refreshBlockBuilderForCurrentLocation());
  }
  if (typeof updateWorldLod === 'function') {
    runFinalStep('updateWorldLod', () => updateWorldLod(true));
  }
  if (typeof appCtx.refreshAstronomicalSky === 'function') {
    runFinalStep('refreshAstronomicalSky', () => appCtx.refreshAstronomicalSky(true));
  } else if (typeof appCtx.alignStarFieldToLocation === 'function') {
    runFinalStep('alignStarFieldToLocation', () => appCtx.alignStarFieldToLocation(appCtx.LOC.lat, appCtx.LOC.lon));
  }
  if (typeof appCtx.refreshLiveWeather === 'function') {
    runFinalStep('refreshLiveWeather', () => appCtx.refreshLiveWeather(true));
  }
  if (appCtx.gameStarted) {
    runFinalStep('startMode', () => appCtx.startMode());
  }
  if (typeof appCtx.waitForWorldRenderReadiness === 'function') {
    loadMetrics.renderReadiness = await appCtx.waitForWorldRenderReadiness({
      timeoutMs: 4500,
      stableFrames: 5,
      minimumReadyMs: 500
    });
  }
  if (typeof appCtx.revalidateActiveWorldSpawn === 'function') {
    runFinalStep('revalidateActiveWorldSpawn', () => appCtx.revalidateActiveWorldSpawn({
      source: 'world_render_ready'
    }));
  }
  appCtx.hideLoad();
  if (typeof appCtx.primeAerialContext === 'function' && appCtx.getContinuousWorldEnabled?.() !== true) {
    loadMetrics.aerialContext = { status: 'warming' };
    globalThis.setTimeout(async () => {
      try {
        const layer = await appCtx.primeAerialContext({ minLoadedTiles: 9, timeoutMs: 12000 });
        loadMetrics.aerialContext = {
          status: 'ready',
          loadedNearCenter: Number(layer?.loadedNearCenter || 0)
        };
      } catch (err) {
        loadMetrics.aerialContext = { status: 'deferred', error: err?.message || String(err) };
      }
    }, 0);
  }
}

export function createSyntheticFallbackWorld(options = {}) {
  const perfModeNow = options.perfModeNow || 'rdt';
  const registerBuildingCollision = typeof options.registerBuildingCollision === 'function' ? options.registerBuildingCollision : () => null;
  const getRoadSubdivisionStep = typeof options.getRoadSubdivisionStep === 'function' ? options.getRoadSubdivisionStep : () => 3;
  const polylineBounds = typeof options.polylineBounds === 'function' ? options.polylineBounds : () => null;
  const invalidateTraversalNetworks = typeof options.invalidateTraversalNetworks === 'function' ? options.invalidateTraversalNetworks : () => {};
  const clearBuildingSpatialIndex = typeof options.clearBuildingSpatialIndex === 'function' ? options.clearBuildingSpatialIndex : () => {};

  if (appCtx.roads.length > 0) return;
  appCtx.showLoad('Creating default environment...');
  const isPolarFallback = Math.abs(Number(appCtx.LOC?.lat) || 0) >= 66;
  const enableFallbackBuildings = false;

  const disposeMeshList = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((mesh) => {
      if (!mesh) return;
      mesh.parent?.remove?.(mesh);
      if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat && typeof mat.dispose === 'function' && mat.dispose());
        } else if (typeof mesh.material.dispose === 'function') {
          mesh.material.dispose();
        }
      }
    });
  };

  disposeMeshList(appCtx.roadMeshes);
  disposeMeshList(appCtx.urbanSurfaceMeshes);
  disposeMeshList(appCtx.structureVisualMeshes);
  disposeMeshList(appCtx.buildingMeshes);
  disposeMeshList(appCtx.landuseMeshes);
  disposeMeshList(appCtx.linearFeatureMeshes);
  disposeMeshList(appCtx.poiMeshes);
  disposeMeshList(appCtx.streetFurnitureMeshes);
  disposeMeshList(appCtx.vegetationMeshes);
  disposeMeshList(appCtx.historicMarkers);
  appCtx.clearWorldCollections([
    'roadMeshes',
    'urbanSurfaceMeshes',
    'structureVisualMeshes',
    'buildingMeshes',
    'landuseMeshes',
    'poiMeshes',
    'streetFurnitureMeshes',
    'vegetationMeshes',
    'vegetationFeatures',
    'historicMarkers',
    'roads',
    'buildings',
    'landuses',
    'surfaceFeatureHints',
    'waterAreas',
    'waterways',
    'waterWaveVisuals'
  ]);
  invalidateTraversalNetworks('fallback_world_reset');
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;
  appCtx.clearWorldCollections([
    'linearFeatures',
    'linearFeatureMeshes',
    'dynamicBuildingColliders',
    'pois',
    'historicSites'
  ]);
  appCtx.urbanSurfaceStats = {
    sidewalkBatchCount: 0,
    sidewalkVertices: 0,
    sidewalkTriangles: 0,
    skippedBuildingAprons: 0
  };
  clearBuildingSpatialIndex();

  const makeRoad = (x1, z1, x2, z2, width = 10) => {
    const pts = [{ x: x1, z: z1 }, { x: x2, z: z2 }];
    appCtx.roads.push({
      pts,
      width,
      limit: 35,
      name: 'Main Street',
      sourceFeatureId: `fallback-road:${x1}:${z1}:${x2}:${z2}`,
      type: 'primary',
      sidewalkHint: 'both',
      networkKind: 'road',
      walkable: true,
      driveable: true,
      lodDepth: 0,
      subdivideMaxDist: getRoadSubdivisionStep('primary', 0, perfModeNow),
      bounds: polylineBounds(pts, width * 0.5 + 18)
    });

    const hw = width / 2;
    const verts = [];
    const indices = [];
    const leftEdge = [];
    const rightEdge = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = pts[1].x - pts[0].x;
      const dz = pts[1].z - pts[0].z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const y1 = (appCtx.SurfaceQuery?.terrainAt?.(p.x + nx * hw, p.z + nz * hw)?.position?.y ??
        appCtx.terrainMeshHeightAt?.(p.x + nx * hw, p.z + nz * hw) ??
        appCtx.elevationWorldYAtWorldXZ(p.x + nx * hw, p.z + nz * hw)) + 0.3;
      const y2 = (appCtx.SurfaceQuery?.terrainAt?.(p.x - nx * hw, p.z - nz * hw)?.position?.y ??
        appCtx.terrainMeshHeightAt?.(p.x - nx * hw, p.z - nz * hw) ??
        appCtx.elevationWorldYAtWorldXZ(p.x - nx * hw, p.z - nz * hw)) + 0.3;
      leftEdge.push({ x: p.x + nx * hw, y: y1, z: p.z + nz * hw });
      rightEdge.push({ x: p.x - nx * hw, y: y2, z: p.z - nz * hw });
    }
    appendUpwardRibbonGeometry(leftEdge, rightEdge, verts, indices);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.95,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const mesh = new THREE.Mesh(geometry, roadMaterial);
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    appCtx.scene.add(mesh);
    appCtx.roadMeshes.push(mesh);
  };

  makeRoad(-200, 0, 200, 0, 12);
  makeRoad(0, -200, 0, 200, 12);
  makeRoad(-150, -150, 150, 150, 10);
  makeRoad(-150, 150, 150, -150, 10);

  const makeBuilding = (x, z, w, d, h, idx = 0) => {
    const pts = [
      { x: x - w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z + d / 2 },
      { x: x - w / 2, z: z + d / 2 }
    ];

    const sourceBuildingId = `fallback-${idx}-${Math.round(x)}-${Math.round(z)}`;
    const colliderRef = registerBuildingCollision(pts, h, {
      sourceBuildingId,
      buildingType: 'fallback',
      name: 'Fallback Building'
    });

    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].z);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z);
    shape.lineTo(pts[0].x, pts[0].z);

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const color = [0x8899aa, 0x887766, 0x7788aa, 0x887799][Math.floor(Math.random() * 4)];
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);

    let avgElevation = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    pts.forEach((point) => {
      const terrainHeight = appCtx.SurfaceQuery?.terrainAt?.(point.x, point.z)?.position?.y ??
        appCtx.terrainMeshHeightAt?.(point.x, point.z) ??
        appCtx.elevationWorldYAtWorldXZ(point.x, point.z);
      avgElevation += terrainHeight;
      if (terrainHeight < minElevation) minElevation = terrainHeight;
      if (terrainHeight > maxElevation) maxElevation = terrainHeight;
    });
    avgElevation /= pts.length;
    const slopeRange = Number.isFinite(minElevation) && Number.isFinite(maxElevation) ? maxElevation - minElevation : 0;
    const baseElevation = slopeRange >= 0.15 ? minElevation + 0.05 : avgElevation;
    mesh.position.y = baseElevation;
    mesh.userData.buildingFootprint = pts;
    mesh.userData.avgElevation = baseElevation;
    mesh.userData.terrainAvgElevation = avgElevation;
    mesh.userData.sourceBuildingId = sourceBuildingId;
    mesh.userData.buildingType = 'fallback';
    if (colliderRef) {
      colliderRef.baseY = baseElevation;
      colliderRef.minY = baseElevation;
      colliderRef.maxY = baseElevation + h;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    appCtx.scene.add(mesh);
    appCtx.buildingMeshes.push(mesh);

    if (typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.15) {
      const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation);
      const groundPatches = Array.isArray(groundPatchesRaw) ? groundPatchesRaw : groundPatchesRaw ? [groundPatchesRaw] : [];
      groundPatches.forEach((groundPatch) => {
        groundPatch.userData.landuseFootprint = pts;
        groundPatch.userData.landuseType = 'buildingGround';
        groundPatch.userData.avgElevation = baseElevation;
        groundPatch.userData.terrainAvgElevation = avgElevation;
        groundPatch.userData.alwaysVisible = true;
        groundPatch.visible = true;
        appCtx.scene.add(groundPatch);
        appCtx.landuseMeshes.push(groundPatch);
      });
    }
  };

  if (enableFallbackBuildings && !isPolarFallback) {
    makeBuilding(-80, -80, 40, 30, 15, 0);
    makeBuilding(80, -80, 35, 40, 20, 1);
    makeBuilding(-80, 80, 45, 35, 18, 2);
    makeBuilding(80, 80, 30, 35, 12, 3);
    makeBuilding(-50, 50, 25, 20, 10, 4);
    makeBuilding(50, -50, 30, 25, 14, 5);
  }
}

export function buildPoiGeometryPass(options = {}) {
  const phaseName = options.phaseName || 'buildPoiGeometry';
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const poiNodes = Array.isArray(options.poiNodes) ? options.poiNodes : [];
  const poiKeyFromTags = typeof options.poiKeyFromTags === 'function' ? options.poiKeyFromTags : () => null;
  const lodNearDist = Number.isFinite(options.lodNearDist) ? options.lodNearDist : 0;
  const lodMidDist = Number.isFinite(options.lodMidDist) ? options.lodMidDist : 0;
  const loadMetrics = options.loadMetrics || {};

  startLoadPhase(phaseName);
  try {
    poiNodes.forEach((node) => {
      const tags = node.tags;
      const poiKey = poiKeyFromTags(tags);
      if (!(poiKey && appCtx.POI_TYPES[poiKey])) return;

      const pos = appCtx.geoToWorld(node.lat, node.lon);
      const poiData = appCtx.POI_TYPES[poiKey];
      const centerDist = Math.hypot(pos.x, pos.z);
      const poiTier = centerDist <= lodNearDist ? 'near' : centerDist <= lodMidDist ? 'mid' : 'far';
      const terrainY = appCtx.SurfaceQuery?.terrainAt?.(pos.x, pos.z)?.position?.y ??
        appCtx.terrainMeshHeightAt?.(pos.x, pos.z) ??
        appCtx.elevationWorldYAtWorldXZ(pos.x, pos.z);

      if (poiTier === 'near') loadMetrics.pois.near += 1;
      else if (poiTier === 'mid') loadMetrics.pois.mid += 1;
      else loadMetrics.pois.far += 1;

      if (poiTier !== 'far') {
        const markerRadius = poiTier === 'near' ? 1.5 : 1.2;
        const markerHeight = poiTier === 'near' ? 4 : 3;
        const markerSegments = poiTier === 'near' ? 8 : 6;
        const geometry = new THREE.CylinderGeometry(markerRadius, markerRadius, markerHeight, markerSegments);
        const material = new THREE.MeshLambertMaterial({
          color: poiData.color,
          emissive: poiData.color,
          emissiveIntensity: poiTier === 'near' ? 0.3 : 0.18
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(pos.x, terrainY + markerHeight * 0.5, pos.z);
        mesh.userData.poiPosition = { x: pos.x, z: pos.z };
        mesh.userData.isPOIMarker = true;
        mesh.userData.lodTier = poiTier;
        mesh.castShadow = false;
        mesh.visible = !!appCtx.poiMode;
        appCtx.scene.add(mesh);
        appCtx.poiMeshes.push(mesh);

        if (poiTier === 'near') {
          const capGeo = new THREE.SphereGeometry(1.8, 8, 6);
          const capMat = new THREE.MeshLambertMaterial({
            color: poiData.color,
            emissive: poiData.color,
            emissiveIntensity: 0.4
          });
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.set(pos.x, terrainY + 4, pos.z);
          cap.userData.poiPosition = { x: pos.x, z: pos.z };
          cap.userData.isCapMesh = true;
          cap.userData.isPOIMarker = true;
          cap.userData.lodTier = 'near';
          cap.visible = !!appCtx.poiMode;
          appCtx.scene.add(cap);
          appCtx.poiMeshes.push(cap);
        }
      }

      appCtx.pois.push({
        x: pos.x,
        z: pos.z,
        sourceFeatureId: node.id ? String(node.id) : '',
        type: poiKey,
        name: tags.name || poiData.category,
        lodTier: poiTier,
        ...poiData
      });

      if (tags.historic) {
        appCtx.historicSites.push({
          x: pos.x,
          z: pos.z,
          lat: node.lat,
          lon: node.lon,
          type: tags.historic,
          name: tags.name || 'Historic Site',
          description: tags.description || tags['name:en'] || null,
          wikipedia: tags.wikipedia || tags['wikipedia:en'] || null,
          wikidata: tags.wikidata || null,
          lodTier: poiTier,
          ...poiData
        });
      }
    });
  } finally {
    endLoadPhase(phaseName);
  }
}

export function buildStreetFurniturePass(options = {}) {
  const phaseName = options.phaseName || 'buildStreetFurniture';
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const loadMetrics = options.loadMetrics || {};

  startLoadPhase(phaseName);
  try {
    generateStreetFurniture();
    loadMetrics.vegetation.generated = Array.isArray(appCtx.vegetationFeatures) ? appCtx.vegetationFeatures.length : 0;
  } catch (err) {
    loadMetrics.streetFurnitureError = err?.message || String(err);
    recordWorldLoadWarning(loadMetrics, 'generateStreetFurniture', err);
  } finally {
    endLoadPhase(phaseName);
  }
}

function deferWorldDetailStep(callback, delayMs = 0) {
  const delay = Math.max(0, Number.isFinite(delayMs) ? delayMs : 0);
  return new Promise((resolve) => {
    const run = () => Promise.resolve(callback()).finally(resolve);
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(run, { timeout: Math.max(800, delay + 800) });
      return;
    }
    globalThis.setTimeout(run, delay);
  });
}

export function scheduleDeferredWorldDetailPasses(options = {}) {
  const isActiveLoadContext = typeof options.isActiveLoadContext === 'function' ? options.isActiveLoadContext : () => true;
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const poiNodes = Array.isArray(options.poiNodes) ? options.poiNodes : [];
  const poiKeyFromTags = typeof options.poiKeyFromTags === 'function' ? options.poiKeyFromTags : () => null;
  const lodNearDist = Number.isFinite(options.lodNearDist) ? options.lodNearDist : 0;
  const lodMidDist = Number.isFinite(options.lodMidDist) ? options.lodMidDist : 0;
  const loadMetrics = options.loadMetrics || {};
  const updateWorldLod = typeof options.updateWorldLod === 'function' ? options.updateWorldLod : null;

  const updatePerfWorldCounts = () => {
    if (typeof appCtx.setPerfLiveStat !== 'function') return;
    appCtx.setPerfLiveStat('worldCounts', {
      roads: Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
      buildings: Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0,
      poiMeshes: Array.isArray(appCtx.poiMeshes) ? appCtx.poiMeshes.length : 0,
      landuseMeshes: Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0
    });
  };

  return deferWorldDetailStep(async () => {
    if (!isActiveLoadContext()) return;
    buildPoiGeometryPass({
      endLoadPhase,
      loadMetrics,
      lodMidDist,
      lodNearDist,
      phaseName: 'buildPoiGeometryDeferred',
      poiKeyFromTags,
      poiNodes,
      startLoadPhase
    });
    updatePerfWorldCounts();

    await new Promise((resolve) => globalThis.setTimeout(resolve, 160));
    {
      if (!isActiveLoadContext()) return;
      buildStreetFurniturePass({
        endLoadPhase,
        loadMetrics,
        phaseName: 'buildStreetFurnitureDeferred',
        startLoadPhase
      });
      updatePerfWorldCounts();
      if (typeof updateWorldLod === 'function') updateWorldLod(true);
      console.log(
        `[WorldLoad] Deferred world details ready (${appCtx.poiMeshes.length} poi meshes, ` +
        `${appCtx.streetFurnitureMeshes.length} furniture, ${appCtx.vegetationMeshes.length} vegetation).`
      );
    }
  }, 0);
}

export function scheduleDeferredPoiLoad(options = {}) {
  const query = String(options.query || '');
  const isActiveLoadContext = typeof options.isActiveLoadContext === 'function' ? options.isActiveLoadContext : () => true;
  if (!query || typeof options.fetchOverpassJSON !== 'function') return;

  deferWorldDetailStep(async () => {
    if (!isActiveLoadContext()) return;
    try {
      const timeoutMs = Math.max(6000, Math.min(16000, Number(options.timeoutMs) || 12000));
      const data = await options.fetchOverpassJSON(
        query,
        timeoutMs,
        performance.now() + timeoutMs + 500,
        null
      );
      if (!isActiveLoadContext()) return;

      const allPoiNodes = data.elements.filter((element) =>
        element?.type === 'node' && !!options.poiKeyFromTags?.(element.tags)
      );
      const tileBudgetCfg = options.tileBudgetCfg || {};
      const poiNodes = options.limitNodesByTileBudget(allPoiNodes, {
        globalCap: Math.max(0, Number(options.maxPoiNodes) || 0),
        basePerTile: Math.max(1, Number(tileBudgetCfg.poiPerTile) || 1),
        minPerTile: Math.max(1, Number(tileBudgetCfg.poiMinPerTile) || 1),
        tileDegrees: Number(tileBudgetCfg.tileDegrees) || 0.002,
        useRdt: options.useRdtBudgeting === true
      });

      const loadMetrics = options.loadMetrics || {};
      loadMetrics.pois ||= {};
      loadMetrics.pois.requested = allPoiNodes.length;
      loadMetrics.pois.selected = poiNodes.length;
      options.buildPoiGeometryPass({
        phaseName: 'buildPoiGeometryDeferred',
        poiNodes,
        poiKeyFromTags: options.poiKeyFromTags,
        lodNearDist: options.lodNearDist,
        lodMidDist: options.lodMidDist,
        loadMetrics,
        startLoadPhase: options.startLoadPhase,
        endLoadPhase: options.endLoadPhase
      });
      options.updateWorldLod?.(true);
      console.log(`[WorldLoad] Deferred POIs ready (${poiNodes.length}/${allPoiNodes.length}).`);
    } catch (err) {
      options.recordLoadWarning?.('deferredPois', err);
    }
  }, 900);
}
