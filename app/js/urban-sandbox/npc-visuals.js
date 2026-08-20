import { createBeveledVehicleBoxGeometry, createTaperedPrismGeometry } from '../engine/classic-utility-car.js?v=3';

function createUrbanNpcVisual(THREE, definition = {}) {
  const scale = Math.max(.86, Math.min(1.14, Number(definition.heightScale) || 1));
  const root = new THREE.Group();
  root.name = `Interactive ${definition.archetype || 'city'} NPC`;
  root.scale.setScalar(scale);
  root.userData.actorId = String(definition.id || '');
  root.userData.characterStyle = `urban-${definition.archetype || 'pedestrian'}`;

  const outfit = new THREE.MeshStandardMaterial({ color: Number(definition.outfitColor || 0x496673), roughness: .82, metalness: .02, flatShading: true });
  const outfitDark = outfit.clone();
  outfitDark.color.multiplyScalar(.68);
  const pants = new THREE.MeshStandardMaterial({ color: Number(definition.pantsColor || 0x29333d), roughness: .9, metalness: .01, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: Number(definition.skinColor || 0x9a6d52), roughness: .9, metalness: 0, flatShading: true });
  const hair = new THREE.MeshStandardMaterial({ color: Number(definition.hairColor || 0x241d18), roughness: .94, metalness: 0, flatShading: true });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x3b474d, emissive: 0x182126, emissiveIntensity: .24, roughness: .92, metalness: .03, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: 0xb7a86b, roughness: .76, metalness: .08, flatShading: true });
  const device = new THREE.MeshStandardMaterial({ color: 0x18252d, emissive: 0x257cad, emissiveIntensity: .42, roughness: .42, metalness: .26, flatShading: true });
  const materials = [outfit, outfitDark, pants, skin, hair, shoe, trim, device];
  const geometries = new Set();
  const add = (geometry, material, name, position, rotation = null, parent = root) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };

  add(createTaperedPrismGeometry(THREE, {
    widthBottom: .43, widthTop: .52, height: .62, length: .3, frontInset: .02, rearInset: .02
  }), outfit, 'NPC tailored torso', [0, 1.08, 0]);
  add(createTaperedPrismGeometry(THREE, {
    widthBottom: .38, widthTop: .42, height: .12, length: .3, frontInset: .02, rearInset: .02
  }), outfitDark, 'NPC fitted waist layer', [0, .75, 0]);
  add(new THREE.CylinderGeometry(.105, .12, .12, 8), skin, 'NPC neck', [0, 1.43, 0]);
  add(new THREE.SphereGeometry(.23, 12, 8), skin, 'NPC head', [0, 1.61, 0]);
  add(new THREE.SphereGeometry(.185, 10, 7), skin, 'NPC face plane', [0, 1.59, .105]);
  add(new THREE.SphereGeometry(.035, 7, 5), skin, 'NPC nose', [0, 1.59, .225]);
  add(new THREE.SphereGeometry(.235, 12, 6, 0, Math.PI * 2, 0, Math.PI * .52), hair, 'NPC hair', [0, 1.68, -.01]);
  add(new THREE.BoxGeometry(.24, .035, .035), trim, 'NPC collar detail', [0, 1.36, .17]);

  const armPivots = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'NPC left arm rig' : 'NPC right arm rig';
    arm.position.set(side * .31, 1.31, 0);
    root.add(arm);
    add(new THREE.CylinderGeometry(.07, .06, .42, 8), outfit, 'NPC jacket sleeve', [0, -.2, 0], null, arm);
    add(new THREE.SphereGeometry(.075, 8, 6), skin, 'NPC hand', [0, -.43, 0], null, arm);
    armPivots[side < 0 ? 'left' : 'right'] = arm;
  }

  const legPivots = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = 'NPC leg rig';
    leg.position.set(side * .12, .73, 0);
    root.add(leg);
    add(new THREE.CylinderGeometry(.09, .075, .55, 8), pants, 'NPC trouser leg', [0, -.27, 0], null, leg);
    add(createBeveledVehicleBoxGeometry(THREE, .18, .13, .32, .035), shoe, 'NPC shaped shoe', [0, -.58, .07], null, leg);
    legPivots.push(leg);
  }

  const gearStyle = String(definition.archetype || '');
  if (/field|weekend|student/.test(gearStyle)) {
    add(createTaperedPrismGeometry(THREE, { widthBottom: .35, widthTop: .3, height: .46, length: .16, frontInset: .02, rearInset: .02 }), outfitDark, 'NPC day pack', [0, 1.08, -.2]);
    add(new THREE.BoxGeometry(.28, .05, .17), trim, 'NPC pack accent', [0, .93, -.29]);
  } else if (/service-worker/.test(gearStyle)) {
    add(new THREE.BoxGeometry(.5, .08, .31), trim, 'NPC reflective vest band', [0, 1.06, .165]);
    add(new THREE.CylinderGeometry(.24, .24, .08, 10), outfitDark, 'NPC work cap', [0, 1.84, 0]);
  } else if (/traveler/.test(gearStyle)) {
    add(createTaperedPrismGeometry(THREE, { widthBottom: .36, widthTop: .31, height: .5, length: .18, frontInset: .02, rearInset: .02 }), outfitDark, 'NPC travel pack', [0, 1.08, -.2]);
    add(new THREE.BoxGeometry(.2, .28, .12), trim, 'NPC travel pouch', [.3, .82, -.05]);
  } else if (/office|commuter/.test(gearStyle)) {
    add(createBeveledVehicleBoxGeometry(THREE, .28, .36, .12, .035), outfitDark, 'NPC work satchel', [-.33, .86, -.06]);
    add(new THREE.BoxGeometry(.04, .72, .04), trim, 'NPC satchel strap', [-.18, 1.1, .02], [0, 0, -.34]);
  } else {
    add(createBeveledVehicleBoxGeometry(THREE, .24, .31, .11, .035), outfitDark, 'NPC shoulder bag', [-.32, .88, -.06]);
  }

  const phone = add(new THREE.BoxGeometry(.09, .17, .035), device, 'NPC reporting phone', [0, -.48, .065], [-.15, 0, 0], armPivots.right);
  let heldEquipment = null;
  if (definition.heldEquipment) {
    heldEquipment = new THREE.Group();
    heldEquipment.name = `NPC held ${definition.heldEquipment}`;
    heldEquipment.position.set(0, -.48, .08);
    armPivots.right.add(heldEquipment);
    add(new THREE.BoxGeometry(.11, .14, .3), device, 'NPC equipment body', [0, 0, .12], null, heldEquipment);
    add(new THREE.BoxGeometry(.08, .2, .1), outfitDark, 'NPC equipment grip', [0, -.13, .04], [-.2, 0, 0], heldEquipment);
    add(new THREE.CylinderGeometry(.03, .03, .18, 8), trim, 'NPC equipment barrel', [0, 0, .34], [Math.PI * .5, 0, 0], heldEquipment);
  }
  const setReaction = (reaction = '') => {
    const reporting = reaction === 'reporting';
    const watching = reaction === 'watching';
    const talking = reaction === 'talking';
    const startled = reaction === 'startled' || reaction === 'hit';
    const downed = reaction === 'downed';
    const armed = reaction === 'armed';
    armPivots.right.rotation.x = reporting ? -1.42 : armed ? -1.18 : startled ? -1.05 : talking ? -.5 : watching ? -.35 : .04;
    armPivots.left.rotation.x = startled ? -1.05 : talking ? .38 : watching ? .2 : -.04;
    phone.visible = reporting;
    root.rotation.z = downed ? Math.PI * .5 : 0;
    root.userData.reaction = reaction;
  };
  setReaction(definition.reaction);
  root.userData.performanceProfile = Object.freeze({
    style: root.userData.characterStyle,
    transparentMaterials: 0
  });

  return Object.freeze({
    root,
    armPivots: Object.freeze(armPivots),
    legPivots: Object.freeze(legPivots),
    phone,
    heldEquipment,
    materials: Object.freeze(materials),
    setReaction,
    dispose() {
      root.removeFromParent?.();
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  });
}

export { createUrbanNpcVisual };
