import { ctx as appCtx } from '../shared-context.js?v=55';
import { inferPresetFromBaseFeature } from './preset-registry.js?v=1';
import { distanceToWorldFeature, worldDataToGeometry, worldToGeoPoint } from './geometry.js?v=1';
import { createOverlayFeatureDraft } from './schema.js?v=1';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function currentWorldKind() {
  if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
    if (appCtx.isEnv(appCtx.ENV.MOON)) return 'moon';
    if (appCtx.isEnv(appCtx.ENV.SPACE)) return 'space';
  }
  return appCtx.onMoon ? 'moon' : 'earth';
}

function worldGeometry(type, coordinates) {
  return { type, coordinates };
}

function buildRoadBaseFeature(feature = {}) {
  return {
    kind: 'base',
    featureType: String(feature?.networkKind || feature?.type || 'road').toLowerCase(),
    featureId: sanitizeText(feature?.sourceFeatureId || feature?.sourceBuildingId || '', 180),
    displayName: sanitizeText(feature?.name || feature?.type || 'Road', 120) || 'Road',
    geometryType: 'LineString',
    geometryWorld: worldGeometry('LineString', Array.isArray(feature?.pts) ? feature.pts : []),
    tags: {
      name: sanitizeText(feature?.name || '', 120),
      highway: sanitizeText(feature?.type || feature?.networkKind || '', 80),
      surface: sanitizeText(feature?.surface || '', 80)
    },
    threeD: {
      layer: finiteNumber(feature?.layer, 0),
      bridge: feature?.bridge === true,
      tunnel: feature?.tunnel === true,
      surface: sanitizeText(feature?.surface || '', 80)
    }
  };
}

function buildBuildingBaseFeature(building = {}) {
  const pts = Array.isArray(building?.pts) ? building.pts : [];
  return {
    kind: 'base',
    featureType: 'building',
    featureId: sanitizeText(building?.sourceBuildingId || '', 180),
    displayName: sanitizeText(building?.name || building?.buildingType || 'Building', 120) || 'Building',
    geometryType: 'Polygon',
    geometryWorld: worldGeometry('Polygon', [pts]),
    tags: {
      name: sanitizeText(building?.name || '', 120),
      building: sanitizeText(building?.buildingType || 'yes', 80),
      'building:levels': building?.levels != null ? String(building.levels) : ''
    },
    threeD: {
      height: finiteNumber(building?.height, 0),
      buildingLevels: building?.levels != null ? finiteNumber(building.levels, 0) : null,
      minHeight: finiteNumber(building?.baseY, 0)
    }
  };
}

function buildLanduseBaseFeature(feature = {}, featureType = 'landuse') {
  return {
    kind: 'base',
    featureType,
    featureId: sanitizeText(feature?.sourceFeatureId || '', 180),
    displayName: sanitizeText(feature?.type || featureType || 'Landuse', 120) || 'Landuse',
    geometryType: 'Polygon',
    geometryWorld: worldGeometry('Polygon', [Array.isArray(feature?.pts) ? feature.pts : []]),
    tags: {
      landuse: featureType === 'landuse' ? sanitizeText(feature?.type || '', 80) : '',
      natural: featureType === 'water' ? 'water' : '',
      amenity: featureType === 'parking' ? 'parking' : ''
    },
    threeD: {
      surface: sanitizeText(feature?.surface || feature?.type || '', 80)
    }
  };
}

function buildPoiBaseFeature(feature = {}) {
  return {
    kind: 'base',
    featureType: feature?.type === 'tree' ? 'tree' : 'poi',
    featureId: sanitizeText(feature?.sourceFeatureId || '', 180),
    displayName: sanitizeText(feature?.name || feature?.type || 'POI', 120) || 'POI',
    geometryType: 'Point',
    geometryWorld: worldGeometry('Point', { x: finiteNumber(feature?.x, 0), z: finiteNumber(feature?.z, 0) }),
    tags: {
      name: sanitizeText(feature?.name || '', 120),
      tourism: sanitizeText(feature?.type || '', 80)
    },
    threeD: {}
  };
}

function collectBaseFeatures() {
  const items = [];
  if (Array.isArray(appCtx.roads)) {
    appCtx.roads.forEach((feature) => {
      if (Array.isArray(feature?.pts) && feature.pts.length >= 2) items.push(buildRoadBaseFeature(feature));
    });
  }
  if (Array.isArray(appCtx.linearFeatures)) {
    appCtx.linearFeatures.forEach((feature) => {
      if (Array.isArray(feature?.pts) && feature.pts.length >= 2) items.push(buildRoadBaseFeature(feature));
    });
  }
  if (Array.isArray(appCtx.buildings)) {
    appCtx.buildings.forEach((building) => {
      if (Array.isArray(building?.pts) && building.pts.length >= 3 && !building.overlayFeatureId) {
        items.push(buildBuildingBaseFeature(building));
      }
    });
  }
  if (Array.isArray(appCtx.landuses)) {
    appCtx.landuses.forEach((feature) => {
      if (!Array.isArray(feature?.pts) || feature.pts.length < 3) return;
      const type = String(feature?.type || '').toLowerCase();
      items.push(buildLanduseBaseFeature(feature, type === 'parking' ? 'parking' : 'landuse'));
    });
  }
  if (Array.isArray(appCtx.waterAreas)) {
    appCtx.waterAreas.forEach((feature) => {
      if (!Array.isArray(feature?.pts) || feature.pts.length < 3) return;
      items.push(buildLanduseBaseFeature(feature, 'water'));
    });
  }
  if (Array.isArray(appCtx.pois)) {
    appCtx.pois.forEach((feature) => {
      if (!Number.isFinite(feature?.x) || !Number.isFinite(feature?.z)) return;
      items.push(buildPoiBaseFeature(feature));
    });
  }
  return items;
}

function pickBaseFeatureAtWorldPoint(worldPoint = {}, maxDistance = 10) {
  const features = collectBaseFeatures();
  let best = null;
  features.forEach((feature) => {
    const hit = distanceToWorldFeature(
      {
        geometry: worldDataToGeometry(feature.geometryWorld, feature.geometryType)
      },
      worldPoint,
      { maxDistance }
    );
    if (!hit || !Number.isFinite(hit.distance) || hit.distance > maxDistance) return;
    if (!best || hit.distance < best.distance) {
      best = {
        ...feature,
        distance: hit.distance,
        target: hit.target,
        segmentIndex: hit.segmentIndex ?? -1,
        inside: hit.inside === true
      };
    }
  });
  return best;
}

function createOverlayDraftFromBaseFeature(baseFeature = {}) {
  const presetId = inferPresetFromBaseFeature(baseFeature);
  const geometry = worldDataToGeometry(baseFeature.geometryWorld, baseFeature.geometryType);
  return createOverlayFeatureDraft({
    presetId,
    worldKind: currentWorldKind(),
    geometry,
    geometryType: baseFeature.geometryType,
    tags: {
      ...(baseFeature.tags || {})
    },
    threeD: {
      ...(baseFeature.threeD || {})
    },
    sourceType: baseFeature.featureType === 'building' ? 'base_patch' : 'overlay_new',
    mergeMode: baseFeature.featureType === 'building' || baseFeature.featureType === 'road' ? 'render_override' : 'additive',
    baseFeatureRef: {
      source: 'osm',
      featureType: baseFeature.featureType,
      featureId: baseFeature.featureId,
      displayName: baseFeature.displayName
    }
  });
}

function snapTargetsAroundPoint(worldPoint = {}, radius = 14) {
  const features = collectBaseFeatures();
  const targets = [];
  features.forEach((feature) => {
    if (feature.geometryType === 'Point') {
      const point = feature.geometryWorld.coordinates;
      const dist = Math.hypot(point.x - worldPoint.x, point.z - worldPoint.z);
      if (dist <= radius) {
        targets.push({
          kind: 'vertex',
          point,
          distance: dist,
          featureId: feature.featureId,
          featureType: feature.featureType
        });
      }
      return;
    }
    const points = feature.geometryType === 'LineString'
      ? feature.geometryWorld.coordinates || []
      : feature.geometryWorld.coordinates?.[0] || [];
    points.forEach((point, index) => {
      const dist = Math.hypot(point.x - worldPoint.x, point.z - worldPoint.z);
      if (dist <= radius) {
        targets.push({
          kind: 'vertex',
          point,
          distance: dist,
          featureId: feature.featureId,
          featureType: feature.featureType,
          vertexIndex: index
        });
      }
    });
  });
  targets.sort((left, right) => left.distance - right.distance);
  return targets;
}

function geoPointFromWorld(worldPoint = {}) {
  return worldToGeoPoint(worldPoint.x, worldPoint.z);
}

export {
  collectBaseFeatures,
  createOverlayDraftFromBaseFeature,
  geoPointFromWorld,
  pickBaseFeatureAtWorldPoint,
  snapTargetsAroundPoint
};
