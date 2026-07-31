import { buildTerrainConformingPolygonGeometry } from './terrain-conforming-polygon.js?v=1';
import { surfaceComposition } from './surface-contract.js?v=9';
import { normalizeWaterBody } from './water-body-contract.js?v=3';
import { createWaterSurfaceRegistry } from './water-surface-registry.js?v=2';

const SOIL_LANDUSE_TYPES = new Set([
  'farmland', 'farmyard', 'orchard', 'vineyard', 'allotments',
  'plant_nursery', 'greenhouse_horticulture'
]);
const ROCK_LANDUSE_TYPES = new Set(['barren', 'quarry', 'landfill']);
const PAVED_LANDUSE_TYPES = new Set(['paved', 'parking']);

function surfaceModeForLanduse(landuseType) {
  if (landuseType === 'forest' || landuseType === 'wood') return 'forest';
  if (landuseType === 'sand' || landuseType === 'dune') return 'sand';
  if (landuseType === 'glacier') return 'snow';
  if (SOIL_LANDUSE_TYPES.has(landuseType)) return 'soil';
  if (ROCK_LANDUSE_TYPES.has(landuseType)) return 'rock';
  if (PAVED_LANDUSE_TYPES.has(landuseType)) return 'pavement';
  return 'grass';
}

function textureSetForLanduse(appCtx, landuseType) {
  const mode = surfaceModeForLanduse(landuseType);
  const registered = appCtx.surfaceTextureSets?.[mode];
  if (registered?.map) return { ...registered, mode };
  if (mode === 'pavement' && appCtx.pavementDiffuse) {
    return {
      map: appCtx.pavementDiffuse,
      normalMap: appCtx.pavementNormal,
      roughnessMap: appCtx.pavementRoughness,
      mode
    };
  }
  if (mode === 'grass' && appCtx.grassDiffuse) {
    return {
      map: appCtx.grassDiffuse,
      normalMap: appCtx.grassNormal,
      roughnessMap: appCtx.grassRoughness,
      mode
    };
  }
  return null;
}

function applyWorldSpaceSurfaceUvs(geometry, metersPerTile) {
  const positions = geometry?.attributes?.position;
  if (!positions) return;
  const scale = 1 / Math.max(1, Number(metersPerTile) || 6);
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i += 1) {
    uvs[i * 2] = positions.getX(i) * scale;
    uvs[i * 2 + 1] = positions.getZ(i) * scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function mappedSurfaceMaterialOptions(appCtx, landuseType, composition) {
  const textures = textureSetForLanduse(appCtx, landuseType);
  const metersPerTile =
    textures?.mode === 'pavement' ? 3.2 :
    textures?.mode === 'forest' ? 5.5 :
    textures?.mode === 'rock' ? 5 :
    textures?.mode === 'soil' ? 6 :
    textures?.mode === 'sand' ? 8 :
    textures?.mode === 'snow' ? 9 :
    7;
  return {
    material: {
      color: textures?.map ? 0xffffff : appCtx.LANDUSE_STYLES[landuseType].color,
      map: textures?.map || null,
      normalMap: textures?.normalMap || null,
      roughnessMap: textures?.roughnessMap || null,
      normalScale: textures?.normalMap ? new THREE.Vector2(0.34, 0.34) : undefined,
      roughness: textures?.mode === 'pavement' ? 0.9 : 0.95,
      metalness: 0.0,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: composition.polygonOffsetFactor,
      polygonOffsetUnits: composition.polygonOffsetUnits
    },
    metersPerTile
  };
}

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
  const ensureWaterSurfaceRegistry = () => appCtx.waterSurfaceRegistry ||
    (appCtx.waterSurfaceRegistry = createWaterSurfaceRegistry());

  function removePublishedWaterArea(waterArea) {
    const meshIndex = appCtx.landuseMeshes.findIndex((mesh) => mesh?.userData?.waterAreaRef === waterArea);
    if (meshIndex >= 0) {
      const [mesh] = appCtx.landuseMeshes.splice(meshIndex, 1);
      mesh.parent?.remove(mesh);
      mesh.geometry?.dispose?.();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material?.dispose?.());
      else mesh.material?.dispose?.();
    }
    const waterIndex = appCtx.waterAreas.indexOf(waterArea);
    if (waterIndex >= 0) appCtx.waterAreas.splice(waterIndex, 1);
    const landuseIndex = appCtx.landuses.findIndex((landuse) => landuse?.type === 'water' && landuse?.pts === waterArea.pts);
    if (landuseIndex >= 0) appCtx.landuses.splice(landuseIndex, 1);
    ensureWaterSurfaceRegistry().remove(waterArea);
  }

  function addLandusePolygon(runtime, pts, landuseType, holeRings = [], guardOptions = null, featureMeta = {}) {
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
    const waterVisualProfile = isWater ? resolveWaterSurfaceVisualProfile() : null;
    const composition = surfaceComposition(landuseType, isWater ? 'water' : 'land-cover');
    const centerElevation = isWater ? appCtx.elevationWorldYAtWorldXZ(
      (minX + maxX) * 0.5,
      (minZ + maxZ) * 0.5
    ) : NaN;
    const surfaceBaseElevation = isWater
      ? Number.isFinite(centerElevation) && centerElevation > 12
        ? centerElevation
        : waterSurfaceBaseElevation(sampledHeights)
      : avgElevation;
    const waterArea = isWater ? normalizeWaterBody({
      shape: 'area',
      pts: ring,
      holes: cleanedHoles,
      area: outerArea,
      surfaceY: surfaceBaseElevation + 0.08,
      bounds: { minX, maxX, minZ, maxZ },
      kindHint: featureMeta.kindHint || featureMeta.layer,
      sourceFeatureId: featureMeta.sourceFeatureId,
      geometrySource: featureMeta.geometrySource || 'osm',
      tileKey: featureMeta.tileKey,
      layer: featureMeta.layer,
      access: featureMeta.access,
      boatAccess: featureMeta.boatAccess,
      surfaceType: featureMeta.surfaceType || featureMeta.kindHint,
      datumMethod: featureMeta.layer === 'ocean' ? 'sea-level' : 'dem-water-surface',
      datumConfidence: featureMeta.layer === 'ocean' ? 0.98 : 0.82
    }) : null;
    const waterFlattenFactor = isWater ? 0 : 1.0;

    // OSM land-use and Shortbread water layers can describe the same body.
    // Publish one physical/visual surface instead of two nearly coincident
    // sheets that flicker, separate with waves, and double draw cost.
    if (isWater) {
      const registration = ensureWaterSurfaceRegistry().register(waterArea);
      if (!registration.accepted) return;
      registration.replacements.forEach(removePublishedWaterArea);
    }

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
          surfaceOffset: composition.surfaceOffset
        }
      );
    }

    const mappedSurface = isWater ? null : mappedSurfaceMaterialOptions(appCtx, landuseType, composition);
    if (!isWater) applyWorldSpaceSurfaceUvs(geometry, mappedSurface.metersPerTile);
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
    } : mappedSurface.material);

    if (isWater) {
      registerWaterWaveMaterial(material, {
        waveScale: 1.0,
        waveBase: 1.0,
        area: outerArea,
        span: Math.max(maxX - minX, maxZ - minZ),
        waterKind: waterArea?.waterKind || inferWaterRenderContext({ area: outerArea, span: Math.max(maxX - minX, maxZ - minZ) })
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = composition.renderOrder;
    mesh.position.y = surfaceBaseElevation;
    mesh.userData.landuseFootprint = ring;
    mesh.userData.avgElevation = surfaceBaseElevation;
    mesh.userData.alwaysVisible = isWater || isExplicitHardscape || isMappedGroundCover;
    mesh.userData.landuseType = landuseType;
    mesh.userData.waterFlattenFactor = waterFlattenFactor;
    mesh.userData.surfaceVariant = isWater ? waterVisualProfile?.mode || 'water' : landuseType;
    if (isWater) mesh.userData.waterSurfaceBase = surfaceBaseElevation;
    if (isWater) {
      mesh.userData.waterRegistryId = waterArea.registryId;
      mesh.userData.waterSurfaceProvenance = waterArea.registryProvenance;
    }
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
      mesh.userData.waterAreaRef = waterArea;
      appCtx.waterAreas.push(waterArea);
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

  function addWaterPolygonFromVectorCoords(runtime, polygonCoords, featureMeta = {}) {
    if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;

    const outer = normalizeWorldRingFromLonLat(polygonCoords[0], 1000);
    if (!outer) return false;

    const holes = [];
    for (let i = 1; i < polygonCoords.length; i++) {
      const hole = normalizeWorldRingFromLonLat(polygonCoords[i], 700);
      if (hole && Math.abs(signedPolygonAreaXZ(hole)) > FEATURE_MIN_HOLE_AREA) holes.push(hole);
    }

    addLandusePolygon(runtime, outer, 'water', holes, null, featureMeta);
    return true;
  }

  function addVectorWaterGeoJSON(runtime, geojson, featureMeta = {}) {
    if (!geojson || !geojson.geometry) return { polygons: 0, lines: 0 };

    let polygons = 0;
    let lines = 0;
    const geom = geojson.geometry;
    const props = geojson.properties || {};
    const polygonSurfaceType = String(props.kind || '').toLowerCase() === 'glacier'
      ? 'glacier'
      : 'water';
    const waterFeatureMeta = {
      ...featureMeta,
      kindHint: props.kind || props.water || props.class || props.subclass || featureMeta.kindHint || null,
      surfaceType: props.water || props.kind || props.class || props.subclass || null,
      access: props.access || null,
      boatAccess: props.boat || props.motorboat || props.ship || null
    };

    if (geom.type === 'Polygon') {
      if (polygonSurfaceType === 'glacier') {
        const outer = normalizeWorldRingFromLonLat(geom.coordinates?.[0], 1000);
        if (outer) {
          cacheSurfaceFeatureHint(outer, 'glacier');
          addLandusePolygon(runtime, outer, 'glacier', [], null, waterFeatureMeta);
          polygons++;
        }
      } else if (addWaterPolygonFromVectorCoords(runtime, geom.coordinates, waterFeatureMeta)) polygons++;
      return { polygons, lines };
    }
    if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((polyCoords, polygonIndex) => {
        const polygonMeta = featureMeta.sourceFeatureId
          ? {
              ...waterFeatureMeta,
              sourceFeatureId: `${featureMeta.sourceFeatureId}:polygon:${polygonIndex}`
            }
          : waterFeatureMeta;
        if (polygonSurfaceType === 'glacier') {
          const outer = normalizeWorldRingFromLonLat(polyCoords?.[0], 1000);
          if (outer) {
            cacheSurfaceFeatureHint(outer, 'glacier');
            addLandusePolygon(runtime, outer, 'glacier', [], null, polygonMeta);
            polygons++;
          }
        } else if (addWaterPolygonFromVectorCoords(runtime, polyCoords, polygonMeta)) polygons++;
      });
      return { polygons, lines };
    }
    if (geom.type === 'LineString') {
      const pts = worldLinePointsFromLonLat(geom.coordinates, 1000);
      if (pts && pts.length >= 2) {
        addWaterwayRibbon(pts, {
          ...props,
          _sourceFeatureId: featureMeta.sourceFeatureId || null,
          _geometrySource: featureMeta.geometrySource || 'osm-shortbread'
        });
        lines++;
      }
      return { polygons, lines };
    }
    if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach((lineCoords, lineIndex) => {
        const pts = worldLinePointsFromLonLat(lineCoords, 1000);
        if (pts && pts.length >= 2) {
          addWaterwayRibbon(pts, {
            ...props,
            _sourceFeatureId: featureMeta.sourceFeatureId
              ? `${featureMeta.sourceFeatureId}:line:${lineIndex}`
              : null,
            _geometrySource: featureMeta.geometrySource || 'osm-shortbread'
          });
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
          const out = addVectorWaterGeoJSON(runtime, feature.toGeoJSON(x, y, z), {
            layer: layerName,
            kindHint: layerName === 'ocean' ? 'open_ocean' : 'lake',
            sourceFeatureId: `shortbread:${z}/${x}/${y}:${layerName}:${i}`,
            geometrySource: 'osm-shortbread',
            tileKey: `${z}/${x}/${y}`
          });
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
          const out = addVectorWaterGeoJSON(runtime, feature.toGeoJSON(x, y, z), {
            layer: layerName,
            sourceFeatureId: `shortbread:${z}/${x}/${y}:${layerName}:${i}`,
            geometrySource: 'osm-shortbread',
            tileKey: `${z}/${x}/${y}`
          });
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
      addLandusePolygon(runtime, pts, landuseType, [], guard, landuseType === 'water' ? {
        kindHint: way.tags?.natural || way.tags?.water || way.tags?.landuse,
        surfaceType: way.tags?.water || way.tags?.natural || way.tags?.landuse,
        access: way.tags?.access,
        boatAccess: way.tags?.boat || way.tags?.motorboat || way.tags?.ship,
        sourceFeatureId: way.id ? `osm:${way.id}` : null,
        geometrySource: 'osm-overpass',
        layer: 'landuse'
      } : {});
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
