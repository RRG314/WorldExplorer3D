import { SPACE_CRAFT_IDENTITY } from './craft-identity.js?v=1';

function phong(color, options = {}) {
  return new THREE.MeshPhongMaterial({
    color,
    shininess: options.shininess ?? 58,
    specular: options.specular ?? 0x526170,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite !== false
  });
}

function addCylinder(parent, radiusTop, radiusBottom, length, material, position, rotation = null, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addBox(parent, size, material, position, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function createExpeditionSpacecraftMesh() {
  const craft = new THREE.Group();
  craft.name = `${SPACE_CRAFT_IDENTITY.starship.name} Exploration Starship`;
  craft.userData.playerFacingName = SPACE_CRAFT_IDENTITY.starship.name;
  craft.userData.craftRole = SPACE_CRAFT_IDENTITY.starship.role;
  craft.userData.visualStyle = 'horizon-class-retro-futurist';
  craft.userData.originalDesign = true;
  craft.userData.visualOnly = true;

  const ceramic = phong(0xd7dde0, { shininess: 72, specular: 0x73808a });
  const ceramicDark = phong(0x7f8b93, { shininess: 64, specular: 0x49565f });
  const hullShadow = phong(0x263542, { shininess: 38, specular: 0x1a2834 });
  const copper = phong(0xc86f3f, { shininess: 68, specular: 0x60301d });
  const windowMat = phong(0x163e60, {
    shininess: 92,
    specular: 0x77c9e8,
    emissive: 0x0b4169,
    emissiveIntensity: 1.05
  });
  const engineMat = phong(0x74d9ff, {
    emissive: 0x1c9fd8,
    emissiveIntensity: 1.4,
    shininess: 90
  });

  // Local +Y is the shared flight authority's forward axis.
  const saucer = addCylinder(craft, 5.7, 5.7, 0.82, ceramic, [0, 4.9, 0], [Math.PI / 2, 0, 0], 40);
  saucer.scale.y = 0.78;
  const saucerLower = addCylinder(craft, 4.75, 3.65, 0.72, ceramicDark, [0, 4.25, -0.36], [Math.PI / 2, 0, 0], 36);
  saucerLower.scale.y = 0.78;
  const bridge = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 12), ceramic);
  bridge.scale.set(1.25, 0.92, 0.32);
  bridge.position.set(0, 5.1, 0.58);
  craft.add(bridge);
  const bridgeGlass = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), windowMat);
  bridgeGlass.scale.y = 0.78;
  bridgeGlass.position.set(0, 5.1, 0.86);
  craft.add(bridgeGlass);

  addBox(craft, [2.1, 6.2, 1.6], hullShadow, [0, 0.75, 0], [0, 0, -0.04]);
  const lowerHull = addCylinder(craft, 1.48, 2.18, 6.6, ceramic, [0, -1.25, 0], null, 24);
  lowerHull.scale.z = 0.8;
  const forwardDeflector = addCylinder(craft, 1.52, 0.7, 0.62, copper, [0, 0.15, -1.38], [Math.PI / 2, 0, 0], 24);
  forwardDeflector.scale.y = 0.72;
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.64, 16, 10), engineMat);
  sensor.scale.set(1, 0.36, 1);
  sensor.position.set(0, 0.15, -1.82);
  craft.add(sensor);

  [-1, 1].forEach((side) => {
    const pylon = addBox(craft, [3.6, 0.34, 0.48], ceramicDark, [side * 2.35, -1.2, 0], [0, 0, side * -0.2]);
    pylon.position.z = 0.15;
    const nacelle = addCylinder(craft, 0.58, 0.76, 8.4, ceramicDark, [side * 4.25, -0.85, 0.55], null, 20);
    nacelle.scale.z = 0.82;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10), copper);
    cap.scale.set(1, 1.35, 0.82);
    cap.position.set(side * 4.25, 3.4, 0.55);
    craft.add(cap);
    const engineStrip = addBox(craft, [0.3, 6.3, 0.16], engineMat, [side * 4.25, -0.55, 1.14]);
    engineStrip.name = `nacelleGlow${side < 0 ? 'Port' : 'Starboard'}`;
    const tail = addCylinder(craft, 0.47, 0.63, 0.8, hullShadow, [side * 4.25, -5.45, 0.55], null, 18);
    tail.name = `nacelleTail${side < 0 ? 'Port' : 'Starboard'}`;

    const runningLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff4d5f : 0x4dffb8 })
    );
    runningLight.position.set(side * 5.35, 4.75, 0.05);
    craft.add(runningLight);
  });

  const engineGlow = new THREE.Group();
  engineGlow.name = 'engineGlow';
  [-1, 1].forEach((side) => {
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.66, 5.8, 16),
      new THREE.MeshBasicMaterial({ color: 0x62dfff, transparent: true, opacity: 0, depthWrite: false })
    );
    plume.position.set(side * 4.25, -8.65, 0.55);
    plume.rotation.x = Math.PI;
    engineGlow.add(plume);
  });
  craft.add(engineGlow);

  const exhaust = new THREE.Group();
  exhaust.name = 'exhaust';
  [-1, 1].forEach((side) => {
    [0, 1, 2].forEach((step) => {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.42 - step * 0.08, 8, 6),
        new THREE.MeshBasicMaterial({
          color: step === 0 ? 0xc8f8ff : 0x45bfff,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      particle.position.set(side * 4.25, -6.5 - step * 1.25, 0.55);
      exhaust.add(particle);
    });
  });
  craft.add(exhaust);

  craft.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return craft;
}

export { createExpeditionSpacecraftMesh };
