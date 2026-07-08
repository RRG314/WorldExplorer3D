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

export {
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  roadSurfaceMaterialCacheKey
};
