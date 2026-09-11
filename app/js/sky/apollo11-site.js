function createFlagTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 950;
  canvas.height = 500;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const stripeHeight = canvas.height / 13;
  context.fillStyle = '#b22234';
  for (let stripe = 0; stripe < 13; stripe += 2) {
    context.fillRect(0, stripe * stripeHeight, canvas.width, stripeHeight + 1);
  }
  const cantonWidth = canvas.width * 0.4;
  const cantonHeight = stripeHeight * 7;
  context.fillStyle = '#3c3b6e';
  context.fillRect(0, 0, cantonWidth, cantonHeight);
  context.fillStyle = '#ffffff';
  for (let row = 0; row < 9; row++) {
    const count = row % 2 === 0 ? 6 : 5;
    const offset = row % 2 === 0 ? 0.5 : 1;
    for (let column = 0; column < count; column++) {
      const x = (column + offset) * cantonWidth / 6;
      const y = (row + 0.5) * cantonHeight / 9;
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createEagleDescentStage(THREE) {
  const group = new THREE.Group();
  group.name = 'Apollo 11 Eagle Descent Stage';
  const foil = new THREE.MeshStandardMaterial({ color: 0xb99136, metalness: 0.55, roughness: 0.62 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x25282b, metalness: 0.72, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d6cb, metalness: 0.32, roughness: 0.68 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.18, 1.15, 8), foil);
  body.position.y = 1.38;
  body.rotation.y = Math.PI / 8;
  group.add(body);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 0.25, 8), darkMetal);
  deck.position.y = 2.08;
  group.add(deck);
  const engineBell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.72, 0.75, 16, 1, true), darkMetal);
  engineBell.position.y = 0.55;
  group.add(engineBell);

  for (let index = 0; index < 4; index++) {
    const angle = Math.PI * 0.25 + index * Math.PI * 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 2.9, 8), white);
    leg.position.set(Math.cos(angle) * 2.15, 0.95, Math.sin(angle) * 2.15);
    leg.rotation.z = Math.cos(angle) * 0.58;
    leg.rotation.x = -Math.sin(angle) * 0.58;
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.1, 16), foil);
    foot.position.set(Math.cos(angle) * 3.05, 0.08, Math.sin(angle) * 3.05);
    group.add(foot);
  }

  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.42, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xb9b7a8, metalness: 0.9, roughness: 0.24 })
  );
  plaque.position.set(0, 1.45, 2.14);
  group.add(plaque);
  return group;
}

function createAmericanFlag(THREE) {
  const group = new THREE.Group();
  group.name = 'Apollo 11 American Flag';
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xb9bec2, metalness: 0.9, roughness: 0.28 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.35, 10), poleMaterial);
  pole.position.y = 1.175;
  group.add(pole);
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.58, 8), poleMaterial);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0.78, 2.25, 0);
  group.add(crossbar);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.52, 0.91, 8, 4),
    new THREE.MeshStandardMaterial({ map: createFlagTexture(THREE), side: THREE.DoubleSide, roughness: 0.85 })
  );
  flag.position.set(0.8, 1.8, 0);
  group.add(flag);
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hitbox.position.set(0.7, 1.3, 0);
  group.add(hitbox);
  return group;
}

function createLaserReflector(THREE) {
  const group = new THREE.Group();
  group.name = 'Apollo 11 Laser Ranging Retroreflector';
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.12, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xd5d8d8, metalness: 0.82, roughness: 0.25 })
  );
  frame.position.y = 0.55;
  frame.rotation.x = -0.28;
  group.add(frame);
  const cells = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9efff, metalness: 0.45, roughness: 0.12 }),
    50
  );
  const transform = new THREE.Object3D();
  for (let index = 0; index < 50; index++) {
    transform.position.set(-0.45 + (index % 10) * 0.1, 0.625, -0.24 + Math.floor(index / 10) * 0.12);
    transform.rotation.x = Math.PI / 2 - 0.28;
    transform.updateMatrix();
    cells.setMatrixAt(index, transform.matrix);
  }
  cells.instanceMatrix.needsUpdate = true;
  group.add(cells);
  return group;
}

function createPassiveSeismometer(THREE) {
  const group = new THREE.Group();
  group.name = 'Apollo 11 Passive Seismic Experiment';
  const foil = new THREE.MeshStandardMaterial({ color: 0xc3b99d, metalness: 0.6, roughness: 0.58 });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x243a55, metalness: 0.25, roughness: 0.42 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.58), foil);
  body.position.y = 0.3;
  group.add(body);
  [-0.72, 0.72].forEach((x) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.045, 0.62), panelMaterial);
    panel.position.set(x, 0.22, 0);
    group.add(panel);
  });
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.25 })
  );
  antenna.position.set(0, 0.9, 0);
  group.add(antenna);
  return group;
}

function createApollo11SiteEquipment({ THREE, appCtx, landingX, landingZ, groundAt }) {
  const moonObjects = [];
  const place = (object, x, z, heading = 0) => {
    object.position.set(x, groundAt(x, z), z);
    object.rotation.y = heading;
    object.userData.moonObject = true;
    object.traverse((child) => {
      if (child.isMesh || child.isInstancedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    appCtx.scene.add(object);
    moonObjects.push(object);
    return object;
  };

  place(createEagleDescentStage(THREE), landingX, landingZ, -0.16);
  const flag = place(createAmericanFlag(THREE), landingX + 6.2, landingZ - 5.3, 0.35);
  place(createLaserReflector(THREE), landingX - 1.2, landingZ - 21, 0.04);
  place(createPassiveSeismometer(THREE), landingX + 0.6, landingZ - 27, -0.03);
  flag.userData.isApollo11 = true;
  return { flag, moonObjects };
}

export { createApollo11SiteEquipment };
