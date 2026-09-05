import { createFieldNavigatorMesh } from './field-navigator-mesh.js?v=2';
import { attachCuratedExplorerCharacter, updateCuratedCharacterAnimation } from './curated-explorer-character.js?v=3';

function createWalkingCharacterHelpers({ THREE, scene }) {
  function createCharacterMesh() {
    const character = createFieldNavigatorMesh(THREE);
    scene.add(character);
    void attachCuratedExplorerCharacter(THREE, character, {
      role: 'player-character',
      isCurrent: () => character.parent === scene
    });
    return character;
  }

  function animateCharacterWalk(characterMesh, isMoving, deltaTime, isRunning = false) {
    if (!characterMesh || !characterMesh.userData.limbs) return;

    if (updateCuratedCharacterAnimation(characterMesh, isMoving, deltaTime, isRunning)) return;

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

  return {
    animateCharacterWalk,
    createCharacterMesh
  };
}

export { createWalkingCharacterHelpers };
