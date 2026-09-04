import { createFieldNavigatorMesh } from './field-navigator-mesh.js?v=1';
import { loadFirstAvailableModelAsset } from '../assets/model-asset-runtime.js?v=1';

function createWalkingCharacterHelpers({ THREE, scene }) {
  function createCharacterMesh() {
    const character = createFieldNavigatorMesh(THREE);
    scene.add(character);
    return character;
  }

  function animateCharacterWalk(characterMesh, isMoving, deltaTime) {
    if (!characterMesh || !characterMesh.userData.limbs) return;

    const mixer = characterMesh.userData.characterMixer;
    if (mixer) {
      mixer.update(deltaTime);
      const actions = characterMesh.userData.characterActions || {};
      const idleAction = actions.idle || null;
      const walkAction = actions.walk || null;
      if (idleAction && walkAction) {
        const blend = isMoving ? 1 : 0;
        walkAction.enabled = true;
        idleAction.enabled = true;
        walkAction.setEffectiveWeight(blend);
        idleAction.setEffectiveWeight(1 - blend);
      }
      return;
    }

    const limbs = characterMesh.userData.limbs;
    const scale = limbs.scale;

    if (isMoving) {
      characterMesh.userData.walkTime += deltaTime * 8;
      const t = characterMesh.userData.walkTime;
      const legSwing = Math.sin(t) * 0.5;
      const armSwing = Math.sin(t) * 0.4;

      limbs.leg1.rotation.x = legSwing;
      limbs.leg2.rotation.x = -legSwing;
      limbs.arm1.rotation.x = -armSwing;
      limbs.arm2.rotation.x = armSwing;
      limbs.body.position.y = 1.0 * scale + Math.abs(Math.sin(t * 2)) * 0.05 * scale;
    } else {
      const resetSpeed = deltaTime * 5;
      limbs.leg1.rotation.x *= 1 - resetSpeed;
      limbs.leg2.rotation.x *= 1 - resetSpeed;
      limbs.arm1.rotation.x *= 1 - resetSpeed;
      limbs.arm2.rotation.x *= 1 - resetSpeed;
      limbs.body.position.y = 1.0 * scale;
    }
  }

  function tuneCharacterMaterials(root, tier = 'high') {
    root.traverse((obj) => {
      if (!obj?.isMesh) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((entry) => {
        if (!entry) return;
        if ('roughness' in entry) entry.roughness = Math.max(.48, Math.min(.9, Number(entry.roughness) || .72));
        if ('metalness' in entry) entry.metalness = Math.min(.18, Number(entry.metalness) || 0);
        if (entry.map) {
          entry.map.anisotropy = Math.min(4, Number(entry.map.anisotropy || 1) * 2);
          entry.map.needsUpdate = true;
        }
        entry.needsUpdate = true;
      });
      obj.castShadow = tier === 'high';
      obj.receiveShadow = false;
    });
  }

  function attachHeroCharacter(characterMesh) {
    if (!characterMesh || typeof THREE.GLTFLoader === 'undefined') return;
    loadFirstAvailableModelAsset(THREE, [
      'character-field-navigator',
      'character-field-navigator-fallback'
    ], {
      name: 'Field Navigator promoted model',
      qualityTier: 'promoted',
      targetHeightMeters: 1.72
    }).then((instance) => {
      if (!characterMesh.parent) {
        instance.release();
        return;
      }
      const root = instance.root;
      tuneCharacterMaterials(root, 'high');
      root.rotation.y += Math.PI;

      for (const fallbackPart of characterMesh.children) fallbackPart.visible = false;
      characterMesh.add(root);
      characterMesh.userData.characterLod = null;
      characterMesh.userData.characterRoot = root;
      characterMesh.userData.characterAssetId = instance.record.id;
      characterMesh.userData.characterAssetRelease = instance.release;

      if (Array.isArray(instance.animations) && instance.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(root);
        const pickClip = (token) =>
          instance.animations.find((clip) => String(clip.name || '').toLowerCase().includes(token));
        const idleClip = pickClip('idle') || instance.animations[0];
        const walkClip = pickClip('walk') || pickClip('run') || instance.animations[Math.min(1, instance.animations.length - 1)] || idleClip;
        const idleAction = mixer.clipAction(idleClip);
        const walkAction = mixer.clipAction(walkClip);
        idleAction.play();
        walkAction.play();
        walkAction.setEffectiveWeight(0);
        characterMesh.userData.characterMixer = mixer;
        characterMesh.userData.characterActions = { idle: idleAction, walk: walkAction };
      }
    }).catch((error) => console.warn('Curated character model unavailable; using the local field navigator.', error));
  }

  return {
    animateCharacterWalk,
    attachHeroCharacter,
    createCharacterMesh
  };
}

export { createWalkingCharacterHelpers };
