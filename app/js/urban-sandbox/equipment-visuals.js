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
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x2d7dff, roughness: .64, metalness: .02, side: THREE.DoubleSide, flatShading: true });
  const canopyAccent = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: .7, metalness: .01, side: THREE.DoubleSide, flatShading: true });
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xd7e0e5, transparent: true, opacity: .9 });
  const materials = [dark, metal, accent, safety, canopyMaterial, canopyAccent, lineMaterial];
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
  add(baton, new THREE.CylinderGeometry(.033, .04, .72, 10), dark, 'Explorer staff shaft', [0, 0, .33], [Math.PI * .5, 0, 0]);
  add(baton, new THREE.CylinderGeometry(.055, .055, .18, 10), safety, 'Explorer staff grip', [0, 0, -.12], [Math.PI * .5, 0, 0]);

  const sidearm = makeItem('pulse-sidearm');
  add(sidearm, new THREE.BoxGeometry(.14, .16, .36), dark, 'Pulse sidearm body', [0, .02, .2]);
  add(sidearm, new THREE.BoxGeometry(.105, .25, .12), metal, 'Pulse sidearm grip', [0, -.16, .08], [-.2, 0, 0]);
  add(sidearm, new THREE.CylinderGeometry(.052, .052, .22, 10), accent, 'Pulse sidearm emitter', [0, .02, .46], [Math.PI * .5, 0, 0]);
  add(sidearm, new THREE.BoxGeometry(.06, .045, .12), safety, 'Pulse sidearm sight', [0, .12, .18]);

  const charge = makeItem('concussion-charge');
  add(charge, new THREE.IcosahedronGeometry(.16, 1), dark, 'Concussion charge shell', [0, 0, .16]);
  add(charge, new THREE.TorusGeometry(.115, .025, 6, 12), accent, 'Concussion charge status ring', [0, 0, .17]);

  const laser = makeItem('laser-gun');
  add(laser, new THREE.BoxGeometry(.15, .16, .43), dark, 'Laser gun body', [0, .02, .22]);
  add(laser, new THREE.BoxGeometry(.11, .27, .13), metal, 'Laser gun grip', [0, -.17, .08], [-.2, 0, 0]);
  add(laser, new THREE.CylinderGeometry(.045, .062, .32, 10), accent, 'Laser gun emitter', [0, .02, .54], [Math.PI * .5, 0, 0]);
  add(laser, new THREE.BoxGeometry(.08, .055, .17), safety, 'Laser gun sight', [0, .13, .2]);

  const paintball = makeItem('paintball-gun');
  add(paintball, new THREE.CylinderGeometry(.045, .052, .5, 10), dark, 'Paintball barrel', [0, .02, .3], [Math.PI * .5, 0, 0]);
  add(paintball, new THREE.BoxGeometry(.15, .18, .27), metal, 'Paintball receiver', [0, .01, .08]);
  add(paintball, new THREE.BoxGeometry(.11, .28, .12), dark, 'Paintball grip', [0, -.18, .04], [-.18, 0, 0]);
  add(paintball, new THREE.SphereGeometry(.13, 10, 7), safety, 'Paintball hopper', [0, .2, .03]);

  const parachutePack = new THREE.Group();
  parachutePack.name = 'Explorer parachute pack';
  parachutePack.visible = false;
  characterMesh.add(parachutePack);
  add(parachutePack, new THREE.BoxGeometry(.43, .55, .2), dark, 'Parachute pack body', [0, 1.08, -.3]);
  add(parachutePack, new THREE.BoxGeometry(.34, .09, .025), safety, 'Parachute pack deployment stripe', [0, 1.13, -.414]);
  [-1, 1].forEach((side) => add(
    parachutePack,
    new THREE.CylinderGeometry(.018, .018, .64, 6),
    metal,
    'Parachute harness strap',
    [side * .17, 1.08, -.13],
    [0, 0, side * .1]
  ));

  const parachuteCanopy = new THREE.Group();
  parachuteCanopy.name = 'Deployed explorer parachute';
  parachuteCanopy.position.set(0, 3.15, 0);
  parachuteCanopy.visible = false;
  characterMesh.add(parachuteCanopy);
  const canopy = add(
    parachuteCanopy,
    new THREE.SphereGeometry(1.75, 20, 8, 0, Math.PI * 2, 0, Math.PI * .5),
    canopyMaterial,
    'Parachute canopy',
    [0, 0, 0]
  );
  canopy.scale.set(1, .48, .78);
  [-.72, 0, .72].forEach((x) => add(
    parachuteCanopy,
    new THREE.BoxGeometry(.34, .025, 1.18),
    canopyAccent,
    'Parachute canopy identity panel',
    [x, .03, 0]
  ));
  const linePoints = [];
  [[-1.35, -.2, -.72], [-1.35, -.2, .72], [1.35, -.2, -.72], [1.35, -.2, .72]].forEach((point) => {
    linePoints.push(...point, point[0] * .12, -2.08, point[2] * .12);
  });
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
  geometries.add(lineGeometry);
  const suspensionLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  suspensionLines.name = 'Parachute suspension lines';
  parachuteCanopy.add(suspensionLines);

  const setEquipped = (id) => {
    items.forEach((group, itemId) => { group.visible = itemId === id; });
    parachutePack.visible = id === 'parachute' || parachuteCanopy.visible;
    root.userData.equippedId = String(id || 'hands');
  };
  setEquipped('hands');
  return Object.freeze({
    root,
    setEquipped,
    setParachuteDeployed(deployed = false) {
      parachuteCanopy.visible = deployed === true;
      parachutePack.visible = deployed === true || root.userData.equippedId === 'parachute';
    },
    pulse() {
      root.scale.setScalar(.9);
      globalThis.requestAnimationFrame?.(() => root.scale.setScalar(1));
    },
    dispose() {
      root.removeFromParent?.();
      parachutePack.removeFromParent?.();
      parachuteCanopy.removeFromParent?.();
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  });
}

export { createEquipmentVisuals };
