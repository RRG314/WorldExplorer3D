import { ctx as appCtx } from '../shared-context.js?v=55';

const CATALOG_RADIUS = 300000;
const BACKDROP_MIN_RADIUS = 330000;
const BACKDROP_DEPTH = 55000;

function raDecToPosition(raHours, decDeg, radius = CATALOG_RADIUS) {
  const ra = Number(raHours) / 24 * Math.PI * 2;
  const dec = Number(decDeg) * Math.PI / 180;
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
    radius * Math.cos(dec) * Math.sin(ra)
  );
}

function seededRandom(seed = 0x47414941) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createDeterministicBackdrop() {
  const random = seededRandom();
  const positions = [];
  const colors = [];
  for (let i = 0; i < 5200; i++) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = BACKDROP_MIN_RADIUS + random() * BACKDROP_DEPTH;
    const sinPhi = Math.sin(phi);
    positions.push(
      radius * sinPhi * Math.cos(theta),
      radius * Math.cos(phi),
      radius * sinPhi * Math.sin(theta)
    );
    const brightness = 0.5 + random() * 0.42;
    const temperature = random();
    if (temperature < 0.18) colors.push(brightness * 0.76, brightness * 0.84, brightness);
    else if (temperature > 0.88) colors.push(brightness, brightness * 0.82, brightness * 0.64);
    else colors.push(brightness, brightness, brightness * 0.96);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 3,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  }));
  points.name = 'Deterministic deep-space backdrop';
  return points;
}

function createCatalogStars(group, catalog) {
  catalog.starEntries = [];
  (appCtx.BRIGHT_STARS || []).filter((star) => !star.isPlanet).forEach((star, index) => {
    const position = raDecToPosition(star.ra, star.dec);
    const radius = Math.max(260, Math.min(720, 570 - Number(star.mag || 0) * 58));
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 8),
      new THREE.MeshBasicMaterial({ color: star.color || 0xffffff, fog: false })
    );
    mesh.position.copy(position);
    mesh.userData = { isCatalogStar: true, starIndex: index, star };
    group.add(mesh);

    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(1500, radius * 3.4), 6, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.copy(position);
    hitbox.userData = { isCatalogStar: true, starIndex: index, star };
    group.add(hitbox);
    catalog.starEntries.push({ mesh, hitbox, star });
  });
}

function createConstellations(group, catalog) {
  catalog.constellationEntries = [];
  const material = new THREE.LineBasicMaterial({
    color: 0x628bb8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false
  });
  Object.entries(appCtx.CONSTELLATION_LINES || {}).forEach(([name, segments]) => {
    const constellation = new THREE.Group();
    constellation.name = name + ' constellation';
    segments.forEach((segment) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        raDecToPosition(segment[0][0], segment[0][1], CATALOG_RADIUS - 1200),
        raDecToPosition(segment[1][0], segment[1][1], CATALOG_RADIUS - 1200)
      ]);
      const line = new THREE.Line(geometry, material.clone());
      line.userData = { isSpaceConstellation: true, constellationName: name };
      constellation.add(line);
      catalog.constellationEntries.push({ line, name });
    });
    group.add(constellation);
  });
}

function highlightSpaceConstellation(name = '') {
  const entries = appCtx.spaceFlight?.celestialCatalog?.constellationEntries || [];
  entries.forEach((entry) => {
    const selected = entry.name === name;
    entry.line.material.color.setHex(selected ? 0x65e6ff : 0x628bb8);
    entry.line.material.opacity = selected ? 0.88 : 0.18;
  });
}

function showSpaceConstellationInfo(name) {
  const panel = document.getElementById('solarSystemInfo');
  if (!panel) return;
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  set('ssInfoTitle', name);
  set('ssInfoType', 'IAU Constellation');
  set('ssInfoDesc', 'Official sky-region pattern shown from catalog right ascension and declination coordinates.');
  set('ssInfoMetaLabel', 'CELESTIAL COORDINATES');
  set('ssInfoMetric1Label', 'Reference frame');
  set('ssInfoDistAU', 'Equatorial J2000');
  set('ssInfoMetric2Label', 'Pattern source');
  set('ssInfoDistKM', 'IAU sky regions');
  set('ssInfoMetric3Label', 'Catalog stars');
  set('ssInfoDistEarth', String((appCtx.BRIGHT_STARS || []).filter((star) => star.constellation === name).length));
  panel.style.display = 'block';
  highlightSpaceConstellation(name);
}

function createSpaceCelestialCatalog(scene) {
  const group = new THREE.Group();
  group.name = 'Catalog celestial sphere';
  const catalog = { group, starEntries: [], constellationEntries: [] };
  group.add(createDeterministicBackdrop());
  createCatalogStars(group, catalog);
  createConstellations(group, catalog);
  scene.add(group);
  appCtx.spaceFlight.celestialCatalog = catalog;
  return catalog;
}

Object.assign(appCtx, { highlightSpaceConstellation, showSpaceConstellationInfo });

export {
  createSpaceCelestialCatalog,
  highlightSpaceConstellation,
  showSpaceConstellationInfo
};
