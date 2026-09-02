import { createBlackHoleVisual } from './black-hole.js?v=4';
import { createRoundStarMaterial } from '../sky/star-point-material.js?v=4';
import { derivePlanetVisualProfile, deriveStarVisualProfile } from './body-visual-profile.js?v=1';

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

function createStarMaterial(profile) {
  return new THREE.ShaderMaterial({
    uniforms: {
      starColor: { value: new THREE.Color(profile.color) },
      time: { value: 0 },
      activity: { value: profile.activity === 'active' ? 1.25 : profile.activity === 'moderate' ? 0.7 : 0.35 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 starColor;
      uniform float time;
      uniform float activity;
      varying vec3 vNormal;
      varying vec3 vPosition;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        vec3 unitPosition = normalize(vPosition);
        float cells = hash(floor(unitPosition * 42.0 + time * 0.16));
        float waves = sin(unitPosition.x * 31.0 + time * 0.7) * sin(unitPosition.y * 27.0 - time * 0.43);
        float limb = pow(max(0.08, abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)))), 0.22);
        float flare = smoothstep(0.94, 1.0, sin(unitPosition.y * 18.0 + time * activity));
        vec3 color = starColor * (0.82 + cells * 0.24 + waves * 0.07 + flare * activity * 0.12);
        gl_FragColor = vec4(color * (0.78 + limb * 0.34), 1.0);
      }
    `
  });
}

function createPlanetTexture(profile, mobile) {
  const size = mobile ? 256 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const context = canvas.getContext('2d');
  const random = seededRandom(profile.seed);
  const colors = profile.palette.map((color) => `#${new THREE.Color(color).getHexString()}`);
  const gas = ['gas-giant', 'ice-giant', 'mini-neptune'].includes(profile.kind);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  for (let stop = 0; stop <= 8; stop += 1) {
    const jitter = gas ? random() * 0.08 : random() * 0.22;
    gradient.addColorStop(Math.min(1, stop / 8), colors[(stop + Math.floor(jitter * 10)) % colors.length]);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (gas) {
    for (let band = 0; band < 34; band += 1) {
      const y = random() * canvas.height;
      const thickness = 1 + random() * (mobile ? 4 : 7);
      context.globalAlpha = 0.08 + random() * 0.23;
      context.fillStyle = colors[(band + 1) % colors.length];
      context.fillRect(0, y, canvas.width, thickness);
    }
    if (profile.kind === 'gas-giant') {
      context.globalAlpha = 0.48;
      context.fillStyle = colors[2];
      context.beginPath();
      context.ellipse(canvas.width * (0.25 + random() * 0.5), canvas.height * (0.48 + random() * 0.18), canvas.width * 0.075, canvas.height * 0.045, 0, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    for (let feature = 0; feature < (mobile ? 65 : 130); feature += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const width = 5 + random() * canvas.width * 0.12;
      const height = 2 + random() * canvas.height * 0.1;
      context.globalAlpha = 0.08 + random() * 0.34;
      context.fillStyle = colors[feature % colors.length];
      context.beginPath();
      context.ellipse(x, y, width, height, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    if (profile.kind === 'lava-world') {
      context.globalAlpha = 0.7;
      context.strokeStyle = colors[1];
      context.lineWidth = mobile ? 2 : 3;
      for (let flow = 0; flow < 16; flow += 1) {
        context.beginPath();
        context.moveTo(random() * canvas.width, random() * canvas.height);
        context.bezierCurveTo(random() * canvas.width, random() * canvas.height, random() * canvas.width, random() * canvas.height, random() * canvas.width, random() * canvas.height);
        context.stroke();
      }
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCourseMarker(radius, destinationName) {
  const marker = new THREE.Group();
  marker.name = 'Active destination marker';
  const material = new THREE.MeshBasicMaterial({
    color: 0x6fe8ff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.8, Math.max(0.14, radius * 0.055), 8, 64), material);
  outer.rotation.x = Math.PI / 2;
  const cross = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.15, Math.max(0.12, radius * 0.045), 8, 48), material.clone());
  cross.rotation.y = Math.PI / 2;
  const label = createLabel(`${destinationName} · COURSE`, 460);
  label.position.y = radius * 3.7;
  label.scale.set(44, 9, 1);
  marker.add(outer, cross, label);
  marker.userData.baseScale = 1;
  marker.visible = false;
  return marker;
}

function createPlanetarySystem(entity) {
  if (entity.id === 'sol') {
    throw new Error('Sol visuals are owned by the authoritative solar-system runtime.');
  }
  const group = new THREE.Group();
  const starProfile = deriveStarVisualProfile(entity);
  const color = starProfile.color;
  const starRadius = Math.max(18, Math.min(38, 24 + Number(entity.physical?.hostMassSolar || 1) * 8));
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(starRadius, 64, 48),
    createStarMaterial(starProfile)
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
  group.userData.destinationMeshes = new Map();
  group.userData.gravityBodies = [star];
  group.userData.starMaterials = [star.material];
  group.userData.destinationMeshes.set(entity.id, star);
  star.userData.massKg = Number(entity.physical?.hostMassSolar || 1) * 1.98847e30;
  star.userData.physicalRadiusKm = Math.max(69570, Number(entity.physical?.hostMassSolar || 1) * 695700);
  const mobile = globalThis.matchMedia?.('(max-width: 768px)').matches === true;
  children.forEach((planet, index) => {
    const axis = Math.max(0.005, Number(planet.semiMajorAxisAu || (index + 1) * 0.1));
    const orbitRadius = 70 + Math.sqrt(axis / maxAxis) * 290;
    group.add(makeOrbit(orbitRadius));
    const radius = Math.max(7, Math.min(22, Math.sqrt(Number(planet.radiusEarth || 1)) * 7));
    const profile = derivePlanetVisualProfile(planet, entity);
    const texture = createPlanetTexture(profile, mobile);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(radius, mobile ? 32 : 56, mobile ? 24 : 40),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: profile.kind.includes('rocky') || profile.kind.includes('world') ? 0.86 : 0.56,
        metalness: 0.02
      })
    );
    body.name = planet.name;
    body.userData = {
      universeEntityId: planet.id,
      planet,
      visualProfile: profile,
      massKg: profile.massEarth * 5.9722e24,
      physicalRadiusKm: profile.radiusEarth * 6371
    };
    const phase = random() * Math.PI * 2;
    body.position.set(Math.cos(phase) * orbitRadius, (random() - 0.5) * 8, Math.sin(phase) * orbitRadius);
    group.add(body);
    if (profile.atmosphere) {
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.065, mobile ? 24 : 40, mobile ? 18 : 30),
        new THREE.MeshBasicMaterial({
          color: profile.kind === 'lava-world' ? 0xff8b54 : profile.kind === 'ice-world' ? 0xbcecff : 0x75c8ff,
          transparent: true,
          opacity: profile.clouds ? 0.1 : 0.055,
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      atmosphere.name = `${planet.name} model-derived atmosphere`;
      body.add(atmosphere);
    }
    if (profile.rings) {
      const rings = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.35, radius * 2.15, mobile ? 48 : 96),
        new THREE.MeshBasicMaterial({ color: profile.palette[1], transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
      );
      rings.rotation.x = Math.PI / 2.4;
      rings.name = `${planet.name} model-derived ring system`;
      body.add(rings);
    }
    const marker = createCourseMarker(radius, planet.name);
    body.add(marker);
    group.userData.destinationMeshes.set(planet.id, body);
    group.userData.gravityBodies.push(body);
    group.userData.orbitingPlanets.push({ body, marker, orbitRadius, phase, orbitDays: Number(planet.orbitDays || 365) });
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

function createGalaxyPoints(entity, count = null, radius = 900) {
  const random = seededRandom(entity.visualProfile?.seed);
  const positions = [];
  const colors = [];
  const resolvedCount = count == null
    ? (globalThis.matchMedia?.('(max-width: 768px)').matches === true ? 6200 : 11800)
    : count;
  const arms = Math.max(2, Number(entity.visualProfile?.arms || 2));
  const hot = new THREE.Color(entity.visualProfile?.tint || 0xb7d6ff);
  const warm = new THREE.Color(0xffc98e);
  const coreColor = new THREE.Color(0xfff2cf);
  for (let i = 0; i < resolvedCount; i++) {
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
    const radialRatio = radial / radius;
    const color = radialRatio < 0.22
      ? coreColor.clone().lerp(warm, radialRatio / 0.22)
      : hot.clone().lerp(warm, Math.max(0, 0.28 - radialRatio) * 1.8);
    color.offsetHSL((random() - 0.5) * 0.035, (random() - 0.5) * 0.12, (random() - 0.5) * 0.15);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(geometry, createRoundStarMaterial({
    size: 2.6,
    sizeAttenuation: false,
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
}

function createGalaxyBulge(entity) {
  const mobile = globalThis.matchMedia?.('(max-width: 768px)').matches === true;
  const count = mobile ? 1000 : 2200;
  const random = seededRandom((entity.visualProfile?.seed || 1) + 7703);
  const positions = [];
  const colors = [];
  const inner = new THREE.Color(0xfff1cf);
  const outer = new THREE.Color(0xd7a872);
  for (let index = 0; index < count; index += 1) {
    const radius = Math.pow(random(), 2.2) * 190;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.32,
      radius * Math.sin(phi) * Math.sin(theta)
    );
    const color = inner.clone().lerp(outer, radius / 190);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const bulge = new THREE.Points(geometry, createRoundStarMaterial({
    size: mobile ? 2.4 : 3,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  bulge.name = 'Model-derived galactic bulge stars';
  return bulge;
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
  if (!entity.visualProfile?.image) group.add(createGalaxyBulge(entity));
  if (!entity.visualProfile?.image) {
    const haloTexture = createNebulaCloudTexture((entity.visualProfile?.seed || 1) + 9001);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture,
      color: entity.visualProfile?.tint || 0x7298d0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    halo.scale.set(1900, 720, 1);
    halo.name = 'Model-derived galactic halo';
    group.add(halo);
    const dustLane = new THREE.Mesh(
      new THREE.RingGeometry(120, 850, 160),
      new THREE.MeshBasicMaterial({ color: 0x080b14, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    dustLane.rotation.x = Math.PI / 2;
    dustLane.scale.y = 0.13;
    dustLane.name = 'Model-derived dust lane';
    group.add(dustLane);
  }
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

function getUniverseDestinationMesh(group, destinationId) {
  return group?.userData?.destinationMeshes?.get?.(destinationId) || null;
}

function setUniverseCourseMarker(group, destinationId, active = true) {
  let selected = null;
  (group?.userData?.orbitingPlanets || []).forEach((entry) => {
    const matches = entry.body?.userData?.universeEntityId === destinationId;
    if (entry.marker) entry.marker.visible = Boolean(active && matches);
    if (matches) selected = entry.body;
  });
  group.userData.activeDestinationId = active ? destinationId : null;
  return selected;
}

function updateUniverseFrameVisual(group, elapsedSeconds, frameScale = 1) {
  if (!group) return;
  const orbiters = group.userData.orbitingPlanets || [];
  if (orbiters.length && !Number.isFinite(group.userData.orbitEpochSeconds)) {
    group.userData.orbitEpochSeconds = elapsedSeconds;
  }
  const localOrbitSeconds = Math.max(0, elapsedSeconds - Number(group.userData.orbitEpochSeconds || 0));
  orbiters.forEach((entry) => {
    const period = Math.max(1, entry.orbitDays);
    const angle = entry.phase + localOrbitSeconds * Math.PI * 2 / Math.max(900, Math.sqrt(period) * 150);
    entry.body.position.x = Math.cos(angle) * entry.orbitRadius;
    entry.body.position.z = Math.sin(angle) * entry.orbitRadius;
    entry.body.rotation.y += 0.006 * frameScale;
    if (entry.marker?.visible) {
      const pulse = 1 + Math.sin(elapsedSeconds * 3.2) * 0.08;
      entry.marker.scale.setScalar(pulse);
      entry.marker.rotation.z += 0.012 * frameScale;
    }
  });
  (group.userData.starMaterials || []).forEach((material) => {
    if (material.uniforms?.time) material.uniforms.time.value = elapsedSeconds;
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

export {
  createUniverseFrameVisual,
  getUniverseDestinationMesh,
  setUniverseCourseMarker,
  updateUniverseFrameVisual
};
