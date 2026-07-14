export function createMoonSystems(ctx) {
  ctx.solarSystem.moonMeshes = [];

  ctx.solarSystem.planetMeshes.forEach((entry) => {
    const moonConfig = ctx.PLANET_MOONS[entry.planet.name];
    if (!moonConfig) return;

    moonConfig.forEach((moon, index) => {
      const moonGeo = new THREE.SphereGeometry(moon.radiusScaled, 14, 14);
      const moonMat = new THREE.MeshPhongMaterial({
        color: moon.color,
        emissive: 0x101010,
        shininess: 18
      });
      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.name = moon.name;
      entry.mesh.add(moonMesh);

      const moonOrbitGeo = new THREE.RingGeometry(moon.orbitRadius - 0.4, moon.orbitRadius + 0.4, 64);
      const moonOrbitMat = new THREE.MeshBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide
      });
      const moonOrbit = new THREE.Mesh(moonOrbitGeo, moonOrbitMat);
      moonOrbit.rotation.x = -Math.PI / 2;
      entry.mesh.add(moonOrbit);

      ctx.solarSystem.moonMeshes.push({
        mesh: moonMesh,
        planetMesh: entry.mesh,
        orbitRadius: moon.orbitRadius,
        orbitDays: moon.orbitDays,
        radiusScaled: moon.radiusScaled,
        name: moon.name,
        phaseOffset: index * (Math.PI * 0.8)
      });
    });
  });
}

export function createAsteroidBelt(ctx) {
  const belt = ctx.ASTEROID_BELT;
  const positions = [];
  const colors = [];
  const sizes = [];

  let seed = 42;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  function isInKirkwoodGap(a) {
    for (let i = 0; i < belt.kirkwoodGaps.length; i++) {
      const gap = belt.kirkwoodGaps[i];
      if (Math.abs(a - gap.au) < gap.width) return true;
    }
    return false;
  }

  for (let i = 0; i < belt.count; i++) {
    let a;
    do {
      a = belt.innerAU + seededRandom() * (belt.outerAU - belt.innerAU);
    } while (isInKirkwoodGap(a));

    const e = seededRandom() * belt.maxEccentricity * seededRandom();
    const I = (seededRandom() - 0.5) * 2 * belt.maxInclination * seededRandom();
    const LN = seededRandom() * 360;
    const w = seededRandom() * 360;
    const M = seededRandom() * 360;
    const pos = ctx.computeOrbitalPosition(a, e, I, w, LN, M);

    const x = pos.x * ctx.AU_TO_SCENE;
    const y = pos.z * ctx.AU_TO_SCENE * 0.3;
    const z = pos.y * ctx.AU_TO_SCENE;
    positions.push(x, y, z);

    const brightness = 0.4 + seededRandom() * 0.5;
    const warmth = seededRandom() * 0.15;
    colors.push(brightness + warmth, brightness, brightness - warmth * 0.5);

    const sizeRoll = seededRandom();
    sizes.push(sizeRoll < 0.9 ? 2.5 + seededRandom() * 3 : 5 + seededRandom() * 5);
  }

  const beltGeo = new THREE.BufferGeometry();
  beltGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  beltGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  beltGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  const beltMat = new THREE.PointsMaterial({
    size: 2.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: false,
    depthWrite: false
  });

  ctx.solarSystem.asteroidBelt = new THREE.Points(beltGeo, beltMat);
  ctx.solarSystem.asteroidBelt.name = 'asteroidBelt';
  ctx.solarSystem.asteroidBelt.renderOrder = 3;
  ctx.solarSystem.group.add(ctx.solarSystem.asteroidBelt);

  createBeltBoundaryRing(ctx, belt.innerAU, 0xb48357, 'beltInnerEdge');
  createBeltBoundaryRing(ctx, belt.outerAU, 0xb48357, 'beltOuterEdge');
  createBeltVolumeBand(ctx, belt.innerAU, belt.outerAU, 0xb48357, 0.09, 'asteroidBeltBand', 1.5);
  createNamedAsteroids(ctx);
}

export function createKuiperBelt(ctx) {
  const belt = ctx.KUIPER_BELT;
  const positions = [];
  const colors = [];
  const sizes = [];

  let seed = 314159;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let i = 0; i < belt.count; i++) {
    const a = belt.innerAU + seededRandom() * (belt.outerAU - belt.innerAU);
    const e = seededRandom() * belt.maxEccentricity * seededRandom();
    const I = (seededRandom() - 0.5) * 2 * belt.maxInclination * seededRandom();
    const LN = seededRandom() * 360;
    const w = seededRandom() * 360;
    const M = seededRandom() * 360;
    const pos = ctx.computeOrbitalPosition(a, e, I, w, LN, M);

    const x = pos.x * ctx.AU_TO_SCENE;
    const y = pos.z * ctx.AU_TO_SCENE * 0.3;
    const z = pos.y * ctx.AU_TO_SCENE;
    positions.push(x, y, z);

    const brightness = 0.45 + seededRandom() * 0.4;
    const iceTint = 0.12 + seededRandom() * 0.18;
    colors.push(brightness - iceTint * 0.2, brightness, brightness + iceTint);

    const sizeRoll = seededRandom();
    sizes.push(sizeRoll < 0.93 ? 1.6 + seededRandom() * 2.2 : 3.2 + seededRandom() * 3.0);
  }

  const beltGeo = new THREE.BufferGeometry();
  beltGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  beltGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  beltGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  const beltMat = new THREE.PointsMaterial({
    size: 1.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    sizeAttenuation: false,
    depthWrite: false
  });

  ctx.solarSystem.kuiperBelt = new THREE.Points(beltGeo, beltMat);
  ctx.solarSystem.kuiperBelt.name = 'kuiperBelt';
  ctx.solarSystem.kuiperBelt.renderOrder = 3;
  ctx.solarSystem.group.add(ctx.solarSystem.kuiperBelt);

  createBeltBoundaryRing(ctx, belt.innerAU, 0x7baee0, 'kuiperInnerEdge');
  createBeltBoundaryRing(ctx, belt.outerAU, 0x7baee0, 'kuiperOuterEdge');
  createBeltVolumeBand(ctx, belt.innerAU, belt.outerAU, 0x7baee0, 0.06, 'kuiperBeltBand', 2.8);
}

export function createBeltBoundaryRing(ctx, radiusAU, color, name) {
  const radius = radiusAU * ctx.AU_TO_SCENE;
  const points = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.34,
    linewidth: 1
  });
  const ring = new THREE.LineLoop(geo, mat);
  ring.name = name;
  ctx.solarSystem.group.add(ring);
}

export function createBeltVolumeBand(ctx, innerAU, outerAU, color, opacity, name, tiltDeg) {
  const innerRadius = innerAU * ctx.AU_TO_SCENE;
  const outerRadius = outerAU * ctx.AU_TO_SCENE;
  const ringGeo = new THREE.RingGeometry(innerRadius, outerRadius, 256, 1);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const beltBand = new THREE.Mesh(ringGeo, ringMat);
  beltBand.name = name;
  beltBand.rotation.x = -Math.PI / 2;
  if (typeof tiltDeg === 'number' && tiltDeg !== 0) {
    beltBand.rotation.z = tiltDeg * ctx.DEG2RAD;
  }
  beltBand.renderOrder = 1;
  ctx.solarSystem.group.add(beltBand);
}

export function createNamedAsteroids(ctx) {
  ctx.solarSystem.asteroidMeshes = [];
  const now = new Date();
  const earthPos = ctx.getEarthHelioPos(now);

  ctx.NAMED_ASTEROIDS.forEach((asteroid, i) => {
    const geo = new THREE.SphereGeometry(asteroid.radiusScaled, 10, 8);
    const posArr = geo.attributes.position.array;
    for (let v = 0; v < posArr.length; v += 3) {
      const deform = 0.8 + Math.sin(v * 3.7) * 0.15 + Math.cos(v * 2.3) * 0.1;
      posArr[v] *= deform;
      posArr[v + 1] *= deform;
      posArr[v + 2] *= deform;
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: asteroid.color,
      emissive: asteroid.emissive,
      shininess: 10,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = asteroid.name;
    mesh.userData = { isAsteroid: true, asteroidIndex: i };

    const glowGeo = new THREE.SphereGeometry(asteroid.radiusScaled * 1.3, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: asteroid.glowColor,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));

    const hitRadius = Math.max(asteroid.radiusScaled * 4, 40);
    const hitGeo = new THREE.SphereGeometry(hitRadius, 6, 6);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData = { isAsteroid: true, asteroidIndex: i };
    mesh.add(hitbox);

    ctx.createLabel(asteroid.name, mesh, asteroid.radiusScaled);

    const a = asteroid.a0;
    const e = asteroid.e0;
    const I = asteroid.I0;
    const LP = asteroid.LP0;
    const LN = asteroid.LN0;
    const w = LP - LN;
    const L = asteroid.L0;
    const M = ctx.normalizeAngle(L - LP);
    const realPos = ctx.computeOrbitalPosition(a, e, I, w, LN, M);

    const visualDist = a * ctx.AU_TO_SCENE;
    const scenePos = ctx.helioToScene(realPos, visualDist, a);
    mesh.position.set(scenePos.x, scenePos.y, scenePos.z);

    ctx.solarSystem.group.add(mesh);

    const distFromEarth = ctx.distanceAU(realPos, earthPos);
    ctx.solarSystem.asteroidMeshes.push({
      mesh,
      hitbox,
      asteroid,
      realPosition: realPos,
      distFromEarthAU: distFromEarth
    });
  });
}
