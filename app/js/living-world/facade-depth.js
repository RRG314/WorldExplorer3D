const FACADE_BUDGET_BY_TIER = Object.freeze({
  low: Object.freeze({ doors: 32, storefronts: 14, windows: 96 }),
  performance: Object.freeze({ doors: 52, storefronts: 24, windows: 180 }),
  balanced: Object.freeze({ doors: 104, storefronts: 52, windows: 420 }),
  quality: Object.freeze({ doors: 168, storefronts: 88, windows: 760 })
});

function disposeMaterial(material) {
  if (Array.isArray(material)) material.forEach((entry) => entry?.dispose?.());
  else material?.dispose?.();
}

function setInstanceTransform(mesh, index, entrance, options = {}) {
  const tangentOffset = Number(options.tangentOffset || 0);
  const outwardOffset = Number(options.outwardOffset || 0);
  const x = entrance.x + entrance.tangentX * tangentOffset + entrance.normalX * outwardOffset;
  const z = entrance.z + entrance.tangentZ * tangentOffset + entrance.normalZ * outwardOffset;
  const position = new THREE.Vector3(x, entrance.y + Number(options.heightOffset || 0), z);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), entrance.yaw);
  const scale = new THREE.Vector3(
    Number(options.width || 1),
    Number(options.height || 1),
    Number(options.depth || 1)
  );
  mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, rotation, scale));
}

function createInstances(count, material, name) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.livingWorldFacade = true;
  return mesh;
}

export function createFacadeDepthPresentation(options = {}) {
  const entrances = Array.isArray(options.entrances) ? options.entrances : [];
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = FACADE_BUDGET_BY_TIER[tier] || FACADE_BUDGET_BY_TIER.balanced;
  const doors = entrances.slice(0, budget.doors);
  const storefronts = entrances.filter((entry) => entry.commercial).slice(0, budget.storefronts);
  const windowPlacements = [];
  for (const entrance of entrances) {
    if (windowPlacements.length >= budget.windows) break;
    const floors = Math.min(5, Math.max(1, entrance.levels || Math.floor(entrance.height / 3.1)));
    const across = Math.min(3, Math.max(1, Math.floor((entrance.facadeWidth || 7) / 4)));
    for (let floor = 0; floor < floors && windowPlacements.length < budget.windows; floor += 1) {
      for (let column = 0; column < across && windowPlacements.length < budget.windows; column += 1) {
        windowPlacements.push({
          entrance,
          heightOffset: 2.1 + floor * 3.05,
          tangentOffset: (column - (across - 1) * 0.5) * 2.5
        });
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'Living World Facade Depth';
  group.userData.livingWorldFacade = true;
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x273743, roughness: 0.7, metalness: 0.18 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x78a8b8,
    roughness: 0.25,
    metalness: 0.48,
    emissive: 0x203a48,
    emissiveIntensity: 0.05
  });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x20262a, roughness: 0.72, metalness: 0.25 });

  const doorMesh = createInstances(doors.length, doorMaterial, 'Living World Doors');
  doors.forEach((entrance, index) => setInstanceTransform(doorMesh, index, entrance, {
    width: 1.15,
    height: 2.25,
    depth: 0.1,
    heightOffset: 1.125,
    outwardOffset: 0.08
  }));
  if (doorMesh) group.add(doorMesh);

  const storefrontMesh = createInstances(storefronts.length, glassMaterial, 'Living World Storefront Glass');
  storefronts.forEach((entrance, index) => setInstanceTransform(storefrontMesh, index, entrance, {
    width: Math.min(4.8, Math.max(2.6, (entrance.facadeWidth || 5) * 0.55)),
    height: 2.45,
    depth: 0.08,
    heightOffset: 1.35,
    outwardOffset: 0.13
  }));
  if (storefrontMesh) {
    storefrontMesh.userData.glassApproximation = 'opaque-reflective';
    group.add(storefrontMesh);
  }

  const windowMesh = createInstances(windowPlacements.length, glassMaterial, 'Living World Windows');
  windowPlacements.forEach((placement, index) => setInstanceTransform(windowMesh, index, placement.entrance, {
    width: 1.45,
    height: 1.35,
    depth: 0.07,
    heightOffset: placement.heightOffset,
    tangentOffset: placement.tangentOffset,
    outwardOffset: 0.12
  }));
  if (windowMesh) group.add(windowMesh);

  const frameMesh = createInstances(storefronts.length, frameMaterial, 'Living World Storefront Frames');
  storefronts.forEach((entrance, index) => setInstanceTransform(frameMesh, index, entrance, {
    width: Math.min(5.05, Math.max(2.85, (entrance.facadeWidth || 5) * 0.58)),
    height: 2.68,
    depth: 0.06,
    heightOffset: 1.36,
    outwardOffset: 0.09
  }));
  if (frameMesh) {
    group.add(frameMesh);
    // Draw the glass just outside a single dark frame slab. The slight depth
    // separation reads as a recessed storefront without transparent overdraw.
    if (storefrontMesh) storefrontMesh.renderOrder = frameMesh.renderOrder + 1;
  }

  const meshes = [doorMesh, frameMesh, storefrontMesh, windowMesh].filter(Boolean);
  meshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
  });

  const diagnostics = Object.freeze({
    tier,
    drawCalls: meshes.length,
    doors: doors.length,
    storefronts: storefronts.length,
    windows: windowPlacements.length,
    transparentMaterials: 0
  });

  return Object.freeze({
    group,
    diagnostics,
    updateNightLighting(phase = 'day') {
      glassMaterial.emissiveIntensity = phase === 'night'
        ? 0.72
        : phase === 'sunset' || phase === 'sunrise' ? 0.34 : 0.05;
    },
    dispose() {
      group.removeFromParent?.();
      meshes.forEach((mesh) => mesh.geometry?.dispose?.());
      disposeMaterial(doorMaterial);
      disposeMaterial(glassMaterial);
      disposeMaterial(frameMaterial);
    }
  });
}

export { FACADE_BUDGET_BY_TIER };
