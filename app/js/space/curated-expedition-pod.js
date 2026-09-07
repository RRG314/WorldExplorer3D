import { loadModelAsset } from '../assets/model-asset-runtime.js?v=15';

const EXPEDITION_POD_ASSET_ID = 'space-pathfinder-transfer-pod-v2';

function setPodFallbackVisible(host, visible) {
  host?.traverse?.((object) => {
    if (object?.userData?.defaultPodFallback === true) object.visible = visible;
  });
}

function prepareCuratedExpeditionPod(THREE, instance) {
  const { root: source, record } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const lengthAxis = ['x', 'y', 'z'].includes(record.sourceLengthAxis) ? record.sourceLengthAxis : 'z';
  const sourceLength = Math.max(.001, Number(size[lengthAxis]));
  const scale = Number(record.targetLengthMeters || 8) / sourceLength;
  source.position.sub(center);
  source.updateMatrix();

  const normalized = new THREE.Group();
  normalized.name = `${record.label} normalized source`;
  normalized.scale.setScalar(scale);
  normalized.add(source);

  const oriented = new THREE.Group();
  oriented.name = `${record.label} forward-axis transform`;
  if (record.sourceForwardAxis === 'x') oriented.rotation.z = Math.PI * .5;
  else if (record.sourceForwardAxis === 'z') oriented.rotation.x = -Math.PI * .5;
  oriented.add(normalized);

  const visual = new THREE.Group();
  visual.name = `${record.label} curated visual`;
  visual.add(oriented);
  visual.userData.curatedPodAssetId = record.id;
  visual.userData.presentationOnly = true;
  visual.userData.gameplayAuthority = record.collisionPolicy;
  visual.userData.importDimensions = Object.freeze({ x: size.x, y: size.y, z: size.z, scale, lengthAxis });
  source.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return visual;
}

async function attachCuratedExpeditionPod(THREE, host) {
  if (!host) return false;
  if (host.userData.curatedPodAssetId === EXPEDITION_POD_ASSET_ID) return true;
  if (host.userData.curatedPodLoadPromise) return host.userData.curatedPodLoadPromise;
  const loadPromise = (async () => {
    try {
      const instance = await loadModelAsset(THREE, EXPEDITION_POD_ASSET_ID);
      if (!host.parent || host.userData.curatedPodDisposed === true) {
        instance.dispose();
        return false;
      }
      const visual = prepareCuratedExpeditionPod(THREE, instance);
      if (host.userData.curatedPodTargetForwardAxis === 'z') visual.rotation.x = Math.PI * .5;
      host.add(visual);
      host.userData.curatedPodAssetId = EXPEDITION_POD_ASSET_ID;
      host.userData.curatedPodAttachment = Object.freeze({ instance, visual });
      setPodFallbackVisible(host, false);
      return true;
    } catch (error) {
      setPodFallbackVisible(host, true);
      console.warn('Curated transfer pod unavailable; keeping the built-in pod.', error);
      return false;
    } finally {
      delete host.userData.curatedPodLoadPromise;
    }
  })();
  host.userData.curatedPodLoadPromise = loadPromise;
  return loadPromise;
}

export {
  EXPEDITION_POD_ASSET_ID,
  attachCuratedExpeditionPod,
  prepareCuratedExpeditionPod
};
