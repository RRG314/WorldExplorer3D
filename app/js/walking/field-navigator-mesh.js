function createFieldNavigatorMesh(THREE) {
  const character = new THREE.Group();
  character.name = 'Field Navigator Character';
  character.userData.characterStyle = 'field-navigator-c';

  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: 0x3f5961, roughness: 0.86, metalness: 0.02, flatShading: true }),
    vest: new THREE.MeshStandardMaterial({ color: 0x77725f, roughness: 0.92, metalness: 0.01, flatShading: true }),
    pants: new THREE.MeshStandardMaterial({ color: 0x293039, roughness: 0.9, metalness: 0.02, flatShading: true }),
    boots: new THREE.MeshStandardMaterial({ color: 0x302c27, roughness: 0.94, metalness: 0.01, flatShading: true }),
    gear: new THREE.MeshStandardMaterial({ color: 0x26363b, roughness: 0.88, metalness: 0.03, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd6ad8f, roughness: 0.82, metalness: 0, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: 0xc88b35, roughness: 0.76, metalness: 0.05, flatShading: true })
  };

  const addMesh = (parent, geometry, material, name, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData.defaultCharacterFallback = true;
    parent.add(mesh);
    return mesh;
  };

  const body = addMesh(
    character,
    new THREE.BoxGeometry(0.46, 0.62, 0.27),
    materials.shell,
    'Navigator Jacket',
    [0, 1.08, 0]
  );
  addMesh(character, new THREE.BoxGeometry(0.5, 0.43, 0.31), materials.vest, 'Field Vest', [0, 1.1, 0.015]);
  addMesh(character, new THREE.BoxGeometry(0.14, 0.11, 0.08), materials.gear, 'Left Vest Pouch', [-0.14, 1.0, 0.19]);
  addMesh(character, new THREE.BoxGeometry(0.14, 0.11, 0.08), materials.gear, 'Right Vest Pouch', [0.14, 1.0, 0.19]);
  addMesh(character, new THREE.BoxGeometry(0.025, 0.46, 0.025), materials.accent, 'Vest Zip', [0, 1.12, 0.176]);
  addMesh(character, new THREE.BoxGeometry(0.38, 0.09, 0.04), materials.gear, 'Chest Strap', [0, 1.27, 0.175], [0, 0, -0.08]);

  addMesh(character, new THREE.BoxGeometry(0.38, 0.48, 0.18), materials.gear, 'Compact Backpack', [0, 1.1, -0.225]);
  addMesh(character, new THREE.BoxGeometry(0.27, 0.08, 0.035), materials.accent, 'Backpack Accent', [0, 1.0, -0.325]);
  addMesh(character, new THREE.BoxGeometry(0.055, 0.5, 0.055), materials.gear, 'Left Pack Strap', [-0.17, 1.12, 0.15], [0, 0, -0.12]);
  addMesh(character, new THREE.BoxGeometry(0.055, 0.5, 0.055), materials.gear, 'Right Pack Strap', [0.17, 1.12, 0.15], [0, 0, 0.12]);

  addMesh(
    character,
    new THREE.SphereGeometry(0.23, 8, 6),
    materials.shell,
    'Weather Hood',
    [0, 1.46, -0.035]
  ).scale.set(1.08, 1.0, 0.9);
  const head = addMesh(
    character,
    new THREE.SphereGeometry(0.205, 8, 6),
    materials.skin,
    'Navigator Head',
    [0, 1.54, 0.025]
  );
  head.scale.set(0.92, 1.08, 0.94);
  const cap = addMesh(
    character,
    new THREE.SphereGeometry(0.215, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.58),
    materials.gear,
    'Field Cap',
    [0, 1.665, 0.01]
  );
  cap.scale.set(1.05, 0.58, 1.03);
  addMesh(character, new THREE.BoxGeometry(0.27, 0.025, 0.16), materials.gear, 'Cap Brim', [0, 1.65, 0.185], [-0.08, 0, 0]);
  addMesh(character, new THREE.BoxGeometry(0.035, 0.025, 0.012), materials.gear, 'Left Eye', [-0.07, 1.56, 0.215]);
  addMesh(character, new THREE.BoxGeometry(0.035, 0.025, 0.012), materials.gear, 'Right Eye', [0.07, 1.56, 0.215]);

  const makeArm = (side) => {
    const group = new THREE.Group();
    group.name = side < 0 ? 'Left Arm' : 'Right Arm';
    group.position.set(side * 0.285, 1.35, 0);
    addMesh(group, new THREE.CylinderGeometry(0.065, 0.055, 0.48, 6), materials.shell, 'Sleeve', [0, -0.24, 0]);
    addMesh(group, new THREE.SphereGeometry(0.065, 7, 5), materials.skin, 'Hand', [0, -0.515, 0.015]);
    character.add(group);
    return group;
  };

  const makeLeg = (side) => {
    const group = new THREE.Group();
    group.name = side < 0 ? 'Left Leg' : 'Right Leg';
    group.position.set(side * 0.115, 0.76, 0);
    addMesh(group, new THREE.CylinderGeometry(0.09, 0.075, 0.58, 6), materials.pants, 'Trouser Leg', [0, -0.29, 0]);
    addMesh(group, new THREE.BoxGeometry(0.18, 0.13, 0.29), materials.boots, 'Trail Boot', [0, -0.62, 0.055]);
    addMesh(group, new THREE.BoxGeometry(0.16, 0.035, 0.3), materials.gear, 'Boot Sole', [0, -0.695, 0.06]);
    character.add(group);
    return group;
  };

  const arm1 = makeArm(-1);
  const arm2 = makeArm(1);
  const leg1 = makeLeg(-1);
  const leg2 = makeLeg(1);

  character.userData.limbs = { leg1, leg2, arm1, arm2, body, scale: 1 };
  character.userData.walkTime = 0;
  character.userData.characterLod = null;
  character.userData.characterMixer = null;
  character.userData.characterActions = null;
  character.userData.characterRoot = character;
  character.userData.performanceProfile = Object.freeze({
    meshes: 26,
    materials: Object.keys(materials).length,
    rig: 'procedural-four-limb'
  });
  character.visible = false;
  return character;
}

export { createFieldNavigatorMesh };
