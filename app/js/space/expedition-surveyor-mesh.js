function surveyorMaterial(color, options = {}) {
  return new THREE.MeshPhongMaterial({
    color,
    shininess: options.shininess ?? 64,
    specular: options.specular ?? 0x536777,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite !== false,
    side: options.side ?? THREE.FrontSide
  });
}

function mesh(parent, geometry, material, name, position, rotation = null) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.position.set(...position);
  if (rotation) part.rotation.set(...rotation);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

function createSurveyorExteriorMesh() {
  const ship = new THREE.Group();
  ship.name = 'Surveyor Long-Range Research Vessel';
  ship.userData.authority = 'interstellar-expedition';
  ship.userData.visualOnly = true;
  ship.userData.dockingRadius = 18;

  const hull = surveyorMaterial(0xbecbd1, { shininess: 74, specular: 0x7f95a3 });
  const panel = surveyorMaterial(0x3d5260, { shininess: 48, specular: 0x2a3c49 });
  const frame = surveyorMaterial(0x182934, { shininess: 42, specular: 0x253f50 });
  const thermal = surveyorMaterial(0x202329, { shininess: 18, specular: 0x2c3138 });
  const glass = surveyorMaterial(0x164964, { shininess: 96, specular: 0x8de9ff, emissive: 0x0d5b79, emissiveIntensity: 0.9 });
  const guidance = surveyorMaterial(0x65e5ff, { shininess: 90, specular: 0xbef7ff, emissive: 0x1b95b2, emissiveIntensity: 1.15 });
  const solar = surveyorMaterial(0x183a6b, { shininess: 74, specular: 0x4c8ac8, emissive: 0x071c38, emissiveIntensity: 0.35, side: THREE.DoubleSide });

  // Longitudinal +Y gives the vessel a readable bow, spine, and engineering stern.
  mesh(ship, new THREE.CylinderGeometry(2.6, 3.25, 22, 28), hull, 'surveyor-pressure-spine', [0, 0, 0]);
  mesh(ship, new THREE.ConeGeometry(2.62, 5.4, 28), hull, 'surveyor-command-bow', [0, 13.7, 0]);
  mesh(ship, new THREE.CylinderGeometry(3.3, 3.8, 4.4, 28), panel, 'surveyor-engineering-stern', [0, -13.1, 0]);
  mesh(ship, new THREE.CylinderGeometry(2.65, 2.65, 0.75, 28), frame, 'surveyor-forward-collar', [0, 10.2, 0]);
  mesh(ship, new THREE.CylinderGeometry(3.3, 3.3, 0.7, 28), frame, 'surveyor-aft-collar', [0, -9.7, 0]);

  const bridge = mesh(ship, new THREE.SphereGeometry(2.1, 24, 14), hull, 'surveyor-bridge', [0, 10.9, 1.1]);
  bridge.scale.set(1.3, 1.65, 0.62);
  const bridgeWindow = mesh(ship, new THREE.SphereGeometry(1.78, 24, 12), glass, 'surveyor-bridge-window', [0, 11.2, 2.12]);
  bridgeWindow.scale.set(1.18, 1.35, 0.18);

  const habitat = new THREE.Group();
  habitat.name = 'surveyor-habitat-ring';
  habitat.position.y = 1.4;
  ship.add(habitat);
  mesh(habitat, new THREE.TorusGeometry(7.2, 1.25, 14, 52), hull, 'surveyor-habitat-pressure-ring', [0, 0, 0], [Math.PI / 2, 0, 0]);
  mesh(habitat, new THREE.TorusGeometry(5.45, 0.18, 8, 48), frame, 'surveyor-habitat-inner-truss', [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    const x = Math.cos(angle) * 6.35;
    const z = Math.sin(angle) * 6.35;
    const cabin = mesh(habitat, new THREE.BoxGeometry(1.7, 1.5, 2.05), index % 2 ? panel : hull, `surveyor-habitat-module-${index + 1}`, [x, 0, z], [0, -angle, 0]);
    cabin.userData.pressurized = true;
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = index / 4 * Math.PI * 2;
    const spoke = mesh(habitat, new THREE.BoxGeometry(0.34, 0.34, 6.4), frame, `surveyor-ring-spoke-${index + 1}`, [Math.cos(angle) * 3.15, 0, Math.sin(angle) * 3.15], [0, -angle + Math.PI / 2, 0]);
    spoke.userData.structural = true;
  }

  [-1, 1].forEach((side) => {
    mesh(ship, new THREE.BoxGeometry(5.8, 0.36, 0.55), frame, `surveyor-radiator-boom-${side < 0 ? 'port' : 'starboard'}`, [side * 5.2, -6.2, 0]);
    const radiator = mesh(ship, new THREE.BoxGeometry(7.8, 0.12, 4.8), thermal, `surveyor-radiator-${side < 0 ? 'port' : 'starboard'}`, [side * 11.8, -6.2, 0]);
    radiator.userData.thermalControl = true;
    const array = mesh(ship, new THREE.BoxGeometry(6.6, 0.1, 3.6), solar, `surveyor-solar-array-${side < 0 ? 'port' : 'starboard'}`, [side * 10.8, 6.8, 0]);
    array.userData.powerSurface = true;
    mesh(ship, new THREE.BoxGeometry(4.8, 0.3, 0.35), frame, `surveyor-array-boom-${side < 0 ? 'port' : 'starboard'}`, [side * 5.5, 6.8, 0]);
    for (let grid = -2; grid <= 2; grid += 1) {
      mesh(ship, new THREE.BoxGeometry(0.05, 0.14, 3.65), frame, 'surveyor-array-grid', [side * (10.8 + grid * 1.3), 6.8, 0.02]);
    }
  });

  const dock = new THREE.Group();
  dock.name = 'Surveyor Pathfinder Dock';
  dock.position.set(0, -4.1, 3.25);
  ship.add(dock);
  mesh(dock, new THREE.CylinderGeometry(2.05, 2.45, 2.6, 28), panel, 'surveyor-dock-bay', [0, 0, 0], [Math.PI / 2, 0, 0]);
  mesh(dock, new THREE.TorusGeometry(1.65, 0.18, 10, 40), guidance, 'surveyor-docking-collar', [0, 0, 1.4]);
  mesh(dock, new THREE.CylinderGeometry(1.54, 1.54, 0.2, 28), frame, 'surveyor-docking-door', [0, 0, 1.46], [Math.PI / 2, 0, 0]);
  [-1, 1].forEach((side) => mesh(dock, new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff516b : 0x58ffc0 }), 'surveyor-docking-running-light', [side * 2.2, 0, 1.4]));

  [-1.2, 0, 1.2].forEach((x, index) => {
    mesh(ship, new THREE.CylinderGeometry(0.56, 0.82, 2.1, 18), frame, `surveyor-drive-${index + 1}`, [x, -16.15, 0]);
    mesh(ship, new THREE.CylinderGeometry(0.46, 0.62, 0.32, 18), guidance, `surveyor-drive-glow-${index + 1}`, [x, -17.28, 0]);
  });

  ship.rotation.set(0.18, 0.45, -0.22);
  return ship;
}

export { createSurveyorExteriorMesh };
