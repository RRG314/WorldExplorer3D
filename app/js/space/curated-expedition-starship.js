import { loadModelAsset } from '../assets/model-asset-runtime.js?v=14';

const EXPEDITION_STARSHIP_ASSET_ID = 'space-solis-reach-exterior-v1';

function setStarshipFallbackVisible(host, visible) {
  host?.traverse?.((object) => {
    if (object?.userData?.defaultStarshipFallback === true) object.visible = visible;
  });
}

function prepareCuratedExpeditionStarship(THREE, instance) {
  const { root: source, record } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const lengthAxis = ['x', 'y', 'z'].includes(record.sourceLengthAxis) ? record.sourceLengthAxis : 'z';
  const scale = Number(record.targetLengthMeters || 15) / Math.max(.001, Number(size[lengthAxis]));
  source.position.sub(center);

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
  visual.userData.curatedStarshipAssetId = record.id;
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

async function attachCuratedExpeditionStarship(THREE, host) {
  if (!host) return false;
  if (host.userData.curatedStarshipAssetId === EXPEDITION_STARSHIP_ASSET_ID) return true;
  if (host.userData.curatedStarshipLoadPromise) return host.userData.curatedStarshipLoadPromise;
  setStarshipFallbackVisible(host, false);
  const loadPromise = (async () => {
    try {
      const instance = await loadModelAsset(THREE, EXPEDITION_STARSHIP_ASSET_ID);
      if (!host.parent || host.userData.curatedStarshipDisposed === true) {
        instance.dispose();
        return false;
      }
      const visual = prepareCuratedExpeditionStarship(THREE, instance);
      host.add(visual);
      host.userData.curatedStarshipAssetId = EXPEDITION_STARSHIP_ASSET_ID;
      host.userData.curatedStarshipAttachment = Object.freeze({ instance, visual });
      return true;
    } catch (error) {
      setStarshipFallbackVisible(host, true);
      console.warn('Curated expedition starship unavailable; restoring the built-in ship.', error);
      return false;
    } finally {
      delete host.userData.curatedStarshipLoadPromise;
    }
  })();
  host.userData.curatedStarshipLoadPromise = loadPromise;
  return loadPromise;
}

export {
  EXPEDITION_STARSHIP_ASSET_ID,
  attachCuratedExpeditionStarship,
  prepareCuratedExpeditionStarship
};
