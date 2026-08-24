import {
  createAuxiliaryRenderer,
  disposeThreeObjectTree,
  disposeThreeRenderer
} from '../../engine/webgl-lifecycle.js?v=1';
import { latLonToLocalPoint, localPointToLatLon } from './helpers.js?v=9';
import { createGlobeBasemapTiles } from './basemap-tiles.js?v=1';

export function createGlobeSelectorScene(options = {}) {
  const {
    appCtx,
    canvas,
    stage,
    zoomInBtn,
    zoomOutBtn,
    scaleReadout,
    mapBasemapBtn,
    satelliteBasemapBtn,
    basemapAttribution,
    placeReadout,
    getActiveCityTab,
    getPanelMode,
    getOpenState,
    cityMatchesSelection,
    onFavoritePick,
    onFavoriteActivate,
    onGlobePick
  } = options;

  let sceneReady = false;
  let renderLoopId = 0;
  let scene = null;
  let camera = null;
  let renderer = null;
  let globeRoot = null;
  let earthMesh = null;
  let markerMesh = null;
  let raycaster = null;
  let favoriteMarkerGroup = null;
  let favoriteMarkerGeometry = null;
  let menuFavoriteMaterial = null;
  let savedFavoriteMaterial = null;
  let favoriteMarkerNodes = [];
  let basemapTiles = null;
  let cameraDistance = 2.8;
  let targetCameraDistance = 2.8;
  let pointerActive = false;
  let pointerDragDistance = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownTime = 0;
  let dragLastX = 0;
  let dragLastY = 0;
  let eventsBound = false;
  let pinchStartDistance = 0;
  let pinchStartAltitude = 0;
  let gestureHadPinch = false;
  const activePointers = new Map();

  const earthRadiusMeters = 6371008.8;
  const minDistance = 1.00012;
  const maxDistance = 4.4;
  const minimumAltitude = minDistance - 1;

  function worldUnitsPerPixel(surfaceRadius = 1) {
    if (!camera || !canvas) return 0.006 / 7;
    const rect = canvas.getBoundingClientRect();
    if (!rect.height) return 0.006 / 7;
    const depth = Math.max(minimumAltitude * 0.25, cameraDistance - Number(surfaceRadius || 1));
    return 2 * depth * Math.tan((camera.fov * Math.PI / 180) * 0.5) / rect.height;
  }

  function getZoomState() {
    const altitude = Math.max(minimumAltitude, cameraDistance - 1);
    const spanMeters = worldUnitsPerPixel(1) * Math.max(1, canvas?.getBoundingClientRect?.().height || 1) * earthRadiusMeters;
    const level = spanMeters <= 1000 ? 'camera' : spanMeters <= 10000 ? 'local' : spanMeters <= 100000 ? 'city' : spanMeters <= 1000000 ? 'regional' : 'global';
    return {
      cameraDistance,
      altitudeEarthRadii: altitude,
      altitudeMeters: altitude * earthRadiusMeters,
      verticalSpanMeters: spanMeters,
      level
    };
  }

  function formatScaleReadout() {
    const { verticalSpanMeters, level } = getZoomState();
    if (level === 'global') return verticalSpanMeters >= 6000000 ? 'Global view' : `~${Math.round(verticalSpanMeters / 100000) * 100} km`;
    if (verticalSpanMeters >= 100000) return `~${Math.round(verticalSpanMeters / 10000) * 10} km`;
    if (verticalSpanMeters >= 10000) return `~${Math.round(verticalSpanMeters / 1000)} km`;
    if (verticalSpanMeters >= 1000) return `~${(verticalSpanMeters / 1000).toFixed(1)} km`;
    return `~${Math.max(10, Math.round(verticalSpanMeters / 10) * 10)} m`;
  }

  function updateZoomUi() {
    if (scaleReadout) scaleReadout.textContent = formatScaleReadout();
    if (zoomInBtn) zoomInBtn.disabled = targetCameraDistance <= minDistance * 1.0000001;
    if (zoomOutBtn) zoomOutBtn.disabled = targetCameraDistance >= maxDistance * 0.9999999;
  }

  function getMarkerScale() {
    return Math.max(0.0001, Math.min(1, worldUnitsPerPixel(1.00002) * 7 / 0.018));
  }

  function applyMarkerScales() {
    const zoomScale = getMarkerScale();
    if (markerMesh) markerMesh.scale.setScalar(zoomScale);
    favoriteMarkerNodes.forEach((entry) => {
      const selectedScale = cityMatchesSelection(entry.city) ? 1.26 : 1;
      entry.mesh.scale.setScalar(selectedScale * zoomScale);
    });
  }

  function ensureSize() {
    if (!renderer || !camera) return;
    const bounds = stage?.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds?.width || canvas.clientWidth || 1));
    const height = Math.max(1, Math.floor(bounds?.height || canvas.clientHeight || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    applyMarkerScales();
    updateZoomUi();
    basemapTiles?.update?.(true);
  }

  function getViewCenter() {
    if (!globeRoot || typeof THREE === 'undefined') return { lat: 0, lon: 0 };
    const inverseRotation = globeRoot.quaternion.clone().invert();
    return localPointToLatLon(new THREE.Vector3(0, 0, 1).applyQuaternion(inverseRotation));
  }

  function renderFrame() {
    if (!getOpenState()) return;
    appCtx.liveEarth?.updateSelectorFrame?.();
    basemapTiles?.update?.();
    applyMarkerScales();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function updateCameraZoom() {
    const currentAltitude = Math.max(minimumAltitude, cameraDistance - 1);
    const targetAltitude = Math.max(minimumAltitude, targetCameraDistance - 1);
    const logDelta = Math.log(targetAltitude) - Math.log(currentAltitude);
    let changed = false;
    if (Math.abs(logDelta) < 0.0015) {
      if (cameraDistance !== targetCameraDistance) {
        cameraDistance = targetCameraDistance;
        changed = true;
      }
    } else {
      cameraDistance = 1 + Math.exp(Math.log(currentAltitude) + logDelta * 0.2);
      changed = true;
    }
    if (camera && changed) {
      camera.position.z = cameraDistance;
      const nextNear = Math.max(0.000004, Math.min(0.02, (cameraDistance - 1) * 0.075));
      if (Math.abs(camera.near - nextNear) > nextNear * 0.02) {
        camera.near = nextNear;
        camera.updateProjectionMatrix();
      }
      updateZoomUi();
    }
  }

  function loopRender() {
    if (!getOpenState()) {
      renderLoopId = 0;
      return;
    }
    updateCameraZoom();
    renderFrame();
    renderLoopId = requestAnimationFrame(loopRender);
  }

  function startRenderLoop() {
    if (renderLoopId || !sceneReady) return;
    renderLoopId = requestAnimationFrame(loopRender);
  }

  function stopRenderLoop() {
    if (!renderLoopId) return;
    cancelAnimationFrame(renderLoopId);
    renderLoopId = 0;
  }

  function setFavoriteMarkersVisible(visible) {
    if (favoriteMarkerGroup) favoriteMarkerGroup.visible = !!visible;
  }

  function renderFavoriteMarkers(favorites = []) {
    if (!favoriteMarkerGroup || !favoriteMarkerGeometry || !menuFavoriteMaterial || !savedFavoriteMaterial) return;
    while (favoriteMarkerGroup.children.length) {
      favoriteMarkerGroup.remove(favoriteMarkerGroup.children[0]);
    }
    favoriteMarkerNodes = [];
    favorites.forEach((city) => {
      const marker = new THREE.Mesh(
        favoriteMarkerGeometry,
        city.source === 'saved' ? savedFavoriteMaterial : menuFavoriteMaterial
      );
      const position = latLonToLocalPoint(city.lat, city.lon, 1.018);
      marker.position.set(position.x, position.y, position.z);
      marker.userData.favoriteCity = city;
      favoriteMarkerGroup.add(marker);
      favoriteMarkerNodes.push({ city, mesh: marker });
    });
    applyMarkerScales();
    setFavoriteMarkersVisible(getActiveCityTab() === 'favorites');
  }

  function focusOnSelection(lat, lon) {
    if (!globeRoot) return;
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    globeRoot.rotation.y = -(lonRad + Math.PI * 0.5);
    globeRoot.rotation.x = Math.max(-1.2, Math.min(1.2, latRad));
    renderFrame();
  }

  function setSelectionMarker(selected) {
    if (!markerMesh) return;
    if (!selected) {
      markerMesh.visible = false;
      return;
    }
    const point = latLonToLocalPoint(selected.lat, selected.lon, 1.02);
    markerMesh.position.set(point.x, point.y, point.z);
    markerMesh.visible = getPanelMode() !== 'live-earth';
    applyMarkerScales();
    renderFrame();
  }

  function setCameraDistance(nextDistance, options = {}) {
    if (!Number.isFinite(nextDistance)) return;
    targetCameraDistance = Math.max(minDistance, Math.min(maxDistance, Number(nextDistance)));
    if (options.immediate !== false) cameraDistance = targetCameraDistance;
    if (camera) {
      camera.position.z = cameraDistance;
      camera.near = Math.max(0.000004, Math.min(0.02, (cameraDistance - 1) * 0.075));
      camera.updateProjectionMatrix();
      updateZoomUi();
      renderFrame();
    }
  }

  function getCameraDistance() {
    return cameraDistance;
  }

  function getRenderStats() {
    const render = renderer?.info?.render;
    return render ? {
      calls: Number(render.calls) || 0,
      triangles: Number(render.triangles) || 0,
      points: Number(render.points) || 0,
      lines: Number(render.lines) || 0
    } : null;
  }

  function getBasemapState() {
    return basemapTiles?.getState?.() || null;
  }

  function setBasemap(mode) {
    basemapTiles?.setMode?.(mode);
  }

  function getPointHitThresholdWorld(targetPixels = 7, surfaceRadius = 1.000025) {
    return Math.max(0.0000001, Math.min(0.018, worldUnitsPerPixel(surfaceRadius) * Math.max(3, Number(targetPixels) || 7)));
  }

  function projectLatLonToClient(lat, lon, radius = 1.00004) {
    if (!camera || !globeRoot || !canvas || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    globeRoot.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const local = latLonToLocalPoint(Number(lat), Number(lon), Number(radius) || 1.00004);
    const projected = new THREE.Vector3(local.x, local.y, local.z)
      .applyMatrix4(globeRoot.matrixWorld)
      .project(camera);
    return {
      x: rect.left + (projected.x + 1) * 0.5 * rect.width,
      y: rect.top + (1 - projected.y) * 0.5 * rect.height,
      depth: projected.z,
      visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1
    };
  }

  function handlePick(clientX, clientY, activate = false) {
    if (!renderer || !camera || !raycaster || !earthMesh) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    raycaster.setFromCamera({
      x: (clientX - rect.left) / rect.width * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1
    }, camera);

    if (getActiveCityTab() === 'favorites' && favoriteMarkerNodes.length > 0) {
      const markerHit = raycaster.intersectObjects(favoriteMarkerNodes.map((entry) => entry.mesh), false)?.[0];
      const favoriteCity = markerHit?.object?.userData?.favoriteCity;
      if (favoriteCity) {
        if (activate) onFavoriteActivate?.(favoriteCity);
        else onFavoritePick(favoriteCity);
        return;
      }
    }
    if (appCtx.liveEarth?.handleGlobePick?.(raycaster)) return;
    const hit = raycaster.intersectObject(earthMesh, false)?.[0];
    if (!hit) return;
    const localPoint = hit.point.clone();
    earthMesh.worldToLocal(localPoint);
    onGlobePick(localPointToLatLon(localPoint), { activate });
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    canvas.addEventListener('pointerdown', (event) => {
      if (activePointers.size === 0) gestureHadPinch = false;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);
      if (activePointers.size >= 2) {
        const [first, second] = [...activePointers.values()];
        pinchStartDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        pinchStartAltitude = Math.max(minimumAltitude, targetCameraDistance - 1);
        gestureHadPinch = true;
        pointerActive = false;
        pointerDragDistance = 8;
        return;
      }
      pointerActive = true;
      pointerDragDistance = 0;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      pointerDownTime = performance.now();
      dragLastX = event.clientX;
      dragLastY = event.clientY;
    });
    canvas.addEventListener('pointermove', (event) => {
      if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size >= 2) {
        const [first, second] = [...activePointers.values()];
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        setCameraDistance(1 + pinchStartAltitude * pinchStartDistance / distance, { immediate: true });
        return;
      }
      if (!pointerActive || !globeRoot) return;
      const dx = event.clientX - dragLastX;
      const dy = event.clientY - dragLastY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      pointerDragDistance += Math.hypot(dx, dy);
      const altitude = Math.max(minimumAltitude, cameraDistance - 1);
      const yawSensitivity = Math.max(0.00000018, Math.min(0.0055, altitude * 0.00265));
      const pitchSensitivity = Math.max(0.00000014, Math.min(0.0038, altitude * 0.0019));
      globeRoot.rotation.y += dx * yawSensitivity;
      globeRoot.rotation.x = Math.max(-1.2, Math.min(1.2, globeRoot.rotation.x + dy * pitchSensitivity));
      renderFrame();
    });
    canvas.addEventListener('pointerup', (event) => {
      const endedPointer = activePointers.get(event.pointerId);
      activePointers.delete(event.pointerId);
      canvas.releasePointerCapture?.(event.pointerId);
      if (gestureHadPinch) {
        if (activePointers.size === 1) {
          const remaining = [...activePointers.values()][0];
          pointerActive = true;
          pointerDragDistance = 8;
          pointerDownX = remaining.x;
          pointerDownY = remaining.y;
          dragLastX = remaining.x;
          dragLastY = remaining.y;
        } else {
          pointerActive = false;
          gestureHadPinch = false;
        }
        return;
      }
      if (!pointerActive || !endedPointer) return;
      pointerActive = false;
      const tapDist = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      const tapTime = performance.now() - pointerDownTime;
      if (pointerDragDistance < 7 && tapDist < 7 && tapTime < 420) handlePick(event.clientX, event.clientY);
    });
    canvas.addEventListener('pointercancel', (event) => {
      activePointers.delete(event.pointerId);
      pointerActive = false;
      if (activePointers.size === 0) gestureHadPinch = false;
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const wheelUnits = Math.max(-2.5, Math.min(2.5, Number(event.deltaY || 0) / 100));
      if (!wheelUnits) return;
      const altitude = Math.max(minimumAltitude, targetCameraDistance - 1);
      setCameraDistance(1 + altitude * Math.exp(wheelUnits * 0.28), { immediate: false });
    }, { passive: false });
    zoomInBtn?.addEventListener('click', () => {
      const altitude = Math.max(minimumAltitude, targetCameraDistance - 1);
      setCameraDistance(1 + altitude * Math.exp(-0.58), { immediate: false });
    });
    zoomOutBtn?.addEventListener('click', () => {
      const altitude = Math.max(minimumAltitude, targetCameraDistance - 1);
      setCameraDistance(1 + altitude * Math.exp(0.58), { immediate: false });
    });
    canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      handlePick(event.clientX, event.clientY, true);
    });
    window.addEventListener('resize', ensureSize);
  }

  function init() {
    if (scene || !canvas || typeof THREE === 'undefined') {
      if (typeof THREE === 'undefined' && placeReadout) {
        placeReadout.textContent = 'Three.js not ready. You can still use manual search.';
      }
      return;
    }
    bindEvents();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.02, 20);
    camera.position.set(0, 0, cameraDistance);
    renderer = createAuxiliaryRenderer({
      canvas,
      pixelRatioCap: 1.5,
      optionsList: [
        { antialias: true, alpha: true, powerPreference: 'low-power' },
        { antialias: false, alpha: true, powerPreference: 'low-power' },
        { antialias: false, alpha: true }
      ]
    });
    if (!renderer) {
      scene = null;
      camera = null;
      if (placeReadout) placeReadout.textContent = '3D globe unavailable on this device. You can still use search and coordinates.';
      return;
    }
    if (typeof renderer.outputColorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (typeof renderer.outputEncoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    scene.add(new THREE.HemisphereLight(0xe7f3ff, 0x8aa6c9, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(2.2, 1.6, 1.3);
    scene.add(sun);
    globeRoot = new THREE.Group();
    scene.add(globeRoot);
    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f6fbb,
      roughness: 0.95,
      metalness: 0,
      emissive: new THREE.Color(0x1b2b44),
      emissiveIntensity: 0.12
    });
    earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), earthMaterial);
    globeRoot.add(earthMesh);
    basemapTiles = createGlobeBasemapTiles({
      THREE,
      globeRoot,
      renderer,
      canvas,
      mapButton: mapBasemapBtn,
      satelliteButton: satelliteBasemapBtn,
      attributionElement: basemapAttribution,
      getZoomState,
      getViewCenter,
      requestRender: renderFrame
    });
    markerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false })
    );
    markerMesh.renderOrder = 4;
    markerMesh.visible = false;
    globeRoot.add(markerMesh);
    favoriteMarkerGroup = new THREE.Group();
    favoriteMarkerGeometry = new THREE.SphereGeometry(0.009, 10, 9);
    menuFavoriteMaterial = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
    savedFavoriteMaterial = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    globeRoot.add(favoriteMarkerGroup);
    try {
      new THREE.TextureLoader().load('/app/assets/textures/earth_atmos_2048.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
          texture.colorSpace = THREE.SRGBColorSpace;
        } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
          texture.encoding = THREE.sRGBEncoding;
        }
        const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.();
        if (Number.isFinite(maxAnisotropy)) texture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
        earthMaterial.map = texture;
        earthMaterial.emissiveMap = texture;
        earthMaterial.emissiveIntensity = 0.28;
        earthMaterial.color.setHex(0xffffff);
        earthMaterial.needsUpdate = true;
        renderFrame();
      });
    } catch {
      // The fallback material remains usable when the texture cannot load.
    }
    raycaster = new THREE.Raycaster();
    sceneReady = true;
    ensureSize();
  }

  function destroy() {
    stopRenderLoop();
    pointerActive = false;
    activePointers.clear();
    favoriteMarkerNodes = [];
    sceneReady = false;
    basemapTiles?.destroy?.();
    basemapTiles = null;
    if (scene) disposeThreeObjectTree(scene);
    renderer = disposeThreeRenderer(renderer);
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    scene = null;
    camera = null;
    globeRoot = null;
    earthMesh = null;
    markerMesh = null;
    raycaster = null;
    favoriteMarkerGroup = null;
    favoriteMarkerGeometry = null;
    menuFavoriteMaterial = null;
    savedFavoriteMaterial = null;
  }

  return {
    destroy,
    ensureSize,
    focusOnSelection,
    getBridgeRefs: () => ({ globeRoot, earthMesh }),
    getCameraDistance,
    getBasemapState,
    getPointHitThresholdWorld,
    getRenderStats,
    getZoomState,
    init,
    projectLatLonToClient,
    renderFavoriteMarkers,
    renderFrame,
    setCameraDistance,
    setBasemap,
    setFavoriteMarkersVisible,
    setSelectionMarker,
    startRenderLoop,
    stopRenderLoop
  };
}
