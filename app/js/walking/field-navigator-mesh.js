import { createBeveledVehicleBoxGeometry, createTaperedPrismGeometry } from '../engine/classic-utility-car.js?v=3';
import { getExplorerAppearance, readExplorerAppearanceId } from '../characters/explorer-appearance.js?v=1';

function createFieldNavigatorMesh(THREE) {
  const character = new THREE.Group();
  const materials = {
    shell: new THREE.MeshStandardMaterial({ roughness: .76, metalness: .02 }),
    secondary: new THREE.MeshStandardMaterial({ roughness: .82, metalness: .03 }),
    pants: new THREE.MeshStandardMaterial({ roughness: .87, metalness: .02 }),
    shoes: new THREE.MeshStandardMaterial({ roughness: .9, metalness: .02 }),
    pack: new THREE.MeshStandardMaterial({ roughness: .8, metalness: .05 }),
    skin: new THREE.MeshStandardMaterial({ roughness: .74, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ roughness: .9, metalness: 0 }),
    accent: new THREE.MeshStandardMaterial({ roughness: .6, metalness: .08 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x182026, roughness: .34, metalness: 0 })
  };
  const ownedGeometries = new Set();
  const styledParts = {};
  const addMesh = (parent, geometry, material, name, position, rotation = null, scale = null) => {
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };

  const torso = addMesh(character, createTaperedPrismGeometry(THREE, {
    widthBottom: .42, widthTop: .56, height: .64, length: .3, frontInset: .04, rearInset: .04
  }), materials.shell, 'Explorer fitted outer layer', [0, 1.08, 0]);
  addMesh(character, new THREE.CylinderGeometry(.205, .22, .16, 18), materials.secondary, 'Explorer waist', [0, .74, 0]);
  addMesh(character, new THREE.BoxGeometry(.34, .045, .035), materials.accent, 'Explorer chest detail', [0, 1.13, .165]);

  const pack = addMesh(character, createBeveledVehicleBoxGeometry(THREE, .39, .5, .19, .065), materials.pack, 'Explorer backpack', [0, 1.08, -.235]);
  addMesh(pack, createBeveledVehicleBoxGeometry(THREE, .25, .15, .06, .025), materials.accent, 'Explorer backpack pocket', [0, -.12, -.12]);
  for (const side of [-1, 1]) {
    addMesh(character, new THREE.TorusGeometry(.19, .022, 8, 24, Math.PI * .82), materials.pack, 'Explorer pack shoulder strap', [side * .14, 1.16, .075], [0, Math.PI / 2, side < 0 ? .36 : -.36], [.8, 1, 1]);
  }

  addMesh(character, new THREE.CylinderGeometry(.09, .105, .12, 16), materials.skin, 'Explorer neck', [0, 1.45, 0]);
  addMesh(character, new THREE.SphereGeometry(.205, 24, 18), materials.skin, 'Explorer head', [0, 1.63, .015], null, [.92, 1.08, .95]);
  addMesh(character, new THREE.SphereGeometry(.034, 12, 8), materials.skin, 'Explorer nose', [0, 1.62, .21], null, [.82, 1.05, .72]);
  for (const side of [-1, 1]) {
    addMesh(character, new THREE.SphereGeometry(.018, 10, 7), materials.eye, side < 0 ? 'Explorer left eye' : 'Explorer right eye', [side * .067, 1.66, .2], null, [1, .7, .5]);
    addMesh(character, new THREE.SphereGeometry(.036, 10, 7), materials.skin, 'Explorer ear', [side * .19, 1.64, .01], null, [.55, 1, .65]);
  }
  addMesh(character, new THREE.BoxGeometry(.085, .012, .01), materials.hair, 'Explorer mouth', [0, 1.56, .208]);

  styledParts.hood = addMesh(character, new THREE.TorusGeometry(.15, .032, 10, 24), materials.shell, 'Explorer hoodie collar', [0, 1.43, -.035], [Math.PI / 2, 0, 0], [1.15, 1, .82]);
  styledParts.hoodBack = addMesh(character, new THREE.SphereGeometry(.205, 20, 14), materials.shell, 'Explorer folded hood', [0, 1.43, -.155], [.18, 0, 0], [1.15, .55, .72]);
  styledParts.cap = addMesh(character, new THREE.SphereGeometry(.215, 20, 10, 0, Math.PI * 2, 0, Math.PI * .52), materials.pack, 'Explorer field cap', [0, 1.75, .005], null, [1.03, .72, 1.02]);
  styledParts.capBrim = addMesh(character, new THREE.BoxGeometry(.27, .025, .14), materials.pack, 'Explorer cap brim', [0, 1.72, .17], [-.08, 0, 0]);
  styledParts.hairShort = addMesh(character, new THREE.SphereGeometry(.21, 20, 12, 0, Math.PI * 2, 0, Math.PI * .54), materials.hair, 'Explorer short hair', [0, 1.74, -.005], null, [1, .72, .98]);
  styledParts.hairCoiled = addMesh(character, new THREE.SphereGeometry(.235, 10, 8), materials.hair, 'Explorer coiled hair', [0, 1.74, -.025], [0, .2, 0], [1.08, .82, 1]);

  const makeArm = (side) => {
    const group = new THREE.Group();
    group.name = side < 0 ? 'Explorer left arm' : 'Explorer right arm';
    group.position.set(side * .31, 1.34, 0);
    addMesh(group, new THREE.SphereGeometry(.085, 14, 10), materials.shell, 'Explorer shoulder', [0, 0, 0], null, [1, 1.08, 1]);
    addMesh(group, new THREE.CylinderGeometry(.061, .068, .43, 14), materials.shell, 'Explorer sleeve', [0, -.22, 0]);
    addMesh(group, new THREE.SphereGeometry(.067, 12, 9), materials.skin, 'Explorer hand', [0, -.47, .012], null, [.9, 1.08, .78]);
    character.add(group);
    return group;
  };
  const makeLeg = (side) => {
    const group = new THREE.Group();
    group.name = side < 0 ? 'Explorer left leg' : 'Explorer right leg';
    group.position.set(side * .115, .7, 0);
    addMesh(group, new THREE.CylinderGeometry(.077, .095, .55, 14), materials.pants, 'Explorer trouser leg', [0, -.275, 0]);
    addMesh(group, createBeveledVehicleBoxGeometry(THREE, .18, .13, .31, .045), materials.shoes, 'Explorer trail shoe', [0, -.59, .065]);
    character.add(group);
    return group;
  };

  const arm1 = makeArm(-1);
  const arm2 = makeArm(1);
  const leg1 = makeLeg(-1);
  const leg2 = makeLeg(1);

  function applyAppearance(id) {
    const appearance = getExplorerAppearance(id);
    for (const [key, value] of Object.entries(appearance)) {
      if (materials[key]?.color && Number.isFinite(value)) materials[key].color.setHex(value);
    }
    styledParts.hood.visible = appearance.hood;
    styledParts.hoodBack.visible = appearance.hood;
    styledParts.cap.visible = appearance.cap;
    styledParts.capBrim.visible = appearance.cap;
    styledParts.hairShort.visible = appearance.hairStyle === 'short';
    styledParts.hairCoiled.visible = appearance.hairStyle === 'coiled';
    character.name = `${appearance.label} Explorer Character`;
    character.userData.characterAppearanceId = appearance.id;
    character.userData.characterStyle = `explorer-${appearance.id}`;
    return appearance;
  }

  character.userData.limbs = { leg1, leg2, arm1, arm2, body: torso, bodyBaseY: torso.position.y, scale: 1 };
  character.userData.walkTime = 0;
  character.userData.characterLod = null;
  character.userData.characterMixer = null;
  character.userData.characterActions = null;
  character.userData.characterRoot = character;
  character.userData.applyAppearance = applyAppearance;
  character.userData.performanceProfile = Object.freeze({ authority: 'explorer-character-visual', qualityTier: 'smooth-promoted', meshes: ownedGeometries.size, materials: Object.keys(materials).length, rig: 'four-limb-runtime' });
  character.userData.disposeCharacterVisual = () => {
    ownedGeometries.forEach((geometry) => geometry.dispose?.());
    Object.values(materials).forEach((entry) => entry.dispose?.());
  };
  applyAppearance(readExplorerAppearanceId());
  character.visible = false;
  return character;
}

export { createFieldNavigatorMesh };
