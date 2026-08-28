import { createBeveledVehicleBoxGeometry, createTaperedPrismGeometry } from '../engine/classic-utility-car.js?v=3';
import { VEHICLE_ROOT_TO_GROUND_METERS, vehicleWheelContactLayout } from '../engine/vehicle-catalog.js?v=5';

function createUrbanVehicleVisual(THREE, definition = {}) {
  const variant = definition.variant || {};
  const width = Number(variant.width || 1.8);
  const height = Number(variant.height || 1.48);
  const length = Number(variant.length || 4.4);
  const wheelRadius = Number(variant.wheelRadius || 0.36);
  const style = String(variant.bodyStyle || 'sedan');
  const pickup = style === 'pickup';
  const crossover = style === 'crossover' || style === 'suv';
  const compact = style === 'compact';
  const van = style === 'van';
  const taxi = style === 'taxi';
  const boxTruck = style === 'box-truck';
  const bus = style === 'bus';
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
  const add = (geometry, material, name, position, rotation = null, parent = root) => {
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };

  const ground = -VEHICLE_ROOT_TO_GROUND_METERS;
  const roofY = ground + height;
  const bodyBottom = ground + wheelRadius * .42;
  const bodyTop = ground + Math.min(height * (bus ? .34 : boxTruck ? .33 : van ? .42 : crossover || pickup ? .46 : .5), height - .42);
  const bodyHeight = Math.max(.42, bodyTop - bodyBottom);
  const bodyY = (bodyBottom + bodyTop) * .5;
  const cabinLength = bus ? length * 0.9 : boxTruck ? length * 0.27 : van ? length * 0.7 : pickup ? length * 0.38 : compact ? length * 0.49 : length * 0.5;
  const cabinZ = bus ? 0 : boxTruck ? length * 0.34 : van ? length * 0.02 : pickup ? length * 0.18 : -length * 0.08;
  const cabinBottom = bodyTop - .08;
  const cabinHeight = Math.max(.32, roofY - cabinBottom - .055);
  const cabinY = cabinBottom + cabinHeight * .5;

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
  const wheelLayout = vehicleWheelContactLayout(variant);
  for (const [side, front] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Group();
    wheel.name = 'Urban Wheel';
    wheel.position.set(side * wheelLayout.halfTrack, ground + wheelRadius, front * wheelLayout.halfWheelbase);
    const tire = add(new THREE.CylinderGeometry(wheelRadius, wheelRadius, Math.min(.25, width * 0.14), 24), rubber, 'Urban tire', [0, 0, 0], [0, 0, Math.PI / 2], wheel);
    tire.userData.vehicleWheelTire = true;
    add(new THREE.CylinderGeometry(wheelRadius * 0.52, wheelRadius * 0.52, Math.min(.26, width * 0.145), 20), chrome, 'Urban wheel hub', [0, 0, 0], [0, 0, Math.PI / 2], wheel);
    root.add(wheel);
    wheels.push(wheel);
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
  return Object.freeze({
    root,
    wheels,
    doors: Object.freeze(doors),
    serviceLights: Object.freeze(serviceLights),
    materials: Object.freeze(materials),
    setCondition(condition = 1) {
      const value = Math.max(0, Math.min(1, Number(condition) || 0));
      root.userData.condition = value;
      paint.color.setHex(Number(definition.color || variant.color || 0x466579)).multiplyScalar(0.42 + value * 0.58);
      darkPaint.color.copy(paint.color).multiplyScalar(0.72);
      root.rotation.z = value <= 0 ? 0.035 : 0;
    },
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
  });
}

export { createUrbanVehicleVisual };
