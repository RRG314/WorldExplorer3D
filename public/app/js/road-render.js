function createRoadSurfaceMaterials({
  asphaltTex = null,
  asphaltNormal = null,
  asphaltRoughness = null,
  includeMarkings = false,
  includeSidewalk = false
} = {}) {
  const roadMainMaterial = asphaltTex ? new THREE.MeshStandardMaterial({
    map: asphaltTex,
    normalMap: asphaltNormal || undefined,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: asphaltRoughness || undefined,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  }) : new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  });

  const roadSkirtMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const roadCapMaterial = asphaltTex ? new THREE.MeshStandardMaterial({
    map: asphaltTex,
    normalMap: asphaltNormal || undefined,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: asphaltRoughness || undefined,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  }) : new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  });

  const materials = {
    roadMainMaterial,
    roadSkirtMaterial,
    roadCapMaterial
  };

  if (includeMarkings) {
    materials.roadMarkMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      emissive: 0x444444,
      emissiveIntensity: 0.3,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6
    });
  }

  if (includeSidewalk) {
    materials.sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8b9bb,
      roughness: 0.94,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: true,
      depthTest: true
    });
  }

  return materials;
}

function disposeRoadSurfaceMaterials(materials = null) {
  if (!materials || typeof materials !== 'object') return;
  Object.values(materials).forEach((material) => {
    if (material && typeof material.dispose === 'function') material.dispose();
  });
}

function roadSurfaceMaterialCacheKey({
  asphaltTex = null,
  asphaltNormal = null,
  asphaltRoughness = null,
  includeMarkings = false,
  includeSidewalk = false
} = {}) {
  return [
    asphaltTex ? 'tex' : 'flat',
    asphaltNormal ? 'normal' : 'plain',
    asphaltRoughness ? 'rough' : 'smooth',
    includeMarkings ? 'marks' : 'nomarks',
    includeSidewalk ? 'sidewalk' : 'nosidewalk'
  ].join(':');
}

function buildIndexedBatchMesh({
  scene,
  targetList = null,
  verts = [],
  indices = [],
  material = null,
  renderOrder = 0,
  userData = null,
  receiveShadow = true,
  frustumCulled = false
} = {}) {
  if (!scene || !material || !Array.isArray(verts) || !Array.isArray(indices) || !verts.length || !indices.length) {
    return null;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const vertexCount = verts.length / 3;
  const indexArray = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  mesh.receiveShadow = !!receiveShadow;
  mesh.frustumCulled = !!frustumCulled;
  if (userData && typeof userData === 'object') {
    Object.assign(mesh.userData, userData);
  }
  scene.add(mesh);
  if (Array.isArray(targetList)) targetList.push(mesh);
  return mesh;
}

function normalizeContinuousWorldRegionKeys(regionKeys = []) {
  if (!Array.isArray(regionKeys) || regionKeys.length === 0) return [];
  return Array.from(new Set(regionKeys.filter((key) => typeof key === 'string' && key.length > 0))).sort();
}

function continuousWorldRegionSignature(regionKeys = []) {
  const keys = normalizeContinuousWorldRegionKeys(regionKeys);
  return keys.length > 0 ? keys.join('|') : '__default__';
}

function appendIndexedGeometryToGroupedBatch(groups, regionKeys = [], verts = [], indices = [], userData = null) {
  if (!(groups instanceof Map) || !Array.isArray(verts) || !Array.isArray(indices) || !verts.length || !indices.length) {
    return null;
  }
  const normalizedKeys = normalizeContinuousWorldRegionKeys(regionKeys);
  const signature = continuousWorldRegionSignature(normalizedKeys);
  let group = groups.get(signature);
  if (!group) {
    group = {
      verts: [],
      indices: [],
      continuousWorldRegionKeys: normalizedKeys,
      userData: {}
    };
    groups.set(signature, group);
  }
  const vertexOffset = group.verts.length / 3;
  group.verts.push(...verts);
  for (let i = 0; i < indices.length; i++) {
    group.indices.push(indices[i] + vertexOffset);
  }
  if (userData && typeof userData === 'object') {
    Object.assign(group.userData, userData);
  }
  return group;
}

function buildGroupedIndexedBatchMeshes({
  scene,
  targetList = null,
  groups = null,
  material = null,
  renderOrder = 0,
  userData = null,
  receiveShadow = true,
  frustumCulled = false
} = {}) {
  const entries =
    groups instanceof Map ? Array.from(groups.values()) :
    Array.isArray(groups) ? groups :
    [];
  const meshes = [];
  for (let i = 0; i < entries.length; i++) {
    const group = entries[i];
    if (!Array.isArray(group?.verts) || !Array.isArray(group?.indices) || !group.verts.length || !group.indices.length) {
      continue;
    }
    const meshUserData = {
      ...(userData && typeof userData === 'object' ? userData : {}),
      ...(group.userData && typeof group.userData === 'object' ? group.userData : {})
    };
    const regionKeys = normalizeContinuousWorldRegionKeys(group.continuousWorldRegionKeys);
    if (regionKeys.length > 0) {
      meshUserData.continuousWorldRegionKeys = regionKeys;
      meshUserData.continuousWorldRegionCount = regionKeys.length;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let sumX = 0;
    let sumZ = 0;
    let pointCount = 0;
    for (let v = 0; v < group.verts.length; v += 3) {
      const x = Number(group.verts[v]);
      const z = Number(group.verts[v + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      sumX += x;
      sumZ += z;
      pointCount += 1;
    }
    if (pointCount > 0) {
      const centerX = sumX / pointCount;
      const centerZ = sumZ / pointCount;
      let maxRadius = 0;
      for (let v = 0; v < group.verts.length; v += 3) {
        const x = Number(group.verts[v]);
        const z = Number(group.verts[v + 2]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        const d = Math.hypot(x - centerX, z - centerZ);
        if (d > maxRadius) maxRadius = d;
      }
      meshUserData.lodCenter = { x: centerX, z: centerZ };
      meshUserData.lodRadius = maxRadius;
      meshUserData.localBounds = { minX, maxX, minZ, maxZ };
    }
    const mesh = buildIndexedBatchMesh({
      scene,
      targetList,
      verts: group.verts,
      indices: group.indices,
      material,
      renderOrder,
      userData: meshUserData,
      receiveShadow,
      frustumCulled
    });
    if (mesh) meshes.push(mesh);
  }
  return meshes;
}

export {
  appendIndexedGeometryToGroupedBatch,
  buildIndexedBatchMesh,
  buildGroupedIndexedBatchMeshes,
  continuousWorldRegionSignature,
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  normalizeContinuousWorldRegionKeys,
  roadSurfaceMaterialCacheKey
};
