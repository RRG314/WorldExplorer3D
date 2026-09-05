import { loadModelAsset } from '../assets/model-asset-runtime.js?v=14';

const CURATED_EQUIPMENT_ASSET_BY_ID = Object.freeze({
  'pulse-sidearm': 'equipment-explorer-pulse-sidearm-v1',
  'compact-sidearm': 'equipment-explorer-pulse-sidearm-v1',
  'responder-sidearm': 'equipment-explorer-pulse-sidearm-v1',
  'paintball-gun': 'equipment-explorer-pulse-sidearm-v1',
  'laser-gun': 'equipment-explorer-laser-rifle-v1'
});

function curatedEquipmentAssetForId(equipmentId = '') {
  return CURATED_EQUIPMENT_ASSET_BY_ID[String(equipmentId || '')] || null;
}

function setEquipmentFallbackVisible(host, visible) {
  host?.children?.forEach?.((child) => {
    if (child?.userData?.defaultEquipmentFallback === true) child.visible = visible;
  });
}

function prepareCuratedEquipmentVisual(THREE, instance) {
  const { root: source, record } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = Number(record.targetLengthMeters || .6) / Math.max(.001, size.x);
  source.position.x -= bounds.min.x;
  source.position.y -= center.y;
  source.position.z -= center.z;
  source.updateMatrix();

  const normalized = new THREE.Group();
  normalized.name = `${record.label} normalized source`;
  normalized.scale.setScalar(scale);
  normalized.add(source);
  const visual = new THREE.Group();
  visual.name = `${record.label} curated visual`;
  visual.rotation.y = -Math.PI * .5;
  visual.add(normalized);
  visual.userData.curatedEquipmentAssetId = record.id;
  visual.userData.presentationOnly = true;
  visual.userData.gameplayAuthority = record.collisionPolicy;
  visual.userData.importDimensions = Object.freeze({ x: size.x, y: size.y, z: size.z, scale });
  source.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
  });
  return visual;
}

async function attachCuratedEquipmentVisual(THREE, host, equipmentId) {
  const assetId = curatedEquipmentAssetForId(equipmentId);
  if (!host || !assetId) return false;
  if (host.userData.curatedEquipmentAssetId === assetId) return true;
  if (host.userData.curatedEquipmentLoadPromise) return host.userData.curatedEquipmentLoadPromise;
  setEquipmentFallbackVisible(host, false);
  const loadPromise = (async () => {
    try {
      const instance = await loadModelAsset(THREE, assetId);
      if (!host.parent || host.userData.curatedEquipmentDisposed === true) {
        instance.dispose();
        return false;
      }
      const visual = prepareCuratedEquipmentVisual(THREE, instance);
      host.add(visual);
      host.userData.curatedEquipmentAssetId = assetId;
      host.userData.curatedEquipmentAttachment = Object.freeze({ instance, visual });
      setEquipmentFallbackVisible(host, false);
      return true;
    } catch (error) {
      setEquipmentFallbackVisible(host, false);
      console.warn(`Curated equipment unavailable for ${equipmentId}; leaving the equipment host empty.`, error);
      return false;
    } finally {
      delete host.userData.curatedEquipmentLoadPromise;
    }
  })();
  host.userData.curatedEquipmentLoadPromise = loadPromise;
  return loadPromise;
}

function disposeCuratedEquipmentVisual(host) {
  if (host?.userData) host.userData.curatedEquipmentDisposed = true;
  const attachment = host?.userData?.curatedEquipmentAttachment;
  if (!attachment) return false;
  attachment.visual.removeFromParent?.();
  attachment.instance.dispose();
  delete host.userData.curatedEquipmentAttachment;
  delete host.userData.curatedEquipmentAssetId;
  setEquipmentFallbackVisible(host, false);
  return true;
}

export {
  CURATED_EQUIPMENT_ASSET_BY_ID,
  attachCuratedEquipmentVisual,
  curatedEquipmentAssetForId,
  disposeCuratedEquipmentVisual,
  prepareCuratedEquipmentVisual
};
