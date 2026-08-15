import {
  createAuxiliaryRenderer,
  disposeThreeObjectTree,
  disposeThreeRenderer
} from '../../engine/webgl-lifecycle.js?v=1';
import { latLonToLocalPoint, localPointToLatLon } from './helpers.js?v=7';

export function createGlobeSelectorScene(options = {}) {
  const {
    appCtx,
    canvas,
    stage,
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

  const minDistance = 1.06;
  const maxDistance = 4.4;

  function getMarkerScale() {
    return Math.max(0.055, Math.min(1, (cameraDistance - 1) * 0.56));
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
  }

  function renderFrame() {
    if (!getOpenState()) return;
    appCtx.liveEarth?.updateSelectorFrame?.();
    applyMarkerScales();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function updateCameraZoom() {
    const delta = targetCameraDistance - cameraDistance;
    let changed = false;
    if (Math.abs(delta) < 0.00015) {
      if (cameraDistance !== targetCameraDistance) {
        cameraDistance = targetCameraDistance;
        changed = true;
      }
    } else {
      cameraDistance += delta * 0.16;
      changed = true;
    }
    if (camera) camera.position.z = cameraDistance;
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
      camera.updateProjectionMatrix();
      renderFrame();
    }
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
      pointerActive = true;
      pointerDragDistance = 0;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      pointerDownTime = performance.now();
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!pointerActive || !globeRoot) return;
      const dx = event.clientX - dragLastX;
      const dy = event.clientY - dragLastY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      pointerDragDistance += Math.hypot(dx, dy);
      const zoomRatio = Math.max(0, Math.min(1, (cameraDistance - minDistance) / (maxDistance - minDistance)));
      const zoomSensitivity = Math.pow(zoomRatio, 0.7);
      const yawSensitivity = 0.00065 + zoomSensitivity * 0.00485;
      const pitchSensitivity = 0.0005 + zoomSensitivity * 0.0033;
      globeRoot.rotation.y += dx * yawSensitivity;
      globeRoot.rotation.x = Math.max(-1.2, Math.min(1.2, globeRoot.rotation.x + dy * pitchSensitivity));
      renderFrame();
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!pointerActive) return;
      pointerActive = false;
      canvas.releasePointerCapture?.(event.pointerId);
      const tapDist = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      const tapTime = performance.now() - pointerDownTime;
      if (pointerDragDistance < 7 && tapDist < 7 && tapTime < 420) handlePick(event.clientX, event.clientY);
    });
    canvas.addEventListener('pointercancel', () => {
      pointerActive = false;
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const direction = Math.sign(event.deltaY || 0);
      if (!direction) return;
      const proximity = Math.max(0, Math.min(1, (targetCameraDistance - minDistance) / (maxDistance - minDistance)));
      const step = 0.035 + 0.22 * Math.pow(proximity, 0.68);
      setCameraDistance(targetCameraDistance + direction * step, { immediate: false });
    }, { passive: false });
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
    earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), earthMaterial);
    globeRoot.add(earthMesh);
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
    favoriteMarkerNodes = [];
    sceneReady = false;
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
    init,
    renderFavoriteMarkers,
    renderFrame,
    setCameraDistance,
    setFavoriteMarkersVisible,
    setSelectionMarker,
    startRenderLoop,
    stopRenderLoop
  };
}
