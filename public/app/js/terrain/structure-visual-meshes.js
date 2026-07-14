export function clearStructureVisualMeshesForContext(appCtx) {
  if (!Array.isArray(appCtx.structureVisualMeshes)) appCtx.structureVisualMeshes = [];
  appCtx.structureVisualMeshes.forEach((mesh) => {
    if (!mesh) return;
    if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
    if (mesh.geometry && typeof mesh.geometry.dispose === "function") mesh.geometry.dispose();
    if (mesh.material && typeof mesh.material.dispose === "function") mesh.material.dispose();
  });
  appCtx.structureVisualMeshes = [];
}

export function buildStructureVisualMeshForContext(appCtx, instances, material, userData = {}) {
  if (!Array.isArray(instances) || instances.length === 0 || typeof THREE === "undefined") return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    position.set(instance.x, instance.y, instance.z);
    if (instance?.quaternion && Number.isFinite(instance.quaternion.x) && Number.isFinite(instance.quaternion.y) && Number.isFinite(instance.quaternion.z) && Number.isFinite(instance.quaternion.w)) {
      quaternion.set(instance.quaternion.x, instance.quaternion.y, instance.quaternion.z, instance.quaternion.w);
    } else {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(instance.rotationY) || 0);
    }
    scale.set(instance.scaleX, instance.scaleY, instance.scaleZ);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, userData, { isStructureVisual: true });
  appCtx.scene.add(mesh);
  appCtx.structureVisualMeshes.push(mesh);
  return mesh;
}

function createStructureVisualMaterial(hex, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness,
    metalness
  });
}

export function rebuildStructureVisualMeshesForContext(appCtx, collectStructureVisualInstances, deps = {}) {
  clearStructureVisualMeshesForContext(appCtx);
  if (appCtx.onMoon || !appCtx.scene) return;
  const {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances,
    tunnelLightInstances
  } = collectStructureVisualInstances(deps);

  if (deckInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      deckInstances,
      createStructureVisualMaterial(0x56606b, 0.92, 0.03),
      { structureVisualType: "decks" }
    );
  }
  if (girderInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      girderInstances,
      createStructureVisualMaterial(0x404954, 0.88, 0.08),
      { structureVisualType: "girders" }
    );
  }
  if (capInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      capInstances,
      createStructureVisualMaterial(0x646c76, 0.92, 0.03),
      { structureVisualType: "caps" }
    );
  }
  if (supportInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      supportInstances,
      createStructureVisualMaterial(0x717983, 0.95, 0.02),
      { structureVisualType: "supports" }
    );
  }
  if (wallInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      wallInstances,
      createStructureVisualMaterial(0x66727d, 0.88, 0.08),
      { structureVisualType: "walls" }
    );
  }
  if (roofInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      roofInstances,
      createStructureVisualMaterial(0x4c5660, 0.84, 0.12),
      { structureVisualType: "roofs" }
    );
  }
  if (portalInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      portalInstances,
      createStructureVisualMaterial(0x585e64, 0.96, 0.02),
      { structureVisualType: "portals" }
    );
  }
  if (tunnelLightInstances.length > 0) {
    const material = createStructureVisualMaterial(0xfff2c7, 0.5, 0.02);
    material.emissive.setHex(0xffd98a);
    material.emissiveIntensity = 1.8;
    buildStructureVisualMeshForContext(appCtx, tunnelLightInstances, material, { structureVisualType: "tunnel_lights" });
  }
}
