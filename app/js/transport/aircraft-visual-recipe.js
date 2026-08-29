import { transportDamagePresentation } from './damage-model.js?v=1';

const PALETTE = Object.freeze({
  body: 0xc6c1b1,
  underside: 0x2f3b40,
  accent: 0xc76738,
  trim: 0x2a7778,
  glass: 0x173b4c,
  tire: 0x151819,
  metal: 0xa9b2b3
});

function material(THREE, color, roughness = .58, metalness = .1, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function aircraftGroundOffset(entry) {
  if (entry?.aircraftKind === 'rotorcraft') return Math.max(.8, Number(entry.dimensions.height) * .46);
  const width = Math.max(.8, Number(entry?.dimensions?.width) || 1.4);
  const height = Math.max(1, Number(entry?.dimensions?.height) || 1.8);
  return Math.max(.82, Math.min(height * .46, width * .62 + .5));
}

function cylinderAlongZ(THREE, radius, length, mat, segments) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function cylinderBetween(THREE, start, end, radius, mat, segments = 8) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), mat);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function taperedCylinderBetween(THREE, start, end, startRadius, endRadius, mat, segments = 12) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(endRadius, startRadius, direction.length(), segments),
    mat
  );
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function ellipticalFuselageGeometry(THREE, length, radiusX, radiusY, segments = 18) {
  const stations = [
    { z: -.5, radius: .08, lift: .02 },
    { z: -.44, radius: .52, lift: .02 },
    { z: -.33, radius: .86, lift: 0 },
    { z: -.08, radius: 1, lift: 0 },
    { z: .25, radius: .98, lift: .01 },
    { z: .4, radius: .76, lift: .03 },
    { z: .49, radius: .18, lift: .02 }
  ];
  const vertices = [];
  const indices = [];
  for (const station of stations) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      vertices.push(
        Math.cos(angle) * radiusX * station.radius,
        Math.sin(angle) * radiusY * station.radius + radiusY * station.lift,
        length * station.z
      );
    }
  }
  for (let ring = 0; ring < stations.length - 1; ring += 1) {
    const nextRing = ring + 1;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = nextRing * segments + segment;
      const d = nextRing * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sweptFinGeometry(THREE, thickness, height, rootChord) {
  const half = thickness * .5;
  const profile = [
    { y: 0, z: rootChord * .48 },
    { y: 0, z: -rootChord * .52 },
    { y: height, z: -rootChord * .34 },
    { y: height * .92, z: rootChord * .12 }
  ];
  const vertices = [];
  for (const x of [-half, half]) {
    for (const point of profile) vertices.push(x, point.y, point.z);
  }
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 1, 1, 4, 5,
    1, 5, 2, 2, 5, 6,
    2, 6, 3, 3, 6, 7,
    3, 7, 0, 0, 7, 4
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function taperedWingGeometry(THREE, span, rootChord, tipChord, thickness) {
  const halfSpan = span * .5;
  const halfRoot = rootChord * .5;
  const halfTip = tipChord * .5;
  const halfThickness = thickness * .5;
  const vertices = [
    -halfSpan, halfThickness, -halfTip, -halfSpan, halfThickness, halfTip,
    halfSpan, halfThickness, -halfTip, halfSpan, halfThickness, halfTip,
    -halfSpan, -halfThickness, -halfTip, -halfSpan, -halfThickness, halfTip,
    halfSpan, -halfThickness, -halfTip, halfSpan, -halfThickness, halfTip,
    0, halfThickness, -halfRoot, 0, halfThickness, halfRoot,
    0, -halfThickness, -halfRoot, 0, -halfThickness, halfRoot
  ];
  const indices = [
    0, 8, 1, 1, 8, 9, 8, 2, 9, 9, 2, 3,
    4, 5, 10, 5, 11, 10, 10, 11, 6, 11, 7, 6,
    0, 4, 8, 4, 10, 8, 2, 9, 6, 6, 9, 11,
    1, 5, 0, 0, 5, 4, 3, 2, 6, 3, 6, 7
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wheel(THREE, radius, tireMat, hubMat) {
  const group = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * .28, 8, 16), tireMat);
  tire.rotation.y = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .36, radius * .36, radius * .42, 12), hubMat);
  hub.rotation.z = Math.PI / 2;
  group.add(tire, hub);
  return group;
}

function addGear(THREE, group, entry, mats) {
  const halfWidth = Math.min(entry.dimensions.width * .48, entry.dimensions.wingspan * .11 || 1.1);
  const mainZ = entry.dimensions.length * .06;
  const wheelRadius = Math.max(.22, Math.min(.65, entry.dimensions.height * .11));
  const groundOffset = aircraftGroundOffset(entry);
  const gearY = -groundOffset + wheelRadius;
  const strutLength = Math.max(.3, groundOffset - wheelRadius - entry.dimensions.width * .2);
  [[-halfWidth, mainZ], [halfWidth, mainZ], [0, entry.dimensions.length * .36]].forEach(([x, z], index) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, strutLength, 8), mats.metal);
    strut.position.set(x, gearY + strutLength * .5, z);
    group.add(strut);
    const wheelMesh = wheel(THREE, index === 2 ? wheelRadius * .72 : wheelRadius, mats.tire, mats.metal);
    wheelMesh.position.set(x, gearY, z);
    group.add(wheelMesh);
  });
}

function addNavigationLights(THREE, group, span, z, y) {
  [[-span * .5, 0xff5146], [span * .5, 0x55ef88]].forEach(([x, color]) => {
    const light = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color }));
    light.position.set(x, y, z);
    light.userData.aircraftLight = true;
    group.add(light);
  });
}

function fixedWingVisual(THREE, entry, options, mats) {
  const group = new THREE.Group();
  const length = entry.dimensions.length;
  const width = entry.dimensions.width;
  const height = entry.dimensions.height;
  const span = entry.dimensions.wingspan;
  const fuselageRadius = Math.max(.42, width * .43);
  const fuselageRadiusY = Math.max(.4, width * .4);
  const segments = options.mobile ? 16 : 24;
  const fuselage = new THREE.Mesh(
    ellipticalFuselageGeometry(THREE, length, fuselageRadius, fuselageRadiusY, segments),
    mats.body
  );
  group.add(fuselage);
  const wing = new THREE.Mesh(taperedWingGeometry(THREE, span, length * .18, length * .085, Math.max(.11, height * .035)), mats.body);
  wing.position.set(0, entry.role === 'bush' ? fuselageRadiusY * .72 : fuselageRadiusY * .02, entry.role === 'bush' ? .1 * length : -.03 * length);
  group.add(wing);
  [-1, 1].forEach((side) => {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(span * .31, Math.max(.035, height * .012), length * .045),
      mats.underside
    );
    flap.position.set(side * span * .27, wing.position.y - .02, wing.position.z - length * .065);
    group.add(flap);
  });
  const tailWing = new THREE.Mesh(taperedWingGeometry(THREE, span * .32, length * .085, length * .04, Math.max(.08, height * .025)), mats.body);
  tailWing.position.set(0, fuselageRadiusY * .4, -length * .39);
  group.add(tailWing);
  const finHeight = entry.role === 'airliner' ? height * .54 : entry.role === 'regional' ? height * .48 : Math.max(height * .45, width * .62);
  const fin = new THREE.Mesh(
    sweptFinGeometry(THREE, Math.max(.1, width * .055), finHeight, length * .13),
    mats.body
  );
  fin.position.set(0, fuselageRadiusY * .32, -length * .38);
  group.add(fin);
  [-1, 1].forEach((side) => {
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * .32, width * .16, .045), mats.glass);
    windshield.position.set(side * width * .16, fuselageRadiusY * .62, length * .405);
    windshield.rotation.y = side * -.16;
    windshield.rotation.x = -.24;
    group.add(windshield);
  });
  const windowCount = options.mobile ? Math.min(12, Math.max(3, Math.round(length / 5))) : Math.min(24, Math.max(4, Math.round(length / 2.7)));
  for (let side = -1; side <= 1; side += 2) {
    for (let index = 0; index < windowCount; index += 1) {
      const windowHeight = Math.max(.14, Math.min(.3, width * .11));
      const windowLength = Math.max(.22, Math.min(.48, width * .17));
      const window = new THREE.Mesh(new THREE.BoxGeometry(.035, windowHeight, windowLength), mats.glass);
      window.position.set(side * fuselageRadius * .985, fuselageRadiusY * .35, length * (.18 - index * .36 / Math.max(1, windowCount - 1)));
      group.add(window);
    }
    const livery = new THREE.Mesh(new THREE.BoxGeometry(.04, Math.max(.055, width * .04), length * .58), mats.trim);
    livery.position.set(side * fuselageRadius * .92, -fuselageRadiusY * .16, -.015 * length);
    group.add(livery);
    const liveryAccent = new THREE.Mesh(new THREE.BoxGeometry(.045, Math.max(.035, width * .025), length * .42), mats.accent);
    liveryAccent.position.set(side * fuselageRadius * .94, -fuselageRadiusY * .25, .045 * length);
    group.add(liveryAccent);
  }
  const engineCount = entry.role === 'airliner' ? 4 : entry.role === 'regional' || entry.role === 'business' ? 2 : 1;
  if (entry.role === 'bush') {
    const cowling = cylinderAlongZ(THREE, fuselageRadius * .76, length * .1, mats.body, segments);
    cowling.position.z = length * .51;
    group.add(cowling);
    const cowlingBand = new THREE.Mesh(new THREE.TorusGeometry(fuselageRadius * .76, .045, 8, segments), mats.accent);
    cowlingBand.position.z = length * .558;
    group.add(cowlingBand);
    const propeller = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.11, height * 1.15, .06), mats.trim);
    const bladeB = blade.clone();
    bladeB.rotation.z = Math.PI / 2;
    propeller.add(blade, bladeB);
    propeller.position.z = length * .58;
    propeller.userData.aircraftRotor = 'propeller';
    group.add(propeller);
    [-1, 1].forEach((side) => {
      group.add(cylinderBetween(
        THREE,
        new THREE.Vector3(side * width * .43, -fuselageRadiusY * .25, length * .08),
        new THREE.Vector3(side * span * .3, wing.position.y - .04, length * .09),
        .035,
        mats.metal
      ));
    });
  } else {
    for (let index = 0; index < engineCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const x = entry.role === 'business'
        ? side * width * .62
        : side * span * (engineCount === 4 ? (.15 + row * .13) : .19);
      const engineZ = entry.role === 'business' ? -length * .24 : length * .03;
      const engineY = entry.role === 'business' ? fuselageRadiusY * .1 : -fuselageRadiusY * .72;
      const engineRadius = Math.max(.28, width * (entry.role === 'airliner' ? .16 : .18));
      const engineLength = Math.max(1.2, length * (entry.role === 'business' ? .17 : .12));
      const engine = cylinderAlongZ(THREE, engineRadius, engineLength, mats.metal, segments);
      engine.position.set(x, engineY, engineZ);
      group.add(engine);
      const intake = new THREE.Mesh(new THREE.TorusGeometry(engineRadius, Math.max(.04, width * .025), 8, segments), mats.trim);
      intake.position.copy(engine.position);
      intake.position.z += engineLength * .5;
      group.add(intake);
      const intakeFan = new THREE.Mesh(new THREE.CircleGeometry(engineRadius * .78, segments), mats.underside);
      intakeFan.position.set(x, engineY, engineZ + engineLength * .505);
      group.add(intakeFan);
      const exhaust = new THREE.Mesh(new THREE.TorusGeometry(engineRadius * .66, Math.max(.035, width * .018), 8, segments), mats.underside);
      exhaust.position.set(x, engineY, engineZ - engineLength * .5);
      group.add(exhaust);
      group.add(cylinderBetween(
        THREE,
        new THREE.Vector3(x, engineY + engineRadius * .7, engineZ),
        new THREE.Vector3(entry.role === 'business' ? side * width * .4 : x * .88, wing.position.y, engineZ),
        Math.max(.045, width * .025),
        mats.underside
      ));
    }
  }
  addGear(THREE, group, entry, mats);
  addNavigationLights(THREE, group, span, 0, height * .17);
  return group;
}

function helicopterVisual(THREE, entry, options, mats) {
  const group = new THREE.Group();
  const segments = options.mobile ? 16 : 24;
  const width = entry.dimensions.width;
  const height = entry.dimensions.height;
  const length = entry.dimensions.length;
  const cabinLength = length * .43;
  const cabinCenterZ = length * .2;
  const rotorY = height * .58;
  const rotorZ = length * .15;

  const cabin = new THREE.Mesh(
    ellipticalFuselageGeometry(THREE, cabinLength, width * .48, height * .3, segments),
    mats.body
  );
  cabin.position.set(0, 0, cabinCenterZ);
  group.add(cabin);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(8, segments / 2)), mats.underside);
  belly.scale.set(width * .42, height * .1, cabinLength * .36);
  belly.position.set(0, -height * .27, cabinCenterZ - length * .01);
  group.add(belly);

  [-1, 1].forEach((side) => {
    const doorWindow = new THREE.Mesh(new THREE.BoxGeometry(.035, height * .18, cabinLength * .22), mats.glass);
    doorWindow.position.set(side * width * .486, height * .1, cabinCenterZ - cabinLength * .08);
    group.add(doorWindow);
    const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(.022, height * .48, .025), mats.underside);
    doorSeam.position.set(side * width * .49, -.015, cabinCenterZ - cabinLength * .22);
    group.add(doorSeam);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.04, .025, cabinLength * .055), mats.metal);
    handle.position.set(side * width * .5, -.02, cabinCenterZ - cabinLength * .02);
    group.add(handle);
  });

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, segments, Math.max(10, segments / 2)),
    mats.glass
  );
  canopy.scale.set(width * .42, height * .235, cabinLength * .19);
  canopy.position.set(0, height * .08, cabinCenterZ + cabinLength * .38);
  group.add(canopy);

  const engineHousing = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 10), mats.accent);
  engineHousing.scale.set(width * .32, height * .11, cabinLength * .24);
  engineHousing.position.set(0, height * .35, cabinCenterZ - cabinLength * .05);
  group.add(engineHousing);

  const tailStart = new THREE.Vector3(0, height * .1, cabinCenterZ - cabinLength * .46);
  const tailEnd = new THREE.Vector3(0, height * .24, -length * .48);
  group.add(taperedCylinderBetween(THREE, tailStart, tailEnd, width * .18, width * .075, mats.underside, segments));

  const fin = new THREE.Mesh(
    sweptFinGeometry(THREE, Math.max(.08, width * .04), height * .36, length * .085),
    mats.accent
  );
  fin.position.set(0, height * .22, -length * .48);
  group.add(fin);

  const tailPlane = new THREE.Mesh(taperedWingGeometry(THREE, width * .74, length * .065, length * .035, .06), mats.body);
  tailPlane.position.set(0, height * .25, -length * .42);
  group.add(tailPlane);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, .6, 8), mats.metal);
  mast.position.set(0, height * .49, rotorZ);
  group.add(mast);

  const mainRotor = new THREE.Group();
  for (let index = 0; index < 4; index += 1) {
    const pivot = new THREE.Group();
    pivot.rotation.y = index * Math.PI * .5;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(entry.dimensions.rotorDiameter * .47, .035, .14), mats.trim);
    blade.position.x = entry.dimensions.rotorDiameter * .235;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(entry.dimensions.rotorDiameter * .045, .042, .15), mats.accent);
    tip.position.x = entry.dimensions.rotorDiameter * .447;
    pivot.add(blade, tip);
    mainRotor.add(pivot);
  }
  const mainHub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .18, 12), mats.metal);
  mainRotor.add(mainHub);
  mainRotor.position.set(0, rotorY, rotorZ);
  mainRotor.userData.aircraftRotor = 'main';
  group.add(mainRotor);

  const tailRotor = new THREE.Group();
  for (let index = 0; index < 3; index += 1) {
    const pivot = new THREE.Group();
    pivot.rotation.z = index * Math.PI * 2 / 3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.055, height * .28, .045), mats.trim);
    blade.position.y = height * .14;
    pivot.add(blade);
    tailRotor.add(pivot);
  }
  tailRotor.add(new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), mats.metal));
  tailRotor.position.set(width * .07, height * .31, -length * .505);
  tailRotor.userData.aircraftRotor = 'tail';
  group.add(tailRotor);

  [-1, 1].forEach((side) => {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, length * .36, 10), mats.metal);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * width * .48, -height * .4, length * .1);
    group.add(skid);
    group.add(cylinderBetween(
      THREE,
      new THREE.Vector3(side * width * .34, -height * .19, length * .24),
      new THREE.Vector3(side * width * .48, -height * .4, length * .24),
      .045,
      mats.metal
    ));
    group.add(cylinderBetween(
      THREE,
      new THREE.Vector3(side * width * .34, -height * .19, -length * .04),
      new THREE.Vector3(side * width * .48, -height * .4, -length * .04),
      .045,
      mats.metal
    ));
  });
  addNavigationLights(THREE, group, width, length * .14, height * .2);
  return group;
}

function createAircraftVisual(THREE, entry, options = {}) {
  const mats = {
    body: material(THREE, PALETTE.body),
    underside: material(THREE, PALETTE.underside, .72, .15),
    accent: material(THREE, PALETTE.accent, .5, .12),
    trim: material(THREE, PALETTE.trim, .58, .18),
    glass: material(THREE, PALETTE.glass, .2, .2, { emissive: 0x061219, emissiveIntensity: .28 }),
    tire: material(THREE, PALETTE.tire, .94, .01),
    metal: material(THREE, PALETTE.metal, .35, .62)
  };
  const root = entry.aircraftKind === 'rotorcraft'
    ? helicopterVisual(THREE, entry, options, mats)
    : fixedWingVisual(THREE, entry, options, mats);
  root.name = entry.label;
  root.userData.transportCatalogId = entry.id;
  root.userData.transportDomain = 'aviation';
  root.userData.playable = true;
  root.userData.enterable = true;
  root.userData.originalUnbrandedDesign = true;
  root.userData.referenceEvidence = entry.visual.referenceEvidence;
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(.25, entry.dimensions.width * .12), 8, 6),
    material(THREE, 0x202326, .95, 0, { transparent: true, opacity: 0 })
  );
  smoke.position.set(0, entry.dimensions.height * .2, entry.dimensions.length * .25);
  smoke.userData.aircraftDamageSmoke = true;
  root.add(smoke);
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

function updateAircraftVisual(visual, condition = 1, dt = 0) {
  if (!visual?.root) return;
  const presentation = transportDamagePresentation(condition);
  visual.root.userData.condition = presentation.condition;
  visual.root.userData.damageBand = presentation.band;
  visual.root.traverse((object) => {
    if (object.userData?.aircraftRotor) {
      const rotorKind = object.userData.aircraftRotor;
      const factor = rotorKind === 'tail' || rotorKind === 'propeller' ? 18 : 8;
      const rotationStep = Math.max(0, Number(dt) || 0) * factor;
      // Main rotors turn around the vertical mast. Nose and tail propellers
      // sit in the XY plane, so rotating them around Y makes the blades wobble
      // instead of spin in their own disc.
      if (rotorKind === 'main') object.rotation.y += rotationStep;
      else if (rotorKind === 'tail') object.rotation.x += rotationStep;
      else object.rotation.z += rotationStep;
    }
    if (object.userData?.aircraftDamageSmoke) {
      const smokeOpacity = presentation.smoke ? Math.min(.58, .18 + (1 - presentation.condition) * .5) : 0;
      object.material.opacity = smokeOpacity;
      object.visible = smokeOpacity > .01;
      object.scale.setScalar(1 + smokeOpacity * .8);
    }
  });
};

export { aircraftGroundOffset, createAircraftVisual, updateAircraftVisual };
