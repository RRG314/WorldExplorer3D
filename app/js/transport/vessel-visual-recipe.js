import { transportDamagePresentation } from './damage-model.js?v=1';

const COLORS = Object.freeze({
  hull: 0x174d55,
  hullLower: 0x7d3425,
  deck: 0xd3cfbd,
  accent: 0xd36b35,
  dark: 0x27343a,
  glass: 0x163b49,
  metal: 0xaeb9b8,
  canvas: 0xe3decb,
  containerA: 0x2c7777,
  containerB: 0xb75e35,
  containerC: 0xb4b1a3
});

function mat(THREE, color, roughness = .62, metalness = .08, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function cylinderBetween(THREE, start, end, radius, material, segments = 8) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function hullGeometry(THREE, entry, lower = false) {
  const length = entry.dimensions.length;
  const halfWidth = entry.dimensions.width * .5;
  const draft = Math.max(.25, entry.dimensions.draft);
  const freeboard = Math.max(.55, Math.min(entry.dimensions.height * .17, entry.dimensions.width * .45));
  const stations = [
    { z: -.5, width: .7, top: freeboard * .62, keel: -draft * .7 },
    { z: -.4, width: .96, top: freeboard * .76, keel: -draft },
    { z: -.12, width: 1, top: freeboard * .82, keel: -draft },
    { z: .25, width: .94, top: freeboard * .92, keel: -draft * .78 },
    { z: .43, width: .58, top: freeboard * 1.04, keel: -draft * .35 },
    { z: .5, width: .04, top: freeboard * 1.12, keel: freeboard * .28 }
  ];
  const vertices = [];
  const indices = [];
  stations.forEach((station) => {
    const yTop = lower ? 0 : station.top;
    const yKeel = station.keel;
    vertices.push(
      -halfWidth * station.width, yTop, length * station.z,
      halfWidth * station.width, yTop, length * station.z,
      halfWidth * station.width * .55, yKeel, length * station.z,
      -halfWidth * station.width * .55, yKeel, length * station.z
    );
  });
  for (let ring = 0; ring < stations.length - 1; ring += 1) {
    const next = ring + 1;
    for (let side = 0; side < 4; side += 1) {
      const following = (side + 1) % 4;
      const a = ring * 4 + side;
      const b = ring * 4 + following;
      const c = next * 4 + side;
      const d = next * 4 + following;
      indices.push(a, c, b, b, c, d);
    }
  }
  indices.push(0, 3, 2, 0, 2, 1);
  const last = (stations.length - 1) * 4;
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addRail(THREE, group, entry, materials, zStart = -.34, zEnd = .42) {
  const x = entry.dimensions.width * .46;
  const y = Math.max(.9, Math.min(entry.dimensions.height * .13, entry.dimensions.width * .38));
  [-1, 1].forEach((side) => {
    const points = [zStart, (zStart + zEnd) * .5, zEnd].map((z) => new THREE.Vector3(side * x, y, entry.dimensions.length * z));
    const upper = points.map((point) => point.clone().add(new THREE.Vector3(0, Math.max(.38, entry.dimensions.width * .08), 0)));
    for (let index = 0; index < upper.length - 1; index += 1) group.add(cylinderBetween(THREE, upper[index], upper[index + 1], Math.max(.018, entry.dimensions.width * .005), materials.metal));
    points.forEach((point, index) => group.add(cylinderBetween(THREE, point, upper[index], Math.max(.016, entry.dimensions.width * .004), materials.metal)));
  });
}

function addNavigationLights(THREE, group, entry, y, z) {
  [[-1, 0xff4d47], [1, 0x4dff82]].forEach(([side, color]) => {
    const light = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.06, entry.dimensions.width * .012), 8, 6), new THREE.MeshBasicMaterial({ color }));
    light.position.set(side * entry.dimensions.width * .48, y, z);
    light.userData.vesselNavigationLight = true;
    group.add(light);
  });
}

function addWindowBand(THREE, group, entry, materials, options = {}) {
  const width = options.width || entry.dimensions.width * .78;
  const height = options.height || Math.max(.38, entry.dimensions.height * .055);
  const length = options.length || entry.dimensions.length * .16;
  const y = options.y || entry.dimensions.height * .24;
  const z = options.z || entry.dimensions.length * .08;
  const count = Math.max(3, Math.min(options.mobile ? 8 : 14, options.count || Math.round(length / Math.max(.9, height * 1.9))));
  [-1, 1].forEach((side) => {
    for (let index = 0; index < count; index += 1) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(.035, height, Math.max(.22, length / count * .58)), materials.glass);
      window.position.set(side * width * .505, y, z - length * .42 + index * length * .84 / Math.max(1, count - 1));
      group.add(window);
    }
  });
}

function addMast(THREE, group, x, y, z, height, materials, options = {}) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(options.radius || .07, options.radius || .09, height, 8), materials.metal);
  mast.position.set(x, y + height * .5, z);
  group.add(mast);
  if (options.radar !== false) {
    const radar = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.5, height * .18), .08, .18), materials.deck);
    radar.position.set(x, y + height * .82, z);
    group.add(radar);
  }
  return mast;
}

function addRunabout(THREE, group, entry, materials) {
  const width = entry.dimensions.width;
  const length = entry.dimensions.length;
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(width * .72, .24, length * .3), materials.dark);
  cockpit.position.set(0, .72, -length * .11);
  group.add(cockpit);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * .66, .42, .06), materials.glass);
  windshield.position.set(0, 1.1, length * .08);
  windshield.rotation.x = -.28;
  group.add(windshield);
  [-1, 1].forEach((side) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(width * .25, .55, .28), materials.deck);
    seat.position.set(side * width * .22, 1.06, -length * .12);
    seat.rotation.x = -.12;
    group.add(seat);
  });
  const archY = 1.68;
  [-1, 1].forEach((side) => {
    group.add(cylinderBetween(
      THREE,
      new THREE.Vector3(side * width * .34, .9, -length * .19),
      new THREE.Vector3(side * width * .34, archY, -length * .19),
      .035,
      materials.metal
    ));
  });
  group.add(cylinderBetween(
    THREE,
    new THREE.Vector3(-width * .34, archY, -length * .19),
    new THREE.Vector3(width * .34, archY, -length * .19),
    .035,
    materials.metal
  ));
  const motor = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), materials.dark);
  motor.scale.set(width * .085, .3, length * .032);
  motor.position.set(0, .42, -length * .49);
  group.add(motor);
  const propShaft = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, .42, 8), materials.metal);
  propShaft.position.set(0, -.02, -length * .52);
  propShaft.rotation.x = -.18;
  group.add(propShaft);
}

function addSailboat(THREE, group, entry, materials) {
  const length = entry.dimensions.length;
  const mastHeight = entry.dimensions.height * .78;
  const mastY = 1;
  const mastZ = length * .04;
  addMast(THREE, group, 0, mastY, mastZ, mastHeight, materials, { radar: false, radius: .055 });
  const boom = cylinderBetween(THREE, new THREE.Vector3(0, mastY + mastHeight * .48, mastZ), new THREE.Vector3(0, mastY + mastHeight * .48, -length * .33), .045, materials.metal);
  group.add(boom);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, mastHeight * .62);
  sailShape.lineTo(length * .34, 0);
  sailShape.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), materials.canvas);
  sail.rotation.y = Math.PI / 2;
  sail.position.set(.035, mastY + mastHeight * .05, mastZ);
  group.add(sail);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(entry.dimensions.width * .64, .65, length * .2), materials.deck);
  cabin.position.set(0, 1.05, -length * .15);
  group.add(cabin);
  addWindowBand(THREE, group, entry, materials, { width: entry.dimensions.width * .65, height: .22, length: length * .16, y: 1.22, z: -length * .15, count: 4 });
  addRail(THREE, group, entry, materials, -.38, .42);
}

function addWheelhouse(THREE, group, entry, materials, options = {}) {
  const width = entry.dimensions.width * (options.widthScale || .7);
  const length = entry.dimensions.length * (options.lengthScale || .18);
  const baseY = options.baseY || Math.max(1, entry.dimensions.height * .1);
  const houseHeight = options.height || Math.max(1.2, entry.dimensions.height * .18);
  const z = options.z ?? entry.dimensions.length * .08;
  const house = new THREE.Mesh(new THREE.BoxGeometry(width, houseHeight, length), materials.deck);
  house.position.set(0, baseY + houseHeight * .5, z);
  group.add(house);
  addWindowBand(THREE, group, entry, materials, { width, height: Math.min(.62, houseHeight * .35), length, y: baseY + houseHeight * .68, z, count: options.mobile ? 4 : 7, mobile: options.mobile });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.07, .12, length * 1.08), materials.accent);
  roof.position.set(0, baseY + houseHeight + .06, z);
  group.add(roof);
  return { topY: baseY + houseHeight, z, width, length };
}

function addWorkboat(THREE, group, entry, materials, options) {
  const house = addWheelhouse(THREE, group, entry, materials, { z: entry.dimensions.length * .18, mobile: options.mobile });
  addMast(THREE, group, 0, house.topY, house.z, entry.dimensions.height * .35, materials);
  const craneBase = new THREE.Vector3(-entry.dimensions.width * .25, 1.1, -entry.dimensions.length * .2);
  const craneTop = craneBase.clone().add(new THREE.Vector3(0, entry.dimensions.height * .28, 0));
  const craneTip = craneTop.clone().add(new THREE.Vector3(entry.dimensions.width * .34, -.15, -entry.dimensions.length * .12));
  group.add(cylinderBetween(THREE, craneBase, craneTop, .08, materials.dark));
  group.add(cylinderBetween(THREE, craneTop, craneTip, .075, materials.dark));
  addRail(THREE, group, entry, materials, -.43, -.03);
}

function addTug(THREE, group, entry, materials, options) {
  const lower = addWheelhouse(THREE, group, entry, materials, { z: entry.dimensions.length * .06, widthScale: .66, lengthScale: .2, height: entry.dimensions.height * .22, mobile: options.mobile });
  const upper = addWheelhouse(THREE, group, entry, materials, { z: lower.z, widthScale: .52, lengthScale: .15, baseY: lower.topY, height: entry.dimensions.height * .15, mobile: options.mobile });
  addMast(THREE, group, 0, upper.topY, upper.z, entry.dimensions.height * .28, materials);
  [-1, 1].forEach((side) => {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(.3, .42, entry.dimensions.height * .18, 10), materials.dark);
    stack.position.set(side * entry.dimensions.width * .17, lower.topY + entry.dimensions.height * .08, -entry.dimensions.length * .12);
    group.add(stack);
  });
  const fenderCount = options.mobile ? 6 : 10;
  for (let index = 0; index < fenderCount; index += 1) {
    [-1, 1].forEach((side) => {
      const fender = new THREE.Mesh(new THREE.TorusGeometry(entry.dimensions.width * .055, entry.dimensions.width * .018, 6, 12), materials.dark);
      fender.rotation.y = Math.PI / 2;
      fender.position.set(side * entry.dimensions.width * .5, .5, entry.dimensions.length * (-.36 + index * .72 / Math.max(1, fenderCount - 1)));
      group.add(fender);
    });
  }
}

function addFerry(THREE, group, entry, materials, options) {
  const deckCount = options.mobile ? 2 : 3;
  const deckHeight = entry.dimensions.height * .1;
  for (let level = 0; level < deckCount; level += 1) {
    const widthScale = 1 - level * .08;
    const block = new THREE.Mesh(new THREE.BoxGeometry(entry.dimensions.width * .78 * widthScale, deckHeight, entry.dimensions.length * .62), materials.deck);
    block.position.set(0, 1.2 + deckHeight * (.5 + level), -entry.dimensions.length * .04);
    group.add(block);
    addWindowBand(THREE, group, entry, materials, { width: entry.dimensions.width * .78 * widthScale, height: deckHeight * .24, length: entry.dimensions.length * .52, y: 1.2 + deckHeight * (.62 + level), z: -entry.dimensions.length * .04, mobile: options.mobile });
  }
  const bridge = addWheelhouse(THREE, group, entry, materials, { z: entry.dimensions.length * .25, widthScale: .72, lengthScale: .12, baseY: 1.2 + deckHeight * deckCount, height: deckHeight * .8, mobile: options.mobile });
  addMast(THREE, group, 0, bridge.topY, bridge.z, entry.dimensions.height * .24, materials);
}

function addResearch(THREE, group, entry, materials, options) {
  const house = addWheelhouse(THREE, group, entry, materials, { z: entry.dimensions.length * .14, widthScale: .68, lengthScale: .27, height: entry.dimensions.height * .22, mobile: options.mobile });
  const upper = addWheelhouse(THREE, group, entry, materials, { z: entry.dimensions.length * .2, widthScale: .54, lengthScale: .15, baseY: house.topY, height: entry.dimensions.height * .12, mobile: options.mobile });
  addMast(THREE, group, 0, upper.topY, upper.z, entry.dimensions.height * .32, materials);
  const craneBase = new THREE.Vector3(entry.dimensions.width * .23, 1.25, -entry.dimensions.length * .25);
  const craneTop = craneBase.clone().add(new THREE.Vector3(0, entry.dimensions.height * .25, 0));
  const craneTip = craneTop.clone().add(new THREE.Vector3(-entry.dimensions.width * .32, -.5, -entry.dimensions.length * .18));
  group.add(cylinderBetween(THREE, craneBase, craneTop, .18, materials.dark, 10));
  group.add(cylinderBetween(THREE, craneTop, craneTip, .15, materials.dark, 10));
  addRail(THREE, group, entry, materials, -.43, -.05);
}

function addCargo(THREE, group, entry, materials, options) {
  const bridge = addWheelhouse(THREE, group, entry, materials, { z: -entry.dimensions.length * .34, widthScale: .72, lengthScale: .1, height: entry.dimensions.height * .18, mobile: options.mobile });
  const bridgeUpper = addWheelhouse(THREE, group, entry, materials, { z: bridge.z, widthScale: .58, lengthScale: .075, baseY: bridge.topY, height: entry.dimensions.height * .12, mobile: options.mobile });
  addMast(THREE, group, 0, bridgeUpper.topY, bridge.z, entry.dimensions.height * .22, materials);
  const rows = options.mobile ? 3 : 5;
  const columns = options.mobile ? 2 : 4;
  const levels = options.mobile ? 2 : 3;
  const containerLength = entry.dimensions.length * .1;
  const containerWidth = entry.dimensions.width * .16;
  const containerHeight = entry.dimensions.height * .055;
  const containerMaterials = [materials.containerA, materials.containerB, materials.containerC];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let level = 0; level < levels; level += 1) {
        const container = new THREE.Mesh(new THREE.BoxGeometry(containerWidth, containerHeight, containerLength), containerMaterials[(row + column + level) % containerMaterials.length]);
        container.position.set(
          (column - (columns - 1) * .5) * containerWidth * 1.05,
          1.2 + containerHeight * (.5 + level),
          entry.dimensions.length * (.24 - row * .11)
        );
        group.add(container);
      }
    }
  }
}

function createVesselVisual(THREE, entry, options = {}) {
  const materials = {
    hull: mat(THREE, COLORS.hull, .58, .15, { emissive: 0x031416, emissiveIntensity: .16 }),
    hullLower: mat(THREE, COLORS.hullLower, .72, .1),
    deck: mat(THREE, COLORS.deck, .66, .04),
    accent: mat(THREE, COLORS.accent, .52, .08),
    dark: mat(THREE, COLORS.dark, .72, .22),
    glass: mat(THREE, COLORS.glass, .22, .16, { emissive: 0x06151c, emissiveIntensity: .28 }),
    metal: mat(THREE, COLORS.metal, .34, .6),
    canvas: mat(THREE, COLORS.canvas, .82, .01, { side: THREE.DoubleSide }),
    containerA: mat(THREE, COLORS.containerA, .7, .12),
    containerB: mat(THREE, COLORS.containerB, .72, .1),
    containerC: mat(THREE, COLORS.containerC, .74, .08)
  };
  const root = new THREE.Group();
  const hull = new THREE.Mesh(hullGeometry(THREE, entry), materials.hull);
  const lower = new THREE.Mesh(hullGeometry(THREE, entry, true), materials.hullLower);
  lower.scale.set(1.002, 1, 1.002);
  root.add(hull, lower);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(entry.dimensions.width * .78, Math.max(.1, entry.dimensions.width * .018), entry.dimensions.length * .7), materials.deck);
  deck.position.set(0, Math.max(.6, Math.min(entry.dimensions.height * .12, entry.dimensions.width * .36)), -.03 * entry.dimensions.length);
  root.add(deck);

  if (entry.role === 'runabout') addRunabout(THREE, root, entry, materials);
  else if (entry.role === 'sailboat') addSailboat(THREE, root, entry, materials);
  else if (entry.role === 'workboat') addWorkboat(THREE, root, entry, materials, options);
  else if (entry.role === 'tug') addTug(THREE, root, entry, materials, options);
  else if (entry.role === 'ferry') addFerry(THREE, root, entry, materials, options);
  else if (entry.role === 'research') addResearch(THREE, root, entry, materials, options);
  else addCargo(THREE, root, entry, materials, options);

  addNavigationLights(THREE, root, entry, Math.max(.8, entry.dimensions.height * .1), entry.dimensions.length * .34);
  [-1, 1].forEach((side) => {
    const damagePanel = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(.04, entry.dimensions.width * .008),
        Math.max(.28, Math.min(entry.dimensions.height * .12, entry.dimensions.width * .18)),
        Math.max(.65, entry.dimensions.length * .08)
      ),
      mat(THREE, 0x5a3428, .9, .04)
    );
    damagePanel.position.set(side * entry.dimensions.width * .493, 0, entry.dimensions.length * .1);
    damagePanel.visible = false;
    damagePanel.userData.vesselDamagePanel = true;
    damagePanel.userData.damageSide = side;
    damagePanel.userData.baseX = damagePanel.position.x;
    root.add(damagePanel);
  });
  const smokeRadius = Math.max(.18, entry.dimensions.width * .055);
  for (let index = 0; index < 4; index += 1) {
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(smokeRadius * (1 + index * .16), 16, 10),
      mat(THREE, index % 2 ? 0x32383b : 0x202629, .98, 0, { transparent: true, opacity: 0, depthWrite: false })
    );
    smoke.position.set(
      (index % 2 ? 1 : -1) * smokeRadius * .42,
      entry.dimensions.height * .32 + smokeRadius * index * 1.25,
      -entry.dimensions.length * .2 + index * smokeRadius * .28
    );
    smoke.visible = false;
    smoke.userData.vesselDamageSmoke = true;
    smoke.userData.smokeIndex = index;
    root.add(smoke);
  }
  root.name = entry.label;
  root.userData.transportCatalogId = entry.id;
  root.userData.transportDomain = 'maritime';
  root.userData.playable = true;
  root.userData.enterable = true;
  root.userData.originalUnbrandedDesign = true;
  root.userData.referenceEvidence = entry.visual.referenceEvidence;
  root.userData.vesselDamageMaterials = [
    { material: materials.hull, baseColor: COLORS.hull, baseRoughness: .58 },
    { material: materials.hullLower, baseColor: COLORS.hullLower, baseRoughness: .72 },
    { material: materials.deck, baseColor: COLORS.deck, baseRoughness: .66 },
    { material: materials.accent, baseColor: COLORS.accent, baseRoughness: .52 }
  ];
  root.traverse((child) => {
    if (!child?.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  const dispose = () => {
    if (root.parent?.remove) root.parent.remove(root);
    else root.removeFromParent?.();
    root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((entryMaterial) => entryMaterial?.dispose?.());
      else object.material?.dispose?.();
    });
  };
  return { root, dispose };
}

function updateVesselVisual(visual, condition = 1) {
  if (!visual?.root) return;
  const presentation = transportDamagePresentation(condition);
  if (visual.root.userData.damageBand === presentation.band &&
      visual.root.userData.condition === presentation.condition) return;
  visual.root.userData.condition = presentation.condition;
  visual.root.userData.damageBand = presentation.band;
  visual.root.userData.damagePresentation = presentation;
  (visual.root.userData.vesselDamageMaterials || []).forEach(({ material, baseColor, baseRoughness }) => {
    material?.color?.setHex?.(baseColor);
    material?.color?.offsetHSL?.(0, -presentation.dirt * .16, -presentation.dirt * .2);
    material.roughness = Math.min(.96, Number(baseRoughness) + presentation.dirt * .12);
  });
  visual.root.traverse((object) => {
    if (object.userData?.vesselDamageSmoke) {
      const index = Number(object.userData.smokeIndex || 0);
      const opacity = presentation.smoke ? Math.max(.08, Math.min(.48, .24 + (1 - presentation.condition) * .34) - index * .055) : 0;
      object.material.opacity = opacity;
      object.visible = opacity > .01;
      object.scale.set(1 + index * .16, 1.15 + index * .24, 1 + index * .14);
    }
    if (object.userData?.vesselDamagePanel) {
      object.visible = presentation.panelDisplacement > .02;
      const side = Number(object.userData.damageSide || 1);
      object.position.x = Number(object.userData.baseX || 0) + side * presentation.panelDisplacement * 1.8;
      object.rotation.z = side * presentation.panelDisplacement * 1.6;
    }
    if (object.userData?.vesselNavigationLight) object.visible = !presentation.lampFailure;
  });
}

export { createVesselVisual, updateVesselVisual };
