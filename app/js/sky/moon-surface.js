export function createMoonSurface(options = {}) {
  const { appCtx, createApollo11LandingSite, positionCarOnMoon } = options;
  // Debug log removed

  const size = 12000; // Wider lunar field to keep horizon context while driving
  const segments = 220; // Keep dense enough for smoother crater ramps

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  // REAL LUNAR FEATURES based on Apollo 11 landing site (Mare Tranquillitatis)
  // And data from Lunar Reconnaissance Orbiter (LRO)

  // Major craters from real lunar data (Apollo 11 landing site area)
  const realCraters = [
  // Based on real Apollo 11 site craters
  { cx: -2000, cz: 1500, radius: 600, depth: 120 }, // West Crater
  { cx: 3500, cz: -2000, radius: 800, depth: 150 }, // Maskelyne
  { cx: -3000, cz: -3000, radius: 700, depth: 140 }, // Moltke
  { cx: 2500, cz: 3000, radius: 900, depth: 180 }, // Sabine (largest)
  { cx: -1500, cz: -2500, radius: 550, depth: 100 }, // Ritter
  { cx: 3800, cz: 2500, radius: 650, depth: 130 }, // Schmidt
  { cx: 1000, cz: -1000, radius: 750, depth: 160 }, // Arago
  { cx: -3500, cz: 2000, radius: 600, depth: 110 }, // Dionysius
  { cx: 500, cz: 3500, radius: 450, depth: 85 }, // Ranger VIII
  { cx: 2800, cz: -3200, radius: 500, depth: 95 }, // Surveyor V
  { cx: 200, cz: -500, radius: 350, depth: 70 }, // Eagle Crater (Apollo 11)
  { cx: -800, cz: 800, radius: 280, depth: 55 } // Little West
  ];

  // Debug log removed

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const hashNoise = (x, z, freq) => {
    const n = Math.sin(x * freq * 12.9898 + z * freq * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  const sampleMoonHeight = (x, z) => {
    let height = 0;

    // Primary crater bowls and rims.
    for (const crater of realCraters) {
      const dx = x - crater.cx;
      const dz = z - crater.cz;
      const dist = Math.hypot(dx, dz);
      if (dist < crater.radius) {
        const t = dist / crater.radius;
        const bowlDepth = -crater.depth * (1 - t * t * t);
        const rimHeight = t > 0.75 ? crater.depth * 0.18 * Math.pow((t - 0.75) / 0.25, 2) * (1 - t) * 4 : 0;
        height += bowlDepth + rimHeight;
      }
    }

    // Macro lunar undulation (maria + broader wave fields).
    height += Math.sin(x * 0.0018) * Math.cos(z * 0.0022) * 28;
    height += Math.sin((x + z) * 0.00095) * 16;

    // Mid-frequency ripples that make motion readability better while preserving realism.
    height += Math.sin(x * 0.014) * Math.cos(z * 0.016) * 4.5;
    height += Math.sin(x * 0.032 + z * 0.026) * 1.8;

    // Regolith grain and micro-impacts.
    const grain = (hashNoise(x, z, 0.035) - 0.5) * 2.4;
    const microImpact = (hashNoise(x + 913.2, z - 412.7, 0.012) - 0.5) * 6.0;
    height += grain + microImpact;

    // Extra local relief around the Apollo 11 spawn zone so desktop driving
    // clearly shows motion and slope changes even before reaching major craters.
    const landingDx = x - 200;
    const landingDz = z + 500;
    const landingDist = Math.hypot(landingDx, landingDz);
    if (landingDist < 1100) {
      const influence = 1 - landingDist / 1100;
      const ridge =
      Math.sin((x + 80) * 0.06) * Math.cos((z - 40) * 0.048) * 7.5 +
      Math.sin((x - z) * 0.032) * 4.1;
      const shallowBowl = -6.0 * Math.exp(-landingDist * landingDist / (2 * 420 * 420));
      height += (ridge + shallowBowl) * influence;
    }

    // Slight mare tilt.
    height += x * 0.001 + z * 0.0008;
    return height;
  };

  // Track min/max height for color mapping
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  const positions = geometry.attributes.position;
  const heights = new Array(positions.count);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    const height = sampleMoonHeight(x, z);

    positions.setY(i, height);
    heights[i] = height;

    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }

  // Debug log removed

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  // Realistic lunar palette with slope-aware contrast so terrain movement reads clearly.
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = heights[i];
    const t = (height - minHeight) / Math.max(1e-6, maxHeight - minHeight);
    const ny = clamp01(normals.getY(i));
    const slope = 1 - ny;

    // Lower areas are basaltic maria (darker), higher areas are brighter highlands.
    const mareMask = clamp01(0.65 - t + slope * 0.2);
    let r = 0.4 + t * 0.32;
    let g = 0.39 + t * 0.3;
    let b = 0.37 + t * 0.27;
    const mareDarken = mareMask * 0.15;
    r -= mareDarken;
    g -= mareDarken * 0.92;
    b -= mareDarken * 0.88;

    // Baked micro-shading and albedo breakup to avoid a monotone look.
    const grain = (hashNoise(x - 213.7, z + 781.1, 0.006) - 0.5) * 0.16;
    const shade = clamp01(0.76 + slope * 0.72 + grain);
    r = clamp01(r * shade);
    g = clamp01(g * shade);
    b = clamp01(b * shade);

    colors[i * 3] = Math.max(0.06, r);
    colors[i * 3 + 1] = Math.max(0.06, g);
    colors[i * 3 + 2] = Math.max(0.06, b);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
    emissive: 0x111111,
    emissiveIntensity: 0.18,
    flatShading: false
  });

  appCtx.moonSurface = new THREE.Mesh(geometry, material);
  appCtx.moonSurface.receiveShadow = true;
  appCtx.moonSurface.castShadow = false;
  appCtx.moonSurface.frustumCulled = false; // Always render - prevents disappearing at high drone altitude
  appCtx.moonSurface.position.y = -100;
  appCtx.scene.add(appCtx.moonSurface);

  // Add instanced lunar rocks for scale and motion cues while driving/walking.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7e838d,
    roughness: 0.99,
    metalness: 0.01
  });
  const targetRockCount = 900;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, targetRockCount);
  const rockTransform = new THREE.Object3D();
  const rockColor = new THREE.Color();
  let moonRockSeed = 0x4c4f4c41;
  const moonRandom = () => {
    moonRockSeed = (Math.imul(moonRockSeed, 1664525) + 1013904223) >>> 0;
    return moonRockSeed / 4294967296;
  };
  let placedRocks = 0;
  const placeRockAt = (rx, rz, rockScale, toneBias = 0) => {
    if (placedRocks >= targetRockCount) return false;
    const localY = sampleMoonHeight(rx, rz);
    rockTransform.position.set(rx, localY + appCtx.moonSurface.position.y + rockScale * 0.33, rz);
    rockTransform.rotation.set(moonRandom() * 0.6, moonRandom() * Math.PI * 2, moonRandom() * 0.6);
    rockTransform.scale.setScalar(rockScale);
    rockTransform.updateMatrix();
    rocks.setMatrixAt(placedRocks, rockTransform.matrix);

    const tone = Math.max(0.18, Math.min(0.72, 0.28 + moonRandom() * 0.34 + toneBias));
    rockColor.setRGB(tone, tone * 0.98, tone * 0.93);
    rocks.setColorAt(placedRocks, rockColor);
    placedRocks++;
    return true;
  };

  for (let attempt = 0; attempt < targetRockCount * 2 && placedRocks < targetRockCount; attempt++) {
    const radius = Math.sqrt(moonRandom()) * (size * 0.48);
    const theta = moonRandom() * Math.PI * 2;
    const rx = Math.cos(theta) * radius;
    const rz = Math.sin(theta) * radius;

    // Keep immediate wheel spawn clear, but keep surrounding area populated for motion cues.
    if (Math.hypot(rx - 200, rz + 500) < 45) continue;

    const rockScale = 0.8 + Math.pow(moonRandom(), 2.05) * 12.0;
    placeRockAt(rx, rz, rockScale, -0.03);
  }

  // Guaranteed visual landmarks near the Apollo start zone for desktop readability.
  const spawnX = 200;
  const spawnZ = -500;
  for (let i = 0; i < 36 && placedRocks < targetRockCount; i++) {
    const theta = i / 36 * Math.PI * 2;
    const radial = 55 + (i % 3) * 35 + moonRandom() * 20;
    const rx = spawnX + Math.cos(theta) * radial;
    const rz = spawnZ + Math.sin(theta) * radial;
    const scale = 2.5 + moonRandom() * 8.5;
    placeRockAt(rx, rz, scale, 0.08);
  }

  rocks.count = placedRocks;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  rocks.userData.moonObject = true;
  appCtx.scene.add(rocks);
  if (!Array.isArray(window._moonObjects)) window._moonObjects = [];
  window._moonObjects.push(rocks);

  // Delay Apollo 11 landing site creation to ensure moonSurface is fully in scene
  setTimeout(() => {
    createApollo11LandingSite();
    // Position car after both moonSurface and landing site are ready
    positionCarOnMoon();
    // Now that moon surface and car are positioned, reveal the car and unpause
    if (appCtx.carMesh) appCtx.carMesh.visible = true;
    // Snap camera to car position immediately to avoid seeing earth ground
    if (appCtx.camera) {
      const camD = 10,camH = 5;
      appCtx.camera.position.set(
        appCtx.car.x - Math.sin(appCtx.car.angle) * camD,
        appCtx.car.y + camH,
        appCtx.car.z - Math.cos(appCtx.car.angle) * camD
      );
      appCtx.camera.lookAt(appCtx.car.x, appCtx.car.y + 0.5, appCtx.car.z);
      // Reset the smoothed lookAt target so chase cam doesn't lerp from old position
      if (appCtx.camera.userData) {
        appCtx.camera.userData.lookTarget = { x: appCtx.car.x, y: appCtx.car.y + 0.5, z: appCtx.car.z };
      }
    }
    appCtx.setPauseReason?.('planetary_transition', false);
  }, 150);

  // Debug log removed
  // Debug log removed
  // Debug log removed
}
