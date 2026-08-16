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

function cylinderBetween(start, end, radius, railMaterial, radialSegments = 8) {
  const direction = end.clone().sub(start);
  const rail = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments),
    railMaterial
  );
  rail.position.copy(start).add(end).multiplyScalar(0.5);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return rail;
}

function addBowRail(group, side, railMaterial) {
  const x = side * 1.23;
  const lower = [
    new THREE.Vector3(x, 1.04, 0.85),
    new THREE.Vector3(x * 0.93, 1.13, 2.75),
    new THREE.Vector3(side * 0.4, 1.26, 4.55)
  ];
  const upper = lower.map((point) => point.clone().add(new THREE.Vector3(0, 0.55, 0)));
  for (let index = 0; index < upper.length - 1; index += 1) {
    group.add(cylinderBetween(upper[index], upper[index + 1], 0.025, railMaterial));
  }
  lower.forEach((point, index) => {
    group.add(cylinderBetween(point, upper[index], 0.022, railMaterial));
  });
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
  group.name = 'Harbor Scout Expedition Boat';
  group.userData.visualStyle = 'harbor-scout-expedition';
  group.userData.visualOnly = true;

  const hullMat = material(0x174d55, 0.58, 0.14, { emissive: 0x041517, emissiveIntensity: 0.2 });
  const deckMat = material(0xd8d3bd, 0.62, 0.04, { emissive: 0x1c1a14, emissiveIntensity: 0.1 });
  const accentMat = material(0xd66f35, 0.5, 0.08, { emissive: 0x291007, emissiveIntensity: 0.18 });
  const frameMat = material(0x263238, 0.66, 0.24);
  const railMat = material(0xb9c4c4, 0.34, 0.62);
  const glassMat = material(0x173f4f, 0.22, 0.16, {
    emissive: 0x071a21,
    emissiveIntensity: 0.32,
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

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.72, 1.78), deckMat);
  cabin.position.set(0, 1.39, -0.56);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.62), glassMat);
  windshield.position.set(0, 1.75, 0.38);
  windshield.rotation.x = -0.34;
  group.add(windshield);

  [-1, 1].forEach((side) => {
    const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.52), glassMat);
    sideWindow.position.set(side * 1.035, 1.73, -0.45);
    sideWindow.rotation.y = side * Math.PI / 2;
    group.add(sideWindow);
  });

  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 2.05), accentMat);
  cabinRoof.position.set(0, 1.88, -0.5);
  group.add(cabinRoof);

  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(1.68, 0.25, 1.12),
    material(0x30383d, 0.78, 0.02)
  );
  cockpit.position.set(0, 1.04, -1.75);
  group.add(cockpit);

  [-0.52, 0.52].forEach((x) => {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.68, 0.25),
      material(0x576263, 0.76, 0.03, { emissive: 0x101414, emissiveIntensity: 0.1 })
    );
    seat.position.set(x, 1.55, -1.72);
    seat.rotation.x = -0.14;
    group.add(seat);
  });

  [-1, 1].forEach((side) => {
    const rubRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 6.7), accentMat);
    rubRail.position.set(side * 1.57, 0.7, -0.22);
    rubRail.rotation.x = 0.015;
    group.add(rubRail);
  });

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 1.55), frameMat);
  rearDeck.position.set(0, 0.98, -3.55);
  group.add(rearDeck);

  const console = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.68, 0.52), frameMat);
  console.position.set(0.52, 1.33, -1.66);
  console.rotation.x = -0.12;
  group.add(console);

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

  addBowRail(group, -1, railMat);
  addBowRail(group, 1, railMat);

  const radarMast = cylinderBetween(
    new THREE.Vector3(0, 1.94, -0.72),
    new THREE.Vector3(0, 2.58, -0.72),
    0.04,
    railMat
  );
  group.add(radarMast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.09, 0.2), deckMat);
  radar.position.set(0, 2.62, -0.72);
  group.add(radar);

  const searchLight = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.19, 10), frameMat);
  searchLight.rotation.x = Math.PI / 2;
  searchLight.position.set(0, 2.2, 0.25);
  group.add(searchLight);
  const searchLens = new THREE.Mesh(new THREE.CircleGeometry(0.105, 10), new THREE.MeshBasicMaterial({ color: 0xffdf9a }));
  searchLens.position.set(0, 2.2, 0.355);
  group.add(searchLens);

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
