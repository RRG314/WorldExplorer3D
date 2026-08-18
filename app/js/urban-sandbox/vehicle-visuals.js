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
  const materials = [paint, darkPaint, glass, trim, chrome, rubber, headlight, taillight, plate];
  const ownedGeometries = new Set();
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
  const bodyHeight = crossover || pickup ? 0.66 : compact ? 0.57 : 0.6;
  const bodyY = ground + wheelRadius + bodyHeight * 0.55;
  const cabinLength = pickup ? length * 0.38 : compact ? length * 0.49 : length * 0.5;
  const cabinZ = pickup ? length * 0.18 : -length * 0.08;
  const cabinHeight = crossover ? height * 0.52 : pickup ? height * 0.48 : height * 0.47;
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
    widthTop: width * 0.75,
    height: cabinHeight,
    length: cabinLength,
    frontInset: pickup ? 0.2 : 0.34,
    rearInset: 0.2
  }), paint, 'Urban cabin', [0, cabinY, cabinZ]);
  add(new THREE.BoxGeometry(width * 0.78, 0.075, cabinLength * 0.72), darkPaint, 'Urban roof', [0, cabinY + cabinHeight * 0.54, cabinZ - 0.02]);
  add(new THREE.BoxGeometry(width * 0.78, 0.32, 0.04), glass, 'Urban windshield', [0, cabinY + 0.02, cabinZ + cabinLength * 0.45], [-0.35, 0, 0]);
  add(new THREE.BoxGeometry(width * 0.77, 0.31, 0.04), glass, 'Urban rear window', [0, cabinY, cabinZ - cabinLength * 0.45], [0.25, 0, 0]);
  if (pickup) {
    add(new THREE.BoxGeometry(width * 0.9, height * 0.23, length * 0.38), darkPaint, 'Pickup bed', [0, bodyY + 0.16, -length * 0.3]);
    add(new THREE.BoxGeometry(width * 0.84, 0.08, length * 0.31), trim, 'Pickup bed floor', [0, bodyY + 0.3, -length * 0.31]);
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
    if (!pickup) {
      add(new THREE.BoxGeometry(0.045, 0.5, cabinLength * 0.42), paint, 'Urban rear door', [sideX, cabinY - 0.1, cabinZ - cabinLength * 0.3]);
      add(new THREE.BoxGeometry(0.05, 0.29, cabinLength * 0.31), glass, 'Urban rear side glass', [sideX, cabinY + 0.2, cabinZ - cabinLength * 0.3]);
      add(new THREE.BoxGeometry(0.065, 0.04, 0.22), chrome, 'Urban rear door handle', [sideX + side * 0.02, cabinY - 0.02, cabinZ - cabinLength * 0.39]);
    }
    add(new THREE.BoxGeometry(0.16, 0.1, 0.23), trim, 'Urban mirror', [side * width * 0.56, cabinY + 0.05, cabinZ + cabinLength * 0.3]);
  }

  const wheels = [];
  const axleZ = compact ? length * 0.3 : length * 0.32;
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
    materials: Object.freeze(materials),
    dispose() {
      root.removeFromParent?.();
      ownedGeometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  });
}

export { createUrbanVehicleVisual };
