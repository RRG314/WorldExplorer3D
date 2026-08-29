import { createBeveledVehicleBoxGeometry, createTaperedPrismGeometry } from '../engine/classic-utility-car.js?v=3';
import { roadVehicleVisualRecipe } from '../transport/road-vehicle-visual-recipe.js?v=1';
import { transportDamagePresentation } from '../transport/damage-model.js?v=1';

function createUrbanVehicleVisual(THREE, definition = {}) {
  const variant = definition.variant || {};
  const recipe = roadVehicleVisualRecipe(variant);
  const { width, height, length, wheelRadius, style } = recipe;
  const {
    pickup, crossover, compact, van, taxi, boxTruck, bus
  } = recipe.flags;
  const responder = definition.serviceType === 'responder';
  const deliveryVan = van && /delivery|parcel/i.test(String(variant.id || variant.label || ''));
  const root = new THREE.Group();
  root.name = `${variant.label || 'Urban vehicle'} visual`;
  root.userData.vehicleStyle = `urban-${style}`;
  root.userData.vehicleId = definition.id || '';

  const paint = new THREE.MeshStandardMaterial({
    color: Number(definition.color || variant.color || 0x466579),
    roughness: 0.5,
    metalness: 0.28,
    envMapIntensity: 0.72
  });
  const darkPaint = paint.clone();
  darkPaint.color.multiplyScalar(0.72);
  const glass = new THREE.MeshStandardMaterial({ color: 0x172932, roughness: 0.2, metalness: 0.34 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: 0.82, metalness: 0.12 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa3a5, roughness: 0.42, metalness: 0.68 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111313, roughness: 0.96, metalness: 0.01 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6d4, emissive: 0xffd784, emissiveIntensity: 0.5, roughness: 0.28 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0xb91f27, emissive: 0x7c1118, emissiveIntensity: 0.62, roughness: 0.35 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xe4e1cc, roughness: 0.72, metalness: 0.04 });
  const service = new THREE.MeshStandardMaterial({ color: taxi ? 0xf4dc55 : bus ? 0xe5edf2 : 0xdce4e6, roughness: 0.68, metalness: 0.04 });
  const materials = [paint, darkPaint, glass, trim, chrome, rubber, headlight, taillight, plate, service];
  const responderRed = responder ? new THREE.MeshStandardMaterial({ color: 0x7d111b, emissive: 0xff2435, emissiveIntensity: 0.18, roughness: 0.34, flatShading: true }) : null;
  const responderBlue = responder ? new THREE.MeshStandardMaterial({ color: 0x12346b, emissive: 0x247cff, emissiveIntensity: 1.6, roughness: 0.34, flatShading: true }) : null;
  if (responderRed && responderBlue) materials.push(responderRed, responderBlue);
  const ownedGeometries = new Set();
  const serviceLights = [];
  const damageParts = { bumpers: [], glass: [], hood: null, lamps: [], wheels: [] };
  const add = (geometry, material, name, position, rotation = null, parent = root) => {
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    if (/hood/i.test(name)) damageParts.hood = mesh;
    if (/bumper/i.test(name)) damageParts.bumpers.push(mesh);
    if (/window|glass|windshield/i.test(name)) damageParts.glass.push(mesh);
    if (/headlight|taillight/i.test(name)) damageParts.lamps.push(mesh);
    return mesh;
  };

  const ground = -recipe.rootToGround;
  const roofY = ground + recipe.roofY;
  const bodyBottom = ground + recipe.bodyBottom;
  const bodyTop = ground + recipe.bodyTop;
  const bodyHeight = recipe.bodyHeight;
  const bodyY = ground + recipe.bodyY;
  const cabinLength = recipe.cabinLength;
  const cabinZ = recipe.cabinZ;
  const cabinBottom = ground + recipe.cabinBottom;
  const cabinHeight = recipe.cabinHeight;
  const cabinY = ground + recipe.cabinY;

  add(createBeveledVehicleBoxGeometry(THREE, width, bodyHeight, length, Math.min(.13, bodyHeight * .2)), paint, 'Urban rounded lower body', [0, bodyY, 0]);
  add(createTaperedPrismGeometry(THREE, {
    widthBottom: width * 0.88,
    widthTop: width * (bus || van ? 0.84 : 0.75),
    height: cabinHeight,
    length: cabinLength,
    frontInset: bus ? 0.08 : pickup || boxTruck ? 0.2 : van ? 0.14 : 0.34,
    rearInset: bus ? 0.05 : van ? 0.12 : 0.2
  }), paint, 'Urban cabin', [0, cabinY, cabinZ]);
  if (!bus && !van && !boxTruck) {
    const hoodLength = compact ? length * .24 : length * .29;
    add(createTaperedPrismGeometry(THREE, {
      widthBottom: width * .91,
      widthTop: width * .82,
      height: Math.max(.18, bodyHeight * .34),
      length: hoodLength,
      frontInset: .08,
      rearInset: .02
    }), paint, 'Urban sculpted hood', [0, bodyTop - Math.max(.18, bodyHeight * .34) * .5, length * .35]);
    if (!pickup && !crossover) {
      add(createTaperedPrismGeometry(THREE, {
        widthBottom: width * .9,
        widthTop: width * .84,
        height: Math.max(.14, bodyHeight * .25),
        length: length * .2,
        frontInset: .02,
        rearInset: .05
      }), paint, 'Urban rear deck', [0, bodyTop - Math.max(.14, bodyHeight * .25) * .5, -length * .395]);
    }
  }
  add(new THREE.BoxGeometry(width * 0.78, 0.075, cabinLength * 0.72), darkPaint, 'Urban roof', [0, roofY - 0.0375, cabinZ - 0.02]);
  add(new THREE.BoxGeometry(width * 0.78, 0.32, 0.04), glass, 'Urban windshield', [0, cabinY + 0.02, cabinZ + cabinLength * 0.45], [-0.35, 0, 0]);
  add(new THREE.BoxGeometry(width * 0.77, 0.31, 0.04), glass, 'Urban rear window', [0, cabinY, cabinZ - cabinLength * 0.45], [0.25, 0, 0]);
  if (pickup) {
    const bedHeight = Math.max(.28, bodyHeight * .58);
    add(new THREE.BoxGeometry(width * 0.9, bedHeight, length * 0.38), darkPaint, 'Pickup bed', [0, bodyTop - bedHeight * .5, -length * 0.3]);
    add(new THREE.BoxGeometry(width * 0.84, 0.08, length * 0.31), trim, 'Pickup bed floor', [0, bodyTop - .1, -length * 0.31]);
  }
  if (boxTruck) {
    const cargoBottom = bodyTop - .08;
    const cargoHeight = Math.max(.5, roofY - cargoBottom - .055);
    const cargoY = cargoBottom + cargoHeight * .5;
    add(new THREE.BoxGeometry(width * 0.96, cargoHeight, length * 0.59), service, 'Box truck cargo body', [0, cargoY, -length * 0.17]);
    add(new THREE.BoxGeometry(width * 0.82, cargoHeight * .82, 0.055), darkPaint, 'Box truck rear shutter', [0, cargoY, -length * 0.475]);
  }
  if (bus) {
    add(new THREE.BoxGeometry(width * 0.9, height * 0.26, length * 0.7), glass, 'Bus side window band', [0, cabinY + cabinHeight * 0.05, -length * 0.03]);
    add(new THREE.BoxGeometry(width * 0.68, 0.22, 0.06), service, 'Bus destination display', [0, cabinY + cabinHeight * 0.27, length * 0.456]);
  }
  if (van) {
    for (const side of [-1, 1]) {
      add(
        new THREE.BoxGeometry(.035, deliveryVan ? .12 : .34, cabinLength * .43),
        deliveryVan ? service : glass,
        deliveryVan ? 'Delivery van side identity panel' : 'Passenger van side window band',
        [side * width * .445, cabinY + .08, cabinZ - cabinLength * .16]
      );
    }
    add(new THREE.BoxGeometry(.035, cabinHeight * .72, height * .03), chrome, 'Van rear door seam', [0, cabinY - .02, -length * .488]);
  }
  if (taxi) {
    add(new THREE.BoxGeometry(0.48, 0.12, 0.22), service, 'Taxi roof lamp', [0, roofY - .06, cabinZ]);
  }
  if (responder) {
    const accent = Number(definition.serviceAccent || 0xe8ecef);
    service.color.setHex(accent);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(.052, .34, cabinLength * .48), service, 'Responder door identity panel', [side * width * .492, cabinY - .1, cabinZ - cabinLength * .08]);
    }
    add(new THREE.BoxGeometry(.92, .055, .26), trim, 'Responder light bar mount', [0, roofY - .045, cabinZ]);
    serviceLights.push(
      add(new THREE.BoxGeometry(.39, .1, .24), responderRed, 'Responder red light', [-.22, roofY - .05, cabinZ]),
      add(new THREE.BoxGeometry(.39, .1, .24), responderBlue, 'Responder blue light', [.22, roofY - .05, cabinZ])
    );
  }

  const doors = {};
  for (const side of [-1, 1]) {
    const sideX = side * width * 0.455;
    const frontDoorLength = cabinLength * 0.43;
    const frontDoorHingeZ = cabinZ + cabinLength * 0.37;
    const driverDoor = new THREE.Group();
    driverDoor.name = side < 0 ? 'Urban left front door pivot' : 'Urban right front door pivot';
    // The pivot is the real front hinge line. Closed panels sit flush with the
    // cabin; opening rotates the panel from that edge instead of spinning a
    // thick slab around its center.
    driverDoor.position.set(sideX, 0, frontDoorHingeZ);
    root.add(driverDoor);
    add(new THREE.BoxGeometry(0.035, 0.5, frontDoorLength), paint, 'Urban front door', [0, cabinY - 0.1, -frontDoorLength * .5], null, driverDoor);
    add(new THREE.BoxGeometry(0.039, 0.3, frontDoorLength * .76), glass, 'Urban front side glass', [0, cabinY + 0.2, -frontDoorLength * .45], null, driverDoor);
    add(new THREE.BoxGeometry(0.045, 0.035, 0.2), chrome, 'Urban front door handle', [side * 0.02, cabinY - 0.02, -frontDoorLength * .78], null, driverDoor);
    doors[side < 0 ? 'left' : 'right'] = driverDoor;
    if (!pickup && !boxTruck) {
      add(new THREE.BoxGeometry(0.035, 0.5, cabinLength * 0.39), paint, 'Urban rear door', [sideX, cabinY - 0.1, cabinZ - cabinLength * 0.31]);
      add(new THREE.BoxGeometry(0.039, 0.29, cabinLength * 0.29), glass, 'Urban rear side glass', [sideX, cabinY + 0.2, cabinZ - cabinLength * 0.31]);
      add(new THREE.BoxGeometry(0.045, 0.035, 0.19), chrome, 'Urban rear door handle', [sideX + side * 0.02, cabinY - 0.02, cabinZ - cabinLength * 0.4]);
    }
    add(new THREE.BoxGeometry(.05, .12, Math.max(.45, length * .34)), trim, 'Urban integrated rocker trim', [side * width * .47, bodyY - bodyHeight * .23, -.03]);
    add(new THREE.BoxGeometry(0.12, 0.1, 0.23), trim, 'Urban mirror', [side * width * 0.46, cabinY + 0.05, cabinZ + cabinLength * 0.3]);
  }

  const wheels = [];
  const wheelLayout = recipe.wheelLayout;
  for (const [side, front] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Group();
    wheel.name = 'Urban Wheel';
    wheel.position.set(side * wheelLayout.halfTrack, ground + wheelRadius, front * wheelLayout.halfWheelbase);
    const tire = add(new THREE.CylinderGeometry(wheelRadius, wheelRadius, Math.min(.25, width * 0.14), 24), rubber, 'Urban tire', [0, 0, 0], [0, 0, Math.PI / 2], wheel);
    tire.userData.vehicleWheelTire = true;
    add(new THREE.CylinderGeometry(wheelRadius * 0.52, wheelRadius * 0.52, Math.min(.26, width * 0.145), 20), chrome, 'Urban wheel hub', [0, 0, 0], [0, 0, Math.PI / 2], wheel);
    root.add(wheel);
    wheels.push(wheel);
    damageParts.wheels.push(wheel);
  }

  for (const front of [-1, 1]) {
    const faceZ = front * length * .49;
    add(new THREE.BoxGeometry(width * 0.96, 0.16, 0.13), trim, front > 0 ? 'Urban front bumper' : 'Urban rear bumper', [0, bodyY - 0.14, faceZ - front * .065]);
    add(new THREE.BoxGeometry(width * 0.46, 0.16, 0.035), plate, 'Urban license plate', [0, bodyY - 0.02, faceZ - front * .018]);
    for (const side of [-1, 1]) {
      const material = front > 0 ? headlight : taillight;
      const lamp = add(new THREE.BoxGeometry(0.34, 0.16, 0.055), material, front > 0 ? 'Urban headlight' : 'Urban taillight', [side * width * 0.3, bodyY + 0.1, faceZ - front * .0275]);
      if (front > 0) lamp.userData.vehicleHeadlightLens = true;
    }
  }
  add(new THREE.BoxGeometry(width * 0.58, 0.2, 0.05), trim, 'Urban grille', [0, bodyY + 0.02, length * .49 - .025]);

  root.userData.performanceProfile = Object.freeze({
    style: `urban-${style}`,
    transparentMaterials: 0
  });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  root.userData.vehicleDimensionsMeters = Object.freeze({ width, height, length });
  root.userData.vehicleVisualEnvelopeMeters = Object.freeze({
    width: Number((bounds.max.x - bounds.min.x).toFixed(3)),
    height: Number((bounds.max.y - bounds.min.y).toFixed(3)),
    length: Number((bounds.max.z - bounds.min.z).toFixed(3)),
    groundOffset: Number((bounds.min.y - ground).toFixed(3)),
    roofOverflow: Number(Math.max(0, bounds.max.y - roofY).toFixed(3))
  });
  const damageSmokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x30383b,
    transparent: true,
    opacity: .34,
    depthWrite: false
  });
  materials.push(damageSmokeMaterial);
  const damageSmoke = new THREE.Group();
  damageSmoke.name = 'Vehicle critical damage smoke';
  damageSmoke.position.set(width * .18, bodyTop + .04, length * .3);
  damageSmoke.visible = false;
  for (let index = 0; index < 3; index += 1) {
    const puff = add(new THREE.SphereGeometry(.18 + index * .035, 7, 5), damageSmokeMaterial, 'Vehicle damage smoke puff', [0, index * .18, 0], null, damageSmoke);
    puff.userData.damageSmokeIndex = index;
  }
  root.add(damageSmoke);
  const baseTransforms = new Map([
    ...damageParts.bumpers,
    ...damageParts.wheels,
    ...(damageParts.hood ? [damageParts.hood] : [])
  ].map((object) => [object, Object.freeze({
    x: object.position.x,
    y: object.position.y,
    z: object.position.z,
    rx: object.rotation.x,
    ry: object.rotation.y,
    rz: object.rotation.z
  })]));
  const setCondition = (condition = 1) => {
    const damage = transportDamagePresentation(condition);
    root.userData.condition = damage.condition;
    root.userData.damageState = damage;
    paint.color.setHex(Number(definition.color || variant.color || 0x466579)).multiplyScalar(1 - damage.dirt * .38);
    darkPaint.color.copy(paint.color).multiplyScalar(0.72);
    glass.color.setHex(damage.glassDamage ? 0x59666a : 0x172932);
    headlight.emissiveIntensity = damage.lampFailure ? .02 : .5;
    taillight.emissiveIntensity = damage.lampFailure ? .04 : .62;
    if (damageParts.hood) {
      const base = baseTransforms.get(damageParts.hood);
      damageParts.hood.position.y = base.y - damage.panelDisplacement * .22;
      damageParts.hood.rotation.x = base.rx - damage.panelDisplacement * 1.8;
    }
    damageParts.bumpers.forEach((bumper, index) => {
      const base = baseTransforms.get(bumper);
      const frontDamage = /front/i.test(bumper.name) ? 1 : .55;
      bumper.position.y = base.y - damage.panelDisplacement * frontDamage;
      bumper.rotation.z = base.rz + (index % 2 ? -1 : 1) * damage.panelDisplacement * .7;
    });
    damageParts.wheels.forEach((wheel, index) => {
      const base = baseTransforms.get(wheel);
      wheel.rotation.z = base.rz + (damage.wheelDamage && index === 0 ? -.18 : 0);
    });
    damageSmoke.visible = damage.smoke;
    root.rotation.z = damage.band === 'disabled' ? .035 : 0;
    return damage;
  };
  const updateDamageVisual = (elapsed = 0) => {
    if (!damageSmoke.visible) return;
    damageSmoke.children.forEach((puff, index) => {
      const phase = Number(elapsed || 0) * .7 + index * 1.8;
      puff.position.x = Math.sin(phase) * (.05 + index * .025);
      puff.position.y = index * .18 + (Math.sin(phase * .8) + 1) * .055;
      const scale = .82 + (Math.sin(phase) + 1) * .14;
      puff.scale.setScalar(scale);
    });
  };
  const api = {
    root,
    wheels,
    doors: Object.freeze(doors),
    serviceLights: Object.freeze(serviceLights),
    materials: Object.freeze(materials),
    setCondition,
    updateDamageVisual,
    setServiceLights(elapsed = 0, active = true) {
      if (!responderRed || !responderBlue) return;
      const redActive = active && Math.sin(Number(elapsed || 0) * 11) >= 0;
      responderRed.emissiveIntensity = redActive ? 2.2 : .12;
      responderBlue.emissiveIntensity = active && !redActive ? 2.2 : .12;
    },
    dispose() {
      root.removeFromParent?.();
      ownedGeometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  };
  setCondition(definition.condition ?? 1);
  return Object.freeze(api);
}

export { createUrbanVehicleVisual };
