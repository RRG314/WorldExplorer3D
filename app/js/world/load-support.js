import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendUpwardRibbonGeometry } from "../road-render.js?v=4";
import { generateStreetFurniture } from "./furniture.js?v=17";
import { yieldToMainThread } from "./cooperative-scheduling.js?v=1";

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
  const spawnPlayer = typeof options.spawnPlayer === 'function'
    ? options.spawnPlayer
    : typeof options.spawnOnRoad === 'function' ? options.spawnOnRoad : () => {};
  const publishLocationWorld = typeof options.publishLocationWorld === 'function' ? options.publishLocationWorld : null;
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const finalizePresentation = options.finalizePresentation !== false;
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
    if (finalizePresentation) appCtx.hideLoad();
    return;
  }

  if (reason && reason !== 'primary') {
    loadMetrics.recoveryReason = reason;
    loadMetrics.partialRecovery = true;
  }

  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.publishLocationTerrain === 'function') {
    runFinalStep('publishLocationTerrain', () => appCtx.publishLocationTerrain());
    await yieldToMainThread();
  }
  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.applyWaterTerrainMask === 'function') {
    runFinalStep('applyWaterTerrainMask', () => appCtx.applyWaterTerrainMask());
    await yieldToMainThread();
  }
  let transportPublication = null;
  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.publishCompiledTransportMeshes === 'function') {
    startLoadPhase('publishCompiledTransportMeshes');
    try {
      transportPublication = await appCtx.publishCompiledTransportMeshes();
    } catch (error) {
      recordWorldLoadWarning(loadMetrics, 'publishCompiledTransportMeshes', error);
    } finally {
      endLoadPhase('publishCompiledTransportMeshes');
    }
    if (transportPublication && loadMetrics.roads) {
      loadMetrics.roads.subdividedPoints = Number(transportPublication.compiledSampleCount || 0);
      loadMetrics.roads.vertices = Number(transportPublication.vertices || 0);
      loadMetrics.roads.triangles = Number(transportPublication.triangles || 0);
      loadMetrics.roads.finalMeshPublications = 1;
      loadMetrics.structureProfileCompilations = 1;
    }
    await yieldToMainThread();
  }
  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.refreshTerrainSurfaceProfiles === 'function') {
    runFinalStep('refreshTerrainSurfaceProfiles', () => appCtx.refreshTerrainSurfaceProfiles());
  }
  if (
    transportPublication?.authority === 'compiled_transport_surface' &&
    Array.isArray(appCtx.deferredTransportLandmarkPublishers)
  ) {
    const publishers = appCtx.deferredTransportLandmarkPublishers.splice(0);
    for (let index = 0; index < publishers.length; index += 1) {
      runFinalStep('publishDeferredTransportLandmark', () => publishers[index]?.());
    }
  } else if (Array.isArray(appCtx.deferredTransportLandmarkPublishers)) {
    // A transport-dependent landmark has no safe fallback surface. Discard it
    // rather than publishing decoration against a stale or provisional deck.
    appCtx.deferredTransportLandmarkPublishers.splice(0);
  }
  if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.retireGroundFallbackPlaceholder === 'function') {
    runFinalStep('retireGroundFallbackPlaceholder', () => appCtx.retireGroundFallbackPlaceholder());
  }
  runFinalStep('buildTraversalNetworks', () => buildTraversalNetworks());
  await yieldToMainThread();
  // World publication owns the one final arrival. Calling a generic road spawn
  // here and a custom-location spawn later left two systems competing over the
  // player's vertical surface and made grade-separated arrivals frame-dependent.
  runFinalStep('spawnPlayer', () => spawnPlayer());
  if (typeof appCtx.refreshMemoryMarkersForCurrentLocation === 'function') {
    runFinalStep('refreshMemoryMarkersForCurrentLocation', () => appCtx.refreshMemoryMarkersForCurrentLocation());
  }
  if (typeof appCtx.refreshBlockBuilderForCurrentLocation === 'function') {
    runFinalStep('refreshBlockBuilderForCurrentLocation', () => appCtx.refreshBlockBuilderForCurrentLocation());
  }
  if (typeof appCtx.refreshEditableWorldPresentation === 'function') {
    runFinalStep('refreshEditableWorldPresentation', () => appCtx.refreshEditableWorldPresentation());
  }
  if (typeof appCtx.refreshApprovedEditorContributions === 'function') {
    runFinalStep('refreshApprovedEditorContributions', () => appCtx.refreshApprovedEditorContributions());
  }
  if (typeof publishLocationWorld === 'function') {
    runFinalStep('publishLocationWorld', () => publishLocationWorld());
  }
  if (typeof appCtx.refreshEditableBuildingVisibility === 'function') {
    runFinalStep('refreshEditableBuildingVisibility', () => appCtx.refreshEditableBuildingVisibility());
  }
  markLoaded();
  if (finalizePresentation) appCtx.hideLoad();
  if (finalizePresentation && appCtx.gameStarted) {
    runFinalStep('startMode', () => appCtx.startMode());
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
      const y1 = appCtx.elevationWorldYAtWorldXZ(p.x + nx * hw, p.z + nz * hw) + 0.3;
      const y2 = appCtx.elevationWorldYAtWorldXZ(p.x - nx * hw, p.z - nz * hw) + 0.3;
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
    appCtx.addEarthWorldObject(mesh);
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
    const material = typeof appCtx.getBuildingMaterial === 'function'
      ? appCtx.getBuildingMaterial('yes', idx, color, {
        lodTier: 'near',
        heightMeters: h,
        footprintWidth: w,
        footprintDepth: d,
        footprintArea: w * d,
        denseUrban: false,
        facadeMaterial: '',
        facadeColorMapped: false
      })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02 });
    const mesh = new THREE.Mesh(geometry, material);

    let avgElevation = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    pts.forEach((point) => {
      const terrainHeight = appCtx.elevationWorldYAtWorldXZ(point.x, point.z);
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
    appCtx.addEarthWorldObject(mesh);
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
        appCtx.addEarthWorldObject(groundPatch);
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
      const terrainY = appCtx.elevationWorldYAtWorldXZ(pos.x, pos.z);

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
        appCtx.addEarthWorldObject(mesh);
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
          appCtx.addEarthWorldObject(cap);
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
        sourceElementType: tags._sourceElementType || node.sourceElementType || node.type,
        sourceElementId: tags._sourceElementId || node.sourceElementId || node.id,
        provider: tags._we3dProvider || node.provider || 'OpenStreetMap',
        license: tags._we3dLicense || node.license || 'ODbL-1.0',
        attribution: tags._we3dAttribution || node.attribution || '© OpenStreetMap contributors',
        retrievedAt: tags._we3dRetrievedAt || node.retrievedAt || '',
        regionalPackId: tags._we3dRegionalPackId || node.regionalPackId || '',
        regionalPackVersion: tags._we3dRegionalPackVersion || node.regionalPackVersion || '',
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
  const mappedFurnitureNodes = Array.isArray(options.mappedFurnitureNodes) ? options.mappedFurnitureNodes : [];

  startLoadPhase(phaseName);
  try {
    generateStreetFurniture({ mappedFurnitureNodes });
    loadMetrics.vegetation.generated = Array.isArray(appCtx.vegetationFeatures) ? appCtx.vegetationFeatures.length : 0;
  } catch (err) {
    loadMetrics.streetFurnitureError = err?.message || String(err);
    recordWorldLoadWarning(loadMetrics, 'generateStreetFurniture', err);
  } finally {
    endLoadPhase(phaseName);
  }
}

export function buildWorldDetailPasses(options = {}) {
  const isActiveLoadContext = typeof options.isActiveLoadContext === 'function' ? options.isActiveLoadContext : () => true;
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const poiNodes = Array.isArray(options.poiNodes) ? options.poiNodes : [];
  const mappedFurnitureNodes = Array.isArray(options.mappedFurnitureNodes) ? options.mappedFurnitureNodes : [];
  const poiKeyFromTags = typeof options.poiKeyFromTags === 'function' ? options.poiKeyFromTags : () => null;
  const lodNearDist = Number.isFinite(options.lodNearDist) ? options.lodNearDist : 0;
  const lodMidDist = Number.isFinite(options.lodMidDist) ? options.lodMidDist : 0;
  const loadMetrics = options.loadMetrics || {};
  const updatePerfWorldCounts = () => {
    if (typeof appCtx.setPerfLiveStat !== 'function') return;
    appCtx.setPerfLiveStat('worldCounts', {
      roads: Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
      buildings: Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0,
      poiMeshes: Array.isArray(appCtx.poiMeshes) ? appCtx.poiMeshes.length : 0,
      landuseMeshes: Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0
    });
  };

  if (!isActiveLoadContext()) return false;
  buildPoiGeometryPass({
    endLoadPhase,
    loadMetrics,
    lodMidDist,
    lodNearDist,
    phaseName: 'buildPoiGeometry',
    poiKeyFromTags,
    poiNodes,
    startLoadPhase
  });
  if (!isActiveLoadContext()) return false;
  buildStreetFurniturePass({
    endLoadPhase,
    loadMetrics,
    mappedFurnitureNodes,
    phaseName: 'buildStreetFurniture',
    startLoadPhase
  });
  updatePerfWorldCounts();
  return true;
}
