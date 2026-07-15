export function createMemoryMarkersApi({ appCtx, helpers, state }) {
  const {
    disposeObject3D,
    getCurrentLocationKey,
    getTopSurfaceYAt,
    isFiniteNumber,
    latLonToWorldSafe
  } = helpers;
  const {
    getMemoryEntries,
    getMemoryGroup,
    getMemoryHitboxes,
    getSelectedMemoryEntryId,
    setMemoryGroup,
    setMemoryHitboxes,
    setSelectedMemoryEntryId
  } = state;

  function ensureMemoryGroup() {
    if (!appCtx.scene) return null;
    let group = getMemoryGroup();
    if (!group) {
      group = new THREE.Group();
      group.name = 'memoryMarkers';
      setMemoryGroup(group);
    }
    if (group.parent !== appCtx.scene) {
      appCtx.scene.add(group);
    }
    return group;
  }

  function clearRenderedMemoryMarkers() {
    setMemoryHitboxes([]);
    const group = getMemoryGroup();
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      disposeObject3D(child);
    }
  }

  function buildPinMarker(entry) {
    const root = new THREE.Group();
    root.name = `memoryPin_${entry.id}`;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.55, 10),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42, metalness: 0.2 })
    );
    stem.position.y = 0.9;
    root.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.15 })
    );
    cap.position.y = 1.74;
    root.add(cap);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.32, 12),
      new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.55, metalness: 0.05 })
    );
    tip.position.y = 0.16;
    root.add(tip);
    return root;
  }

  function buildFlowerMarker(entry) {
    const root = new THREE.Group();
    root.name = `memoryFlower_${entry.id}`;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 1.45, 9),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55, metalness: 0.05 })
    );
    stem.position.y = 0.82;
    root.add(stem);
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.1 })
    );
    center.position.y = 1.6;
    root.add(center);

    const petalMaterial = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.35, metalness: 0.05 });
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), petalMaterial.clone());
      petal.position.set(Math.cos(angle) * 0.24, 1.6, Math.sin(angle) * 0.24);
      root.add(petal);
    }

    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6, metalness: 0.03 });
    const leafA = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMaterial);
    leafA.scale.set(1.5, 0.45, 0.8);
    leafA.position.set(0.17, 0.74, 0);
    root.add(leafA);
    const leafB = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMaterial.clone());
    leafB.scale.set(1.5, 0.45, 0.8);
    leafB.position.set(-0.16, 0.62, 0.04);
    root.add(leafB);
    return root;
  }

  function createMarkerForEntry(entry, x, y, z) {
    const marker = entry.type === 'flower' ? buildFlowerMarker(entry) : buildPinMarker(entry);
    marker.position.set(x, y + 0.02, z);
    marker.userData = { isMemoryMarker: true, memoryEntryId: entry.id };
    marker.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.y = 1.1;
    hitbox.userData = { isMemoryMarkerHitbox: true, memoryEntryId: entry.id };
    marker.add(hitbox);
    setMemoryHitboxes([...getMemoryHitboxes(), hitbox]);
    return marker;
  }

  function getEntriesForCurrentLocation() {
    const key = getCurrentLocationKey();
    if (!key) return [];
    return getMemoryEntries().filter((entry) => entry.locationKey === key);
  }

  function getMemoryEntriesForCurrentLocation() {
    return getEntriesForCurrentLocation().map((entry) => ({
      id: entry.id,
      type: entry.type,
      lat: entry.lat,
      lon: entry.lon,
      message: entry.message,
      locationKey: entry.locationKey,
      locationLabel: entry.locationLabel,
      createdAt: entry.createdAt
    }));
  }

  function refreshMemoryMarkersForCurrentLocation() {
    const group = ensureMemoryGroup();
    if (!group) return;
    clearRenderedMemoryMarkers();
    if (!appCtx.isEnv || !appCtx.ENV || !appCtx.isEnv(appCtx.ENV.EARTH)) return;

    const entries = getEntriesForCurrentLocation();
    entries.forEach((entry) => {
      const worldPos = latLonToWorldSafe(entry.lat, entry.lon);
      if (!isFiniteNumber(worldPos.x) || !isFiniteNumber(worldPos.z)) return;
      const y = getTopSurfaceYAt(worldPos.x, worldPos.z);
      group.add(createMarkerForEntry(entry, worldPos.x, y, worldPos.z));
    });

    const infoPanel = document.getElementById('memoryInfoPanel');
    if (infoPanel && getSelectedMemoryEntryId() && !entries.some((entry) => entry.id === getSelectedMemoryEntryId())) {
      infoPanel.classList.remove('show');
      setSelectedMemoryEntryId(null);
    }
  }

  function clearMemoryMarkersForWorldReload() {
    clearRenderedMemoryMarkers();
    const infoPanel = document.getElementById('memoryInfoPanel');
    if (infoPanel) infoPanel.classList.remove('show');
    setSelectedMemoryEntryId(null);
  }

  return {
    clearMemoryMarkersForWorldReload,
    clearRenderedMemoryMarkers,
    ensureMemoryGroup,
    getEntriesForCurrentLocation,
    getMemoryEntriesForCurrentLocation,
    refreshMemoryMarkersForCurrentLocation
  };
}
