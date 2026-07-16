import { buildTerrainConformingPolygonGeometry } from './terrain-conforming-polygon.js?v=1';

export function createWorldLandusePass(options = {}) {
  const {
    FEATURE_MIN_HOLE_AREA = 6,
    FEATURE_MIN_POLYGON_AREA = 8,
    WATER_VECTOR_TILE_ZOOM = 0,
    addWaterwayRibbon,
    appCtx,
    batchLanduseMeshes,
    decimatePoints,
    fetchVectorTileWater,
    inferWaterRenderContext,
    normalizeWorldRingFromLonLat,
    registerWaterWaveMaterial,
    resolveWaterSurfaceVisualProfile,
    sanitizeWorldFootprintPoints,
    signedPolygonAreaXZ,
    vectorTileRangeForBounds,
    waterSurfaceBaseElevation,
    worldLinePointsFromLonLat
  } = options;

  const visibleMappedSurfaceTypes = new Set([
    'forest', 'wood', 'park', 'garden', 'grass', 'meadow', 'scrub',
    'orchard', 'vineyard', 'allotments', 'farmland', 'farmyard',
    'plant_nursery', 'greenhouse_horticulture', 'recreation_ground',
    'village_green', 'cemetery', 'sand', 'dune', 'barren', 'glacier', 'quarry'
  ]);
  const denseNaturalTypes = new Set(['forest', 'wood', 'scrub', 'orchard', 'vineyard']);
  const mineralSurfaceTypes = new Set(['sand', 'dune', 'barren', 'glacier', 'quarry']);

  function landuseOverlayOpacity(landuseType, isExplicitHardscape) {
    if (isExplicitHardscape) return 0.94;
    if (mineralSurfaceTypes.has(landuseType)) return 0.55;
    if (denseNaturalTypes.has(landuseType)) return 0.28;
    return 0.2;
  }

  function addLandusePolygon(runtime, pts, landuseType, holeRings = [], guardOptions = null) {
    if (!pts || pts.length < 3) return;

    let ring = sanitizeWorldFootprintPoints(
      pts,
      FEATURE_MIN_POLYGON_AREA,
      guardOptions || undefined
    );
    if (ring.length < 3) return;

    ring = sanitizeWorldFootprintPoints(
      decimatePoints(ring, 900, false),
      FEATURE_MIN_POLYGON_AREA,
      guardOptions || undefined
    );
    if (ring.length < 3) return;

    const outerArea = Math.abs(signedPolygonAreaXZ(ring));
    if (!Number.isFinite(outerArea) || outerArea < FEATURE_MIN_POLYGON_AREA) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    ring.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    });

    const sampledHeights = [];
    let avgElevation = 0;
    ring.forEach((point) => {
      const sample = appCtx.elevationWorldYAtWorldXZ(point.x, point.z);
      sampledHeights.push(sample);
      avgElevation += sample;
    });
    avgElevation /= ring.length;

    const minElevation = sampledHeights.reduce((best, value) =>
      Number.isFinite(value) ? Math.min(best, value) : best,
    Infinity);

    const cleanedHoles = [];
    if (holeRings && holeRings.length > 0) {
      holeRings.forEach((holeRing) => {
        if (!holeRing || holeRing.length < 3) return;
        const cleanedHole = sanitizeWorldFootprintPoints(
          holeRing,
          FEATURE_MIN_HOLE_AREA,
          guardOptions || undefined
        );
        if (cleanedHole.length < 3) return;
        const holeArea = Math.abs(signedPolygonAreaXZ(cleanedHole));
        if (!Number.isFinite(holeArea) || holeArea < FEATURE_MIN_HOLE_AREA) return;
        if (holeArea >= outerArea * 0.92) return;

        cleanedHoles.push(cleanedHole);
      });
    }

    const isWater = landuseType === 'water';
    const isExplicitHardscape = landuseType === 'paved' || landuseType === 'parking';
    const isMappedGroundCover = visibleMappedSurfaceTypes.has(landuseType);
    const overlayOpacity = landuseOverlayOpacity(landuseType, isExplicitHardscape);
    const waterVisualProfile = isWater ? resolveWaterSurfaceVisualProfile() : null;
    const surfaceBaseElevation = isWater
      ? waterSurfaceBaseElevation(sampledHeights)
      : avgElevation;
    const waterFlattenFactor = isWater ? 0 : 1.0;
    let geometry;
    if (isWater) {
      const shape = new THREE.Shape();
      ring.forEach((point, index) => {
        if (index === 0) shape.moveTo(point.x, -point.z);
        else shape.lineTo(point.x, -point.z);
      });
      shape.closePath();
      cleanedHoles.forEach((cleanedHole) => {
        const path = new THREE.Path();
        cleanedHole.forEach((point, index) => {
          if (index === 0) path.moveTo(point.x, -point.z);
          else path.lineTo(point.x, -point.z);
        });
        path.closePath();
        shape.holes.push(path);
      });
      geometry = new THREE.ShapeGeometry(shape, 20);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) positions.setY(i, 0.08);
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    } else {
      geometry = buildTerrainConformingPolygonGeometry(
        ring,
        cleanedHoles,
        (x, z) => {
          const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
          return terrainY === 0 && Math.abs(surfaceBaseElevation) > 2 ? surfaceBaseElevation : terrainY;
        },
        {
          baseY: surfaceBaseElevation,
          maxEdgeLength: 42,
          maxTriangles: Math.max(140, Math.min(900, ring.length * 8)),
          surfaceOffset: 0.035
        }
      );
    }

    const material = new THREE.MeshStandardMaterial(isWater ? {
      color: waterVisualProfile?.color || appCtx.LANDUSE_STYLES.water.color,
      emissive: waterVisualProfile?.emissive || 0x0f355a,
      emissiveIntensity: waterVisualProfile?.emissiveIntensity ?? 0.18,
      roughness: waterVisualProfile?.roughness ?? 0.34,
      metalness: waterVisualProfile?.metalness ?? 0.02,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6
    } : {
      color: appCtx.LANDUSE_STYLES[landuseType].color,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: overlayOpacity,
      depthWrite: isExplicitHardscape,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    if (isWater) {
      registerWaterWaveMaterial(material, {
        waveScale: 1.0,
        waveBase: 1.0,
        area: outerArea,
        span: Math.max(maxX - minX, maxZ - minZ),
        waterKind: inferWaterRenderContext({
          area: outerArea,
          span: Math.max(maxX - minX, maxZ - minZ)
        })
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.position.y = surfaceBaseElevation;
    mesh.userData.landuseFootprint = ring;
    mesh.userData.avgElevation = surfaceBaseElevation;
    mesh.userData.alwaysVisible = isWater || isExplicitHardscape || isMappedGroundCover;
    mesh.userData.landuseType = landuseType;
    mesh.userData.waterFlattenFactor = waterFlattenFactor;
    mesh.userData.surfaceVariant = isWater ? waterVisualProfile?.mode || 'water' : landuseType;
    if (isWater) mesh.userData.waterSurfaceBase = surfaceBaseElevation;
    mesh.receiveShadow = false;
    mesh.visible = appCtx.landUseVisible || mesh.userData.alwaysVisible;
    appCtx.scene.add(mesh);
    appCtx.landuseMeshes.push(mesh);
    appCtx.landuses.push({
      type: landuseType,
      pts: ring,
      bounds: { minX, maxX, minZ, maxZ }
    });

    if (isWater) {
      const centroid = ring.reduce((acc, point) => {
        acc.x += point.x;
        acc.z += point.z;
        return acc;
      }, { x: 0, z: 0 });
      appCtx.waterAreas.push({
        type: 'water',
        pts: ring,
        area: outerArea,
        centerX: centroid.x / ring.length,
        centerZ: centroid.z / ring.length,
        surfaceY: surfaceBaseElevation + 0.08,
        bounds: { minX, maxX, minZ, maxZ }
      });
    }
  }

  function cacheSurfaceFeatureHint(pts, landuseType, guardOptions = null) {
    if (!pts || pts.length < 3 || !landuseType) return;

    let ring = sanitizeWorldFootprintPoints(
      pts,
      FEATURE_MIN_POLYGON_AREA,
      guardOptions || undefined
    );
    if (ring.length < 3) return;

    ring = sanitizeWorldFootprintPoints(
      decimatePoints(ring, 140, false),
      FEATURE_MIN_POLYGON_AREA,
      guardOptions || undefined
    );
    if (ring.length < 3) return;

    const area = Math.abs(signedPolygonAreaXZ(ring));
    if (!Number.isFinite(area) || area < FEATURE_MIN_POLYGON_AREA) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    ring.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    });

    appCtx.surfaceFeatureHints.push({
      type: landuseType,
      pts: ring,
      bounds: { minX, maxX, minZ, maxZ }
    });
  }

  function addWaterPolygonFromVectorCoords(runtime, polygonCoords) {
    if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;

    const outer = normalizeWorldRingFromLonLat(polygonCoords[0], 1000);
    if (!outer) return false;

    const holes = [];
    for (let i = 1; i < polygonCoords.length; i++) {
      const hole = normalizeWorldRingFromLonLat(polygonCoords[i], 700);
      if (hole && Math.abs(signedPolygonAreaXZ(hole)) > FEATURE_MIN_HOLE_AREA) holes.push(hole);
    }

    addLandusePolygon(runtime, outer, 'water', holes);
    return true;
  }

  function addVectorWaterGeoJSON(runtime, geojson) {
    if (!geojson || !geojson.geometry) return { polygons: 0, lines: 0 };

    let polygons = 0;
    let lines = 0;
    const geom = geojson.geometry;
    const props = geojson.properties || {};

    if (geom.type === 'Polygon') {
      if (addWaterPolygonFromVectorCoords(runtime, geom.coordinates)) polygons++;
      return { polygons, lines };
    }
    if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((polyCoords) => {
        if (addWaterPolygonFromVectorCoords(runtime, polyCoords)) polygons++;
      });
      return { polygons, lines };
    }
    if (geom.type === 'LineString') {
      const pts = worldLinePointsFromLonLat(geom.coordinates, 1000);
      if (pts && pts.length >= 2) {
        addWaterwayRibbon(pts, props);
        lines++;
      }
      return { polygons, lines };
    }
    if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach((lineCoords) => {
        const pts = worldLinePointsFromLonLat(lineCoords, 1000);
        if (pts && pts.length >= 2) {
          addWaterwayRibbon(pts, props);
          lines++;
        }
      });
    }

    return { polygons, lines };
  }

  function ensureWaterFallbackIfEmpty(runtime) {
    return false;
  }

  async function loadVectorTileWaterCoverage(runtime, latMin, lonMin, latMax, lonMax) {
    const tr = vectorTileRangeForBounds(latMin, lonMin, latMax, lonMax, WATER_VECTOR_TILE_ZOOM);
    const tileJobs = [];
    for (let tx = tr.xMin; tx <= tr.xMax; tx++) {
      for (let ty = tr.yMin; ty <= tr.yMax; ty++) {
        tileJobs.push(fetchVectorTileWater(WATER_VECTOR_TILE_ZOOM, tx, ty));
      }
    }
    if (tileJobs.length === 0) return { polygons: 0, lines: 0, tiles: 0, okTiles: 0 };

    const settled = await Promise.allSettled(tileJobs);
    let polygons = 0;
    let lines = 0;
    let okTiles = 0;
    const errors = [];

    settled.forEach((result) => {
      if (result.status !== 'fulfilled') {
        if (errors.length < 4) errors.push(result.reason?.message || String(result.reason || 'tile rejected'));
        return;
      }
      okTiles++;
      const { tile, x, y, z } = result.value;
      const polygonLayers = ['ocean', 'water_polygons'];
      const lineLayers = ['water_lines'];

      polygonLayers.forEach((layerName) => {
        const layer = tile.layers[layerName];
        if (!layer || !Number.isFinite(layer.length)) return;
        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i);
          if (!feature || typeof feature.toGeoJSON !== 'function') continue;
          const out = addVectorWaterGeoJSON(runtime, feature.toGeoJSON(x, y, z));
          polygons += out.polygons;
          lines += out.lines;
        }
      });

      lineLayers.forEach((layerName) => {
        const layer = tile.layers[layerName];
        if (!layer || !Number.isFinite(layer.length)) return;
        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i);
          if (!feature || typeof feature.toGeoJSON !== 'function') continue;
          const out = addVectorWaterGeoJSON(runtime, feature.toGeoJSON(x, y, z));
          polygons += out.polygons;
          lines += out.lines;
        }
      });
    });

    return { polygons, lines, tiles: tileJobs.length, okTiles, errors };
  }

  async function buildLanduseGeometryPass(runtime = {}) {
    const currentWaterFeatureCount = () =>
      (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0) +
      (Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0);

    const loadSignature =
      `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:` +
      `${Number(appCtx.LOC?.lon || 0).toFixed(6)}:` +
      `${Number(runtime.featureRadius || 0).toFixed(6)}`;

    const waterSignals = runtime.worldSurfaceProfile?.signals?.normalized || {};
    const likelyWaterNearby =
      currentWaterFeatureCount() > 0 ||
      appCtx.selLoc === 'custom' ||
      Number(waterSignals.water || 0) >= 0.05 ||
      Number(waterSignals.explicitBlue || 0) >= 0.04 ||
      appCtx.boatMode?.active === true ||
      appCtx.oceanMode?.active === true;
    const requiresImmediateWaterCoverage =
      appCtx.selLoc === 'custom' ||
      appCtx.boatMode?.active === true ||
      appCtx.oceanMode?.active === true;

    async function runVectorWaterCoverage(runOptions = {}) {
      const showStatus = runOptions.showStatus === true;
      const injectFallback = runOptions.injectFallback === true;
      const currentSignature =
        `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:` +
        `${Number(appCtx.LOC?.lon || 0).toFixed(6)}:` +
        `${Number(runtime.featureRadius || 0).toFixed(6)}`;
      if (currentSignature !== loadSignature) return null;
      if (showStatus) {
        appCtx.showLoad('Loading water...');
      }
      try {
        const waterSummary = await loadVectorTileWaterCoverage(
          runtime,
          appCtx.LOC.lat - runtime.featureRadius,
          appCtx.LOC.lon - runtime.featureRadius,
          appCtx.LOC.lat + runtime.featureRadius,
          appCtx.LOC.lon + runtime.featureRadius
        );
        runtime.loadMetrics.vectorWater = { ...waterSummary };
        if (waterSummary.polygons === 0 && waterSummary.lines === 0 && showStatus) {
          console.warn(`[Water] Vector tiles loaded but no water features in bounds (tiles ok ${waterSummary.okTiles}/${waterSummary.tiles}).`);
        }
      } catch (waterErr) {
        console.warn('[Water] Vector water load failed, continuing without vector water layer.', waterErr);
      }
      if (injectFallback && ensureWaterFallbackIfEmpty(runtime)) {
        console.warn('[Water] No water features loaded; injected deterministic fallback water surface.');
      }
      return true;
    }

    appCtx.showLoad(`Loading land use... (${runtime.landuseWays.length})`);
    runtime.startLoadPhase('buildLanduseGeometry');

    runtime.landuseWays.forEach((way) => {
      const landuseType = runtime.classifyLanduseType(way.tags);
      if (!landuseType) return;
      if (!Array.isArray(way.nodes) || way.nodes.length < 4 || way.nodes[0] !== way.nodes[way.nodes.length - 1]) return;
      const pts = way.nodes
        .map((id) => runtime.nodes[id])
        .filter((node) => node)
        .map((node) => appCtx.geoToWorld(node.lat, node.lon));
      const guard = landuseType === 'water' ? null : runtime.landuseGeometryGuards;
      cacheSurfaceFeatureHint(pts, landuseType, guard);
      addLandusePolygon(runtime, pts, landuseType, [], guard);
    });

    if (Array.isArray(runtime.waterwayWays) && runtime.waterwayWays.length > 0) {
      runtime.waterwayWays.forEach((way) => {
        const pts = way.nodes
          .map((id) => runtime.nodes[id])
          .filter((node) => node)
          .map((node) => appCtx.geoToWorld(node.lat, node.lon));
        addWaterwayRibbon(pts, way.tags || {});
      });
    }

    await runVectorWaterCoverage({
      showStatus: likelyWaterNearby || requiresImmediateWaterCoverage,
      injectFallback: appCtx.oceanMode?.active === true
    });

    runtime.endLoadPhase('buildLanduseGeometry');
    runtime.startLoadPhase('batchLanduseGeometry');
    const batchedLanduseCount = batchLanduseMeshes();
    if (batchedLanduseCount > 0) {
      runtime.loadMetrics.lod.landuseBatched = batchedLanduseCount;
    }
    if (appCtx._lastLanduseBatchStats) {
      runtime.loadMetrics.landuseBatching = { ...appCtx._lastLanduseBatchStats };
    }
    runtime.endLoadPhase('batchLanduseGeometry');
  }

  return {
    buildLanduseGeometryPass
  };
}
