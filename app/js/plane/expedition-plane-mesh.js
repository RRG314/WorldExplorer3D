function standardMaterial(color, roughness = 0.55, metalness = 0.12, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}

function cylinderBetween(start, end, radius, material, radialSegments = 8) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments),
    material
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function createTaperedPanelGeometry({ span, rootChord, tipChord, thickness = 0.12, sweep = 0 }) {
  const halfSpan = span * 0.5;
  const halfThickness = thickness * 0.5;
  const vertices = [];
  const corners = [
    [-halfSpan, -rootChord * 0.5],
    [0, -rootChord * 0.5],
    [halfSpan, -rootChord * 0.5],
    [-halfSpan, tipChord * 0.5 - sweep],
    [0, rootChord * 0.5],
    [halfSpan, tipChord * 0.5 - sweep]
  ];
  corners.forEach(([x, z]) => vertices.push(x, halfThickness, z));
  corners.forEach(([x, z]) => vertices.push(x, -halfThickness, z));
  const indices = [
    0, 4, 3, 0, 1, 4,
    1, 2, 5, 1, 5, 4,
    6, 9, 10, 6, 10, 7,
    7, 10, 11, 7, 11, 8,
    0, 6, 7, 0, 7, 1,
    1, 7, 8, 1, 8, 2,
    3, 4, 10, 3, 10, 9,
    4, 5, 11, 4, 11, 10,
    0, 3, 9, 0, 9, 6,
    2, 8, 11, 2, 11, 5
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createExpeditionPlaneMesh() {
  const plane = new THREE.Group();
  plane.name = 'Trailblazer Expedition Plane';
  plane.userData.visualStyle = 'trailblazer-expedition';
  plane.userData.visualOnly = true;

  const bodyMat = standardMaterial(0xd8d1b8, 0.62, 0.08);
  const undersideMat = standardMaterial(0x4d5b57, 0.7, 0.12);
  const accentMat = standardMaterial(0xd76b35, 0.52, 0.1);
  const frameMat = standardMaterial(0x273039, 0.68, 0.22);
  const glassMat = standardMaterial(0x183f50, 0.22, 0.18, {
    emissive: 0x07171f,
    emissiveIntensity: 0.32
  });
  const tireMat = standardMaterial(0x161a1c, 0.92, 0.02);
  const hubMat = standardMaterial(0xaeb8ba, 0.38, 0.58);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 4.9, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.05;
  plane.add(fuselage);

  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.58, 3.8, 10, 1, false, 0, Math.PI), undersideMat);
  belly.rotation.set(Math.PI / 2, 0, Math.PI);
  belly.position.set(0, -0.14, -0.22);
  plane.add(belly);

  const cowling = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.54, 0.92, 12), accentMat);
  cowling.rotation.x = Math.PI / 2;
  cowling.position.z = 2.87;
  plane.add(cowling);

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.58, 12), frameMat);
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 3.62;
  plane.add(spinner);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.64, 12, 8), glassMat);
  cockpit.scale.set(0.82, 0.6, 1.18);
  cockpit.position.set(0, 0.48, 1.12);
  plane.add(cockpit);

  [-0.54, 0.54].forEach((x) => {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.52, 0.92), glassMat);
    window.position.set(x, 0.43, 0.58);
    plane.add(window);
  });

  const wing = new THREE.Mesh(createTaperedPanelGeometry({
    span: 7.2,
    rootChord: 1.38,
    tipChord: 0.92,
    thickness: 0.15,
    sweep: 0.18
  }), bodyMat);
  wing.position.set(0, 0.62, 0.12);
  plane.add(wing);

  const wingAccent = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.035, 0.24), accentMat);
  wingAccent.position.set(0, 0.71, 0.44);
  plane.add(wingAccent);

  [[-0.52, 0.13, 0.2, -2.5, 0.58, 0.13], [0.52, 0.13, 0.2, 2.5, 0.58, 0.13]].forEach((points) => {
    plane.add(cylinderBetween(
      new THREE.Vector3(points[0], points[1], points[2]),
      new THREE.Vector3(points[3], points[4], points[5]),
      0.035,
      frameMat
    ));
  });

  const tailWing = new THREE.Mesh(createTaperedPanelGeometry({
    span: 2.55,
    rootChord: 0.72,
    tipChord: 0.48,
    thickness: 0.1,
    sweep: 0.1
  }), bodyMat);
  tailWing.position.set(0, 0.2, -2.22);
  plane.add(tailWing);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.15, 0.92), accentMat);
  fin.position.set(0, 0.63, -2.2);
  fin.rotation.x = -0.16;
  plane.add(fin);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.25), frameMat);
  rudder.position.set(0, 0.63, -2.69);
  plane.add(rudder);

  const propeller = new THREE.Group();
  propeller.name = 'propeller';
  const propellerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 10), hubMat);
  propellerHub.rotation.x = Math.PI / 2;
  propeller.add(propellerHub);
  const bladeGeometry = new THREE.BoxGeometry(0.13, 1.9, 0.055);
  const bladeA = new THREE.Mesh(bladeGeometry, frameMat);
  const bladeB = new THREE.Mesh(bladeGeometry, frameMat);
  bladeB.rotation.z = Math.PI / 2;
  propeller.add(bladeA, bladeB);
  propeller.position.z = 3.92;
  plane.add(propeller);

  [[-0.82, -0.82, 0.55], [0.82, -0.82, 0.55], [0, -0.58, -2.12]].forEach(([x, y, z], index) => {
    const strutStart = new THREE.Vector3(x * (index < 2 ? 0.55 : 0), -0.18, z + (index < 2 ? -0.08 : 0.18));
    const wheelCenter = new THREE.Vector3(x, y, z);
    plane.add(cylinderBetween(strutStart, wheelCenter, 0.045, frameMat));
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(index < 2 ? 0.3 : 0.2, index < 2 ? 0.3 : 0.2, index < 2 ? 0.16 : 0.12, 12),
      tireMat
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.copy(wheelCenter);
    plane.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, (index < 2 ? 0.18 : 0.14), 10), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheelCenter);
    plane.add(hub);
  });

  [-3.58, 3.58].forEach((x, index) => {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), index === 0
      ? new THREE.MeshBasicMaterial({ color: 0xff4b45 })
      : new THREE.MeshBasicMaterial({ color: 0x50ef83 }));
    light.position.set(x, 0.64, -0.04);
    plane.add(light);
  });
  const landingLight = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), lightMat);
  landingLight.position.set(0, -0.05, 3.34);
  landingLight.rotation.x = -Math.PI / 2;
  plane.add(landingLight);

  plane.scale.setScalar(0.92);
  plane.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  plane.visible = false;
  return { plane, propeller };
}

export { createExpeditionPlaneMesh };
