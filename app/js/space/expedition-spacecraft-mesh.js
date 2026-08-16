function phongMaterial(color, shininess = 45, specular = 0x333333, options = {}) {
  return new THREE.MeshPhongMaterial({ color, shininess, specular, ...options });
}

function createWingGeometry(side = 1) {
  const sx = side < 0 ? -1 : 1;
  const points = [
    [0.9 * sx, -2.7, -0.25],
    [4.35 * sx, -3.7, -0.18],
    [3.2 * sx, 0.6, -0.12],
    [1.35 * sx, 1.25, -0.18],
    [0.9 * sx, -2.7, 0.25],
    [4.35 * sx, -3.7, 0.18],
    [3.2 * sx, 0.6, 0.12],
    [1.35 * sx, 1.25, 0.18]
  ];
  const vertices = points.flat();
  const indices = side < 0
    ? [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
    : [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createExpeditionSpacecraftMesh() {
  const craft = new THREE.Group();
  craft.name = 'Wayfinder Expedition Spacecraft';
  craft.userData.visualStyle = 'wayfinder-expedition';
  craft.userData.visualOnly = true;

  const hullMat = phongMaterial(0xbfc7c8, 58, 0x45525a);
  const panelMat = phongMaterial(0x3d5157, 34, 0x1c2529);
  const accentMat = phongMaterial(0xd57937, 50, 0x4b2510);
  const darkMat = phongMaterial(0x1a2228, 26, 0x101418);
  const glassMat = phongMaterial(0x183b55, 92, 0x5b94b4, {
    emissive: 0x071828,
    emissiveIntensity: 0.55
  });
  const engineMat = phongMaterial(0x69757a, 72, 0x899398);

  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 2.05, 9.7, 10), hullMat);
  craft.add(core);

  const forwardHull = new THREE.Mesh(new THREE.ConeGeometry(1.58, 3.7, 10), hullMat);
  forwardHull.position.y = 6.7;
  craft.add(forwardHull);

  const noseCap = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.25, 10), accentMat);
  noseCap.position.y = 9.15;
  craft.add(noseCap);

  const bellyPanel = new THREE.Mesh(new THREE.BoxGeometry(2.15, 5.4, 0.22), panelMat);
  bellyPanel.position.set(0, 0.2, -1.62);
  craft.add(bellyPanel);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.28, 12, 8), glassMat);
  canopy.scale.set(0.72, 1.16, 0.42);
  canopy.position.set(0, 3.2, 1.5);
  craft.add(canopy);

  [-1, 1].forEach((side) => {
    const wing = new THREE.Mesh(createWingGeometry(side), panelMat);
    craft.add(wing);

    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, 5.8, 10), hullMat);
    pod.position.set(side * 3.15, -1.3, 0);
    craft.add(pod);

    const podNose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.45, 10), accentMat);
    podNose.position.set(side * 3.15, 2.33, 0);
    craft.add(podNose);

    const podNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.72, 1.05, 10), engineMat);
    podNozzle.position.set(side * 3.15, -4.7, 0);
    craft.add(podNozzle);

    const runningLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0x36d9ff : 0xff9b42 })
    );
    runningLight.position.set(side * 4.2, -3.45, 0.02);
    craft.add(runningLight);
  });

  const tailCollar = new THREE.Mesh(new THREE.CylinderGeometry(2.08, 2.08, 0.42, 10), accentMat);
  tailCollar.position.y = -4.65;
  craft.add(tailCollar);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.72, 1.55, 12), engineMat);
  nozzle.position.y = -5.65;
  craft.add(nozzle);

  const engineGlow = new THREE.Mesh(
    new THREE.ConeGeometry(1.55, 8, 12),
    new THREE.MeshBasicMaterial({ color: 0x43cfff, transparent: true, opacity: 0, depthWrite: false })
  );
  engineGlow.position.y = -10.35;
  engineGlow.rotation.x = Math.PI;
  engineGlow.name = 'engineGlow';
  craft.add(engineGlow);

  const exhaustGroup = new THREE.Group();
  exhaustGroup.name = 'exhaust';
  const hotExhaustMat = new THREE.MeshBasicMaterial({
    color: 0xb5f4ff,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const coolExhaustMat = new THREE.MeshBasicMaterial({
    color: 0x3aaeff,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const particleOffsets = [
    [0, -9.2, 0],
    [0.44, -10.5, -0.18],
    [-0.38, -11.75, 0.22],
    [0.22, -13.0, 0.1],
    [-0.2, -14.15, -0.16],
    [0.06, -15.2, 0.04]
  ];
  particleOffsets.forEach(([x, y, z], index) => {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.58 - index * 0.045, 8, 6),
      index < 2 ? hotExhaustMat : coolExhaustMat
    );
    particle.position.set(x, y, z);
    exhaustGroup.add(particle);
  });
  craft.add(exhaustGroup);

  craft.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return craft;
}

export { createExpeditionSpacecraftMesh };
