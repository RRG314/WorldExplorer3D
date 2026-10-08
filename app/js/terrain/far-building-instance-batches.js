// Preserve every regional building while allowing the renderer to reject
// off-screen groups. Each cell keeps small GPU transforms; its double-precision
// Object3D position carries the world offset into the camera-relative matrix.
export function partitionFarBuildingInstances(buildings, cellSize = 2048) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new TypeError('Invalid building batch size');
  const buckets = new Map();
  const scratch={color:[0,0,0]};
  for (let index = 0; index < buildings.length; index++) {
    const { x, z, roofFraction = 0 } = buildings.read ? buildings.read(index,scratch) : buildings[index];
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('Invalid building position');
    const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}` + (roofFraction > 0 ? `:g${Math.round(roofFraction*20)}` : '');
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
  yieldControl = async () => {},
  now = () => performance.now()
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
  const scratch={color:[0,0,0]};
  let completed = 0;
  let sliceStarted = now();
  try {
    for (const [key, indices] of buckets) {
      const [cellX, cellZ] = key.split(':').map(Number);
      const originX = cellX * cellSize, originZ = cellZ * cellSize;
      const roofFraction = key.includes(':g') ? Number(key.split(':g')[1]) / 20 : 0;
      let geometry;
      if (roofFraction > 0) {
        const wall = 1 - roofFraction, shape = new THREE.Shape();
        shape.moveTo(-.5,0); shape.lineTo(.5,0); shape.lineTo(.5,wall);
        shape.lineTo(0,1); shape.lineTo(-.5,wall); shape.closePath();
        geometry = new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,steps:1});
        geometry.translate(0,0,-.5);
      } else {
        geometry = new THREE.BoxGeometry(1, 1, 1);
        geometry.translate(0, .5, 0);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const localBox = geometry.boundingBox;
      const localSphere = geometry.boundingSphere;
      const bounds = new THREE.Box3().makeEmpty();
      const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
      batches.push(mesh);
      mesh.position.set(originX, 0, originZ);
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      for (let index = 0; index < indices.length; index++) {
        const building = buildings.read ? buildings.read(indices[index],scratch) : buildings[indices[index]];
        position.set(building.x - originX, building.baseY, building.z - originZ);
        rotation.setFromAxisAngle(up, building.rotationY);
        scale.set(building.width, building.height, building.depth);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
        color.setRGB(building.color[0], building.color[1], building.color[2]);
        mesh.setColorAt(index, color);
        // Bound the Float32 transform actually uploaded, including rotation.
        mesh.getMatrixAt(index, matrix);
        bounds.union(transformedBox.copy(localBox).applyMatrix4(matrix));
        if ((++completed & 63) === 0 && now() - sliceStarted >= 8) {
          await yieldControl();
          sliceStarted = now();
        }
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
      mesh.userData.regionalRoofFraction = roofFraction;
      preserveInstanceRaycasting(mesh, localBox, localSphere, Uint32Array.from(indices));
    }
    return batches;
  } catch (error) {
    for (const mesh of batches) { mesh.dispose(); mesh.geometry.dispose(); }
    throw error;
  }
}
