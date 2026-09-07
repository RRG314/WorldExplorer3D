// Visual bounds are measured once per attached asset, never by scanning the
// BMW's vertices on every camera update. World transforms still follow pitch,
// roll and yaw, so a slope cannot rotate the body into an otherwise safe view.
const bodyCache = new WeakMap();

export function vehicleCameraProbeRadius(camera) {
  const near = Math.max(.01, Number(camera?.near) || .5);
  const halfHeight = near * Math.tan((Number(camera?.fov) || 70) * Math.PI / 360);
  return Math.max(.38, Math.hypot(near, halfHeight, halfHeight * (Number(camera?.aspect) || 1)));
}

export function createVehicleCameraBody(THREE, carMesh, defaultRadius = .38) {
  if (!THREE || !carMesh) return null;
  const roots = carMesh.children.filter(child => child.visible);
  let cached = bodyCache.get(carMesh);
  if (!cached || roots.length !== cached.roots.length || roots.some((root, i) => root !== cached.roots[i])) {
    carMesh.updateWorldMatrix(true, true);
    const inverse = carMesh.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    const relative = new THREE.Matrix4();
    for (const root of roots) root.traverseVisible(object => {
      if (!object.isMesh || !object.geometry) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      relative.multiplyMatrices(inverse, object.matrixWorld);
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(relative));
    });
    cached = { roots, bounds, inverse, point: new THREE.Vector3() };
    bodyCache.set(carMesh, cached);
  }
  if (cached.bounds.isEmpty()) return null;
  carMesh.updateWorldMatrix(true, false);
  cached.inverse.copy(carMesh.matrixWorld).invert();
  return {
    contains(point, radius = defaultRadius) {
      const local = cached.point.copy(point).applyMatrix4(cached.inverse);
      // Player vehicle parents are unit scale; account for any presentation
      // scaling conservatively rather than silently shrinking the exclusion.
      const e = cached.inverse.elements;
      const padding = radius * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      return local.x >= cached.bounds.min.x - padding && local.x <= cached.bounds.max.x + padding &&
        local.y >= cached.bounds.min.y - padding && local.y <= cached.bounds.max.y + padding &&
        local.z >= cached.bounds.min.z - padding && local.z <= cached.bounds.max.z + padding;
    },
    roofPoint() {
      return cached.bounds.getCenter(new THREE.Vector3()).setY(cached.bounds.max.y + defaultRadius + .17).applyMatrix4(carMesh.matrixWorld);
    }
  };
}

export function selectBodySafeCamera(desired, candidates, body, isClear) {
  if (!body || !body.contains(desired)) return { point: desired, mode: 'chase' };
  for (const point of candidates) {
    if (!body.contains(point) && isClear(point)) return { point, mode: 'clearance-chase' };
  }
  // The caller uses the existing first-person presentation only when no
  // outside-body pose fits. Never publish a third-person pose inside the mesh.
  return { point: null, mode: 'clearance-first-person' };
}
