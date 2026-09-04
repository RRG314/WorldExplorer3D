function podMaterial(color, options = {}) {
  return new THREE.MeshPhongMaterial({
    color,
    shininess: options.shininess ?? 56,
    specular: options.specular ?? 0x526577,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite !== false
  });
}

function addMesh(parent, geometry, surface, name, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = name;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createExpeditionPodMesh() {
  const pod = new THREE.Group();
  pod.name = 'Pathfinder Flight Pod';
  pod.userData.visualOnly = true;
  pod.userData.authority = 'expedition-pod-journey';

  const hull = podMaterial(0xc7d2d8, { shininess: 72, specular: 0x718797 });
  const hullDark = podMaterial(0x2c3d48, { shininess: 46, specular: 0x263847 });
  const thermal = podMaterial(0x171d22, { shininess: 18, specular: 0x20272b });
  const frame = podMaterial(0x667783, { shininess: 74, specular: 0x8295a2 });
  const windowSurface = podMaterial(0x17445e, {
    shininess: 96,
    specular: 0x77dcff,
    emissive: 0x0c4562,
    emissiveIntensity: 0.85
  });
  const guidance = podMaterial(0x69dcf3, {
    shininess: 88,
    specular: 0xb7f4ff,
    emissive: 0x238faa,
    emissiveIntensity: 1.05
  });

  // Local +Y remains the shared Space Flight forward axis.
  const pressureHull = addMesh(pod, new THREE.CylinderGeometry(1.55, 1.75, 6.4, 28), hull, 'pod-pressure-hull', [0, 0, 0]);
  pressureHull.scale.z = 0.9;
  addMesh(pod, new THREE.ConeGeometry(1.56, 2.3, 28), hull, 'pod-forward-aeroshell', [0, 4.35, 0]);
  const heatShield = addMesh(pod, new THREE.CylinderGeometry(1.78, 1.9, 0.52, 28), thermal, 'pod-heat-shield', [0, -3.45, 0]);
  heatShield.scale.z = 0.92;

  [-1, 1].forEach((side) => {
    const window = addMesh(pod, new THREE.SphereGeometry(0.72, 18, 10), windowSurface, `pod-window-${side < 0 ? 'port' : 'starboard'}`, [side * 0.76, 2.15, 1.15]);
    window.scale.set(0.82, 0.62, 0.25);
    addMesh(pod, new THREE.BoxGeometry(0.12, 1.42, 0.12), frame, 'pod-window-frame', [side * 0.08, 2.12, 1.44]);
    [-1.55, 1.55].forEach((y) => {
      addMesh(pod, new THREE.BoxGeometry(0.46, 0.72, 0.62), hullDark, 'pod-rcs-housing', [side * 1.68, y, 0]);
      const jet = addMesh(pod, new THREE.CylinderGeometry(0.1, 0.16, 0.28, 12), guidance, 'pod-rcs-jet', [side * 1.98, y, 0], [0, 0, Math.PI / 2]);
      jet.userData.pulsePhase = y + side;
    });
    addMesh(pod, new THREE.BoxGeometry(0.16, 5.25, 0.18), frame, 'pod-longeron', [side * 1.45, -0.2, -0.25]);
  });

  [-0.72, 0, 0.72].forEach((x, index) => {
    const engine = addMesh(pod, new THREE.CylinderGeometry(0.3, 0.42, 0.72, 16), hullDark, `pod-main-engine-${index + 1}`, [x, -3.75, 0]);
    const nozzle = addMesh(pod, new THREE.CylinderGeometry(0.18, 0.32, 0.36, 16), guidance, `pod-main-nozzle-${index + 1}`, [x, -4.27, 0]);
    engine.userData.engine = true;
    nozzle.userData.engine = true;
  });

  addMesh(pod, new THREE.BoxGeometry(0.12, 1.58, 1.2), hullDark, 'pod-side-hatch', [1.58, 0.35, 0]);
  [-0.56, 0.56].forEach((z) => addMesh(pod, new THREE.BoxGeometry(0.13, 1.75, 0.12), frame, 'pod-hatch-frame', [1.66, 0.35, z]));
  addMesh(pod, new THREE.BoxGeometry(0.13, 0.13, 1.25), frame, 'pod-hatch-header', [1.66, 1.22, 0]);
  addMesh(pod, new THREE.BoxGeometry(0.14, 0.34, 0.26), guidance, 'pod-hatch-control', [1.7, 0.25, -0.73]);

  for (let band = 0; band < 5; band += 1) {
    const ring = addMesh(pod, new THREE.TorusGeometry(1.62, 0.055, 8, 28), band === 4 ? guidance : frame, `pod-structure-ring-${band + 1}`, [0, -2.35 + band * 1.18, 0], [Math.PI / 2, 0, 0]);
    ring.scale.z = 0.9;
  }

  const entryPlasma = new THREE.Group();
  entryPlasma.name = 'podEntryPlasma';
  entryPlasma.visible = false;
  [
    { color: 0xffb052, opacity: 0.18, scale: [1.18, 2.55, 1.08] },
    { color: 0xff5b32, opacity: 0.1, scale: [1.35, 2.9, 1.18] }
  ].forEach((layer, index) => {
    const shell = addMesh(entryPlasma, new THREE.SphereGeometry(1.82, 24, 16), new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, depthWrite: false, side: THREE.BackSide }), `pod-entry-plasma-${index + 1}`, [0, -0.1, 0]);
    shell.scale.set(...layer.scale);
    shell.userData.baseOpacity = layer.opacity;
  });
  pod.add(entryPlasma);

  const dockingGuide = new THREE.Group();
  dockingGuide.name = 'podDockingGuide';
  dockingGuide.visible = false;
  const dockingRing = addMesh(dockingGuide, new THREE.TorusGeometry(3.2, 0.11, 10, 40), guidance, 'pod-docking-ring', [0, 25, 0], [Math.PI / 2, 0, 0]);
  dockingRing.userData.baseY = 25;
  [-1, 1].forEach((side) => {
    addMesh(dockingGuide, new THREE.BoxGeometry(0.16, 3.4, 0.16), guidance, 'pod-docking-rail', [side * 3.2, 25, 0]);
    addMesh(dockingGuide, new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff6275 : 0x66ffc7 }), 'pod-docking-light', [side * 3.2, 27, 0]);
  });
  pod.add(dockingGuide);

  const touchdownLights = new THREE.Group();
  touchdownLights.name = 'podTouchdownLights';
  touchdownLights.visible = false;
  [-1, 1].forEach((side) => {
    [-0.65, 0.65].forEach((z) => addMesh(touchdownLights, new THREE.SphereGeometry(0.14, 10, 8), guidance, 'pod-touchdown-light', [side * 1.35, -2.65, z]));
  });
  pod.add(touchdownLights);

  const engineGlow = new THREE.Group();
  engineGlow.name = 'engineGlow';
  [-0.72, 0, 0.72].forEach((x) => {
    const plume = addMesh(engineGlow, new THREE.ConeGeometry(0.28, 3.5, 14), new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0, depthWrite: false }), 'pod-engine-plume', [x, -5.95, 0], [0, 0, Math.PI]);
    plume.userData.podExhaust = true;
  });
  pod.add(engineGlow);

  const exhaust = new THREE.Group();
  exhaust.name = 'exhaust';
  [-0.72, 0, 0.72].forEach((x) => {
    for (let step = 0; step < 3; step += 1) {
      addMesh(exhaust, new THREE.SphereGeometry(0.25 - step * 0.04, 8, 6), new THREE.MeshBasicMaterial({ color: step === 0 ? 0xd8fbff : 0x4cc8ff, transparent: true, opacity: 0, depthWrite: false }), 'pod-exhaust-particle', [x, -4.8 - step * 0.82, 0]);
    }
  });
  pod.add(exhaust);
  pod.scale.setScalar(1.18);
  return pod;
}

export { createExpeditionPodMesh };
