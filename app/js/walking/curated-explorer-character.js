import { loadModelAsset } from '../assets/model-asset-runtime.js?v=15';

const EXPLORER_ASSET_ID = 'character-field-explorer-v1';
const EXPLORER_WOMAN_ASSET_ID = 'character-field-explorer-woman-v1';
const EXPLORER_ASSET_BY_GENDER = Object.freeze({
  man: EXPLORER_ASSET_ID,
  woman: EXPLORER_WOMAN_ASSET_ID
});
const NEARBY_NPC_ASSET_ID = 'character-city-explorer-v1';
const NEARBY_NPC_ASSET_IDS = Object.freeze([
  NEARBY_NPC_ASSET_ID,
  'character-city-explorer-woman-casual-v1',
  'character-city-explorer-casual-v1',
  'character-city-explorer-woman-worker-v1'
]);
const RESPONDER_ASSET_ID = 'character-civic-responder-v1';
const SHIP_CREW_ASSET_ID = 'character-ship-crew-v1';

const ASSET_BY_ROLE = Object.freeze({
  'player-character': EXPLORER_ASSET_ID,
  'nearby-npc-character': NEARBY_NPC_ASSET_ID,
  'civic-responder-character': RESPONDER_ASSET_ID,
  'ship-crew-character': SHIP_CREW_ASSET_ID
});

function setFallbackVisible(host, visible) {
  host?.traverse?.((object) => {
    if (object?.userData?.defaultCharacterFallback === true) object.visible = visible;
  });
}

function applyMaterialPalette(material, palette = {}) {
  const name = String(material?.name || '');
  const color = /SciFi_Light_Accent/i.test(name)
    ? palette.accent
    : /SciFi_MainDark/i.test(name)
      ? palette.secondary
      : /SciFi_Main/i.test(name)
        ? palette.uniform
        : /SciFi_Light/i.test(name)
          ? palette.shell
          : null;
  if (Number.isFinite(color)) material.color?.setHex?.(color);
}

function styleForRole(role = '') {
  if (role === 'nearby-npc-character') return 'licensed-stylized-city-explorer';
  if (role === 'civic-responder-character') return 'licensed-stylized-civic-responder';
  if (role === 'ship-crew-character') return 'licensed-stylized-expedition-crew';
  return 'licensed-stylized-field-explorer';
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
    if (options.hideAuthoredWeapons === true && /pistol|rifle|gun|weapon/i.test(String(object.name || ''))) {
      object.visible = false;
      object.userData.retiredAuthoredWeapon = true;
      return;
    }
    object.castShadow = true;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      material.depthWrite = true;
      applyMaterialPalette(material, options.palette);
    });
  });
  visual.userData.curatedCharacterAssetId = record.id;
  visual.userData.characterRole = options.role || 'player-character';
  visual.userData.collisionPolicy = record.collisionPolicy;
  visual.userData.performanceProfile = Object.freeze({
    style: styleForRole(visual.userData.characterRole),
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
  const armed = !!host?.userData?.heldEquipmentId;
  const target = armed
    ? isMoving && actions.armedRun ? 'armedRun' : actions.armedIdle ? 'armedIdle' : 'idle'
    : isRunning && actions.run ? 'run' : isMoving && actions.walk ? 'walk' : 'idle';
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
  delete host.userData.curatedCharacterLoadStarted;
  delete host.userData.curatedCharacterLoadToken;
  setFallbackVisible(host, true);
  return true;
}

async function attachCuratedExplorerCharacter(THREE, host, options = {}) {
  if (!host || host.userData.curatedCharacterLoadStarted) return false;
  const loadToken = {};
  host.userData.curatedCharacterLoadStarted = true;
  host.userData.curatedCharacterLoadToken = loadToken;
  try {
    const assetId = options.assetId || ASSET_BY_ROLE[options.role] || EXPLORER_ASSET_ID;
    const instance = await loadModelAsset(THREE, assetId, { signal: options.signal });
    if (options.isCurrent && !options.isCurrent()) {
      instance.dispose();
      if (host.userData.curatedCharacterLoadToken === loadToken) {
        host.userData.curatedCharacterLoadStarted = false;
        delete host.userData.curatedCharacterLoadToken;
      }
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
    if (host.userData.curatedCharacterLoadToken === loadToken) {
      host.userData.curatedCharacterLoadStarted = false;
      delete host.userData.curatedCharacterLoadToken;
      setFallbackVisible(host, options.failClosed !== true);
    }
    if (error?.name !== 'AbortError') {
      console.warn(options.failClosed === true
        ? 'Curated character unavailable; leaving the character host empty.'
        : 'Curated character unavailable; keeping the built-in character.', error);
    }
    return false;
  }
}

export {
  EXPLORER_ASSET_ID,
  EXPLORER_ASSET_BY_GENDER,
  EXPLORER_WOMAN_ASSET_ID,
  NEARBY_NPC_ASSET_ID,
  NEARBY_NPC_ASSET_IDS,
  RESPONDER_ASSET_ID,
  SHIP_CREW_ASSET_ID,
  attachCuratedExplorerCharacter,
  disposeCuratedCharacter,
  updateCuratedCharacterAnimation
};
