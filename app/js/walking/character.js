import { createFieldNavigatorMesh } from './field-navigator-mesh.js?v=2';
import { readExplorerAppearanceId } from '../characters/explorer-appearance.js?v=1';

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
    const bodyBaseY = Number(limbs.bodyBaseY ?? 1.0) * scale;

    if (isMoving) {
      characterMesh.userData.walkTime += deltaTime * 8;
      const t = characterMesh.userData.walkTime;
      const legSwing = Math.sin(t) * 0.5;
      const armSwing = Math.sin(t) * 0.4;

      limbs.leg1.rotation.x = legSwing;
      limbs.leg2.rotation.x = -legSwing;
      limbs.arm1.rotation.x = -armSwing;
      limbs.arm2.rotation.x = armSwing;
      limbs.body.position.y = bodyBaseY + Math.abs(Math.sin(t * 2)) * 0.05 * scale;
    } else {
      const resetSpeed = deltaTime * 5;
      limbs.leg1.rotation.x *= 1 - resetSpeed;
      limbs.leg2.rotation.x *= 1 - resetSpeed;
      limbs.arm1.rotation.x *= 1 - resetSpeed;
      limbs.arm2.rotation.x *= 1 - resetSpeed;
      limbs.body.position.y = bodyBaseY;
    }
  }

  function attachHeroCharacter(characterMesh) {
    if (!characterMesh?.userData?.applyAppearance) return;
    const applySelectedAppearance = (event) => {
      const id = event?.detail?.id || readExplorerAppearanceId();
      characterMesh.userData.applyAppearance(id);
    };
    document.addEventListener('world-explorer:appearance-changed', applySelectedAppearance);
    characterMesh.userData.characterAppearanceListener = applySelectedAppearance;
    applySelectedAppearance();
  }

  return {
    animateCharacterWalk,
    attachHeroCharacter,
    createCharacterMesh
  };
}

export { createWalkingCharacterHelpers };
