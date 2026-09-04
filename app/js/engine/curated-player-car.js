import { loadModelAsset } from '../assets/model-asset-runtime.js?v=2';

function retainPrimaryE34Variant(THREE, root) {
  let triangles = 0;
  root.traverse((object) => {
    if (!object?.isMesh || !object.geometry) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    if (!position) {
      object.visible = false;
      return;
    }
    const sourceIndex = geometry.getIndex();
    const count = sourceIndex ? sourceIndex.count : position.count;
    const selected = [];
    const minimum = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maximum = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const a = sourceIndex ? sourceIndex.getX(offset) : offset;
      const b = sourceIndex ? sourceIndex.getX(offset + 1) : offset + 1;
      const c = sourceIndex ? sourceIndex.getX(offset + 2) : offset + 2;
      // The downloaded scene contains three display variants arranged beside
      // one another. The primary closed car is centered at the source origin;
      // retain it and discard the two showroom copies before normalizing.
      const triangle = [a, b, c];
      if (triangle.some((index) =>
        position.getX(index) < -1.3 || position.getX(index) > 1.3 ||
        position.getY(index) < -3.1 || position.getY(index) > 3.1
      )) continue;
      selected.push(a, b, c);
      for (const index of triangle) {
        minimum.x = Math.min(minimum.x, position.getX(index));
        minimum.y = Math.min(minimum.y, position.getY(index));
        minimum.z = Math.min(minimum.z, position.getZ(index));
        maximum.x = Math.max(maximum.x, position.getX(index));
        maximum.y = Math.max(maximum.y, position.getY(index));
        maximum.z = Math.max(maximum.z, position.getZ(index));
      }
    }
    if (!selected.length) {
      geometry.setIndex([]);
      geometry.boundingBox = new THREE.Box3().makeEmpty();
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
      object.visible = false;
      return;
    }
    geometry.setIndex(selected);
    geometry.boundingBox = new THREE.Box3(minimum, maximum);
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    triangles += selected.length / 3;
  });
  return triangles;
}

function prepareE34Model(THREE, source, record) {
  const oriented = new THREE.Group();
  oriented.name = `${record.label} visual`;
  const triangles = retainPrimaryE34Variant(THREE, source);
  source.updateMatrixWorld(true);
  // GLTFLoader has already converted this Z-up Sketchfab source to Three.js'
  // Y-up space in the imported hierarchy. Measure and center that hierarchy
  // instead of applying a second axis conversion.
  const sourceBounds = new THREE.Box3().setFromObject(source);
  const size = sourceBounds.getSize(new THREE.Vector3());
  const center = sourceBounds.getCenter(new THREE.Vector3());
  const target = record.dimensionsMeters;
  const scale = target.length / Math.max(0.001, size.z);
  source.position.x -= center.x;
  source.position.y -= sourceBounds.min.y;
  source.position.z -= center.z;
  source.updateMatrix();
  const normalized = new THREE.Group();
  normalized.name = `${record.label} source transform`;
  normalized.scale.setScalar(scale);
  normalized.add(source);
  normalized.updateMatrix();
  oriented.add(normalized);
  oriented.position.y = -1.1;
  oriented.updateMatrix();
  oriented.updateMatrixWorld(true);
  oriented.userData.defaultPlayerVehicleVisual = true;
  oriented.userData.curatedVehicleAssetId = record.id;
  oriented.userData.collisionPolicy = record.collisionPolicy;
  oriented.userData.importDimensions = Object.freeze({
    source: Object.freeze({ x: size.x, y: size.y, z: size.z }),
    normalized: Object.freeze({
      x: size.x * scale,
      y: size.y * scale,
      z: size.z * scale
    }),
    scale
  });
  oriented.userData.performanceProfile = Object.freeze({
    style: 'licensed-e34',
    sourceBytes: record.budgets.bytes,
    sourceTriangles: record.budgets.triangles,
    visibleTriangles: triangles,
    maxInstances: record.budgets.maxInstances
  });
  return oriented;
}

async function attachCuratedPlayerCar(THREE, appCtx) {
  const carMesh = appCtx?.carMesh;
  if (!carMesh || carMesh.userData.curatedVehicleLoadStarted) return false;
  carMesh.userData.curatedVehicleLoadStarted = true;
  try {
    const instance = await loadModelAsset(THREE, 'vehicle-bmw-525i-e34');
    if (!carMesh.parent) return false;
    const visual = prepareE34Model(THREE, instance.root, instance.record);
    const fallbackParts = carMesh.children.filter((child) => child.userData?.defaultPlayerVehicleFallback === true);
    fallbackParts.forEach((child) => { child.visible = false; });
    visual.visible = !carMesh.userData.activeUrbanVehicleId;
    carMesh.add(visual);
    carMesh.userData.curatedVehicleAssetId = instance.record.id;
    carMesh.userData.curatedVehicleVisual = visual;
    return true;
  } catch (error) {
    carMesh.userData.curatedVehicleLoadStarted = false;
    console.warn('Curated player car unavailable; keeping the built-in vehicle.', error);
    return false;
  }
}

export { attachCuratedPlayerCar };
