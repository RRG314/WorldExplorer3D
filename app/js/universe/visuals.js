import { createBlackHoleVisual } from './black-hole.js?v=2';
import { createRoundStarMaterial } from '../sky/star-point-material.js?v=2';

const UNIVERSE_ORBIT_DAYS_PER_SECOND = 0.25;

function seededRandom(seed = 1) {
  let state = Math.abs(Math.floor(Number(seed) || 1)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function dataConstrainedPlanetClass(planet, host) {
  const radius = Math.max(0.1, Number(planet.radiusEarth || 1));
  const mass = Math.max(0.01, Number(planet.massEarth || radius ** 3));
  const densityEarth = mass / (radius ** 3);
  const axisAu = Math.max(0.001, Number(planet.semiMajorAxisAu || 1));
  const hostMass = Math.max(0.05, Number(host.physical?.hostMassSolar || 1));
  const luminositySolar = Math.pow(hostMass, 3.5);
  const equilibriumTemperatureK = 278 * Math.pow(luminositySolar, 0.25) / Math.sqrt(axisAu);
  const appearanceClass = radius >= 6 ? 'gas-giant'
    : radius >= 2.2 ? 'volatile-rich'
      : equilibriumTemperatureK >= 700 ? 'hot-rocky'
        : equilibriumTemperatureK <= 190 ? 'cold-rocky'
          : densityEarth < 0.55 ? 'low-density-terrestrial' : 'rocky';
  return { appearanceClass, densityEarth, equilibriumTemperatureK };
}

function createSimulatedBodyTexture(seed, simulation) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const random = seededRandom(seed || 1);
  const palettes = {
    'gas-giant': ['#b6906c', '#e4c9a5', '#87634f', '#d7aa77'],
    'volatile-rich': ['#456c88', '#89b5c5', '#d5e5df', '#315166'],
    'hot-rocky': ['#321812', '#a64021', '#f08a32', '#6a2518'],
    'cold-rocky': ['#7d8790', '#c3ccd0', '#52636d', '#e0e4df'],
    'low-density-terrestrial': ['#6f7f73', '#9aab91', '#4e675e', '#bdad83'],
    rocky: ['#735d4d', '#aa8767', '#514944', '#c0a17d']
  };
  const palette = palettes[simulation.appearanceClass] || palettes.rocky;
  context.fillStyle = palette[0];
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (simulation.appearanceClass === 'gas-giant' || simulation.appearanceClass === 'volatile-rich') {
    for (let y = 0; y < canvas.height; y += 8) {
      context.fillStyle = palette[Math.floor(random() * palette.length)];
      context.globalAlpha = 0.24 + random() * 0.42;
      context.fillRect(0, y, canvas.width, 5 + random() * 8);
    }
  } else {
    for (let i = 0; i < 340; i++) {
      context.fillStyle = palette[Math.floor(random() * palette.length)];
      context.globalAlpha = 0.12 + random() * 0.3;
      context.beginPath();
      context.ellipse(
        random() * canvas.width,
        random() * canvas.height,
        3 + random() * 30,
        2 + random() * 14,
        random() * Math.PI,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData = {
    source: 'data-constrained-simulation',
    appearanceClass: simulation.appearanceClass,
    densityEarth: simulation.densityEarth,
    equilibriumTemperatureK: simulation.equilibriumTemperatureK
  };
  return texture;
}

function createSimulatedStarTexture(entity, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const random = seededRandom(entity.visualProfile?.seed || 5772);
  const base = new THREE.Color(color);
  context.fillStyle = `#${base.getHexString()}`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 720; i++) {
    const light = base.clone().lerp(new THREE.Color(i % 3 ? 0xffffff : 0x3b1608), 0.08 + random() * 0.2);
    context.fillStyle = `#${light.getHexString()}`;
    context.globalAlpha = 0.12 + random() * 0.22;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, 1 + random() * 5, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData = {
    source: 'temperature-colored stellar surface simulation',
    hostTemperatureK: Number(entity.physical?.hostTemperatureK || 0)
  };
  return texture;
}

function addObservedSolarDisk(star, radius) {
  new THREE.TextureLoader().load('/app/assets/textures/universe/sun-sdo-2025.jpg', (sourceTexture) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(sourceTexture.image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < imageData.data.length; offset += 4) {
      const brightness = Math.max(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2]);
      imageData.data[offset + 3] = Math.max(0, Math.min(255, (brightness - 4) * 10));
    }
    context.putImageData(imageData, 0, 0);
    const observedTexture = new THREE.CanvasTexture(canvas);
    if (typeof THREE.SRGBColorSpace !== 'undefined') observedTexture.colorSpace = THREE.SRGBColorSpace;
    const disk = new THREE.Sprite(new THREE.SpriteMaterial({
      map: observedTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    }));
    disk.scale.set(radius * 2.08, radius * 2.08, 1);
    disk.renderOrder = 20;
    disk.name = 'Sun — NASA SDO observed disk';
    disk.userData = {
      imageCredit: 'NASA/GSFC/Solar Dynamics Observatory',
      imageSourceUrl: 'https://science.nasa.gov/photojournal/image-of-sun-from-nasas-solar-dynamics-observatory/'
    };
    star.add(disk);
    sourceTexture.dispose();
  });
}

function createFeatheredAlphaMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 96, 42, 128, 96, 132);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.58, '#ffffff');
  gradient.addColorStop(0.82, '#9a9a9a');
  gradient.addColorStop(1, '#000000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

function createLabel(text, width = 320) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '600 28px Inter, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(238, 246, 255, 0.95)';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  }));
  sprite.scale.set(110, 22, 1);
  return sprite;
}

function orbitalDisplayPosition(orbit, meanAngle) {
  const eccentricity = Math.max(0, Math.min(0.95, Number(orbit.eccentricity || 0)));
  const inclination = Number(orbit.inclinationDeg || 0) * Math.PI / 180;
  const ascendingNode = Number(orbit.ascendingNodeDeg || 0) * Math.PI / 180;
  const radius = orbit.orbitRadius * (1 - eccentricity * eccentricity) /
    Math.max(0.05, 1 + eccentricity * Math.cos(meanAngle));
  const orbitalX = Math.cos(meanAngle) * radius;
  const orbitalZ = Math.sin(meanAngle) * radius;
  return new THREE.Vector3(
    Math.cos(ascendingNode) * orbitalX - Math.sin(ascendingNode) * Math.cos(inclination) * orbitalZ,
    Math.sin(inclination) * orbitalZ,
    Math.sin(ascendingNode) * orbitalX + Math.cos(ascendingNode) * Math.cos(inclination) * orbitalZ
  );
}

function makeOrbit(orbit, color = 0x53677e) {
  const points = [];
  for (let i = 0; i < 128; i++) {
    points.push(orbitalDisplayPosition(orbit, i / 128 * Math.PI * 2));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28 })
  );
}

function createPlanetarySystem(entity) {
  const group = new THREE.Group();
  const color = entity.visualProfile?.color || 0xfff0c2;
  const starRadius = Math.max(18, Math.min(38, 24 + Number(entity.physical?.hostMassSolar || 1) * 8));
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(starRadius, 32, 24),
    new THREE.MeshBasicMaterial({ map: createSimulatedStarTexture(entity, color), color: 0xffffff })
  );
  star.name = entity.name;
  star.userData = {
    universeEntityId: entity.id,
    massKg: Number(entity.physical?.hostMassSolar || 0) * 1.98847e30,
    physicalRadiusKm: Math.pow(Math.max(0.01, Number(entity.physical?.hostMassSolar || 1)), 0.8) * 695700
  };
  group.add(star);
  if (entity.id === 'sol') addObservedSolarDisk(star, starRadius);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(starRadius * 1.55, 24, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11, depthWrite: false })
  );
  star.add(glow);

  const label = createLabel(entity.name);
  label.position.y = starRadius + 38;
  group.add(label);

  const children = entity.children || [];
  const maxAxis = Math.max(0.01, ...children.map((planet) => Number(planet.semiMajorAxisAu || 0.01)));
  const random = seededRandom(entity.visualProfile?.seed);
  group.userData.orbitingPlanets = [];
  children.forEach((planet, index) => {
    const axis = Math.max(0.005, Number(planet.semiMajorAxisAu || (index + 1) * 0.1));
    const orbitRadius = 70 + Math.sqrt(axis / maxAxis) * 290;
    const orbit = {
      orbitRadius,
      eccentricity: Number(planet.eccentricity || 0),
      inclinationDeg: Number(planet.inclinationDeg || 0),
      ascendingNodeDeg: Number(planet.ascendingNodeDeg || 0)
    };
    group.add(makeOrbit(orbit));
    const radius = Math.max(3.5, Math.min(10, Number(planet.radiusEarth || 1) * 4.5));
    const simulation = dataConstrainedPlanetClass(planet, entity);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshPhongMaterial({
        map: createSimulatedBodyTexture((entity.visualProfile?.seed || 1) + index * 997, simulation),
        color: 0xffffff,
        shininess: simulation.appearanceClass.includes('volatile') ? 18 : 5
      })
    );
    body.name = planet.name;
    body.userData = {
      universeEntityId: planet.id,
      planet,
      appearance: {
        ...simulation,
        claim: 'inferred from measured mass, radius, orbit, and host-star properties; not direct surface imaging'
      },
      massKg: Number(planet.massEarth || 0) * 5.97237e24,
      physicalRadiusKm: Number(planet.radiusEarth || 0) * 6371
    };
    const phase = random() * Math.PI * 2;
    body.position.copy(orbitalDisplayPosition(orbit, phase));
    group.add(body);
    group.userData.orbitingPlanets.push({
      body,
      ...orbit,
      phase,
      orbitDays: Number(planet.orbitDays || 365),
      orbitalPlaneAccuracy: Number.isFinite(Number(planet.inclinationDeg)) ? 'catalog-derived' : 'unknown-coplanar-display'
    });
  });
  group.userData.gravityBodies = [star, ...group.userData.orbitingPlanets.map((entry) => entry.body)];
  return group;
}

function createDustVolume(seed, count, radius, color, pointSize = 3.2) {
  const random = seededRandom(seed);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const radial = Math.pow(random(), 0.58) * radius;
    const angle = random() * Math.PI * 2;
    const height = (random() - 0.5) * Math.max(90, radius * 0.22);
    positions.push(Math.cos(angle) * radial, height, Math.sin(angle) * radial);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, createRoundStarMaterial({
    size: pointSize,
    sizeAttenuation: false,
    color: 0xffffff,
    vertexColors: false,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
}

function loadObservationTexture(entity) {
  const texture = new THREE.TextureLoader().load(entity.visualProfile.image);
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createObservationSprite(entity, definition) {
  const material = new THREE.SpriteMaterial({
    map: definition.texture,
    alphaMap: createFeatheredAlphaMap(),
    transparent: true,
    opacity: definition.opacity,
    depthWrite: false,
    blending: definition.blending || THREE.NormalBlending,
    fog: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.z = definition.z || 0;
  sprite.scale.set(
    definition.width,
    definition.width / Number(entity.visualProfile.imageAspect || 1.39),
    1
  );
  return sprite;
}

function createNebula(entity) {
  const group = new THREE.Group();
  const texture = loadObservationTexture(entity);
  const observation = createObservationSprite(entity, {
    texture,
    z: 0,
    width: Number(entity.visualProfile.displayWidth || 18000),
    opacity: 0.96
  });
  observation.name = `${entity.name} — full-frame observation`;
  group.add(observation);
  group.userData.nebulaObservation = observation;
  group.userData.observationalImage = {
    credit: entity.visualProfile.imageCredit,
    accuracy: entity.accuracy,
    presentation: 'single full-frame feathered observation; no invented volumetric geometry'
  };
  return group;
}

function createStellarRegion(entity) {
  const group = new THREE.Group();
  const field = createDustVolume(
    entity.visualProfile.seed,
    8200,
    14500,
    entity.visualProfile.tint || 0xa9c9ff,
    1.45
  );
  field.name = 'Model-derived stellar region';
  group.add(field);
  const random = seededRandom(entity.visualProfile.seed + 71);
  for (let i = 0; i < 48; i++) {
    const color = i % 5 === 0 ? 0xffcf94 : i % 3 === 0 ? 0xbad7ff : 0xf5f7ff;
    const radius = 2.5 + random() * 6;
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({ color })
    );
    star.position.set(
      (random() - 0.5) * 27000,
      (random() - 0.5) * 6200,
      (random() - 0.5) * 27000
    );
    group.add(star);
  }
  const label = createLabel(entity.name, 440);
  label.position.y = 8600;
  group.add(label);
  group.userData.stellarRegionField = field;
  return group;
}

function createGalaxyPoints(entity, count = 5200, radius = 900) {
  const random = seededRandom(entity.visualProfile?.seed);
  const positions = [];
  const arms = Math.max(2, Number(entity.visualProfile?.arms || 2));
  for (let i = 0; i < count; i++) {
    const radial = Math.pow(random(), 0.58) * radius;
    const arm = i % arms;
    const baseAngle = arm / arms * Math.PI * 2;
    const angle = baseAngle + radial / radius * Math.PI * 3.2 + (random() - 0.5) * 0.52;
    const bulge = Math.max(0, 1 - radial / (radius * 0.32));
    positions.push(
      Math.cos(angle) * radial + (random() - 0.5) * 20,
      (random() - 0.5) * (28 + radial * 0.055) + (random() - 0.5) * bulge * 120,
      Math.sin(angle) * radial + (random() - 0.5) * 20
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, createRoundStarMaterial({
    size: 2.4,
    color: 0xffffff,
    vertexColors: false,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
}

function createGalaxy(entity) {
  const group = new THREE.Group();
  if (entity.visualProfile?.imageRole === 'inside-galaxy-observed-plane') {
    const observation = createObservationSprite(entity, {
      texture: loadObservationTexture(entity),
      width: Number(entity.visualProfile.displayWidth || 9000),
      opacity: 0.96,
      z: 0
    });
    observation.name = `${entity.name} — NASA observed panorama`;
    group.add(observation);
    group.userData.observationalImage = {
      credit: entity.visualProfile.imageCredit,
      source: entity.visualProfile.imageSourceUrl,
      presentation: 'single full-frame observational panorama; no generated ring or spiral'
    };
    return group;
  }
  const starField = createGalaxyPoints(entity);
  if (entity.visualProfile?.image) {
    group.add(createObservationSprite(entity, {
      texture: loadObservationTexture(entity),
      width: 1680,
      opacity: 0.88,
      z: 0
    }));
    starField.material.opacity = 0.24;
    starField.material.size = 2.25;
  }
  group.add(starField);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(entity.visualProfile?.image ? 34 : 64, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffe2ae,
      transparent: true,
      opacity: entity.visualProfile?.image ? 0.18 : 0.45,
      depthWrite: false
    })
  );
  group.add(core);
  const label = createLabel(entity.name, 420);
  label.position.y = 170;
  group.add(label);
  const inclination = Number(entity.visualProfile?.inclinationDeg || 22) * Math.PI / 180;
  group.rotation.x = inclination;
  return group;
}

function createGalaxyCluster(entity) {
  const group = new THREE.Group();
  const random = seededRandom(entity.visualProfile?.seed);
  for (let i = 0; i < 42; i++) {
    const member = createGalaxyPoints({ visualProfile: { seed: random() * 1e8, arms: 2 + i % 3 } }, 260, 72);
    const radius = Math.pow(random(), 0.55) * 900;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    member.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.65,
      radius * Math.sin(phi) * Math.sin(theta)
    );
    member.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    group.add(member);
  }
  const label = createLabel(entity.name, 420);
  label.position.y = 560;
  group.add(label);
  return group;
}

function createUniverseFrameVisual(entity) {
  let group;
  if (entity.objectClass === 'planetary_system') group = createPlanetarySystem(entity);
  else if (entity.objectClass === 'nebula') group = createNebula(entity);
  else if (entity.objectClass === 'stellar_region') group = createStellarRegion(entity);
  else if (entity.objectClass === 'galaxy') group = createGalaxy(entity);
  else if (entity.objectClass === 'galaxy_cluster') group = createGalaxyCluster(entity);
  else if (entity.objectClass === 'black_hole') group = createBlackHoleVisual(entity);
  else group = new THREE.Group();
  group.name = `Universe frame: ${entity.name}`;
  group.userData.universeEntity = entity;
  return group;
}

function updateUniverseFrameVisual(group, elapsedSeconds, frameScale = 1) {
  if (!group) return;
  const orbiters = group.userData.orbitingPlanets || [];
  orbiters.forEach((entry) => {
    const period = Math.max(1, entry.orbitDays);
    const angle = entry.phase + elapsedSeconds * Math.PI * 2 * UNIVERSE_ORBIT_DAYS_PER_SECOND / period;
    entry.body.position.copy(orbitalDisplayPosition(entry, angle));
    entry.body.rotation.y += 0.006 * frameScale;
  });
  if (group.userData.universeEntity?.objectClass === 'galaxy' && !group.userData.insideGalaxyView) {
    group.rotation.y += 0.00012 * frameScale;
  }
  if (group.userData.stellarRegionField) group.userData.stellarRegionField.rotation.y += 0.00022 * frameScale;
}

export { createUniverseFrameVisual, updateUniverseFrameVisual };
