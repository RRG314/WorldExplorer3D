function createTaperedPrismGeometry(THREE, options = {}) {
  const widthBottom = Number(options.widthBottom) || 1;
  const widthTop = Number(options.widthTop) || widthBottom;
  const height = Number(options.height) || 1;
  const length = Number(options.length) || 1;
  const frontInset = Math.max(0, Number(options.frontInset) || 0);
  const rearInset = Math.max(0, Number(options.rearInset) || 0);
  const halfBottom = widthBottom / 2;
  const halfTop = widthTop / 2;
  const halfHeight = height / 2;
  const halfLength = length / 2;
  const positions = new Float32Array([
    -halfBottom, -halfHeight, halfLength,
    halfBottom, -halfHeight, halfLength,
    halfBottom, -halfHeight, -halfLength,
    -halfBottom, -halfHeight, -halfLength,
    -halfTop, halfHeight, halfLength - frontInset,
    halfTop, halfHeight, halfLength - frontInset,
    halfTop, halfHeight, -halfLength + rearInset,
    -halfTop, halfHeight, -halfLength + rearInset
  ]);
  const indices = [
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
    0, 3, 2, 0, 2, 1
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  geometry.dispose();
  return faceted;
}

function createClassicUtilityCar(THREE) {
  const car = new THREE.Group();
  car.name = 'Classic Utility Car D';
  car.userData.vehicleStyle = 'classic-utility-d';

  const paint = new THREE.MeshStandardMaterial({
    color: 0x5f7a52,
    metalness: 0.22,
    roughness: 0.54,
    envMapIntensity: 0.65,
    flatShading: true
  });
  paint.userData.vehiclePaintFinish = 'utility-matte';
  const trim = new THREE.MeshStandardMaterial({ color: 0x171c1b, roughness: 0.84, metalness: 0.08, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x182426, roughness: 0.32, metalness: 0.16, flatShading: true });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111313, roughness: 0.96, metalness: 0.01, flatShading: true });
  const rim = new THREE.MeshStandardMaterial({ color: 0x59605c, roughness: 0.7, metalness: 0.4, flatShading: true });
  const headlight = new THREE.MeshStandardMaterial({
    color: 0xfff8d8,
    emissive: 0xffe4a6,
    emissiveIntensity: 0.55,
    roughness: 0.24,
    metalness: 0.04,
    flatShading: true
  });
  const taillight = new THREE.MeshStandardMaterial({
    color: 0xd52a24,
    emissive: 0xb9110c,
    emissiveIntensity: 0.7,
    roughness: 0.3,
    metalness: 0.02,
    flatShading: true
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xe38b27,
    emissive: 0xb35a12,
    emissiveIntensity: 0.25,
    roughness: 0.42,
    metalness: 0.02
  });

  const addMesh = (geometry, material, name, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    car.add(mesh);
    return mesh;
  };

  addMesh(
    createTaperedPrismGeometry(THREE, { widthBottom: 1.88, widthTop: 1.78, height: 0.62, length: 3.66, frontInset: 0.16, rearInset: 0.08 }),
    paint,
    'Utility Lower Body',
    [0, 0.57, 0]
  );
  addMesh(
    createTaperedPrismGeometry(THREE, { widthBottom: 1.65, widthTop: 1.46, height: 0.78, length: 2.7, frontInset: 0.43, rearInset: 0.12 }),
    paint,
    'Utility Cabin',
    [0, 1.16, -0.28]
  );
  addMesh(
    createTaperedPrismGeometry(THREE, { widthBottom: 1.7, widthTop: 1.56, height: 0.23, length: 1.0, frontInset: 0.12, rearInset: 0.02 }),
    paint,
    'Utility Hood',
    [0, 0.91, 1.27]
  );
  addMesh(new THREE.BoxGeometry(1.5, 0.09, 2.25), paint, 'Utility Roof', [0, 1.59, -0.34]);
  addMesh(new THREE.BoxGeometry(1.92, 0.19, 0.23), trim, 'Front Bumper', [0, 0.36, 1.86]);
  addMesh(new THREE.BoxGeometry(1.94, 0.2, 0.25), trim, 'Rear Bumper', [0, 0.37, -1.87]);
  addMesh(new THREE.BoxGeometry(1.28, 0.22, 0.055), trim, 'Front Grille', [0, 0.67, 1.84]);
  addMesh(new THREE.BoxGeometry(0.56, 0.12, 0.08), trim, 'Front Skid Plate', [0, 0.28, 1.93]);
  addMesh(new THREE.BoxGeometry(0.62, 0.12, 0.08), trim, 'Rear Skid Plate', [0, 0.28, -1.94]);

  addMesh(new THREE.BoxGeometry(1.28, 0.42, 0.035), glass, 'Windshield', [0, 1.25, 0.91], [-0.43, 0, 0]);
  addMesh(new THREE.BoxGeometry(1.32, 0.43, 0.035), glass, 'Rear Window', [0, 1.24, -1.68], [0.14, 0, 0]);
  for (const side of [-1, 1]) {
    const x = side * 0.81;
    addMesh(new THREE.BoxGeometry(0.035, 0.43, 0.78), glass, side < 0 ? 'Left Front Window' : 'Right Front Window', [x, 1.27, 0.28]);
    addMesh(new THREE.BoxGeometry(0.035, 0.43, 0.72), glass, side < 0 ? 'Left Rear Window' : 'Right Rear Window', [x, 1.27, -0.62]);
    addMesh(new THREE.BoxGeometry(0.035, 0.4, 0.42), glass, side < 0 ? 'Left Cargo Window' : 'Right Cargo Window', [x, 1.27, -1.22]);
    addMesh(new THREE.BoxGeometry(0.07, 0.44, 0.045), trim, 'Door Divider', [x + side * 0.006, 1.25, -0.17]);
    addMesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), trim, 'Mirror', [side * 0.99, 1.18, 0.55]);
    addMesh(new THREE.BoxGeometry(0.075, 0.09, 2.5), trim, 'Roof Rail', [side * 0.59, 1.69, -0.32]);
    addMesh(new THREE.BoxGeometry(0.08, 0.18, 0.82), trim, 'Lower Cladding Front', [side * 0.93, 0.48, 1.02]);
    addMesh(new THREE.BoxGeometry(0.08, 0.18, 0.82), trim, 'Lower Cladding Rear', [side * 0.93, 0.48, -1.02]);
    addMesh(new THREE.BoxGeometry(0.035, 0.025, 0.26), trim, 'Front Door Handle', [side * 0.835, 1.0, 0.18]);
    addMesh(new THREE.BoxGeometry(0.035, 0.025, 0.26), trim, 'Rear Door Handle', [side * 0.835, 1.0, -0.72]);
    addMesh(new THREE.BoxGeometry(0.055, 0.09, 0.08), amber, 'Side Marker', [side * 0.955, 0.69, 1.55]);
  }
  addMesh(new THREE.BoxGeometry(1.24, 0.07, 0.07), trim, 'Front Roof Crossbar', [0, 1.72, 0.25]);
  addMesh(new THREE.BoxGeometry(1.24, 0.07, 0.07), trim, 'Rear Roof Crossbar', [0, 1.72, -1.02]);

  const wheels = [];
  const tireGeometry = new THREE.CylinderGeometry(0.39, 0.39, 0.28, 12);
  const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.292, 10);
  for (const [x, y, z] of [[-0.92, 0.39, 1.12], [0.92, 0.39, 1.12], [-0.92, 0.39, -1.13], [0.92, 0.39, -1.13]]) {
    const wheel = new THREE.Group();
    wheel.name = 'Utility Wheel';
    wheel.position.set(x, y, z);
    const tire = new THREE.Mesh(tireGeometry, rubber);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);
    const hub = new THREE.Mesh(rimGeometry, rim);
    hub.rotation.z = Math.PI / 2;
    hub.castShadow = true;
    wheel.add(hub);
    car.add(wheel);
    wheels.push(wheel);
  }

  const addRoundLamp = (x, y, z, material, name, front = false) => {
    const lamp = addMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12), material, name, [x, y, z], [Math.PI / 2, 0, 0]);
    if (front) lamp.userData.vehicleHeadlightLens = true;
    return lamp;
  };
  addRoundLamp(-0.57, 0.75, 1.86, headlight, 'Left Round Headlight', true);
  addRoundLamp(0.57, 0.75, 1.86, headlight, 'Right Round Headlight', true);
  addRoundLamp(-0.64, 0.78, -1.86, taillight, 'Left Upper Tail Light');
  addRoundLamp(-0.64, 0.5, -1.88, taillight, 'Left Lower Tail Light');
  addRoundLamp(0.64, 0.78, -1.86, taillight, 'Right Upper Tail Light');
  addRoundLamp(0.64, 0.5, -1.88, taillight, 'Right Lower Tail Light');

  const visualOffsetY = -1.1;
  for (const child of car.children) child.position.y += visualOffsetY;
  car.userData.performanceProfile = Object.freeze({
    style: 'classic-utility-d',
    meshes: 49,
    wheelSegments: 12,
    transparentMaterials: 0
  });

  return { car, paintMaterial: paint, wheels };
}

export { createClassicUtilityCar, createTaperedPrismGeometry };
