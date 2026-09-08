import { loadModelAsset } from '../assets/model-asset-runtime.js?v=15';

const PARACHUTE_ASSET_ID = 'equipment-explorer-parachute-v1';

function setParachuteFallbackVisible(host, visible) {
  host?.traverse?.((object) => {
    if (object?.userData?.defaultEquipmentFallback === true) object.visible = visible;
  });
}

function prepareCuratedParachuteVisual(THREE, instance) {
  const { root: source, record } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const sourceWidth = Math.max(size.x, size.z, .001);
  const scale = Number(record.targetWidthMeters || 3.5) / sourceWidth;
  source.position.x -= center.x;
  source.position.y -= bounds.min.y;
  source.position.z -= center.z;
  source.updateMatrix();

  const normalized = new THREE.Group();
  normalized.name = `${record.label} normalized source`;
  normalized.scale.setScalar(scale);
  normalized.add(source);

  const visual = new THREE.Group();
  visual.name = `${record.label} curated visual`;
  visual.position.y = -2.05;
  visual.add(normalized);
  visual.userData.curatedParachuteAssetId = record.id;
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

async function attachCuratedParachuteVisual(THREE, host) {
  if (!host) return false;
  if (host.userData.curatedParachuteAssetId === PARACHUTE_ASSET_ID) return true;
  if (host.userData.curatedParachuteLoadPromise) return host.userData.curatedParachuteLoadPromise;
  const loadPromise = (async () => {
    try {
      const instance = await loadModelAsset(THREE, PARACHUTE_ASSET_ID);
      if (!host.parent || host.userData.curatedParachuteDisposed === true) {
        instance.dispose();
        return false;
      }
      const visual = prepareCuratedParachuteVisual(THREE, instance);
      host.add(visual);
      host.userData.curatedParachuteAssetId = PARACHUTE_ASSET_ID;
      host.userData.curatedParachuteAttachment = Object.freeze({ instance, visual });
      setParachuteFallbackVisible(host, false);
      return true;
    } catch (error) {
      setParachuteFallbackVisible(host, true);
      console.warn('Curated parachute unavailable; keeping the built-in canopy.', error);
      return false;
    } finally {
      delete host.userData.curatedParachuteLoadPromise;
    }
  })();
  host.userData.curatedParachuteLoadPromise = loadPromise;
  return loadPromise;
}

function disposeCuratedParachuteVisual(host) {
  if (host?.userData) host.userData.curatedParachuteDisposed = true;
  const attachment = host?.userData?.curatedParachuteAttachment;
  if (!attachment) return false;
  attachment.visual.removeFromParent?.();
  attachment.instance.dispose();
  delete host.userData.curatedParachuteAttachment;
  delete host.userData.curatedParachuteAssetId;
  setParachuteFallbackVisible(host, true);
  return true;
}

export {
  PARACHUTE_ASSET_ID,
  attachCuratedParachuteVisual,
  disposeCuratedParachuteVisual,
  prepareCuratedParachuteVisual
};
