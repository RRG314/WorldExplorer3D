import { loadModelAsset } from '../assets/model-asset-runtime.js?v=3';

const EXPLORER_ASSET_ID = 'character-field-explorer-v1';
const NEARBY_NPC_ASSET_ID = 'character-city-explorer-v1';

function setFallbackVisible(host, visible) {
  host?.traverse?.((object) => {
    if (object?.userData?.defaultCharacterFallback === true) object.visible = visible;
  });
}

function prepareExplorerVisual(THREE, instance, options = {}) {
  const { record, root: source } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = record.dimensionsMeters.height / Math.max(.001, size.y);
  source.position.x -= center.x;
  source.position.y -= bounds.min.y;
  source.position.z -= center.z;
  source.updateMatrix();

  const normalized = new THREE.Group();
  normalized.name = `${record.label} source transform`;
  normalized.rotation.y = record.sourceForwardAxis === 'x' ? -Math.PI * .5 : 0;
  normalized.scale.setScalar(scale);
  normalized.add(source);

  const visual = new THREE.Group();
  visual.name = `${record.label} curated visual`;
  visual.add(normalized);
  source.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      material.depthWrite = true;
    });
  });
  visual.userData.curatedCharacterAssetId = record.id;
  visual.userData.characterRole = options.role || 'player-character';
  visual.userData.collisionPolicy = record.collisionPolicy;
  visual.userData.performanceProfile = Object.freeze({
    style: options.variation === 'nearby-npc' ? 'licensed-stylized-city-explorer' : 'licensed-stylized-field-explorer',
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
  return { mixer, actions };
}

function updateCuratedCharacterAnimation(host, isMoving, deltaTime, isRunning = false) {
  const mixer = host?.userData?.characterMixer;
  if (!mixer) return false;
  mixer.update(Math.max(0, Number(deltaTime) || 0));
  const actions = host.userData.characterActions || {};
  const target = isRunning && actions.run ? 'run' : isMoving && actions.walk ? 'walk' : 'idle';
  for (const [name, action] of Object.entries(actions)) {
    action.enabled = true;
    action.setEffectiveWeight(name === target ? 1 : 0);
  }
  return true;
}

function disposeCuratedCharacter(host) {
  const attachment = host?.userData?.curatedCharacterAttachment;
  if (!attachment) return false;
  attachment.mixer.stopAllAction();
  attachment.visual.removeFromParent?.();
  attachment.instance.dispose();
  delete host.userData.curatedCharacterAttachment;
  host.userData.characterMixer = null;
  host.userData.characterActions = null;
  delete host.userData.curatedCharacterAssetId;
  setFallbackVisible(host, true);
  return true;
}

async function attachCuratedExplorerCharacter(THREE, host, options = {}) {
  if (!host || host.userData.curatedCharacterLoadStarted) return false;
  host.userData.curatedCharacterLoadStarted = true;
  try {
    const assetId = options.assetId || (options.role === 'nearby-npc-character' ? NEARBY_NPC_ASSET_ID : EXPLORER_ASSET_ID);
    const instance = await loadModelAsset(THREE, assetId, { signal: options.signal });
    if (options.isCurrent && !options.isCurrent()) {
      instance.dispose();
      return false;
    }
    const visual = prepareExplorerVisual(THREE, instance, options);
    const animation = createAnimationState(THREE, visual, instance.animations, instance.record);
    setFallbackVisible(host, false);
    host.add(visual);
    host.userData.curatedCharacterAssetId = instance.record.id;
    host.userData.characterMixer = animation.mixer;
    host.userData.characterActions = animation.actions;
    host.userData.curatedCharacterAttachment = Object.freeze({ instance, visual, ...animation });
    return true;
  } catch (error) {
    host.userData.curatedCharacterLoadStarted = false;
    setFallbackVisible(host, true);
    if (error?.name !== 'AbortError') {
      console.warn('Curated Explorer unavailable; keeping the built-in character.', error);
    }
    return false;
  }
}

export {
  EXPLORER_ASSET_ID,
  NEARBY_NPC_ASSET_ID,
  attachCuratedExplorerCharacter,
  disposeCuratedCharacter,
  updateCuratedCharacterAnimation
};
