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
    new THREE.MeshBasicMaterial({ color })
  );
  star.name = entity.name;
  star.userData = {
    universeEntityId: entity.id,
    massKg: Number(entity.physical?.hostMassSolar || 0) * 1.98847e30,
    physicalRadiusKm: Math.pow(Math.max(0.01, Number(entity.physical?.hostMassSolar || 1)), 0.8) * 695700
  };
  group.add(star);
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
    const hue = 0.05 + random() * 0.55;
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(hue, 0.42, 0.54), shininess: 8 })
    );
    body.name = planet.name;
    body.userData = {
      universeEntityId: planet.id,
      planet,
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

function createObservationPointMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.34, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function populateObservationVolume(points, image, options) {
  const aspect = Number(options.aspect || image.width / image.height || 1);
  const sampleWidth = Math.min(420, image.width);
  const sampleHeight = Math.max(1, Math.round(sampleWidth / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const positions = [];
  const colors = [];
  const random = seededRandom(Number(options.seed || 1) + 104729);
  const width = Number(options.width || 9000);
  const height = width / aspect;
  const depth = Number(options.depth || width * 0.4);
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      const alpha = pixels[offset + 3] / 255;
      const luminance = Math.max(red, green, blue) * 0.62 + (red + green + blue) / 3 * 0.38;
      if (alpha < 0.1 || luminance < 0.035 || random() > Math.min(1, 0.28 + luminance * 1.2)) continue;
      const normalizedX = (x + random() - 0.5) / sampleWidth - 0.5;
      const normalizedY = 0.5 - (y + random() - 0.5) / sampleHeight;
      const coherentDepth = Math.sin(normalizedX * Math.PI * 5) * Math.cos(normalizedY * Math.PI * 4);
      const z = ((random() - 0.5) * 0.78 + coherentDepth * 0.22) * depth * (0.2 + luminance * 0.8);
      positions.push(normalizedX * width, normalizedY * height, z);
      colors.push(Math.min(1, red * 1.12), Math.min(1, green * 1.12), Math.min(1, blue * 1.12));
    }
  }
  points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  points.geometry.computeBoundingSphere();
  points.userData.observationSampleCount = positions.length / 3;
}

function createObservationVolume(entity, options = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    map: createObservationPointMap(),
    size: Number(options.pointSize || 72),
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: Number(options.opacity || 0.82),
    alphaTest: 0.015,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: false
  }));
  points.name = `Observation-derived volume: ${entity.name}`;
  new THREE.TextureLoader().load(entity.visualProfile.image, (texture) => {
    populateObservationVolume(points, texture.image, {
      aspect: entity.visualProfile.imageAspect,
      seed: entity.visualProfile.seed,
      ...options
    });
    texture.dispose();
  });
  points.userData = {
    accuracy: 'observational color and projected density; deterministic modeled depth',
    imageCredit: entity.visualProfile.imageCredit,
    source: entity.visualProfile.imageSourceUrl || entity.provenance?.[0]?.url,
    generatedDepth: true
  };
  return points;
}

function createInsideGalaxyObservationBand(entity) {
  const texture = new THREE.TextureLoader().load(entity.visualProfile.image);
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  const geometry = new THREE.CylinderGeometry(3200, 3200, 760, 128, 1, true);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.72,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const band = new THREE.Mesh(geometry, material);
  band.name = `Inside-galaxy observation: ${entity.name}`;
  band.rotation.y = Math.PI * 0.34;
  band.userData = {
    accuracy: 'observational infrared panorama viewed from inside the Milky Way',
    imageCredit: entity.visualProfile.imageCredit,
    source: entity.visualProfile.imageSourceUrl
  };
  return band;
}

function createNebula(entity) {
  const group = new THREE.Group();
  const observationVolume = createObservationVolume(entity, {
    width: 9000,
    depth: 4300,
    pointSize: 170,
    opacity: 0.42
  });
  group.add(observationVolume);
  const label = createLabel(entity.name, 420);
  label.position.y = 4700;
  group.add(label);
  group.userData.nebulaObservationVolume = observationVolume;
  group.userData.observationalImage = {
    credit: entity.visualProfile.imageCredit,
    accuracy: entity.accuracy,
    generatedDepth: 'deterministic image-derived point depth'
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
  const starField = createGalaxyPoints(entity);
  if (entity.visualProfile?.image) {
    if (entity.visualProfile.imageRole === 'inside-galaxy-observed-plane') {
      group.add(createInsideGalaxyObservationBand(entity));
    } else {
      group.add(createObservationVolume(entity, {
        width: 1680,
        depth: 95,
        pointSize: 18,
        opacity: 0.9
      }));
    }
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
  if (group.userData.universeEntity?.objectClass === 'galaxy') group.rotation.y += 0.00012 * frameScale;
  if (group.userData.stellarRegionField) group.userData.stellarRegionField.rotation.y += 0.00022 * frameScale;
}

export { createUniverseFrameVisual, updateUniverseFrameVisual };
