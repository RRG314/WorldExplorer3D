import { createTaperedPrismGeometry } from '../engine/classic-utility-car.js?v=2';

function createUrbanVehicleVisual(THREE, definition = {}) {
  const variant = definition.variant || {};
  const width = Number(variant.width || 1.8);
  const height = Number(variant.height || 1.48);
  const length = Number(variant.length || 4.4);
  const wheelRadius = Number(variant.wheelRadius || 0.36);
  const style = String(variant.bodyStyle || 'sedan');
  const pickup = style === 'pickup';
  const crossover = style === 'crossover';
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
    flatShading: true
  });
  const darkPaint = paint.clone();
  darkPaint.color.multiplyScalar(0.72);
  const glass = new THREE.MeshStandardMaterial({ color: 0x172932, roughness: 0.24, metalness: 0.3, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: 0.82, metalness: 0.12, flatShading: true });
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa3a5, roughness: 0.42, metalness: 0.68, flatShading: true });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111313, roughness: 0.96, metalness: 0.01, flatShading: true });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6d4, emissive: 0xffd784, emissiveIntensity: 0.5, roughness: 0.28, flatShading: true });
  const taillight = new THREE.MeshStandardMaterial({ color: 0xb91f27, emissive: 0x7c1118, emissiveIntensity: 0.62, roughness: 0.35, flatShading: true });
  const plate = new THREE.MeshStandardMaterial({ color: 0xe4e1cc, roughness: 0.72, metalness: 0.04, flatShading: true });
  const service = new THREE.MeshStandardMaterial({ color: taxi ? 0xf4dc55 : bus ? 0xe5edf2 : 0xdce4e6, roughness: 0.68, metalness: 0.04, flatShading: true });
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

  const ground = -1.12;
  const bodyHeight = bus ? height * 0.26 : boxTruck ? 0.72 : van ? height * 0.42 : crossover || pickup ? 0.66 : compact ? 0.57 : 0.6;
  const bodyY = ground + wheelRadius + bodyHeight * 0.55;
  const cabinLength = bus ? length * 0.9 : boxTruck ? length * 0.27 : van ? length * 0.7 : pickup ? length * 0.38 : compact ? length * 0.49 : length * 0.5;
  const cabinZ = bus ? 0 : boxTruck ? length * 0.34 : van ? length * 0.02 : pickup ? length * 0.18 : -length * 0.08;
  const cabinHeight = bus ? height * 0.58 : boxTruck ? height * 0.46 : van ? height * 0.54 : crossover ? height * 0.52 : pickup ? height * 0.48 : height * 0.47;
  const cabinY = bodyY + bodyHeight * 0.48 + cabinHeight * 0.48;

  add(createTaperedPrismGeometry(THREE, {
    widthBottom: width,
    widthTop: width * 0.94,
    height: bodyHeight,
    length,
    frontInset: 0.13,
    rearInset: 0.08
  }), paint, 'Urban lower body', [0, bodyY, 0]);
  add(createTaperedPrismGeometry(THREE, {
    widthBottom: width * 0.88,
    widthTop: width * (bus || van ? 0.84 : 0.75),
    height: cabinHeight,
    length: cabinLength,
    frontInset: bus ? 0.08 : pickup || boxTruck ? 0.2 : van ? 0.14 : 0.34,
    rearInset: bus ? 0.05 : van ? 0.12 : 0.2
  }), paint, 'Urban cabin', [0, cabinY, cabinZ]);
  add(new THREE.BoxGeometry(width * 0.78, 0.075, cabinLength * 0.72), darkPaint, 'Urban roof', [0, cabinY + cabinHeight * 0.54, cabinZ - 0.02]);
  add(new THREE.BoxGeometry(width * 0.78, 0.32, 0.04), glass, 'Urban windshield', [0, cabinY + 0.02, cabinZ + cabinLength * 0.45], [-0.35, 0, 0]);
  add(new THREE.BoxGeometry(width * 0.77, 0.31, 0.04), glass, 'Urban rear window', [0, cabinY, cabinZ - cabinLength * 0.45], [0.25, 0, 0]);
  if (pickup) {
    add(new THREE.BoxGeometry(width * 0.9, height * 0.23, length * 0.38), darkPaint, 'Pickup bed', [0, bodyY + 0.16, -length * 0.3]);
    add(new THREE.BoxGeometry(width * 0.84, 0.08, length * 0.31), trim, 'Pickup bed floor', [0, bodyY + 0.3, -length * 0.31]);
  }
  if (boxTruck) {
    add(new THREE.BoxGeometry(width * 0.96, height * 0.74, length * 0.59), service, 'Box truck cargo body', [0, ground + wheelRadius + height * 0.52, -length * 0.17]);
    add(new THREE.BoxGeometry(width * 0.82, height * 0.56, 0.055), darkPaint, 'Box truck rear shutter', [0, ground + wheelRadius + height * 0.51, -length * 0.475]);
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
    add(new THREE.BoxGeometry(.035, cabinHeight * .72, height * .03), chrome, 'Van rear door seam', [0, cabinY - .02, -length * .506]);
  }
  if (taxi) {
    add(new THREE.BoxGeometry(0.48, 0.16, 0.22), service, 'Taxi roof lamp', [0, cabinY + cabinHeight * 0.61, cabinZ]);
  }
  if (responder) {
    const accent = Number(definition.serviceAccent || 0xe8ecef);
    service.color.setHex(accent);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(.052, .34, cabinLength * .48), service, 'Responder door identity panel', [side * width * .492, cabinY - .1, cabinZ - cabinLength * .08]);
    }
    add(new THREE.BoxGeometry(.92, .055, .26), trim, 'Responder light bar mount', [0, cabinY + cabinHeight * .62, cabinZ]);
    serviceLights.push(
      add(new THREE.BoxGeometry(.39, .13, .24), responderRed, 'Responder red light', [-.22, cabinY + cabinHeight * .7, cabinZ]),
      add(new THREE.BoxGeometry(.39, .13, .24), responderBlue, 'Responder blue light', [.22, cabinY + cabinHeight * .7, cabinZ])
    );
  }

  const doors = {};
  for (const side of [-1, 1]) {
    const sideX = side * width * 0.485;
    const driverDoor = new THREE.Group();
    driverDoor.name = side < 0 ? 'Urban left front door pivot' : 'Urban right front door pivot';
    driverDoor.position.set(sideX, 0, cabinZ + cabinLength * 0.12);
    root.add(driverDoor);
    add(new THREE.BoxGeometry(0.045, 0.5, cabinLength * 0.48), paint, 'Urban front door', [0, cabinY - 0.1, 0], null, driverDoor);
    add(new THREE.BoxGeometry(0.05, 0.3, cabinLength * 0.37), glass, 'Urban front side glass', [0, cabinY + 0.2, 0.02], null, driverDoor);
    add(new THREE.BoxGeometry(0.065, 0.04, 0.24), chrome, 'Urban front door handle', [side * 0.02, cabinY - 0.02, -cabinLength * 0.13], null, driverDoor);
    doors[side < 0 ? 'left' : 'right'] = driverDoor;
    if (!pickup && !boxTruck) {
      add(new THREE.BoxGeometry(0.045, 0.5, cabinLength * 0.42), paint, 'Urban rear door', [sideX, cabinY - 0.1, cabinZ - cabinLength * 0.3]);
      add(new THREE.BoxGeometry(0.05, 0.29, cabinLength * 0.31), glass, 'Urban rear side glass', [sideX, cabinY + 0.2, cabinZ - cabinLength * 0.3]);
      add(new THREE.BoxGeometry(0.065, 0.04, 0.22), chrome, 'Urban rear door handle', [sideX + side * 0.02, cabinY - 0.02, cabinZ - cabinLength * 0.39]);
    }
    add(new THREE.BoxGeometry(0.16, 0.1, 0.23), trim, 'Urban mirror', [side * width * 0.56, cabinY + 0.05, cabinZ + cabinLength * 0.3]);
  }

  const wheels = [];
  const axleZ = bus ? length * 0.37 : boxTruck ? length * 0.35 : compact ? length * 0.3 : length * 0.32;
  for (const [side, front] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Group();
    wheel.name = 'Urban Wheel';
    wheel.position.set(side * width * 0.51, ground + wheelRadius, front * axleZ);
    const tire = add(new THREE.CylinderGeometry(wheelRadius, wheelRadius, width * 0.16, 14), rubber, 'Urban tire', [0, 0, 0], [0, 0, Math.PI / 2], wheel);
    tire.userData.vehicleWheelTire = true;
    add(new THREE.CylinderGeometry(wheelRadius * 0.52, wheelRadius * 0.52, width * 0.17, 10), chrome, 'Urban wheel hub', [0, 0, 0], [0, 0, Math.PI / 2], wheel);
    root.add(wheel);
    wheels.push(wheel);
  }

  for (const front of [-1, 1]) {
    const z = front * length * 0.505;
    add(new THREE.BoxGeometry(width * 0.96, 0.16, 0.13), trim, front > 0 ? 'Urban front bumper' : 'Urban rear bumper', [0, bodyY - 0.14, z]);
    add(new THREE.BoxGeometry(width * 0.46, 0.16, 0.035), plate, 'Urban license plate', [0, bodyY - 0.02, z + front * 0.075]);
    for (const side of [-1, 1]) {
      const material = front > 0 ? headlight : taillight;
      const lamp = add(new THREE.BoxGeometry(0.34, 0.16, 0.055), material, front > 0 ? 'Urban headlight' : 'Urban taillight', [side * width * 0.3, bodyY + 0.1, z + front * 0.085]);
      if (front > 0) lamp.userData.vehicleHeadlightLens = true;
    }
  }
  add(new THREE.BoxGeometry(width * 0.58, 0.2, 0.05), trim, 'Urban grille', [0, bodyY + 0.02, length * 0.515]);

  root.userData.performanceProfile = Object.freeze({
    style: `urban-${style}`,
    transparentMaterials: 0
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
