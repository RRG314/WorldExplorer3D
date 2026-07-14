function material(color, roughness, metalness = 0.05, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}

function createHullGeometry() {
  const stations = [
    { z: -4.7, width: 1.55, top: 0.72, keel: -0.22 },
    { z: -2.8, width: 1.72, top: 0.82, keel: -0.42 },
    { z: 0.2, width: 1.68, top: 0.86, keel: -0.58 },
    { z: 2.9, width: 1.34, top: 0.92, keel: -0.4 },
    { z: 4.8, width: 0.62, top: 1.04, keel: -0.02 },
    { z: 5.65, width: 0.05, top: 1.16, keel: 0.54 }
  ];
  const vertices = [];
  const indices = [];
  stations.forEach((station) => {
    vertices.push(
      -station.width, station.top, station.z,
      station.width, station.top, station.z,
      station.width * 0.58, station.keel, station.z,
      -station.width * 0.58, station.keel, station.z
    );
  });
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      indices.push(a + side, b + side, b + next, a + side, b + next, a + next);
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

function createForedeckGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1.28, 0, -1.7,
    1.28, 0, -1.7,
    0, 0, 1.65
  ], 3));
  geometry.setIndex([0, 2, 1]);
  geometry.computeVertexNormals();
  return geometry;
}

function addRail(group, x, z, length, rotationY = 0) {
  const rail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, length, 8),
    material(0xdce4e8, 0.28, 0.72)
  );
  rail.position.set(x, 1.62, z);
  rail.rotation.z = Math.PI / 2;
  rail.rotation.y = rotationY;
  group.add(rail);
}

function addNavigationLight(group, x, color) {
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  light.position.set(x, 1.48, 3.25);
  group.add(light);
}

function createBoatModeMesh() {
  const group = new THREE.Group();
  group.name = 'BoatModeMesh';

  const hullMat = material(0x164d69, 0.5, 0.16, { emissive: 0x061923, emissiveIntensity: 0.22 });
  const deckMat = material(0xf3f5f2, 0.48, 0.04, { emissive: 0x242725, emissiveIntensity: 0.12 });
  const accentMat = material(0xc83e4d, 0.42, 0.1, { emissive: 0x24080c, emissiveIntensity: 0.18 });
  const glassMat = material(0x80c9e8, 0.16, 0.08, {
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide
  });

  const hull = new THREE.Mesh(createHullGeometry(), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.15, 5.7), deckMat);
  deck.position.set(0, 0.9, -0.35);
  group.add(deck);

  const foredeck = new THREE.Mesh(createForedeckGeometry(), deckMat);
  foredeck.position.set(0, 1.08, 3.65);
  group.add(foredeck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.78, 1.82), deckMat);
  cabin.position.set(0, 1.42, -0.55);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.72), glassMat);
  windshield.position.set(0, 1.78, 0.39);
  windshield.rotation.x = -0.34;
  group.add(windshield);

  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(1.68, 0.25, 1.12),
    material(0x30383d, 0.78, 0.02)
  );
  cockpit.position.set(0, 1.04, -1.75);
  group.add(cockpit);

  [-0.52, 0.52].forEach((x) => {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.72, 0.24),
      material(0xd8dde0, 0.7, 0.03, { emissive: 0x17191a, emissiveIntensity: 0.1 })
    );
    seat.position.set(x, 1.55, -1.72);
    seat.rotation.x = -0.14;
    group.add(seat);
  });

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.28, 0.12, 3.6), accentMat);
  stripe.position.set(0, 0.48, -0.15);
  stripe.scale.x = 1.01;
  group.add(stripe);

  const motor = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.76, 0.58),
    material(0x343b40, 0.38, 0.52, { emissive: 0x080a0b, emissiveIntensity: 0.16 })
  );
  motor.position.set(0, 0.76, -5.0);
  motor.castShadow = true;
  group.add(motor);

  const swimPlatform = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.62), deckMat);
  swimPlatform.position.set(0, 0.72, -4.95);
  group.add(swimPlatform);

  addRail(group, -1.18, 1.8, 3.7, -0.08);
  addRail(group, 1.18, 1.8, 3.7, 0.08);
  addNavigationLight(group, -1.05, 0xff3c45);
  addNavigationLight(group, 1.05, 0x41ff78);

  group.traverse((child) => {
    if (!child?.isMesh) return;
    child.renderOrder = 8;
    child.castShadow = true;
  });
  group.visible = false;
  return group;
}

export { createBoatModeMesh };
