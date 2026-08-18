function createEquipmentVisuals(THREE, characterMesh) {
  const hand = characterMesh?.userData?.limbs?.arm2;
  if (!hand) return null;
  const root = new THREE.Group();
  root.name = 'Urban equipped item';
  root.position.set(0, -.52, .08);
  root.rotation.set(-Math.PI * .48, 0, 0);
  hand.add(root);

  const dark = new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: .72, metalness: .24, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x71808a, roughness: .42, metalness: .62, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: 0x4c9ed1, emissive: 0x174b6b, emissiveIntensity: .38, roughness: .4, metalness: .18, flatShading: true });
  const safety = new THREE.MeshStandardMaterial({ color: 0xd59236, roughness: .66, metalness: .08, flatShading: true });
  const materials = [dark, metal, accent, safety];
  const geometries = new Set();
  const items = new Map();
  const makeItem = (id) => {
    const group = new THREE.Group();
    group.name = `${id} equipped visual`;
    group.visible = false;
    root.add(group);
    items.set(id, group);
    return group;
  };
  const add = (parent, geometry, material, name, position, rotation = null) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const flashlight = makeItem('flashlight');
  add(flashlight, new THREE.CylinderGeometry(.045, .055, .34, 10), dark, 'Field light grip', [0, 0, .13], [Math.PI * .5, 0, 0]);
  add(flashlight, new THREE.CylinderGeometry(.09, .055, .12, 10), metal, 'Field light head', [0, 0, .36], [Math.PI * .5, 0, 0]);
  add(flashlight, new THREE.CircleGeometry(.068, 10), accent, 'Field light lens', [0, 0, .425]);

  const baton = makeItem('baton');
  add(baton, new THREE.CylinderGeometry(.033, .04, .72, 10), dark, 'Impact baton shaft', [0, 0, .33], [Math.PI * .5, 0, 0]);
  add(baton, new THREE.CylinderGeometry(.055, .055, .18, 10), safety, 'Impact baton grip', [0, 0, -.12], [Math.PI * .5, 0, 0]);

  const sidearm = makeItem('pulse-sidearm');
  add(sidearm, new THREE.BoxGeometry(.14, .16, .36), dark, 'Pulse sidearm body', [0, .02, .2]);
  add(sidearm, new THREE.BoxGeometry(.105, .25, .12), metal, 'Pulse sidearm grip', [0, -.16, .08], [-.2, 0, 0]);
  add(sidearm, new THREE.CylinderGeometry(.052, .052, .22, 10), accent, 'Pulse sidearm emitter', [0, .02, .46], [Math.PI * .5, 0, 0]);
  add(sidearm, new THREE.BoxGeometry(.06, .045, .12), safety, 'Pulse sidearm sight', [0, .12, .18]);

  const charge = makeItem('concussion-charge');
  add(charge, new THREE.IcosahedronGeometry(.16, 1), dark, 'Concussion charge shell', [0, 0, .16]);
  add(charge, new THREE.TorusGeometry(.115, .025, 6, 12), accent, 'Concussion charge status ring', [0, 0, .17]);

  const setEquipped = (id) => {
    items.forEach((group, itemId) => { group.visible = itemId === id; });
    root.userData.equippedId = String(id || 'hands');
  };
  setEquipped('hands');
  return Object.freeze({
    root,
    setEquipped,
    pulse() {
      root.scale.setScalar(.9);
      globalThis.requestAnimationFrame?.(() => root.scale.setScalar(1));
    },
    dispose() {
      root.removeFromParent?.();
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  });
}

export { createEquipmentVisuals };
