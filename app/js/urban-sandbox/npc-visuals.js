import {
  attachCuratedEquipmentVisual,
  disposeCuratedEquipmentVisual
} from './curated-equipment-visual.js?v=2';

function normalizedNodeName(object) {
  return String(object?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function curatedRightWrist(root) {
  const visual = root?.userData?.curatedCharacterAttachment?.visual;
  if (!visual) return null;
  let match = null;
  visual.traverse?.((object) => {
    if (match) return;
    const name = normalizedNodeName(object);
    if (name === 'wristr' || name === 'rightwrist') match = object;
  });
  return match;
}

// Interactive NPCs deliberately have no generated body or generated weapon.
// The host owns gameplay pose and interaction state while locally bundled,
// curated assets own every visible character/equipment mesh. A failed asset
// load therefore leaves an empty host instead of reviving the retired style.
function createUrbanNpcVisual(THREE, definition = {}) {
  const scale = Math.max(.86, Math.min(1.14, Number(definition.heightScale) || 1));
  const root = new THREE.Group();
  root.name = `Curated-only interactive ${definition.archetype || 'city'} NPC host`;
  root.scale.setScalar(scale);
  root.userData.actorId = String(definition.id || '');
  root.userData.characterStyle = 'curated-only-local-model';
  root.userData.proceduralCharacterMeshCount = 0;
  root.userData.proceduralEquipmentMeshCount = 0;
  root.userData.heldEquipmentId = String(definition.heldEquipment || '');

  const heldEquipment = definition.heldEquipment ? new THREE.Group() : null;
  if (heldEquipment) {
    heldEquipment.name = `Curated NPC held ${definition.heldEquipment} host`;
    heldEquipment.visible = false;
    heldEquipment.userData.equipmentPresentation = 'curated-only-local-model';
    heldEquipment.userData.proceduralEquipmentMeshCount = 0;
    root.add(heldEquipment);
    void attachCuratedEquipmentVisual(THREE, heldEquipment, definition.heldEquipment);
  }

  function syncHeldEquipment() {
    if (!heldEquipment) return false;
    const wrist = curatedRightWrist(root);
    const loaded = !!heldEquipment.userData.curatedEquipmentAssetId;
    if (!wrist || !loaded) {
      heldEquipment.visible = false;
      return false;
    }
    root.updateMatrixWorld?.(true);
    const wristWorld = wrist.getWorldPosition(new THREE.Vector3());
    heldEquipment.position.copy(root.worldToLocal(wristWorld));
    // Curated equipment is normalized to point along the character's +Z
    // heading. Retaining the character frame avoids inheriting the wrist
    // bone's imported twist, which was turning guns sideways/downward.
    heldEquipment.position.add(new THREE.Vector3(.018, -.018, .045));
    heldEquipment.rotation.set(0, 0, 0);
    heldEquipment.scale.setScalar(1);
    heldEquipment.visible = true;
    heldEquipment.userData.attachment = 'curated-right-wrist-position-character-heading';
    return true;
  }

  const setReaction = (reaction = '') => {
    root.userData.reaction = String(reaction || '');
    root.userData.weaponPose = heldEquipment ? 'curated-forward-ready' : 'unarmed';
  };
  setReaction(definition.reaction);
  root.userData.performanceProfile = Object.freeze({
    style: 'curated-only-local-model',
    transparentMaterials: 0,
    proceduralCharacterMeshes: 0,
    proceduralEquipmentMeshes: 0
  });

  return Object.freeze({
    root,
    armPivots: Object.freeze({ left: null, right: null }),
    legPivots: Object.freeze([]),
    phone: null,
    heldEquipment,
    materials: Object.freeze([]),
    setReaction,
    updateAnimation(deltaTime, moving = false, running = false) {
      const animated = root.userData.updateCuratedCharacterAnimation?.(moving, deltaTime, running) === true;
      syncHeldEquipment();
      return animated;
    },
    dispose() {
      if (heldEquipment) disposeCuratedEquipmentVisual(heldEquipment);
      root.userData.disposeCuratedCharacter?.();
      root.removeFromParent?.();
    }
  });
}

export { createUrbanNpcVisual };
