function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.03,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0
  });
}

function addBox(root, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addClockFace(root, position, rotation) {
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(3.45, 40),
    standardMaterial(0xeee3c4, { emissive: 0x5b4822, emissiveIntensity: 0.3 })
  );
  group.add(face);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(3.45, 0.24, 8, 36),
    standardMaterial(0x2c2d2b, { metalness: 0.55, roughness: 0.5 })
  );
  rim.position.z = 0.08;
  group.add(rim);

  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI / 6;
    const marker = addBox(group, [0.17, 0.58, 0.12], [Math.sin(angle) * 2.8, Math.cos(angle) * 2.8, 0.15], standardMaterial(0x262725));
    marker.rotation.z = -angle;
  }
  const minuteHand = addBox(group, [0.2, 2.65, 0.13], [0, 0.85, 0.19], standardMaterial(0x171817));
  minuteHand.rotation.z = -0.42;
  const hourHand = addBox(group, [0.28, 1.85, 0.16], [0.55, 0.35, 0.21], standardMaterial(0x171817));
  hourHand.rotation.z = 1.02;

  group.position.set(...position);
  group.rotation.set(...rotation);
  root.add(group);
}

function addPinnacle(root, x, z, baseHeight, material, roofMaterial) {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 7, 8), material);
  shaft.position.set(x, baseHeight + 3.5, z);
  shaft.castShadow = true;
  root.add(shaft);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 4.5, 8), roofMaterial);
  cap.position.set(x, baseHeight + 9.25, z);
  cap.castShadow = true;
  root.add(cap);
}

export function createMeasuredElizabethTower() {
  const root = new THREE.Group();
  const stone = standardMaterial(0xb7a77e, { emissive: 0x201b11, emissiveIntensity: 0.12 });
  const stoneDark = standardMaterial(0x8d8062, { emissive: 0x18140d, emissiveIntensity: 0.1 });
  const roof = standardMaterial(0x303b3a, { metalness: 0.22, roughness: 0.62 });
  const louver = standardMaterial(0x252a29, { roughness: 0.72 });

  addBox(root, [13.4, 4, 13.4], [0, 2, 0], stoneDark);
  addBox(root, [11.8, 45, 11.8], [0, 26.5, 0], stone);
  addBox(root, [13.2, 2.2, 13.2], [0, 49.5, 0], stoneDark);
  addBox(root, [12.5, 10, 12.5], [0, 55.5, 0], stone);
  addBox(root, [13.4, 1.8, 13.4], [0, 61.4, 0], stoneDark);
  addBox(root, [11.4, 13.5, 11.4], [0, 69.05, 0], stone);

  for (const side of [-1, 1]) {
    for (const offset of [-3.3, 0, 3.3]) {
      addBox(root, [1.25, 7.8, 0.35], [offset, 68.8, side * 5.78], louver);
      addBox(root, [0.35, 7.8, 1.25], [side * 5.78, 68.8, offset], louver);
    }
  }

  addClockFace(root, [0, 55.5, 6.31], [0, 0, 0]);
  addClockFace(root, [0, 55.5, -6.31], [0, Math.PI, 0]);
  addClockFace(root, [6.31, 55.5, 0], [0, Math.PI / 2, 0]);
  addClockFace(root, [-6.31, 55.5, 0], [0, -Math.PI / 2, 0]);

  for (const x of [-6.25, 6.25]) {
    for (const z of [-6.25, 6.25]) addPinnacle(root, x, z, 61, stoneDark, roof);
  }

  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 15, 4), roof);
  mainRoof.position.y = 83.25;
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.castShadow = true;
  root.add(mainRoof);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.55, 6.5, 8), roof);
  spire.position.y = 94.25;
  spire.castShadow = true;
  root.add(spire);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), roof);
  finial.position.y = 97.7;
  root.add(finial);
  return root;
}
