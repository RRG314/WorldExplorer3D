const MATERIAL_COLORS = Object.freeze({
  default: 0x8a765f,
  brick: 0x8f4f3d,
  concrete: 0x989b9d,
  stone: 0x817d72,
  metal: 0x5d6970,
  wood: 0x8b623e,
  glass: 0x5d93a5
});

function geometryForType(type) {
  if (type === 'column') return new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  if (type === 'sign') return new THREE.BoxGeometry(1, 0.65, 0.12);
  if (type === 'fence') return new THREE.BoxGeometry(1, 0.72, 0.12);
  if (type === 'floor' || type === 'roof') return new THREE.BoxGeometry(1, 0.18, 1);
  if (type === 'window' || type === 'door' || type === 'glass_wall' || type === 'storefront') {
    return new THREE.BoxGeometry(1, 1, 0.1);
  }
  return new THREE.BoxGeometry(1, 1, 1);
}

function materialForGroup(materialId, type) {
  const glassLike = type === 'window' || type === 'glass_wall' || type === 'storefront';
  return new THREE.MeshStandardMaterial({
    color: glassLike ? MATERIAL_COLORS.glass : (MATERIAL_COLORS[materialId] || MATERIAL_COLORS.default),
    roughness: glassLike ? 0.25 : 0.8,
    metalness: glassLike ? 0.48 : materialId === 'metal' ? 0.32 : 0.04,
    emissive: glassLike ? 0x162e38 : 0x000000,
    emissiveIntensity: glassLike ? 0.08 : 0
  });
}

function disposeGroup(group) {
  if (!group) return;
  group.removeFromParent?.();
  group.children.forEach((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
}

export function createEditableWorldPresentation(objects = []) {
  const group = new THREE.Group();
  group.name = 'Editable World Local Structures';
  group.userData.virtualAlternateWorld = true;
  const buckets = new Map();
  for (const object of objects) {
    const key = `${object.type}:${object.materialId}`;
    const bucket = buckets.get(key) || { type: object.type, materialId: object.materialId, objects: [] };
    bucket.objects.push(object);
    buckets.set(key, bucket);
  }
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (const bucket of buckets.values()) {
    const mesh = new THREE.InstancedMesh(
      geometryForType(bucket.type),
      materialForGroup(bucket.materialId, bucket.type),
      bucket.objects.length
    );
    mesh.name = `Editable ${bucket.type}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    bucket.objects.forEach((object, index) => {
      const transform = object.transform;
      position.set(transform.position.x, transform.position.y, transform.position.z);
      euler.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
      quaternion.setFromEuler(euler);
      scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
      mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    group.add(mesh);
  }
  return Object.freeze({
    group,
    diagnostics: Object.freeze({ objects: objects.length, drawCalls: buckets.size, transparentMaterials: 0 }),
    dispose: () => disposeGroup(group)
  });
}
