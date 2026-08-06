import { createBlackHoleVisual } from './black-hole.js?v=2';
import { createRoundStarMaterial } from '../sky/star-point-material.js?v=2';

function seededRandom(seed = 1) {
  let state = Math.abs(Math.floor(Number(seed) || 1)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
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

function makeOrbit(radius, color = 0x53677e) {
  const points = [];
  for (let i = 0; i < 96; i++) {
    const angle = i / 96 * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28 })
  );
}

function createPlanetarySystem(entity) {
  if (entity.id === 'sol') {
    throw new Error('Sol visuals are owned by the authoritative solar-system runtime.');
  }
  const group = new THREE.Group();
  const color = entity.visualProfile?.color || 0xfff0c2;
  const starRadius = Math.max(18, Math.min(38, 24 + Number(entity.physical?.hostMassSolar || 1) * 8));
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(starRadius, 32, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  star.name = entity.name;
  star.userData = { universeEntityId: entity.id };
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
    group.add(makeOrbit(orbitRadius));
    const radius = Math.max(3.5, Math.min(10, Number(planet.radiusEarth || 1) * 4.5));
    const hue = 0.05 + random() * 0.55;
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(hue, 0.42, 0.54), shininess: 8 })
    );
    body.name = planet.name;
    body.userData = { universeEntityId: planet.id, planet };
    const phase = random() * Math.PI * 2;
    body.position.set(Math.cos(phase) * orbitRadius, (random() - 0.5) * 8, Math.sin(phase) * orbitRadius);
    group.add(body);
    group.userData.orbitingPlanets.push({ body, orbitRadius, phase, orbitDays: Number(planet.orbitDays || 365) });
  });
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

function createNebulaCloudTexture(seed) {
  const random = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 18; i++) {
    const x = 18 + random() * 92;
    const y = 18 + random() * 92;
    const radius = 12 + random() * 34;
    const alpha = 0.08 + random() * 0.14;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.42})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return new THREE.CanvasTexture(canvas);
}

function createNebulaCloudVolume(entity) {
  const group = new THREE.Group();
  const random = seededRandom(entity.visualProfile.seed + 104729);
  const cloudMap = createNebulaCloudTexture(entity.visualProfile.seed);
  const tint = new THREE.Color(entity.visualProfile.tint || 0x9bbcff);
  for (let i = 0; i < 42; i++) {
    const material = new THREE.SpriteMaterial({
      map: cloudMap,
      color: tint.clone().offsetHSL((random() - 0.5) * 0.08, -0.08, (random() - 0.5) * 0.12),
      transparent: true,
      opacity: 0.09 + random() * 0.09,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const cloud = new THREE.Sprite(material);
    const radial = Math.pow(random(), 0.62) * 7200;
    const azimuth = random() * Math.PI * 2;
    const elevation = (random() - 0.5) * 5200;
    cloud.position.set(Math.cos(azimuth) * radial, elevation, Math.sin(azimuth) * radial);
    const size = 850 + random() * 2600;
    cloud.scale.set(size * (0.75 + random() * 0.7), size, 1);
    cloud.userData = { baseOpacity: material.opacity, phase: random() * Math.PI * 2 };
    group.add(cloud);
  }
  group.userData.cloudMap = cloudMap;
  return group;
}

function createNebula(entity) {
  const group = new THREE.Group();
  const texture = new THREE.TextureLoader().load(entity.visualProfile.image);
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  const tint = entity.visualProfile.tint || 0xffffff;
  const layers = [];
  [
    { z: 0, width: 9000, opacity: 0.38 },
    { z: -4200, width: 11500, opacity: 0.16 },
    { z: 3200, width: 7800, opacity: 0.1 }
  ].forEach((definition, index) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      alphaMap: createFeatheredAlphaMap(),
      color: tint,
      transparent: true,
      opacity: definition.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.z = definition.z;
    sprite.scale.set(
      definition.width,
      definition.width / Number(entity.visualProfile.imageAspect || 1.39),
      1
    );
    sprite.userData = { baseOpacity: definition.opacity, phase: index * 1.7 };
    group.add(sprite);
    layers.push(sprite);
  });
  const cloudVolume = createNebulaCloudVolume(entity);
  group.add(cloudVolume);
  const label = createLabel(entity.name, 420);
  label.position.y = 4700;
  group.add(label);
  group.userData.nebulaLayers = layers;
  group.userData.nebulaClouds = cloudVolume.children;
  group.userData.observationalImage = {
    credit: entity.visualProfile.imageCredit,
    accuracy: entity.accuracy,
    generatedDepth: 'layered image projection'
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
    const texture = new THREE.TextureLoader().load(entity.visualProfile.image);
    if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
    const image = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      alphaMap: createFeatheredAlphaMap(),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    }));
    const width = 1680;
    image.scale.set(width, width / Number(entity.visualProfile.imageAspect || 2.5), 1);
    image.userData = {
      accuracy: 'observational multiwavelength image',
      imageCredit: entity.visualProfile.imageCredit,
      source: entity.visualProfile.imageSourceUrl
    };
    group.add(image);
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
    const angle = entry.phase + elapsedSeconds * Math.PI * 2 / Math.max(8, Math.sqrt(period) * 9);
    entry.body.position.x = Math.cos(angle) * entry.orbitRadius;
    entry.body.position.z = Math.sin(angle) * entry.orbitRadius;
    entry.body.rotation.y += 0.006 * frameScale;
  });
  if (group.userData.universeEntity?.objectClass === 'galaxy') group.rotation.y += 0.00012 * frameScale;
  if (group.userData.stellarRegionField) group.userData.stellarRegionField.rotation.y += 0.00022 * frameScale;
  (group.userData.nebulaLayers || []).forEach((layer) => {
    layer.material.opacity = layer.userData.baseOpacity * (
      0.92 + Math.sin(elapsedSeconds * 0.2 + layer.userData.phase) * 0.08
    );
  });
  (group.userData.nebulaClouds || []).forEach((cloud) => {
    cloud.material.opacity = cloud.userData.baseOpacity * (
      0.88 + Math.sin(elapsedSeconds * 0.08 + cloud.userData.phase) * 0.12
    );
  });
}

export { createUniverseFrameVisual, updateUniverseFrameVisual };
