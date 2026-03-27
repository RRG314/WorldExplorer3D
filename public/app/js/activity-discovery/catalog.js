import { ctx as appCtx } from '../shared-context.js?v=55';
import {
  createDefaultAnchorDraft,
  getActivityTemplate,
  orderedRouteAnchors,
  sanitizeText
} from '../activity-editor/schema.js?v=2';
import { listStoredActivities } from './library.js?v=2';
import {
  discoveryBadgeForActivity,
  discoveryCategoryForActivity,
  discoveryColorForActivity,
  discoveryIconForActivity,
  discoveryMarkerShape
} from './schema.js?v=2';
import { worldPointToGeo } from '../map-coordinates.js?v=2';

const CREATOR_SYSTEM_USER_ID = 'system_worldexplorer';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentReferencePose() {
  const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
  if (mode === 'boat') {
    return {
      mode,
      x: finiteNumber(appCtx.boat?.x, 0),
      y: finiteNumber(appCtx.boat?.y, 0),
      z: finiteNumber(appCtx.boat?.z, 0)
    };
  }
  if (mode === 'drone') {
    return {
      mode,
      x: finiteNumber(appCtx.drone?.x, 0),
      y: finiteNumber(appCtx.drone?.y, 12),
      z: finiteNumber(appCtx.drone?.z, 0)
    };
  }
  if (mode === 'walk' && appCtx.Walk?.state?.walker) {
    return {
      mode,
      x: finiteNumber(appCtx.Walk.state.walker.x, 0),
      y: finiteNumber(appCtx.Walk.state.walker.y, 1.7),
      z: finiteNumber(appCtx.Walk.state.walker.z, 0)
    };
  }
  return {
    mode: 'drive',
    x: finiteNumber(appCtx.car?.x, 0),
    y: finiteNumber(appCtx.car?.y, 1.2),
    z: finiteNumber(appCtx.car?.z, 0)
  };
}

function worldToGeo(worldX, worldZ) {
  return worldPointToGeo(worldX, worldZ);
}

function distanceToRef(ref, point) {
  return Math.hypot(finiteNumber(point?.x, 0) - ref.x, finiteNumber(point?.z, 0) - ref.z);
}

function buildAnchor(typeId, label, x, y, z, extra = {}) {
  return createDefaultAnchorDraft(typeId, {
    id: extra.id || `${typeId}_${Math.random().toString(36).slice(2, 9)}`,
    label,
    x,
    y,
    z,
    yaw: finiteNumber(extra.yaw, 0),
    baseY: finiteNumber(extra.baseY, y),
    heightOffset: finiteNumber(extra.heightOffset, 0),
    radius: finiteNumber(extra.radius, undefined),
    sizeX: finiteNumber(extra.sizeX, undefined),
    sizeY: finiteNumber(extra.sizeY, undefined),
    sizeZ: finiteNumber(extra.sizeZ, undefined),
    environment: sanitizeText(extra.environment || '', 48).toLowerCase(),
    valid: extra.valid !== false
  });
}

function summarizeRouteDistance(anchors = []) {
  const route = orderedRouteAnchors(anchors);
  if (route.length < 2) return 0;
  let distance = 0;
  for (let i = 1; i < route.length; i += 1) {
    distance += Math.hypot(
      finiteNumber(route[i].x, 0) - finiteNumber(route[i - 1].x, 0),
      finiteNumber(route[i].z, 0) - finiteNumber(route[i - 1].z, 0),
      finiteNumber(route[i].y, 0) - finiteNumber(route[i - 1].y, 0)
    );
  }
  return distance;
}

function estimateDurationMinutes(traversalMode = '', anchors = []) {
  const distance = summarizeRouteDistance(anchors);
  const speedPerMinute =
    traversalMode === 'boat' ? 520 :
    traversalMode === 'drone' ? 760 :
    traversalMode === 'walk' ? 110 :
    traversalMode === 'submarine' ? 320 :
    700;
  return clamp(Math.round(Math.max(2, distance / Math.max(speedPerMinute, 1))), 2, 40);
}

function estimateDifficulty(traversalMode = '', anchors = []) {
  const distance = summarizeRouteDistance(anchors);
  const checkpointCount = anchors.filter((anchor) => anchor.typeId === 'checkpoint').length;
  const score = checkpointCount + distance / 260 + (traversalMode === 'drone' || traversalMode === 'boat' ? 0.8 : 0);
  if (score >= 9) return 'Hard';
  if (score >= 5) return 'Moderate';
  return 'Easy';
}

function buildActivityRecord(base = {}, ref = currentReferencePose()) {
  const anchors = Array.isArray(base.anchors) ? base.anchors.slice() : [];
  const route = orderedRouteAnchors(anchors);
  const startPoint = route[0] || anchors[0] || base.startPoint || base.center || { x: ref.x, y: ref.y, z: ref.z };
  const center = base.center || (anchors.length > 0
    ? anchors.reduce((acc, anchor) => {
        acc.x += finiteNumber(anchor.x, 0);
        acc.y += finiteNumber(anchor.y, 0);
        acc.z += finiteNumber(anchor.z, 0);
        return acc;
      }, { x: 0, y: 0, z: 0 })
    : { x: ref.x, y: ref.y, z: ref.z });
  if (anchors.length > 0) {
    center.x /= anchors.length;
    center.y /= anchors.length;
    center.z /= anchors.length;
  }
  const geo = worldToGeo(startPoint.x, startPoint.z);
  const distanceMeters = Math.round(distanceToRef(ref, startPoint));
  const template = getActivityTemplate(base.templateId || '');
  const traversalMode = sanitizeText(base.traversalMode || template.traversalMode || 'drive', 32).toLowerCase();
  const record = {
    id: sanitizeText(base.id || '', 120).toLowerCase(),
    sourceType: sanitizeText(base.sourceType || 'generated', 24).toLowerCase(),
    subtype: sanitizeText(base.subtype || '', 32).toLowerCase(),
    title: sanitizeText(base.title || template.label || 'Activity', 120),
    description: sanitizeText(base.description || '', 260),
    creatorId: sanitizeText(base.creatorId || (sanitizeText(base.sourceType || '', 24).toLowerCase() === 'generated' ? CREATOR_SYSTEM_USER_ID : ''), 160),
    creatorName: sanitizeText(base.creatorName || 'World Explorer', 80),
    creatorAvatar: sanitizeText(base.creatorAvatar || '🌍', 12) || '🌍',
    visibility: sanitizeText(base.visibility || 'public', 24).toLowerCase(),
    status: sanitizeText(base.status || (sanitizeText(base.visibility || 'public', 24).toLowerCase() === 'public' ? 'published' : 'draft'), 24).toLowerCase(),
    featured: base.featured === true,
    isNearby: distanceMeters <= finiteNumber(base.nearbyThreshold, 220),
    distanceMeters,
    traversalMode,
    templateId: sanitizeText(base.templateId || template.id || '', 80).toLowerCase(),
    locationLabel: sanitizeText(base.locationLabel || appCtx.customLoc?.name || appCtx.LOCS?.[appCtx.selLoc]?.name || 'Current World', 120),
    anchors,
    routeAnchors: route,
    center,
    startPoint,
    lat: geo.lat,
    lon: geo.lon,
    estimatedMinutes: clamp(finiteNumber(base.estimatedMinutes, estimateDurationMinutes(traversalMode, anchors)), 1, 45),
    difficulty: sanitizeText(base.difficulty || estimateDifficulty(traversalMode, anchors), 24),
    playerMode: sanitizeText(base.playerMode || (base.sourceType === 'room' ? 'multiplayer' : 'solo'), 24).toLowerCase(),
    roomCode: sanitizeText(base.roomCode || '', 24).toUpperCase(),
    roomVisibility: sanitizeText(base.roomVisibility || '', 24).toLowerCase(),
    isWeekly: base.isWeekly === true,
    requiresNearbyStart: base.requiresNearbyStart !== false,
    featuredReason: sanitizeText(base.featuredReason || '', 120),
    recommendedScore: finiteNumber(base.recommendedScore, 0),
    legacyGameMode: sanitizeText(base.legacyGameMode || '', 40).toLowerCase(),
    previewRoute: route.map((anchor) => ({ id: anchor.id, x: anchor.x, y: anchor.y, z: anchor.z, label: anchor.label, typeId: anchor.typeId }))
  };
  record.categoryId = sanitizeText(base.categoryId || discoveryCategoryForActivity(record), 48).toLowerCase();
  record.badge = discoveryBadgeForActivity(record);
  record.icon = discoveryIconForActivity(record);
  record.color = discoveryColorForActivity(record);
  record.markerShape = discoveryMarkerShape(record);
  return record;
}

function nearbyInterestingPlaces(maxDistance = 1500) {
  const ref = currentReferencePose();
  const items = [];
  const pushPlace = (sourceType, item, icon, category) => {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return;
    const distance = distanceToRef(ref, item);
    if (distance <= 80 || distance > maxDistance) return;
    items.push({
      sourceType,
      name: sanitizeText(item.name || item.address || category || 'Location', 120),
      category: sanitizeText(item.category || category || '', 48),
      icon,
      distance,
      x: finiteNumber(item.x, 0),
      y: finiteNumber(item.y, 0),
      z: finiteNumber(item.z, 0)
    });
  };
  (Array.isArray(appCtx.historicSites) ? appCtx.historicSites : []).forEach((site) => pushPlace('historic', site, '⛩', 'Historic'));
  (Array.isArray(appCtx.pois) ? appCtx.pois : []).forEach((poi) => pushPlace('poi', poi, poi.icon || '📍', poi.category || 'POI'));
  return items.sort((a, b) => a.distance - b.distance).slice(0, 16);
}

function resolveRoadSupport(x, z) {
  if (typeof appCtx.findNearestRoad !== 'function') return null;
  const nearest = appCtx.findNearestRoad(x, z);
  if (!nearest?.road) return null;
  return {
    x: finiteNumber(nearest.pt?.x, x),
    z: finiteNumber(nearest.pt?.z, z),
    y: finiteNumber(appCtx.GroundHeight?.roadSurfaceY?.(nearest.pt?.x, nearest.pt?.z), finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(x, z), 0))
  };
}

function resolveWalkSupport(x, z) {
  const info = typeof appCtx.findNearestTraversalFeature === 'function'
    ? appCtx.findNearestTraversalFeature(x, z, { mode: 'walk', maxDistance: 36 })
    : null;
  const point = info?.pt || info?.feature?.pts?.[0] || { x, z };
  const y = finiteNumber(appCtx.GroundHeight?.walkSurfaceY?.(point.x, point.z), finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(point.x, point.z), 0));
  return { x: finiteNumber(point.x, x), y, z: finiteNumber(point.z, z) };
}

function buildDrivingActivity(ref) {
  const landmarks = nearbyInterestingPlaces(1600);
  const target = landmarks.find((item) => item.distance >= 260) || null;
  const roadStart = resolveRoadSupport(ref.x, ref.z);
  const roadFinish = target ? resolveRoadSupport(target.x, target.z) : null;
  if (!roadStart || !roadFinish || !target) return null;
  const midRoad = resolveRoadSupport((roadStart.x + roadFinish.x) * 0.5, (roadStart.z + roadFinish.z) * 0.5) || roadFinish;
  return buildActivityRecord({
    id: `generated_drive_${Math.round(roadFinish.x)}_${Math.round(roadFinish.z)}`,
    sourceType: 'generated',
    subtype: 'route',
    templateId: 'driving_route',
    title: 'Street Race',
    description: `A clean road race from your current street toward ${target.name}.`,
    creatorId: CREATOR_SYSTEM_USER_ID,
    creatorName: 'World Explorer',
    visibility: 'public',
    featured: target.distance > 700,
    featuredReason: target.distance > 700 ? 'A longer local route with a clear destination.' : '',
    locationLabel: target.name,
    anchors: [
      buildAnchor('start', 'Start', roadStart.x, roadStart.y, roadStart.z, { environment: 'road' }),
      buildAnchor('checkpoint', 'Midpoint', midRoad.x, midRoad.y, midRoad.z, { environment: 'road' }),
      buildAnchor('finish', target.name, roadFinish.x, roadFinish.y, roadFinish.z, { environment: 'road' })
    ],
    recommendedScore: 72
  }, ref);
}

function buildWalkingActivity(ref) {
  const places = nearbyInterestingPlaces(900);
  if (places.length < 1) return null;
  const walkStart = resolveWalkSupport(ref.x, ref.z);
  const first = resolveWalkSupport(places[0].x, places[0].z);
  const second = resolveWalkSupport((places[1] || places[0]).x, (places[1] || places[0]).z);
  return buildActivityRecord({
    id: `generated_walk_${Math.round(first.x)}_${Math.round(first.z)}`,
    sourceType: 'generated',
    subtype: 'exploration',
    templateId: 'walking_route',
    title: 'City Walk',
    description: `A short on-foot route through nearby places around ${places[0].name}.`,
    creatorId: CREATOR_SYSTEM_USER_ID,
    creatorName: 'World Explorer',
    visibility: 'public',
    locationLabel: places[0].name,
    anchors: [
      buildAnchor('start', 'Start', walkStart.x, walkStart.y, walkStart.z, { environment: 'walk' }),
      buildAnchor('checkpoint', places[0].name, first.x, first.y, first.z, { environment: 'walk' }),
      buildAnchor('finish', places[1]?.name || 'Finish', second.x, second.y, second.z, { environment: 'walk' })
    ],
    recommendedScore: 66
  }, ref);
}

function buildRooftopActivity(ref) {
  const buildings = (Array.isArray(appCtx.buildings) ? appCtx.buildings : [])
    .filter((building) => Number.isFinite(building?.centerX) && Number.isFinite(building?.centerZ) && finiteNumber(building?.height, 0) >= 14)
    .map((building) => ({
      x: finiteNumber(building.centerX, 0),
      z: finiteNumber(building.centerZ, 0),
      y: finiteNumber(building.baseY, 0) + finiteNumber(building.height, 0),
      distance: Math.hypot(finiteNumber(building.centerX, 0) - ref.x, finiteNumber(building.centerZ, 0) - ref.z)
    }))
    .filter((building) => building.distance > 70 && building.distance < 650)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  if (buildings.length < 3) return null;
  return buildActivityRecord({
    id: `generated_roof_${Math.round(buildings[0].x)}_${Math.round(buildings[0].z)}`,
    sourceType: 'generated',
    subtype: 'rooftop',
    templateId: 'rooftop_run',
    title: 'Roof Run',
    description: 'A short elevated run across nearby roofs with clearer parkour-style movement.',
    creatorId: CREATOR_SYSTEM_USER_ID,
    creatorName: 'World Explorer',
    visibility: 'public',
    featured: true,
    featuredReason: 'A vertical activity built from nearby rooftop geometry.',
    locationLabel: appCtx.customLoc?.name || appCtx.LOCS?.[appCtx.selLoc]?.name || 'Current City',
    anchors: [
      buildAnchor('start', 'Roof Start', buildings[0].x, buildings[0].y, buildings[0].z, { environment: 'rooftop' }),
      buildAnchor('checkpoint', 'Roof Transfer', buildings[1].x, buildings[1].y, buildings[1].z, { environment: 'rooftop' }),
      buildAnchor('finish', 'Roof Finish', buildings[2].x, buildings[2].y, buildings[2].z, { environment: 'rooftop' })
    ],
    recommendedScore: 80
  }, ref);
}

function buildDroneActivity(ref) {
  const radius = 160;
  const baseY = Math.max(finiteNumber(ref.y, 18), finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(ref.x, ref.z), 0) + 64);
  const points = [0, Math.PI * 0.5, Math.PI].map((angle, index) => ({
    x: ref.x + Math.cos(angle) * radius,
    y: baseY + 18 + index * 8,
    z: ref.z + Math.sin(angle) * radius
  }));
  return buildActivityRecord({
    id: `generated_drone_${Math.round(ref.x)}_${Math.round(ref.z)}`,
    sourceType: 'generated',
    subtype: 'survey',
    templateId: 'drone_course',
    title: 'Drone Run',
    description: 'A quick aerial run above the current district for scouting and flying practice.',
    creatorId: CREATOR_SYSTEM_USER_ID,
    creatorName: 'World Explorer',
    visibility: 'public',
    locationLabel: appCtx.customLoc?.name || appCtx.LOCS?.[appCtx.selLoc]?.name || 'Current City',
    anchors: [
      buildAnchor('start', 'Launch', ref.x, baseY, ref.z, { environment: 'air' }),
      buildAnchor('checkpoint', 'Survey A', points[0].x, points[0].y, points[0].z, { environment: 'air' }),
      buildAnchor('checkpoint', 'Survey B', points[1].x, points[1].y, points[1].z, { environment: 'air' }),
      buildAnchor('finish', 'Survey End', points[2].x, points[2].y, points[2].z, { environment: 'air' })
    ],
    recommendedScore: 58
  }, ref);
}

function buildBoatActivity(ref) {
  if (typeof appCtx.inspectBoatCandidate !== 'function') return null;
  const candidate = appCtx.inspectBoatCandidate(ref.x, ref.z, 420, { allowSynthetic: false, waterKind: 'coastal' });
  if (!candidate) return null;
  const startX = finiteNumber(candidate.spawnX, ref.x);
  const startZ = finiteNumber(candidate.spawnZ, ref.z);
  const startY = finiteNumber(candidate.surfaceY, finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(startX, startZ), 0));
  const courseRadius = candidate.waterKind === 'open_ocean' ? 260 : candidate.waterKind === 'coastal' ? 180 : 110;
  const points = [
    { x: startX + courseRadius, z: startZ },
    { x: startX, z: startZ + courseRadius * 0.72 },
    { x: startX - courseRadius * 0.66, z: startZ + courseRadius * 0.1 }
  ];
  return buildActivityRecord({
    id: `generated_boat_${Math.round(startX)}_${Math.round(startZ)}`,
    sourceType: 'generated',
    subtype: 'route',
    templateId: 'boat_course',
    title: candidate.waterKind === 'harbor' ? 'Harbor Run' : 'Boat Run',
    description: 'A surface-water route tuned to the local shoreline and boat-friendly water nearby.',
    creatorId: CREATOR_SYSTEM_USER_ID,
    creatorName: 'World Explorer',
    visibility: 'public',
    featured: candidate.waterKind === 'open_ocean' || candidate.waterKind === 'coastal',
    featuredReason: candidate.waterKind === 'harbor' ? '' : 'Local water geometry supports a stronger boat route.',
    locationLabel: candidate.label || 'Water Activity',
    anchors: [
      buildAnchor('start', 'Launch', startX, startY, startZ, { environment: 'water_surface' }),
      buildAnchor('checkpoint', 'Gate 1', points[0].x, startY, points[0].z, { environment: 'water_surface' }),
      buildAnchor('checkpoint', 'Gate 2', points[1].x, startY, points[1].z, { environment: 'water_surface' }),
      buildAnchor('finish', 'Finish', points[2].x, startY, points[2].z, { environment: 'water_surface' })
    ],
    recommendedScore: 76
  }, ref);
}

function buildFishingActivity(ref) {
  if (typeof appCtx.inspectBoatCandidate !== 'function') return null;
  const candidate = appCtx.inspectBoatCandidate(ref.x, ref.z, 320, { allowSynthetic: false, waterKind: 'harbor' });
  if (!candidate) return null;
  const startX = finiteNumber(candidate.spawnX, ref.x);
  const startZ = finiteNumber(candidate.spawnZ, ref.z);
  const surfaceY = finiteNumber(candidate.surfaceY, finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(startX, startZ), 0));
  const zoneX = startX + 38;
  const zoneZ = startZ + 24;
  return buildActivityRecord({
    id: `generated_fishing_${Math.round(startX)}_${Math.round(startZ)}`,
    sourceType: 'generated',
    subtype: 'fishing',
    templateId: 'fishing_trip',
    traversalMode: 'boat',
    title: 'Fishing Trip',
    description: 'A calm dock-to-zone fishing game with a clear casting area and return point.',
    creatorId: CREATOR_SYSTEM_USER_ID,
    creatorName: 'World Explorer',
    visibility: 'public',
    locationLabel: candidate.label || 'Water Activity',
    anchors: [
      buildAnchor('start', 'Dock Start', startX, surfaceY, startZ, { environment: 'dock' }),
      buildAnchor('fishing_zone', 'Casting Zone', zoneX, surfaceY, zoneZ, { environment: 'water_surface', radius: 24 }),
      buildAnchor('dock_point', 'Return Dock', startX - 12, surfaceY, startZ + 10, { environment: 'dock' })
    ],
    recommendedScore: 52
  }, ref);
}

function buildLegacyModeActivities(ref) {
  const roadStart = resolveRoadSupport(ref.x, ref.z);
  const walkStart = resolveWalkSupport(ref.x, ref.z);
  const sharedLocationLabel = appCtx.customLoc?.name || appCtx.LOCS?.[appCtx.selLoc]?.name || 'Current City';
  const drivingPoint = roadStart || {
    x: ref.x,
    y: finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(ref.x, ref.z), ref.y),
    z: ref.z
  };
  const walkingPoint = walkStart || {
    x: ref.x,
    y: finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(ref.x, ref.z), ref.y),
    z: ref.z
  };
  return [
    buildActivityRecord({
      id: `legacy_trial_${Math.round(drivingPoint.x)}_${Math.round(drivingPoint.z)}`,
      sourceType: 'generated',
      subtype: 'legacy_mode',
      templateId: 'driving_route',
      title: 'Time Trial',
      description: 'Legacy destination race mode. Spawn into the current district and race to the target as fast as possible.',
      creatorId: CREATOR_SYSTEM_USER_ID,
      creatorName: 'World Explorer',
      visibility: 'public',
      featured: true,
      featuredReason: 'Classic built-in game mode.',
      locationLabel: sharedLocationLabel,
      startPoint: drivingPoint,
      center: drivingPoint,
      anchors: [buildAnchor('start', 'Start', drivingPoint.x, drivingPoint.y, drivingPoint.z, { environment: 'road' })],
      traversalMode: 'drive',
      requiresNearbyStart: false,
      estimatedMinutes: 4,
      difficulty: 'Moderate',
      recommendedScore: 82,
      legacyGameMode: 'trial'
    }, ref),
    buildActivityRecord({
      id: `legacy_checkpoint_${Math.round(drivingPoint.x)}_${Math.round(drivingPoint.z)}`,
      sourceType: 'generated',
      subtype: 'legacy_mode',
      templateId: 'driving_route',
      title: 'Checkpoints',
      description: 'Legacy checkpoint collection mode. Start instantly and sweep the marker field across the loaded area.',
      creatorId: CREATOR_SYSTEM_USER_ID,
      creatorName: 'World Explorer',
      visibility: 'public',
      locationLabel: sharedLocationLabel,
      startPoint: drivingPoint,
      center: drivingPoint,
      anchors: [buildAnchor('start', 'Start', drivingPoint.x, drivingPoint.y, drivingPoint.z, { environment: 'road' })],
      traversalMode: 'drive',
      requiresNearbyStart: false,
      estimatedMinutes: 5,
      difficulty: 'Moderate',
      recommendedScore: 78,
      legacyGameMode: 'checkpoint'
    }, ref),
    buildActivityRecord({
      id: `legacy_painttown_${Math.round(drivingPoint.x)}_${Math.round(drivingPoint.z)}`,
      sourceType: 'generated',
      subtype: 'legacy_mode',
      templateId: 'driving_route',
      title: 'Paint the Town Red',
      description: 'Legacy building-claim mode. Start directly in the current district and paint the city as fast as you can.',
      creatorId: CREATOR_SYSTEM_USER_ID,
      creatorName: 'World Explorer',
      visibility: 'public',
      locationLabel: sharedLocationLabel,
      startPoint: drivingPoint,
      center: drivingPoint,
      anchors: [buildAnchor('start', 'Start', drivingPoint.x, drivingPoint.y, drivingPoint.z, { environment: 'road' })],
      traversalMode: 'drive',
      requiresNearbyStart: false,
      estimatedMinutes: 5,
      difficulty: 'Hard',
      recommendedScore: 80,
      legacyGameMode: 'painttown'
    }, ref),
    buildActivityRecord({
      id: `legacy_police_${Math.round(drivingPoint.x)}_${Math.round(drivingPoint.z)}`,
      sourceType: 'generated',
      subtype: 'legacy_mode',
      templateId: 'driving_route',
      title: 'Police Chase',
      description: 'Legacy pursuit mode. Start immediately with the police chase enabled and survive as long as you can.',
      creatorId: CREATOR_SYSTEM_USER_ID,
      creatorName: 'World Explorer',
      visibility: 'public',
      featured: true,
      featuredReason: 'Classic built-in game mode.',
      locationLabel: sharedLocationLabel,
      startPoint: drivingPoint,
      center: drivingPoint,
      anchors: [buildAnchor('start', 'Start', drivingPoint.x, drivingPoint.y, drivingPoint.z, { environment: 'road' })],
      traversalMode: 'drive',
      requiresNearbyStart: false,
      estimatedMinutes: 4,
      difficulty: 'Hard',
      recommendedScore: 84,
      legacyGameMode: 'police'
    }, ref),
    buildActivityRecord({
      id: `legacy_flower_${Math.round(walkingPoint.x)}_${Math.round(walkingPoint.z)}`,
      sourceType: 'generated',
      subtype: 'legacy_mode',
      templateId: 'collectible_hunt',
      title: 'Find the Flower',
      description: 'Legacy red flower hunt. Start instantly and race for the fastest flower find in the current area.',
      creatorId: CREATOR_SYSTEM_USER_ID,
      creatorName: 'World Explorer',
      visibility: 'public',
      featured: true,
      featuredReason: 'Classic built-in challenge.',
      locationLabel: sharedLocationLabel,
      startPoint: walkingPoint,
      center: walkingPoint,
      anchors: [buildAnchor('start', 'Start', walkingPoint.x, walkingPoint.y, walkingPoint.z, { environment: 'walk' })],
      traversalMode: 'walk',
      requiresNearbyStart: false,
      estimatedMinutes: 3,
      difficulty: 'Easy',
      recommendedScore: 86,
      legacyGameMode: 'flower'
    }, ref)
  ].filter(Boolean);
}

function buildGeneratedActivities(ref) {
  return [
    ...buildLegacyModeActivities(ref),
    buildDrivingActivity(ref),
    buildWalkingActivity(ref),
    buildRooftopActivity(ref),
    buildDroneActivity(ref),
    buildBoatActivity(ref),
    buildFishingActivity(ref)
  ].filter(Boolean);
}

function buildRoomActivities(ref) {
  const roomState = appCtx.multiplayerMapRooms || {};
  const allRooms = [
    ...(Array.isArray(roomState.publicRooms) ? roomState.publicRooms : []),
    ...(roomState.signedIn && Array.isArray(roomState.userRooms) ? roomState.userRooms : [])
  ];
  const seen = new Set();
  return allRooms.map((room) => {
    const code = sanitizeText(room.code || '', 24).toUpperCase();
    if (!code || seen.has(code)) return null;
    seen.add(code);
    if (!Number.isFinite(room.lat) || !Number.isFinite(room.lon)) return null;
    const point = typeof appCtx.geoToWorld === 'function'
      ? appCtx.geoToWorld(Number(room.lat), Number(room.lon))
      : { x: 0, z: 0 };
    const y = finiteNumber(appCtx.elevationWorldYAtWorldXZ?.(point.x, point.z), 0);
    return buildActivityRecord({
      id: `room_${code.toLowerCase()}`,
      sourceType: 'room',
      subtype: 'room',
      title: sanitizeText(room.name || room.locationLabel || `Room ${code}`, 120),
      description: room.isWeekly
        ? 'A weekly featured multiplayer room tied to a real location in the world.'
        : 'A shared multiplayer room you can join directly from the world.',
      creatorId: sanitizeText(room.ownerUid || room.createdBy || '', 160),
      creatorName: sanitizeText(room.ownerName || room.hostName || room.createdByName || 'Room Host', 80),
      creatorAvatar: sanitizeText(room.creatorAvatar || '🌐', 12) || '🌐',
      visibility: sanitizeText(room.visibility || room.type || 'public', 24).toLowerCase() === 'private' ? 'private' : 'public',
      featured: room.isWeekly === true || room.type === 'public',
      featuredReason: room.isWeekly ? 'Weekly featured room.' : '',
      traversalMode: ref.mode,
      locationLabel: sanitizeText(room.locationLabel || room.name || code, 120),
      roomCode: code,
      roomVisibility: sanitizeText(room.visibility || room.type || 'public', 24).toLowerCase(),
      isWeekly: room.isWeekly === true,
      playerMode: 'multiplayer',
      status: sanitizeText(room.visibility || room.type || 'public', 24).toLowerCase() === 'private' ? 'private' : 'published',
      startPoint: { x: point.x, y, z: point.z },
      center: { x: point.x, y, z: point.z },
      anchors: [buildAnchor('start', sanitizeText(room.name || code, 80), point.x, y, point.z, { environment: 'terrain' })],
      requiresNearbyStart: false,
      estimatedMinutes: 10,
      difficulty: 'Open'
    }, ref);
  }).filter(Boolean);
}

function buildCurrentRoomActivities(ref) {
  const currentRoom = typeof appCtx.getCurrentMultiplayerRoom === 'function'
    ? appCtx.getCurrentMultiplayerRoom()
    : null;
  const roomCode = sanitizeText(currentRoom?.code || '', 24).toUpperCase();
  if (!roomCode) return [];
  const rows = Array.isArray(appCtx.multiplayerRoomActivities) ? appCtx.multiplayerRoomActivities : [];
  return rows.map((activity) => buildActivityRecord({
    ...activity,
    id: sanitizeText(activity.id || '', 120).toLowerCase(),
    sourceType: 'room_activity',
    subtype: 'room_activity',
    roomCode,
    visibility: 'room',
    status: 'published',
    playerMode: 'multiplayer',
    creatorAvatar: activity.creatorAvatar || '👥',
    featured: sanitizeText(appCtx.multiplayerActiveRoomActivity?.activityId || '', 120).toLowerCase() === sanitizeText(activity.id || '', 120).toLowerCase(),
    featuredReason: sanitizeText(appCtx.multiplayerActiveRoomActivity?.activityId || '', 120).toLowerCase() === sanitizeText(activity.id || '', 120).toLowerCase()
      ? 'Currently running in this room.'
      : '',
    requiresNearbyStart: false,
    recommendedScore: 86
  }, ref)).filter(Boolean);
}

function buildCreatorActivities(ref) {
  return listStoredActivities().map((activity) => buildActivityRecord({
    ...activity,
    sourceType: 'creator',
    featured: false,
    playerMode: 'solo',
    requiresNearbyStart: true,
    recommendedScore: 64
  }, ref));
}

function buildActivityCatalog() {
  const ref = currentReferencePose();
  const items = [
    ...buildGeneratedActivities(ref),
    ...buildCreatorActivities(ref),
    ...buildCurrentRoomActivities(ref),
    ...buildRoomActivities(ref)
  ];
  return items
    .sort((a, b) => {
      const scoreA = finiteNumber(a.recommendedScore, 0) + (a.featured ? 24 : 0) - finiteNumber(a.distanceMeters, 0) * 0.03;
      const scoreB = finiteNumber(b.recommendedScore, 0) + (b.featured ? 24 : 0) - finiteNumber(b.distanceMeters, 0) * 0.03;
      return scoreB - scoreA;
    })
    .slice(0, 36);
}

export {
  buildActivityCatalog,
  buildActivityRecord,
  currentReferencePose,
  worldToGeo
};
