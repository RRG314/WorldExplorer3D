import { ctx as appCtx } from "../shared-context.js?v=55";
import { escapeHtml, escapeJsString, formatPrice, toFiniteNumber } from "./ui-utils.js?v=1";

export function updateNearbyPOI() {
  const poiInfo = document.getElementById('poiInfo');
  if (!appCtx.poiMode) {
    if (appCtx.nearestPOI) {
      appCtx.nearestPOI = null;
      poiInfo.style.display = 'none';
    }
    return;
  }

  let closest = null;
  let minDist = Infinity;
  appCtx.pois.forEach((poi) => {
    const dx = poi.x - appCtx.car.x;
    const dz = poi.z - appCtx.car.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minDist && dist < 150) {
      minDist = dist;
      closest = { ...poi, dist };
    }
  });

  if (closest && (closest !== appCtx.nearestPOI || Math.abs(closest.dist - appCtx.nearestPOI?.dist) > 5)) {
    appCtx.nearestPOI = closest;
    document.getElementById('poiIcon').textContent = closest.icon;
    document.getElementById('poiName').textContent = closest.name;
    document.getElementById('poiCategory').textContent = closest.category;
    document.getElementById('poiDistance').textContent = Math.floor(closest.dist) + 'm ahead';
    poiInfo.style.display = 'block';
  } else if (!closest && appCtx.nearestPOI) {
    appCtx.nearestPOI = null;
    poiInfo.style.display = 'none';
  }
}

export function closeLegend() {
  document.getElementById('legendPanel').style.display = 'none';
}

function resolveDestinationEntrySupport(destination) {
  if (!destination || typeof appCtx.resolveBuildingEntrySupport !== 'function') return null;
  try {
    return appCtx.resolveBuildingEntrySupport(destination, { allowSynthetic: true });
  } catch (error) {
    console.warn('[Interiors] Failed to resolve destination entry support.', error);
    return null;
  }
}

export function getNavigationTargetForDestination(destination) {
  const support = resolveDestinationEntrySupport(destination);
  if (support?.enterable && support.entryAnchor) {
    return {
      x: toFiniteNumber(support.entryAnchor.x, toFiniteNumber(destination?.x, 0)),
      z: toFiniteNumber(support.entryAnchor.z, toFiniteNumber(destination?.z, 0)),
      support
    };
  }
  return {
    x: toFiniteNumber(destination?.x, 0),
    z: toFiniteNumber(destination?.z, 0),
    support
  };
}

export function describeDestinationEntrySupport(destination) {
  const support = resolveDestinationEntrySupport(destination);
  if (!support?.enterable) return 'Exterior only';
  if (typeof appCtx.summarizeBuildingEntrySupport === 'function') {
    return appCtx.summarizeBuildingEntrySupport(support);
  }
  return 'Enterable';
}

export function renderInteriorLegend() {
  const statusEl = document.getElementById('enterableBuildingsStatus');
  const listEl = document.getElementById('enterableBuildingsList');
  if (!statusEl || !listEl) return;

  const loading = !!appCtx.interiorLegendLoading;
  const items = Array.isArray(appCtx.interiorLegendEntries) ? appCtx.interiorLegendEntries : [];
  const message = String(appCtx.interiorLegendMessage || '').trim();

  if (loading) {
    statusEl.textContent = message || 'Scanning nearby enterable buildings...';
  } else if (message) {
    statusEl.textContent = message;
  } else if (items.length > 0) {
    statusEl.textContent = `Enterable buildings within range: ${items.length}`;
  } else {
    statusEl.textContent = 'No supported buildings identified nearby yet.';
  }

  if (items.length === 0) {
    listEl.innerHTML = '<div style="opacity:0.75">No enterable buildings are cached nearby.</div>';
    return;
  }

  listEl.innerHTML = items.map((item) => {
    const distance = Number.isFinite(item.distance) ? `${Math.round(item.distance)}m` : '';
    const badge = escapeHtml(item.supportType || 'Enterable');
    return `
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid rgba(0,255,255,0.28);border-radius:6px;background:rgba(0,255,255,0.06)">
        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="color:#d9fdff">${escapeHtml(item.label || 'Building')}</span>
          <span style="color:#8ef9ff;font-size:9px;text-transform:uppercase;letter-spacing:0.08em">${badge}</span>
        </div>
        <span style="color:#8ef9ff;white-space:nowrap">${distance}</span>
      </div>
    `;
  }).join('');
}

export function updateMapLayers() {
  appCtx.mapLayers.properties = document.getElementById('filterProperties').checked;
  appCtx.mapLayers.navigation = document.getElementById('filterNavigation').checked;
  appCtx.mapLayers.schools = document.getElementById('filterSchools').checked;
  appCtx.mapLayers.healthcare = document.getElementById('filterHealthcare').checked;
  appCtx.mapLayers.emergency = document.getElementById('filterEmergency').checked;
  appCtx.mapLayers.food = document.getElementById('filterFood').checked;
  appCtx.mapLayers.shopping = document.getElementById('filterShopping').checked;
  appCtx.mapLayers.culture = document.getElementById('filterCulture').checked;
  appCtx.mapLayers.historic = document.getElementById('filterHistoric').checked;
  appCtx.mapLayers.parks = document.getElementById('filterParks').checked;
  appCtx.mapLayers.parking = document.getElementById('filterParking').checked;
  appCtx.mapLayers.fuel = document.getElementById('filterFuel').checked;
  appCtx.mapLayers.banks = document.getElementById('filterBanks').checked;
  appCtx.mapLayers.postal = document.getElementById('filterPostal').checked;
  appCtx.mapLayers.hotels = document.getElementById('filterHotels').checked;
  appCtx.mapLayers.tourism = document.getElementById('filterTourism').checked;
  appCtx.mapLayers.checkpoints = document.getElementById('filterCheckpoints').checked;
  appCtx.mapLayers.destination = document.getElementById('filterDestination').checked;
  appCtx.mapLayers.customTrack = document.getElementById('filterCustomTrack').checked;
  appCtx.mapLayers.activities = document.getElementById('filterActivities')?.checked !== false;
  appCtx.mapLayers.police = document.getElementById('filterPolice').checked;
  appCtx.mapLayers.memoryPins = document.getElementById('filterMemoryPins').checked;
  appCtx.mapLayers.memoryFlowers = document.getElementById('filterMemoryFlowers').checked;
  appCtx.mapLayers.paths = document.getElementById('filterPaths').checked;
  appCtx.mapLayers.interiors = document.getElementById('filterInteriors').checked;
  appCtx.mapLayers.contributions = document.getElementById('filterContributions').checked;
  appCtx.showPathOverlays = appCtx.mapLayers.paths;

  if (typeof appCtx.syncLinearFeatureOverlayVisibility === 'function') {
    appCtx.syncLinearFeatureOverlayVisibility();
  }
  if (typeof appCtx.syncApprovedEditorContributionVisibility === 'function') {
    appCtx.syncApprovedEditorContributionVisibility();
  }

  const allPOIs = appCtx.mapLayers.schools && appCtx.mapLayers.healthcare && appCtx.mapLayers.emergency &&
    appCtx.mapLayers.food && appCtx.mapLayers.shopping && appCtx.mapLayers.culture &&
    appCtx.mapLayers.historic && appCtx.mapLayers.parks && appCtx.mapLayers.parking &&
    appCtx.mapLayers.fuel && appCtx.mapLayers.banks && appCtx.mapLayers.postal &&
    appCtx.mapLayers.hotels && appCtx.mapLayers.tourism;
  document.getElementById('filterPOIsAll').checked = allPOIs;

  const allGameElements = appCtx.mapLayers.checkpoints && appCtx.mapLayers.destination && appCtx.mapLayers.customTrack;
  document.getElementById('filterGameElementsAll').checked = allGameElements;
}

export function toggleAllLayers(state) {
  [
    'filterProperties', 'filterNavigation', 'filterPOIsAll', 'filterSchools', 'filterHealthcare',
    'filterEmergency', 'filterFood', 'filterShopping', 'filterCulture', 'filterHistoric',
    'filterParks', 'filterParking', 'filterFuel', 'filterBanks', 'filterPostal',
    'filterHotels', 'filterTourism', 'filterGameElementsAll', 'filterCheckpoints',
    'filterDestination', 'filterCustomTrack', 'filterPolice', 'filterMemoryPins',
    'filterMemoryFlowers', 'filterRoads', 'filterPaths', 'filterInteriors', 'filterContributions'
  ].forEach((id) => {
    document.getElementById(id).checked = state;
  });
  const filterActivities = document.getElementById('filterActivities');
  if (filterActivities) filterActivities.checked = state;

  appCtx.showRoads = state;
  appCtx.showPathOverlays = state;
  document.getElementById('mapRoadsToggle').classList.toggle('active', state);
  document.getElementById('mapPathsToggle').classList.toggle('active', state);
  const floatRoads = document.getElementById('fRoads');
  const floatPaths = document.getElementById('fPaths');
  if (floatRoads) floatRoads.classList.toggle('on', state);
  if (floatPaths) floatPaths.classList.toggle('on', state);
  if (typeof appCtx.syncLinearFeatureOverlayVisibility === 'function') {
    appCtx.syncLinearFeatureOverlayVisibility();
  }
  updateMapLayers();
}

export function toggleAllPOIs() {
  const state = document.getElementById('filterPOIsAll').checked;
  [
    'filterSchools', 'filterHealthcare', 'filterEmergency', 'filterFood', 'filterShopping',
    'filterCulture', 'filterHistoric', 'filterParks', 'filterParking', 'filterFuel',
    'filterBanks', 'filterPostal', 'filterHotels', 'filterTourism'
  ].forEach((id) => {
    document.getElementById(id).checked = state;
  });
  updateMapLayers();
}

export function toggleAllGameElements() {
  const state = document.getElementById('filterGameElementsAll').checked;
  ['filterCheckpoints', 'filterDestination', 'filterCustomTrack'].forEach((id) => {
    document.getElementById(id).checked = state;
  });
  updateMapLayers();
}

export function toggleRoads() {
  appCtx.showRoads = document.getElementById('filterRoads').checked;
  appCtx.mapLayers.roads = appCtx.showRoads;
  document.getElementById('mapRoadsToggle').classList.toggle('active', appCtx.showRoads);
  const floatRoads = document.getElementById('fRoads');
  if (floatRoads) floatRoads.classList.toggle('on', appCtx.showRoads);
}

export function togglePathOverlays() {
  appCtx.showPathOverlays = document.getElementById('filterPaths').checked;
  appCtx.mapLayers.paths = appCtx.showPathOverlays;
  document.getElementById('mapPathsToggle').classList.toggle('active', appCtx.showPathOverlays);
  const floatPaths = document.getElementById('fPaths');
  if (floatPaths) floatPaths.classList.toggle('on', appCtx.showPathOverlays);
  if (typeof appCtx.syncLinearFeatureOverlayVisibility === 'function') {
    appCtx.syncLinearFeatureOverlayVisibility();
  }
}

export function closeMapInfo() {
  document.getElementById('mapInfoPanel').style.display = 'none';
}

export function navigateToPOI(x, z) {
  appCtx.selectedProperty = null;
  appCtx.selectedHistoric = null;
  appCtx.showNavigation = true;
  createNavigationRoute(appCtx.car.x, appCtx.car.z, x, z);
}

export function clearNavigation() {
  appCtx.selectedProperty = null;
  appCtx.selectedHistoric = null;
  appCtx.showNavigation = false;
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;
  appCtx._navigationRouteState = null;

  if (appCtx.navigationRoute) {
    appCtx.scene.remove(appCtx.navigationRoute);
    appCtx.navigationRoute = null;
  }
  if (appCtx.navigationMarker) {
    appCtx.scene.remove(appCtx.navigationMarker);
    appCtx.navigationMarker = null;
  }

  document.getElementById('navigationHud').style.display = 'none';
}

function currentNavigationMode() {
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') return 'walk';
  return 'drive';
}

function navigationRouteNeedsRebuild(fromX, fromZ, toX, toZ, mode) {
  const previous = appCtx._navigationRouteState;
  if (!previous) return true;
  if (previous.mode !== mode) return true;
  if (!Array.isArray(appCtx.navigationRoutePoints) || appCtx.navigationRoutePoints.length < 2) return true;
  if (Math.hypot(previous.toX - toX, previous.toZ - toZ) > 4) return true;
  const originThreshold = mode === 'walk' ? 10 : 18;
  return Math.hypot(previous.fromX - fromX, previous.fromZ - fromZ) > originThreshold;
}

function navigationSurfaceY(x, z, mode = 'drive') {
  if (!appCtx.SurfaceQuery) return 0;
  const queryMode = mode === 'walk' ? 'walk' : mode === 'drive' ? 'drive' : 'terrain';
  return appCtx.SurfaceQuery.at(x, z, { mode: queryMode }).position.y;
}

function routePointsToWorldVectors(points, mode = 'drive') {
  return points.map((point) => {
    const baseY = navigationSurfaceY(point.x, point.z, mode);
    return new THREE.Vector3(point.x, baseY + 2.3, point.z);
  });
}

export function createNavigationRoute(fromX, fromZ, toX, toZ, forceRebuild = false) {
  const navMode = currentNavigationMode();
  const shouldRebuild = forceRebuild || navigationRouteNeedsRebuild(fromX, fromZ, toX, toZ, navMode);
  if (!shouldRebuild) return;

  let routeData = null;
  if (navMode !== 'drone' && typeof appCtx.findTraversalRoute === 'function') {
    routeData = appCtx.findTraversalRoute(fromX, fromZ, toX, toZ, { mode: navMode });
  }
  if (!routeData || !Array.isArray(routeData.points) || routeData.points.length < 2) {
    routeData = {
      mode: navMode,
      points: [{ x: fromX, z: fromZ }, { x: toX, z: toZ }],
      distance: Math.hypot(toX - fromX, toZ - fromZ)
    };
  }

  appCtx.navigationRoutePoints = routeData.points;
  appCtx.navigationRouteDistance = routeData.distance;
  appCtx._navigationRouteState = { mode: navMode, fromX, fromZ, toX, toZ };

  const worldPoints = routePointsToWorldVectors(routeData.points, navMode);
  if (worldPoints.length < 2) return;

  if (appCtx.navigationRoute) appCtx.scene.remove(appCtx.navigationRoute);
  if (appCtx.navigationMarker) appCtx.scene.remove(appCtx.navigationMarker);

  const curve = new THREE.CatmullRomCurve3(worldPoints);
  const tubularSegments = Math.max(24, (worldPoints.length - 1) * 10);
  const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, 0.3, 8, false);
  const tubeMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.8
  });
  appCtx.navigationRoute = new THREE.Mesh(tubeGeometry, tubeMaterial);
  appCtx.scene.add(appCtx.navigationRoute);

  const markerGroup = new THREE.Group();
  const sphereGeometry = new THREE.SphereGeometry(2, 16, 16);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.7
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.y = 5;
  markerGroup.add(sphere);

  const beamGeometry = new THREE.CylinderGeometry(0.2, 0.2, 20, 8);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.5
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.y = 10;
  markerGroup.add(beam);

  markerGroup.position.set(toX, navigationSurfaceY(toX, toZ, navMode), toZ);
  appCtx.navigationMarker = markerGroup;
  appCtx.scene.add(appCtx.navigationMarker);

  const animateMarker = () => {
    if (appCtx.navigationMarker && appCtx.navigationMarker.parent) {
      const time = Date.now() * 0.003;
      sphere.scale.setScalar(1 + Math.sin(time) * 0.2);
      sphere.material.opacity = 0.5 + Math.sin(time) * 0.2;
      requestAnimationFrame(animateMarker);
    }
  };
  animateMarker();
}

export function updateNavigationRoute() {
  const navHud = document.getElementById('navigationHud');
  if (!appCtx.showNavigation) {
    navHud.style.display = 'none';
    return;
  }

  const destination = appCtx.selectedProperty || appCtx.selectedHistoric;
  if (!destination) return;

  let currentX;
  let currentZ;
  let currentAngle;
  if (appCtx.droneMode) {
    currentX = appCtx.drone.x;
    currentZ = appCtx.drone.z;
    currentAngle = appCtx.drone.yaw;
  } else if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
    currentX = appCtx.Walk.state.walker.x;
    currentZ = appCtx.Walk.state.walker.z;
    currentAngle = appCtx.Walk.state.walker.yaw;
  } else {
    currentX = appCtx.car.x;
    currentZ = appCtx.car.z;
    currentAngle = appCtx.car.angle;
  }

  createNavigationRoute(currentX, currentZ, destination.x, destination.z);

  const routePoints = Array.isArray(appCtx.navigationRoutePoints) ? appCtx.navigationRoutePoints : [];
  const guidancePoint = routePoints.length > 1 && typeof appCtx.pickNavigationTargetPoint === 'function'
    ? appCtx.pickNavigationTargetPoint(currentX, currentZ, routePoints)
    : destination;
  const dx = (guidancePoint?.x ?? destination.x) - currentX;
  const dz = (guidancePoint?.z ?? destination.z) - currentZ;
  const dist = routePoints.length > 1 && typeof appCtx.measureRemainingPolylineDistance === 'function'
    ? appCtx.measureRemainingPolylineDistance(currentX, currentZ, routePoints)
    : Math.hypot(destination.x - currentX, destination.z - currentZ);
  const angleToDestination = Math.atan2(dx, dz);
  let normalizedAngle = angleToDestination - currentAngle;
  while (normalizedAngle > Math.PI) normalizedAngle -= 2 * Math.PI;
  while (normalizedAngle < -Math.PI) normalizedAngle += 2 * Math.PI;
  const arrowRotation = -normalizedAngle * (180 / Math.PI);

  navHud.style.display = 'block';
  document.getElementById('navDestination').textContent =
    appCtx.selectedProperty
      ? appCtx.selectedProperty.address.substring(0, 30)
      : appCtx.selectedHistoric.name.substring(0, 30);
  document.getElementById('navDistance').textContent = dist < 1000 ? Math.floor(dist) + 'm' : (dist / 1000).toFixed(1) + 'km';
  document.getElementById('navDirection').style.transform = `rotate(${arrowRotation}deg)`;
  if (dist < 10) {
    document.getElementById('navDistance').textContent = '✓ Arrived!';
  }
}
