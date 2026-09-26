// Persistent equipment anchors survive changes of the licensed character rig.
// This host owns no geometry, materials, textures, or procedural avatar.
export function createPlayerCharacterHost(THREE) {
  const character = new THREE.Group();
  character.name = 'Player Character';
  character.userData.characterStyle = 'curated-only-local-model';
  const anchors = [-1, 1].map((side) => {
    const anchor = new THREE.Group();
    anchor.name = side < 0 ? 'Left equipment anchor' : 'Right equipment anchor';
    anchor.position.set(side * 0.285, 1.35, 0);
    character.add(anchor);
    return anchor;
  });
  character.userData.limbs = { arm1: anchors[0], arm2: anchors[1] };
  character.userData.characterRoot = character;
  character.userData.proceduralCharacterMeshCount = 0;
  character.visible = false;
  return character;
}
