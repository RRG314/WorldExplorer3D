const ANIMAL_VISUAL_BUDGET = Object.freeze({ maxMeshes: 30, maxTriangles: 1800, maxMaterials: 8 });

function createMaterials(THREE, palette) {
  return {
    coat: new THREE.MeshStandardMaterial({ color: palette.coat, roughness: .88, metalness: 0, flatShading: true }),
    secondary: new THREE.MeshStandardMaterial({ color: palette.secondary, roughness: .9, metalness: 0, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: palette.dark, roughness: .82, metalness: .02, flatShading: true }),
    light: new THREE.MeshStandardMaterial({ color: palette.light, roughness: .92, metalness: 0, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: 0x080b0d, roughness: .28, metalness: .08 }),
    accent: new THREE.MeshStandardMaterial({ color: palette.accent || 0x2d7dff, roughness: .55, metalness: .15 })
  };
}

function buildFactory(THREE, group, materials) {
  let meshes = 0;
  let triangles = 0;
  const add = (geometry, material, name, position, scale = [1, 1, 1], rotation = null, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...(scale || [1, 1, 1]));
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    meshes++;
    triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes?.position?.count || 0) / 3;
    return mesh;
  };
  return { add, stats: () => ({ meshes, triangles: Math.round(triangles), materials: Object.keys(materials).length }) };
}

function createQuadruped(THREE, species, options) {
  const group = new THREE.Group();
  group.name = `World Discovery ${species}`;
  const materials = createMaterials(THREE, options.palette);
  const { add, stats } = buildFactory(THREE, group, materials);
  const sphere = () => new THREE.SphereGeometry(1, 9, 7);
  const body = add(sphere(), materials.coat, `${species} torso`, [0, .64, 0], options.body);
  add(sphere(), materials.secondary, `${species} chest`, [0, .7, -.43 * options.body[2]], [options.body[0] * .78, options.body[1] * .88, options.body[2] * .42]);
  const neck = add(new THREE.CylinderGeometry(.12, .18, options.neckHeight, 8), materials.coat, `${species} neck`, [0, .83 + options.neckHeight * .2, -.43 * options.body[2]], [1, 1, 1], [.22, 0, 0]);
  const headY = .88 + options.neckHeight * .55;
  const headZ = -.55 * options.body[2] - options.muzzleLength * .4;
  const head = add(sphere(), materials.coat, `${species} head`, [0, headY, headZ], options.head);
  add(sphere(), materials.secondary, `${species} muzzle`, [0, headY - .05, headZ - options.muzzleLength], [options.head[0] * .72, options.head[1] * .58, options.muzzleLength]);
  add(sphere(), materials.dark, `${species} nose`, [0, headY - .035, headZ - options.muzzleLength * 1.72], [.055, .043, .05]);
  [-1, 1].forEach((side) => {
    add(new THREE.ConeGeometry(options.earWidth, options.earHeight, options.earSides || 6), materials.coat, `${species} ear`, [side * options.head[0] * .62, headY + options.head[1] * .82, headZ + .015], [1, 1, 1], [0, 0, side * (options.earTilt || .12)]);
    add(sphere(), materials.eye, `${species} eye`, [side * options.head[0] * .73, headY + .04, headZ - options.head[2] * .76], [.025, .028, .018]);
  });
  const legs = [];
  const legZ = [-options.body[2] * .57, options.body[2] * .5];
  [-1, 1].forEach((side) => legZ.forEach((z, legIndex) => {
    const pivot = new THREE.Group();
    pivot.name = `${species} ${legIndex ? 'rear' : 'front'} ${side < 0 ? 'left' : 'right'} leg`;
    pivot.position.set(side * options.body[0] * .58, .54, z);
    group.add(pivot);
    add(new THREE.CylinderGeometry(options.legWidth * .84, options.legWidth, options.legLength * .56, 7), materials.coat, 'upper leg', [0, -options.legLength * .26, 0], [1, 1, 1], [legIndex ? -.06 : .05, 0, 0], pivot);
    add(new THREE.CylinderGeometry(options.legWidth * .58, options.legWidth * .75, options.legLength * .54, 7), materials.secondary, 'lower leg', [0, -options.legLength * .72, legIndex ? -.015 : .015], [1, 1, 1], [legIndex ? .04 : -.04, 0, 0], pivot);
    add(sphere(), materials.dark, 'paw or hoof', [0, -options.legLength, -.025], [options.legWidth * 1.2, options.legWidth * .55, options.legWidth * 1.5], null, pivot);
    legs.push(pivot);
  }));
  const tailPivot = new THREE.Group();
  tailPivot.name = `${species} tail`;
  tailPivot.position.set(0, .78, options.body[2] * .77);
  group.add(tailPivot);
  add(new THREE.CylinderGeometry(options.tailTip, options.tailBase, options.tailLength, 8), materials.coat, `${species} tail coat`, [0, options.tailLift, options.tailLength * .35], [1, 1, 1], [options.tailAngle, 0, 0], tailPivot);
  if (options.tailTipColor) add(sphere(), materials.light, `${species} tail tip`, [0, options.tailLift + Math.sin(options.tailAngle) * options.tailLength * .6, Math.cos(options.tailAngle) * options.tailLength * .6], [options.tailBase * .9, options.tailBase * 1.25, options.tailBase * .9], null, tailPivot);
  if (options.collar) {
    add(new THREE.TorusGeometry(options.head[0] * .8, .022, 6, 18), materials.accent, `${species} collar`, [0, headY - options.head[1] * .7, headZ + options.head[2] * .45], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(new THREE.SphereGeometry(.035, 7, 5), materials.accent, `${species} collar tag`, [0, headY - options.head[1] * .92, headZ - options.head[2] * .12]);
  }
  group.userData.animalRig = { body, neck, head, legs, tail: tailPivot, wings: [] };
  group.userData.performanceProfile = Object.freeze({ ...stats(), species });
  return group;
}

function createBird(THREE, species, waterbird = false) {
  const group = new THREE.Group();
  group.name = `World Discovery ${species}`;
  const materials = createMaterials(THREE, waterbird
    ? { coat: 0x5b4836, secondary: 0x9b8766, dark: 0x162c22, light: 0xe6e0cf, accent: 0xe0a332 }
    : { coat: 0x607080, secondary: 0x8597a5, dark: 0x26313a, light: 0xc9d1d5, accent: 0x9d6a40 });
  const { add, stats } = buildFactory(THREE, group, materials);
  const sphere = () => new THREE.SphereGeometry(1, 10, 7);
  const body = add(sphere(), materials.coat, `${species} torso`, [0, .48, 0], waterbird ? [.31, .3, .55] : [.25, .27, .42]);
  add(sphere(), materials.light, `${species} breast`, [0, .44, -.23], waterbird ? [.24, .22, .3] : [.19, .2, .24]);
  const head = add(sphere(), waterbird ? materials.dark : materials.coat, `${species} head`, [0, .72, -.36], waterbird ? [.22, .23, .22] : [.18, .19, .18]);
  const beak = add(new THREE.ConeGeometry(waterbird ? .11 : .06, waterbird ? .3 : .18, 5), materials.accent, `${species} beak`, [0, .69, waterbird ? -.63 : -.55], [1, 1, 1], [Math.PI / 2, 0, 0]);
  [-1, 1].forEach((side) => add(sphere(), materials.eye, `${species} eye`, [side * (waterbird ? .16 : .13), .76, -.47], [.021, .023, .018]));
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.name = `${species} wing`;
    pivot.position.set(side * .2, .54, -.02);
    group.add(pivot);
    add(new THREE.ConeGeometry(waterbird ? .2 : .24, waterbird ? .62 : .72, 5), materials.secondary, `${species} flight feathers`, [side * .18, 0, .08], [1, .5, 1], [Math.PI / 2, 0, side * Math.PI / 2], pivot);
    add(new THREE.ConeGeometry(.13, .45, 5), materials.coat, `${species} covert feathers`, [side * .1, .02, -.02], [1, .65, 1], [Math.PI / 2, 0, side * Math.PI / 2], pivot);
    return pivot;
  });
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * .1, .29, .02);
    group.add(leg);
    add(new THREE.CylinderGeometry(.015, .019, .25, 6), materials.accent, `${species} leg`, [0, -.12, 0], [1, 1, 1], null, leg);
    add(new THREE.BoxGeometry(.11, .018, .18), materials.accent, `${species} foot`, [0, -.25, -.03], null, null, leg);
    return leg;
  });
  const tail = add(new THREE.ConeGeometry(.16, .38, 5), materials.dark, `${species} tail`, [0, .47, .43], [1, .55, 1], [-Math.PI / 2, 0, 0]);
  group.userData.animalRig = { body, head, beak, legs, wings, tail };
  group.userData.performanceProfile = Object.freeze({ ...stats(), species });
  return group;
}

function refreshAnimalProfile(group, species) {
  let meshes = 0;
  let triangles = 0;
  const materials = new Set();
  group.traverse((child) => {
    if (!child?.isMesh) return;
    meshes++;
    const geometry = child.geometry;
    triangles += geometry?.index ? geometry.index.count / 3 : (geometry?.attributes?.position?.count || 0) / 3;
    (Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean).forEach((material) => materials.add(material.uuid));
  });
  group.userData.performanceProfile = Object.freeze({ meshes, triangles: Math.round(triangles), materials: materials.size, species });
  return group;
}

function decorateLivestock(THREE, group, species, detail = {}) {
  const coat = group.getObjectByName(`${species} torso`)?.material;
  const dark = group.getObjectByName('paw or hoof')?.material || coat;
  const light = group.getObjectByName(`${species} chest`)?.material || coat;
  const add = (geometry, material, name, position, rotation = null, scale = null) => {
    const mesh = new THREE.Mesh(geometry, material || coat);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (detail.horns) {
    [-1, 1].forEach((side) => add(
      new THREE.ConeGeometry(.045, detail.hornLength || .3, 5), light,
      `${species} horn`, [side * detail.hornSpread, detail.hornY, detail.hornZ],
      [0, 0, side * (detail.hornTilt || .45)]
    ));
  }
  if (detail.beard) add(new THREE.ConeGeometry(.06, .26, 5), dark, `${species} beard`, [0, detail.beardY, detail.beardZ], [0, 0, Math.PI]);
  if (detail.wool) {
    [[-.2, .87, -.1], [.2, .87, -.1], [0, .92, .28]].forEach((position, index) =>
      add(new THREE.DodecahedronGeometry(.25, 0), light, `${species} wool ${index + 1}`, position, null, [1.25, .85, 1.35])
    );
  }
  if (detail.mane) add(new THREE.BoxGeometry(.12, .62, .42), dark, `${species} mane`, [0, 1.16, -.3], [.22, 0, 0]);
  if (detail.patches) {
    add(new THREE.CircleGeometry(.18, 7), dark, `${species} flank patch left`, [-detail.patchX, .76, .08], [0, -Math.PI / 2, 0], [1, 1.35, 1]);
    add(new THREE.CircleGeometry(.14, 7), dark, `${species} flank patch right`, [detail.patchX, .72, -.2], [0, Math.PI / 2, 0], [1, 1.2, 1]);
  }
  if (detail.snoutDisc) add(new THREE.CylinderGeometry(.11, .11, .045, 8), light, `${species} snout disc`, [0, detail.snoutY, detail.snoutZ], [Math.PI / 2, 0, 0]);
  return refreshAnimalProfile(group, species);
}

function createChicken(THREE, species) {
  const group = createBird(THREE, species, false);
  const head = group.getObjectByName(`${species} head`);
  const red = new THREE.MeshStandardMaterial({ color: 0xb9251c, roughness: .82, metalness: 0, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd0a63a, roughness: .9, metalness: 0, flatShading: true });
  [-.06, 0, .06].forEach((x, index) => {
    const comb = new THREE.Mesh(new THREE.ConeGeometry(.045, .14 + index * .018, 5), red);
    comb.name = `${species} comb`;
    comb.position.set(x, .94, -.36);
    group.add(comb);
  });
  const wattle = new THREE.Mesh(new THREE.ConeGeometry(.045, .13, 5), red);
  wattle.name = `${species} wattle`;
  wattle.position.set(0, .58, -.48);
  wattle.rotation.z = Math.PI;
  group.add(wattle);
  if (head) head.material = gold;
  return refreshAnimalProfile(group, species);
}

function createAnimalModel(THREE, species) {
  const variants = {
    'trail-hound': () => createQuadruped(THREE, species, { palette: { coat: 0x8d623f, secondary: 0xc2a17c, dark: 0x2c241e, light: 0xe0d2bd, accent: 0x2d7dff }, body: [.36, .31, .56], head: [.25, .25, .26], neckHeight: .35, muzzleLength: .19, earWidth: .11, earHeight: .30, earSides: 7, earTilt: .22, legWidth: .07, legLength: .54, tailBase: .065, tailTip: .035, tailLength: .62, tailLift: .05, tailAngle: -.72, collar: true }),
    'field-retriever': () => createQuadruped(THREE, species, { palette: { coat: 0xc18a3d, secondary: 0xe0b768, dark: 0x432c18, light: 0xf0d69a, accent: 0x286ad1 }, body: [.39, .34, .62], head: [.27, .26, .29], neckHeight: .38, muzzleLength: .21, earWidth: .13, earHeight: .24, earSides: 7, earTilt: .58, legWidth: .075, legLength: .57, tailBase: .075, tailTip: .045, tailLength: .7, tailLift: .1, tailAngle: -.58, collar: true }),
    'park-terrier': () => createQuadruped(THREE, species, { palette: { coat: 0xd8d0bd, secondary: 0xa7855e, dark: 0x332a22, light: 0xf1ece1, accent: 0x2d7dff }, body: [.25, .25, .4], head: [.23, .23, .22], neckHeight: .18, muzzleLength: .13, earWidth: .1, earHeight: .26, earSides: 5, earTilt: .08, legWidth: .05, legLength: .35, tailBase: .045, tailTip: .026, tailLength: .34, tailLift: .08, tailAngle: -.3, collar: true }),
    'harbor-cat': () => createQuadruped(THREE, species, { palette: { coat: 0x566573, secondary: 0x8996a0, dark: 0x17202a, light: 0xd4d7d8, accent: 0x4db3bf }, body: [.27, .24, .48], head: [.22, .21, .20], neckHeight: .18, muzzleLength: .10, earWidth: .10, earHeight: .25, earSides: 4, earTilt: .14, legWidth: .052, legLength: .42, tailBase: .05, tailTip: .032, tailLength: .72, tailLift: .12, tailAngle: -1.15, collar: true }),
    'meadow-tabby': () => createQuadruped(THREE, species, { palette: { coat: 0xb9793e, secondary: 0xd4a269, dark: 0x4b2d1c, light: 0xe9d2b3, accent: 0x467e75 }, body: [.26, .23, .45], head: [.21, .2, .19], neckHeight: .16, muzzleLength: .095, earWidth: .095, earHeight: .24, earSides: 4, earTilt: .1, legWidth: .049, legLength: .4, tailBase: .047, tailTip: .027, tailLength: .68, tailLift: .16, tailAngle: -1.28, collar: true }),
    'midnight-cat': () => createQuadruped(THREE, species, { palette: { coat: 0x20252c, secondary: 0x414b57, dark: 0x080b0f, light: 0xe1e3df, accent: 0x7e68cf }, body: [.25, .22, .47], head: [.2, .2, .19], neckHeight: .17, muzzleLength: .09, earWidth: .1, earHeight: .27, earSides: 4, earTilt: .08, legWidth: .047, legLength: .41, tailBase: .046, tailTip: .025, tailLength: .74, tailLift: .18, tailAngle: -1.2, collar: true }),
    'pasture-cow': () => decorateLivestock(THREE, createQuadruped(THREE, species, { palette: { coat: 0xe7dfcf, secondary: 0xf3eee3, dark: 0x24211f, light: 0xd5c6ac, accent: 0x6d7f52 }, body: [.58, .5, .9], head: [.34, .31, .42], neckHeight: .46, muzzleLength: .28, earWidth: .14, earHeight: .24, earSides: 6, earTilt: .62, legWidth: .1, legLength: .72, tailBase: .055, tailTip: .035, tailLength: .68, tailLift: .06, tailAngle: -.8 }), species, { horns: true, hornLength: .31, hornSpread: .28, hornY: 1.38, hornZ: -.69, patches: true, patchX: .57 }),
    'wool-sheep': () => decorateLivestock(THREE, createQuadruped(THREE, species, { palette: { coat: 0xe5dfce, secondary: 0xf2eee3, dark: 0x3d3832, light: 0xf4f0e5, accent: 0x73825d }, body: [.48, .46, .72], head: [.25, .27, .3], neckHeight: .32, muzzleLength: .2, earWidth: .11, earHeight: .22, earSides: 6, earTilt: .55, legWidth: .07, legLength: .54, tailBase: .07, tailTip: .045, tailLength: .24, tailLift: .05, tailAngle: -.45 }), species, { wool: true }),
    'hill-goat': () => decorateLivestock(THREE, createQuadruped(THREE, species, { palette: { coat: 0xb6aa92, secondary: 0xd7cfbe, dark: 0x3c342a, light: 0xeee8da, accent: 0x687b56 }, body: [.4, .38, .69], head: [.25, .27, .31], neckHeight: .48, muzzleLength: .22, earWidth: .1, earHeight: .24, earSides: 6, earTilt: .48, legWidth: .064, legLength: .64, tailBase: .06, tailTip: .038, tailLength: .32, tailLift: .12, tailAngle: -.25 }), species, { horns: true, hornLength: .39, hornSpread: .19, hornY: 1.42, hornZ: -.58, hornTilt: .25, beard: true, beardY: .93, beardZ: -.83 }),
    'yard-chicken': () => createChicken(THREE, species),
    'heritage-pig': () => decorateLivestock(THREE, createQuadruped(THREE, species, { palette: { coat: 0xb87565, secondary: 0xd59b8c, dark: 0x4b302d, light: 0xe8b5a8, accent: 0x75624c }, body: [.48, .34, .7], head: [.3, .25, .32], neckHeight: .16, muzzleLength: .2, earWidth: .12, earHeight: .2, earSides: 4, earTilt: .28, legWidth: .075, legLength: .4, tailBase: .035, tailTip: .025, tailLength: .28, tailLift: .12, tailAngle: -1.4 }), species, { snoutDisc: true, snoutY: .91, snoutZ: -.71 }),
    'field-horse': () => decorateLivestock(THREE, createQuadruped(THREE, species, { palette: { coat: 0x70482f, secondary: 0x9b6845, dark: 0x211812, light: 0xd9c1a5, accent: 0x536d49 }, body: [.46, .48, .84], head: [.24, .32, .38], neckHeight: .78, muzzleLength: .3, earWidth: .09, earHeight: .29, earSides: 5, earTilt: .18, legWidth: .07, legLength: .94, tailBase: .09, tailTip: .055, tailLength: .84, tailLift: .08, tailAngle: -.7 }), species, { mane: true }),
    'woodland-fox': () => createQuadruped(THREE, species, { palette: { coat: 0xb94f21, secondary: 0xd77b42, dark: 0x2a1915, light: 0xe8d4b5, accent: 0x8f552c }, body: [.31, .27, .58], head: [.23, .22, .27], neckHeight: .28, muzzleLength: .22, earWidth: .12, earHeight: .34, earSides: 5, earTilt: .12, legWidth: .055, legLength: .49, tailBase: .115, tailTip: .055, tailLength: .86, tailLift: .12, tailAngle: -.92, tailTipColor: true }),
    'white-tailed-deer': () => createQuadruped(THREE, species, { palette: { coat: 0x8a6546, secondary: 0xb89a74, dark: 0x2c251e, light: 0xe1d6c5, accent: 0x765336 }, body: [.36, .38, .69], head: [.20, .25, .29], neckHeight: .64, muzzleLength: .21, earWidth: .11, earHeight: .38, earSides: 6, earTilt: .25, legWidth: .055, legLength: .82, tailBase: .07, tailTip: .04, tailLength: .38, tailLift: .08, tailAngle: -.55, tailTipColor: true }),
    'small-mammal': () => createQuadruped(THREE, species, { palette: { coat: 0x7d6247, secondary: 0xa68b6d, dark: 0x29221c, light: 0xd3c5b0, accent: 0x6f543a }, body: [.23, .21, .38], head: [.18, .18, .19], neckHeight: .14, muzzleLength: .09, earWidth: .08, earHeight: .18, earSides: 6, earTilt: .14, legWidth: .045, legLength: .34, tailBase: .04, tailTip: .025, tailLength: .46, tailLift: .06, tailAngle: -.9 }),
    mallard: () => createBird(THREE, species, true),
    'rock-pigeon': () => createBird(THREE, species, false),
    'marsh-mallard': () => createBird(THREE, species, true),
    'city-pigeon': () => createBird(THREE, species, false)
  };
  const model = (variants[species] || variants['small-mammal'])();
  model.userData.worldDiscoveryAnimal = { species, budget: ANIMAL_VISUAL_BUDGET };
  return model;
}

function animateAnimalModel(group, elapsed, speed = 1) {
  const rig = group?.userData?.animalRig;
  if (!rig) return;
  rig.legs?.forEach((leg, index) => { leg.rotation.x = Math.sin(elapsed * 7 * speed + index * Math.PI) * .22 * speed; });
  rig.wings?.forEach((wing, index) => { wing.rotation.z = (index ? 1 : -1) * (.12 + Math.sin(elapsed * 8 * speed) * .48 * speed); });
  if (rig.tail?.rotation) rig.tail.rotation.z = Math.sin(elapsed * 4.4 * speed) * .28;
  if (rig.head?.rotation) rig.head.rotation.y = Math.sin(elapsed * .75) * .08;
  if (rig.body?.position) rig.body.position.y += Math.sin(elapsed * 4 * speed) * .0009;
}

export { ANIMAL_VISUAL_BUDGET, animateAnimalModel, createAnimalModel };
