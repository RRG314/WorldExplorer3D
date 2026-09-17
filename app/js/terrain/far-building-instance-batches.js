// Preserve every regional building while allowing the renderer to reject
// off-screen groups. Instance transforms remain in the original world frame.
export function partitionFarBuildingInstances(buildings, cellSize = 2048) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new TypeError('Invalid building batch size');
  const buckets = new Map();
  for (let index = 0; index < buildings.length; index++) {
    const { x, z } = buildings[index];
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('Invalid building position');
    const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }
  return buckets;
}

function preserveInstanceRaycasting(mesh, localBox, localSphere, sourceIndices) {
  const raycast = mesh.raycast;
  mesh.raycast = function (raycaster, intersections) {
    // r128 uses geometry bounds for both whole-batch culling and individual
    // instance raycasts. Individual tests require the original unit-box bounds.
    const batchBox = this.geometry.boundingBox;
    const batchSphere = this.geometry.boundingSphere;
    const start = intersections.length;
    this.geometry.boundingBox = localBox;
    this.geometry.boundingSphere = localSphere;
    try {
      raycast.call(this, raycaster, intersections);
      for (let index = start; index < intersections.length; index++) {
        intersections[index].sourceInstanceId = sourceIndices[intersections[index].instanceId];
      }
    } finally {
      this.geometry.boundingBox = batchBox;
      this.geometry.boundingSphere = batchSphere;
    }
  };
}

export async function buildFarBuildingInstanceBatches(THREE, buildings, material, {
  cellSize = 2048,
  yieldControl = async () => {}
} = {}) {
  const buckets = partitionFarBuildingInstances(buildings, cellSize);
  const batches = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const transformedBox = new THREE.Box3();
  let completed = 0;
  try {
    for (const [key, indices] of buckets) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.translate(0, .5, 0);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const localBox = geometry.boundingBox;
      const localSphere = geometry.boundingSphere;
      const bounds = new THREE.Box3().makeEmpty();
      const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
      batches.push(mesh);
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      for (let index = 0; index < indices.length; index++) {
        const building = buildings[indices[index]];
        position.set(building.x, building.baseY, building.z);
        rotation.setFromAxisAngle(up, building.rotationY);
        scale.set(building.width, building.height, building.depth);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
        color.setRGB(building.color[0], building.color[1], building.color[2]);
        mesh.setColorAt(index, color);
        // Bound the Float32 transform actually uploaded, including rotation.
        mesh.getMatrixAt(index, matrix);
        bounds.union(transformedBox.copy(localBox).applyMatrix4(matrix));
        if (++completed % 12000 === 0) await yieldControl();
      }
      geometry.boundingBox = bounds;
      geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
      geometry.boundingSphere.radius += 1e-5;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor?.setUsage(THREE.StaticDrawUsage);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = `FarMappedBuildingInstances:${key}`;
      mesh.renderOrder = 1;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.userData.isFarMappedBuildingInstances = true;
      mesh.userData.spatialBatchKey = key;
      preserveInstanceRaycasting(mesh, localBox, localSphere, Uint32Array.from(indices));
    }
    return batches;
  } catch (error) {
    for (const mesh of batches) mesh.geometry.dispose();
    throw error;
  }
}
