import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';

export function attachShipFurnishing(THREE, host, assetId, options = {}) {
  const fallback = options.replace === false ? [] : [...host.children];
  const pending = (async () => {
    let instance;
    try {
      instance = await loadModelAsset(THREE, assetId);
      if (!options.isCurrent?.()) { instance.dispose(); return false; }
      const visual = new THREE.Group();
      visual.name = `${assetId}:licensed-furnishing`;
      visual.add(instance.root);
      instance.root.rotation.y += options.sourceYaw || 0;
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      instance.root.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      const fit = options.fit || { x: 1, y: 1, z: 1 };
      const scale = Math.min(fit.x / Math.max(size.x, 0.001), fit.y / Math.max(size.y, 0.001), fit.z / Math.max(size.z, 0.001));
      visual.scale.setScalar(scale);
      visual.position.set(options.x || 0, options.y || 0, options.z || 0);
      visual.rotation.y = options.yaw || 0;
      visual.userData.modelAssetId = assetId;
      host.add(visual);
      fallback.forEach((object) => { object.visible = false; });
      host.userData.curatedFurnishing = assetId;
      host.userData.disposeShipFurnishing = () => {
        instance.dispose();
        visual.parent?.remove(visual);
        delete host.userData.disposeShipFurnishing;
        delete host.userData.curatedFurnishing;
      };
      return true;
    } catch (error) {
      instance?.dispose();
      host.userData.furnishingError = String(error?.message || error);
      console.warn('Ship furnishing unavailable; retaining authored furniture.', assetId);
      return false;
    }
  })();
  host.userData.furnishingReady = pending;
  return pending;
}
