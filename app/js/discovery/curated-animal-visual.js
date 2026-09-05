import { loadModelAsset } from '../assets/model-asset-runtime.js?v=7';

const CURATED_ANIMAL_ASSET_BY_SPECIES = Object.freeze({
  'trail-hound': 'animal-trail-hound-husky-v1',
  'field-retriever': 'animal-trail-hound-husky-v1',
  'park-terrier': 'animal-park-terrier-shiba-inu-v1',
  'pasture-cow': 'animal-pasture-cow-v1',
  'heritage-pig': 'animal-heritage-pig-v1',
  'field-horse': 'animal-field-horse-v1',
  'white-tailed-deer': 'animal-white-tailed-deer-v1',
  'woodland-fox': 'animal-woodland-fox-v1'
});

function curatedAnimalAssetForSpecies(speciesId = '') {
  return CURATED_ANIMAL_ASSET_BY_SPECIES[String(speciesId || '')] || null;
}

function setFallbackVisible(host, visible) {
  host?.traverse?.((object) => {
    if (object?.userData?.defaultAnimalFallback === true) object.visible = visible;
  });
}

function localFallbackHeight(THREE, host) {
  host.updateMatrixWorld(true);
  const scaleY = Math.max(.0001, Math.abs(Number(host.scale?.y || 1)));
  return new THREE.Box3().setFromObject(host).getSize(new THREE.Vector3()).y / scaleY;
}

function prepareAnimalVisual(THREE, instance, targetLocalHeight) {
  const { record, root: source } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetLocalHeight / Math.max(.001, size.y);
  source.position.x -= center.x;
  source.position.y -= bounds.min.y;
  source.position.z -= center.z;
  source.updateMatrix();

  const normalized = new THREE.Group();
  normalized.name = `${record.label} source transform`;
  normalized.scale.setScalar(scale);
  normalized.add(source);

  const visual = new THREE.Group();
  visual.name = `${record.label} curated visual`;
  visual.add(normalized);
  source.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
  });
  visual.userData.curatedAnimalAssetId = record.id;
  visual.userData.performanceProfile = Object.freeze({
    style: 'licensed-stylized-real-world-animal',
    sourceBytes: record.budgets.bytes,
    triangles: record.budgets.triangles,
    maxInstances: record.budgets.maxInstances,
    textureEdgePixels: record.budgets.textureEdgePixels
  });
  return visual;
}

function createAnimationState(THREE, visual, clips, record) {
  const mixer = new THREE.AnimationMixer(visual);
  const actions = {};
  for (const [role, clipName] of Object.entries(record.animationClips || {})) {
    const clip = clips.find((entry) => entry.name === clipName);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(role === 'idle' ? 1 : 0);
    action.play();
    actions[role] = action;
  }
  return { mixer, actions, active: 'idle' };
}

function updateCuratedAnimalAnimation(host, deltaTime, activity = 'idle') {
  const mixer = host?.userData?.animalMixer;
  if (!mixer) return false;
  const actions = host.userData.animalActions || {};
  const requested = actions[activity] ? activity : activity === 'run' && actions.walk ? 'walk' : 'idle';
  for (const [name, action] of Object.entries(actions)) {
    action.enabled = true;
    action.setEffectiveWeight(name === requested ? 1 : 0);
  }
  mixer.update(Math.max(0, Number(deltaTime) || 0));
  host.userData.curatedAnimalActivity = requested;
  return true;
}

function disposeCuratedAnimal(host) {
  const attachment = host?.userData?.curatedAnimalAttachment;
  if (!attachment) return false;
  attachment.mixer.stopAllAction();
  attachment.visual.removeFromParent?.();
  attachment.instance.dispose();
  delete host.userData.curatedAnimalAttachment;
  delete host.userData.curatedAnimalAssetId;
  delete host.userData.curatedAnimalActivity;
  delete host.userData.curatedAnimalLoadStarted;
  delete host.userData.curatedAnimalLoadToken;
  host.userData.animalMixer = null;
  host.userData.animalActions = null;
  setFallbackVisible(host, true);
  return true;
}

async function attachCuratedAnimalVisual(THREE, host, options = {}) {
  const assetId = options.assetId || curatedAnimalAssetForSpecies(options.speciesId);
  if (!host || !assetId || host.userData.curatedAnimalLoadStarted) return false;
  const targetLocalHeight = Math.max(.05, Number(options.targetLocalHeight) || localFallbackHeight(THREE, host));
  const loadToken = {};
  host.userData.curatedAnimalLoadStarted = true;
  host.userData.curatedAnimalLoadToken = loadToken;
  try {
    const instance = await loadModelAsset(THREE, assetId, { signal: options.signal });
    if (options.isCurrent && !options.isCurrent()) {
      instance.dispose();
      if (host.userData.curatedAnimalLoadToken === loadToken) {
        host.userData.curatedAnimalLoadStarted = false;
        delete host.userData.curatedAnimalLoadToken;
      }
      return false;
    }
    const visual = prepareAnimalVisual(THREE, instance, targetLocalHeight);
    const animation = createAnimationState(THREE, visual, instance.animations, instance.record);
    setFallbackVisible(host, false);
    host.add(visual);
    host.userData.curatedAnimalAssetId = instance.record.id;
    host.userData.animalMixer = animation.mixer;
    host.userData.animalActions = animation.actions;
    host.userData.curatedAnimalAttachment = Object.freeze({ instance, visual, ...animation });
    return true;
  } catch (error) {
    if (host.userData.curatedAnimalLoadToken === loadToken) {
      host.userData.curatedAnimalLoadStarted = false;
      delete host.userData.curatedAnimalLoadToken;
      setFallbackVisible(host, true);
    }
    if (error?.name !== 'AbortError') {
      console.warn('Curated animal unavailable; keeping the built-in animal.', error);
    }
    return false;
  }
}

export {
  CURATED_ANIMAL_ASSET_BY_SPECIES,
  attachCuratedAnimalVisual,
  curatedAnimalAssetForSpecies,
  disposeCuratedAnimal,
  updateCuratedAnimalAnimation
};
