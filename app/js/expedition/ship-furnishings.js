import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';

export function attachShipFurnishing(THREE, host, assetId, options = {}) {
  const fallback = options.replace === false ? [] : [...host.children];
  if (!host.userData.shipFurnishingOwnership || host.userData.shipFurnishingOwnership.disposed) {
    host.userData.shipFurnishingOwnership = { instances: new Set(), disposed: false };
    delete host.userData.furnishingReady;
  }
  const ownership = host.userData.shipFurnishingOwnership;
  host.userData.disposeShipFurnishing = () => {
    ownership.disposed = true;
    for (const entry of ownership.instances) {
      entry.instance.dispose();
      entry.visual.parent?.remove(entry.visual);
    }
    ownership.instances.clear();
    delete host.userData.curatedFurnishing;
  };
  const pending = (async () => {
    let instance;
    try {
      instance = await loadModelAsset(THREE, assetId);
      if (ownership.disposed || (options.isCurrent && !options.isCurrent())) { instance.dispose(); return false; }
      const visual = new THREE.Group();
      visual.name = `${assetId}:licensed-furnishing`;
      // Keep the imported hierarchy intact; mounting transforms belong outside it.
      const pivot = new THREE.Group();
      pivot.rotation.y = options.sourceYaw || 0;
      pivot.add(instance.root);
      visual.add(pivot);
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      pivot.position.sub(new THREE.Vector3(center.x, bounds.min.y, options.mount === 'wall' ? bounds.min.z : center.z));
      const fit = options.fit || { x: 1, y: 1, z: 1 };
      const scale = Math.min(fit.x / Math.max(size.x, 0.001), fit.y / Math.max(size.y, 0.001), fit.z / Math.max(size.z, 0.001));
      visual.scale.setScalar(scale);
      visual.position.set(options.x || 0, options.y || 0, options.z || 0);
      visual.rotation.y = options.yaw || 0;
      visual.userData.modelAssetId = assetId;
      host.add(visual);
      const owner = { instance, visual };
      ownership.instances.add(owner);
      fallback.forEach((object) => { object.visible = false; });
      host.userData.curatedFurnishing = assetId;
      return true;
    } catch (error) {
      instance?.dispose();
      host.userData.furnishingError = String(error?.message || error);
      console.warn('Ship furnishing unavailable; retaining authored furniture.', assetId);
      return false;
    }
  })();
  const prior = host.userData.furnishingReady;
  host.userData.furnishingReady = prior
    ? Promise.all([prior, pending]).then(results => results.every(Boolean)) : pending;
  return pending;
}
