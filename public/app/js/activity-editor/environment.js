import { ctx as appCtx } from '../shared-context.js?v=55';
import { sampleDynamicWaterAt } from '../boat-mode.js?v=6';
import {
  getActivityAnchorType,
  getActivityTemplate,
  sanitizeText
} from './schema.js?v=2';

const _pointerRaycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
const _pointerMouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
const _downRaycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
const _downRayStart = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const _downRayDir = typeof THREE !== 'undefined' ? new THREE.Vector3(0, -1, 0) : null;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pointerRayFromEvent(event) {
  if (!_pointerRaycaster || !_pointerMouse || !appCtx.camera || !appCtx.renderer?.domElement || !event) return null;
  const rect = appCtx.renderer.domElement.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  _pointerMouse.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  _pointerRaycaster.setFromCamera(_pointerMouse, appCtx.camera);
  return _pointerRaycaster;
}

function collectWaterMeshes() {
  const landuseMeshes = Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes : [];
  return landuseMeshes.filter((mesh) => {
    if (!mesh?.visible) return false;
    const landuseType = String(mesh.userData?.landuseType || '').toLowerCase();
    const variant = String(mesh.userData?.surfaceVariant || '').toLowerCase();
    return landuseType === 'water' || variant === 'water' || variant === 'ice';
  });
}

function hitTypeForObject(object) {
  if (!object) return '';
  if (Array.isArray(object.userData?.buildingFootprint) && object.userData.buildingFootprint.length >= 3) return 'building';
  const landuseType = String(object.userData?.landuseType || '').toLowerCase();
  const variant = String(object.userData?.surfaceVariant || '').toLowerCase();
  if (landuseType === 'water' || variant === 'water' || variant === 'ice') return 'water';
  if (landuseType === 'buildingground') return 'urban_surface';
  if (object.userData?.roadSurface === true || object.parent?.userData?.roadSurface === true) return 'road';
  return '';
}

function raycastWorldSurface(event, placementMode = '') {
  const raycaster = pointerRayFromEvent(event);
  if (!raycaster) return null;
  const mode = sanitizeText(placementMode, 32).toLowerCase();
  const targets = [];
  if (mode === 'rooftop' || mode === 'mixed' || mode === 'template_default') {
    if (Array.isArray(appCtx.buildingMeshes) && appCtx.buildingMeshes.length > 0) targets.push(...appCtx.buildingMeshes);
  }
  if (mode === 'water_surface' || mode === 'underwater' || mode === 'dock') {
    const waterMeshes = collectWaterMeshes();
    if (waterMeshes.length) targets.push(...waterMeshes);
  }
  if (mode === 'road' && Array.isArray(appCtx.roadMeshes) && appCtx.roadMeshes.length > 0) {
    targets.push(...appCtx.roadMeshes);
  }
  if ((mode === 'walk' || mode === 'template_default' || mode === 'mixed') && Array.isArray(appCtx.linearFeatureMeshes) && appCtx.linearFeatureMeshes.length > 0) {
    targets.push(...appCtx.linearFeatureMeshes);
  }
  if ((mode === 'walk' || mode === 'mixed' || mode === 'template_default') && Array.isArray(appCtx.urbanSurfaceMeshes) && appCtx.urbanSurfaceMeshes.length > 0) {
    targets.push(...appCtx.urbanSurfaceMeshes);
  }
  if (!targets.length) return null;
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits || hits.length === 0) return null;
  const hit = hits[0];
  return {
    x: hit.point.x,
    y: hit.point.y,
    z: hit.point.z,
    hitType: hitTypeForObject(hit.object),
    object: hit.object,
    faceNormal: hit.face?.normal ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null
  };
}

function fallbackWorldPointFromEvent(event) {
  const raycaster = pointerRayFromEvent(event);
  if (!raycaster) return null;
  const origin = raycaster.ray.origin;
  const direction = raycaster.ray.direction;
  if (Math.abs(direction.y) < 1e-5) return null;
  let x = origin.x;
  let z = origin.z;
  for (let i = 0; i < 3; i += 1) {
    const walkY = appCtx.GroundHeight?.walkSurfaceY?.(x, z);
    const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ?.(x, z);
    const targetY = i === 0 ? 0 : (Number.isFinite(walkY) ? walkY : finiteNumber(terrainY, 0));
    const distance = (targetY - origin.y) / direction.y;
    x = origin.x + direction.x * distance;
    z = origin.z + direction.z * distance;
  }
  const y = appCtx.GroundHeight?.walkSurfaceY?.(x, z) ?? finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(x, z), 0);
  return { x, y, z, hitType: 'terrain', object: null, faceNormal: null };
}

function sampleRoofSurfaceAt(x, z) {
  if (!_downRaycaster || !_downRayStart || !_downRayDir) return null;
  if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length === 0) return null;
  const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(x, z), 0);
  _downRayStart.set(x, 1800, z);
  _downRaycaster.set(_downRayStart, _downRayDir);
  const hits = _downRaycaster.intersectObjects(appCtx.buildingMeshes, false);
  for (const hit of hits) {
    if (!Number.isFinite(hit?.point?.y)) continue;
    const normal = hit.face?.normal ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
    if (normal && normal.y < 0.45) continue;
    if (hit.point.y <= terrainY + 1.5) continue;
    return {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
      normal
    };
  }
  return null;
}

function nearestRoadSupport(x, z) {
  if (typeof appCtx.findNearestRoad !== 'function') return null;
  const nearest = appCtx.findNearestRoad(x, z);
  if (!nearest?.road) return null;
  const pt = nearest.pt ? { x: nearest.pt.x, z: nearest.pt.z } : { x, z };
  const y = appCtx.GroundHeight?.roadMeshY?.(pt.x, pt.z) ??
    appCtx.GroundHeight?.roadSurfaceY?.(pt.x, pt.z) ??
    finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(pt.x, pt.z), 0);
  return {
    road: nearest.road,
    dist: finiteNumber(nearest.dist, Infinity),
    x: pt.x,
    y: finiteNumber(y, 0),
    z: pt.z
  };
}

function nearestWalkSupport(x, z) {
  const walkInfo = appCtx.GroundHeight?.walkSurfaceInfo?.(x, z) || null;
  if (!walkInfo) return null;
  const pt = walkInfo.pt ? { x: walkInfo.pt.x, z: walkInfo.pt.z } : { x, z };
  return {
    source: sanitizeText(walkInfo.source || 'terrain', 48).toLowerCase(),
    feature: walkInfo.feature || null,
    dist: finiteNumber(walkInfo.dist, Infinity),
    x: pt.x,
    y: finiteNumber(walkInfo.y, 0),
    z: pt.z
  };
}

function nearestWaterSupport(x, z) {
  if (typeof appCtx.inspectBoatCandidate !== 'function') return null;
  const candidate = appCtx.inspectBoatCandidate(x, z, 240, { allowSynthetic: false });
  if (!candidate) return null;
  const sample = sampleDynamicWaterAt(x, z, candidate, { time: performance.now() * 0.001 });
  const surfaceY = Number.isFinite(sample?.surfaceY) ? sample.surfaceY : finiteNumber(candidate.surfaceY, 0);
  const seabedY = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(x, z), surfaceY - 8);
  return {
    candidate,
    surfaceY,
    seabedY,
    shorelineDistance: finiteNumber(candidate.shorelineDistance, 0),
    waterKind: sanitizeText(candidate.waterKind || '', 32).toLowerCase()
  };
}

function snapToNearbyAnchor(point, anchors = [], excludeId = '') {
  let best = null;
  for (const anchor of anchors) {
    if (!anchor || anchor.id === excludeId) continue;
    const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z, point.y - anchor.y);
    if (distance > 3.5) continue;
    if (!best || distance < best.distance) {
      best = { anchor, distance };
    }
  }
  return best;
}

function resolvePlacementMode(template, anchorType) {
  if (anchorType?.placementMode && anchorType.placementMode !== 'template_default') {
    return anchorType.placementMode;
  }
  return template?.preferredSurface || 'walk';
}

function buildCandidate(base, overrides = {}) {
  return {
    x: finiteNumber(overrides.x, base.x),
    y: finiteNumber(overrides.y, base.y),
    z: finiteNumber(overrides.z, base.z),
    baseY: finiteNumber(overrides.baseY, base.y),
    heightOffset: finiteNumber(overrides.heightOffset, 0),
    surfaceType: sanitizeText(overrides.surfaceType || base.hitType || 'terrain', 48).toLowerCase(),
    valid: overrides.valid !== false,
    invalidReason: sanitizeText(overrides.invalidReason || '', 220),
    support: overrides.support || null,
    snapLabel: sanitizeText(overrides.snapLabel || '', 120),
    placementMode: sanitizeText(overrides.placementMode || '', 32).toLowerCase()
  };
}

function resolvePlacementCandidateFromPointer(event, options = {}) {
  const template = getActivityTemplate(options.templateId);
  const anchorType = getActivityAnchorType(options.anchorTypeId);
  const placementMode = resolvePlacementMode(template, anchorType);
  const sceneHit = raycastWorldSurface(event, placementMode);
  const basePoint = sceneHit || fallbackWorldPointFromEvent(event);
  if (!basePoint) return null;

  const x = finiteNumber(basePoint.x, 0);
  const z = finiteNumber(basePoint.z, 0);
  const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(x, z), 0);
  const roof = sampleRoofSurfaceAt(x, z);
  const walk = nearestWalkSupport(x, z);
  const road = nearestRoadSupport(x, z);
  const interior = typeof appCtx.sampleInteriorWalkSurface === 'function' ? appCtx.sampleInteriorWalkSurface(x, z) : null;
  const water = nearestWaterSupport(x, z);
  const requestedOffset = finiteNumber(options.heightOffset, anchorType.defaultHeightOffset || 0);

  let candidate = buildCandidate(basePoint, {
    y: terrainY,
    baseY: terrainY,
    surfaceType: 'terrain',
    placementMode,
    support: { terrainY }
  });

  if (placementMode === 'road') {
    const maxDistance = Math.max(4, finiteNumber(road?.road?.width, 10) * 0.6 + 3);
    const valid = !!road && road.dist <= maxDistance;
    candidate = buildCandidate(basePoint, {
      x: valid ? road.x : x,
      y: valid ? road.y : terrainY,
      z: valid ? road.z : z,
      baseY: valid ? road.y : terrainY,
      surfaceType: 'road',
      valid,
      invalidReason: valid ? '' : 'Driving anchors should sit on a drivable road surface.',
      support: { road, terrainY },
      snapLabel: valid ? 'Snapped to road centerline' : ''
    });
  } else if (placementMode === 'walk') {
    const valid = !!walk;
    candidate = buildCandidate(basePoint, {
      x: walk?.x ?? x,
      y: walk?.y ?? terrainY,
      z: walk?.z ?? z,
      baseY: walk?.y ?? terrainY,
      surfaceType: walk?.source || 'terrain',
      valid,
      invalidReason: valid ? '' : 'Walking anchors should sit on a walkable surface, path, or terrain.',
      support: { walk, terrainY },
      snapLabel: walk?.source && walk.source !== 'terrain' ? `Snapped to ${walk.source.replace(/_/g, ' ')}` : ''
    });
  } else if (placementMode === 'rooftop') {
    const valid = !!roof;
    candidate = buildCandidate(basePoint, {
      x: roof?.x ?? x,
      y: roof?.y ?? terrainY,
      z: roof?.z ?? z,
      baseY: roof?.y ?? terrainY,
      surfaceType: 'rooftop',
      valid,
      invalidReason: valid ? '' : 'Rooftop anchors require an elevated roof or deck surface.',
      support: { roof, terrainY },
      snapLabel: valid ? 'Snapped to roof surface' : ''
    });
  } else if (placementMode === 'interior') {
    const valid = !!(interior && Number.isFinite(interior.y));
    candidate = buildCandidate(basePoint, {
      y: valid ? interior.y : terrainY,
      baseY: valid ? interior.y : terrainY,
      surfaceType: valid ? 'interior' : 'terrain',
      valid,
      invalidReason: valid ? '' : 'Interior anchors require an active loaded interior floor.',
      support: { interior, terrainY },
      snapLabel: valid ? 'Snapped to interior floor' : ''
    });
  } else if (placementMode === 'water_surface') {
    const valid = !!water;
    candidate = buildCandidate(basePoint, {
      y: valid ? water.surfaceY : terrainY,
      baseY: valid ? water.surfaceY : terrainY,
      surfaceType: 'water_surface',
      valid,
      invalidReason: valid ? '' : 'This anchor must be placed over water.',
      support: { water, terrainY },
      snapLabel: valid ? `Snapped to ${sanitizeText(water.waterKind || 'water', 40).replace(/_/g, ' ')}` : ''
    });
  } else if (placementMode === 'dock') {
    const valid = !!water && water.shorelineDistance <= 64;
    candidate = buildCandidate(basePoint, {
      y: water?.surfaceY ?? terrainY,
      baseY: water?.surfaceY ?? terrainY,
      surfaceType: valid ? 'dock' : 'water_surface',
      valid,
      invalidReason: valid ? '' : 'Dock points should sit on sheltered water close to shore or a waterfront edge.',
      support: { water, terrainY },
      snapLabel: valid ? 'Aligned to near-shore water' : ''
    });
  } else if (placementMode === 'underwater') {
    const valid = !!water;
    const surfaceY = water?.surfaceY ?? terrainY + 1;
    const seabedY = water?.seabedY ?? terrainY;
    const desiredY = Math.max(seabedY + 1.4, surfaceY - Math.max(1.2, requestedOffset || 4));
    candidate = buildCandidate(basePoint, {
      y: desiredY,
      baseY: surfaceY,
      heightOffset: desiredY - surfaceY,
      surfaceType: 'underwater',
      valid,
      invalidReason: valid ? '' : 'Underwater anchors must sit below a water surface.',
      support: { water, seabedY, terrainY },
      snapLabel: valid ? 'Depth locked beneath water surface' : ''
    });
  } else if (placementMode === 'air') {
    const baseY = roof?.y ?? walk?.y ?? water?.surfaceY ?? terrainY;
    const desiredY = baseY + Math.max(2, requestedOffset || 8);
    candidate = buildCandidate(basePoint, {
      y: desiredY,
      baseY,
      heightOffset: desiredY - baseY,
      surfaceType: 'air',
      valid: true,
      invalidReason: '',
      support: { roof, walk, water, terrainY }
    });
  }

  if (options.snapEnabled !== false) {
    const snap = snapToNearbyAnchor(candidate, options.anchors || [], sanitizeText(options.excludeAnchorId || '', 80));
    if (snap) {
      candidate = buildCandidate(candidate, {
        x: snap.anchor.x,
        y: snap.anchor.y,
        z: snap.anchor.z,
        baseY: snap.anchor.baseY,
        heightOffset: snap.anchor.heightOffset,
        snapLabel: `Snapped to ${snap.anchor.label || getActivityAnchorType(snap.anchor.typeId).label}`
      });
    }
  }

  return candidate;
}

export {
  resolvePlacementCandidateFromPointer,
  resolvePlacementMode
};
