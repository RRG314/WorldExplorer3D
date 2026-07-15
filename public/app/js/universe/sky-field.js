import { icrsToCartesian } from './catalog.js?v=5';
import { createRoundStarMaterial } from '../sky/star-point-material.js?v=2';

const SKY_RADIUS = 185000;
const GAIA_CSV_URL = new URL('../../assets/data/universe/gaia-dr3-nearby-bright.csv', import.meta.url);

function seededRandom(seed = 0x5ca1ab1e) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createProceduralBackdrop() {
  const random = seededRandom();
  const positions = [];
  for (let i = 0; i < 4200; i++) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const planar = Math.sqrt(Math.max(0, 1 - y * y));
    const radius = SKY_RADIUS * (0.96 + random() * 0.035);
    positions.push(
      Math.cos(angle) * planar * radius,
      y * radius,
      Math.sin(angle) * planar * radius
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, createRoundStarMaterial({
    size: 1.15,
    sizeAttenuation: false,
    vertexColors: false,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    fog: false
  }));
  points.name = 'Generated faint-star background';
  points.userData.accuracy = 'procedurally generated visual fill';
  return points;
}

function parseGaiaCsv(csv) {
  const rows = String(csv || '').trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  return rows.slice(1).map((line) => {
    const values = line.split(',');
    return {
      sourceId: values[0],
      raDeg: Number(values[1]),
      decDeg: Number(values[2]),
      parallaxMas: Number(values[3]),
      magnitude: Number(values[4]),
      bpRp: Number(values[5])
    };
  }).filter((star) => (
    Number.isFinite(star.raDeg) &&
    Number.isFinite(star.decDeg) &&
    Number.isFinite(star.parallaxMas) &&
    star.parallaxMas > 0
  ));
}

function starCartesian(star) {
  const distanceLy = (1000 / star.parallaxMas) * 3.26156;
  const ra = star.raDeg * Math.PI / 180;
  const dec = star.decDeg * Math.PI / 180;
  return new THREE.Vector3(
    distanceLy * Math.cos(dec) * Math.cos(ra),
    distanceLy * Math.sin(dec),
    distanceLy * Math.cos(dec) * Math.sin(ra)
  );
}

function observerCartesian(entity) {
  if (!entity || entity.id === 'sol') return new THREE.Vector3();
  const position = entity.canonicalPosition || {};
  if (position.frame !== 'ICRS') return new THREE.Vector3();
  const xyz = icrsToCartesian(entity);
  return new THREE.Vector3(xyz.x, xyz.y, xyz.z);
}

function rebuildGaiaGeometry(state) {
  if (!state.gaiaStars.length || !state.currentEntity) return;
  const observer = observerCartesian(state.currentEntity);
  const positions = [];
  state.gaiaStars.forEach((star) => {
    const direction = starCartesian(star).sub(observer);
    if (direction.lengthSq() < 1e-8) return;
    direction.normalize().multiplyScalar(SKY_RADIUS * 0.93);
    positions.push(direction.x, direction.y, direction.z);
  });
  state.gaiaPoints.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  state.gaiaPoints.geometry = geometry;
  state.gaiaPoints.userData.catalogCount = positions.length / 3;
}

function loadGaiaStars(state) {
  return fetch(GAIA_CSV_URL)
    .then((response) => {
      if (!response.ok) throw new Error('Gaia snapshot unavailable (' + response.status + ')');
      return response.text();
    })
    .then((csv) => {
      state.gaiaStars = parseGaiaCsv(csv);
      rebuildGaiaGeometry(state);
      return state.gaiaStars.length;
    })
    .catch((error) => {
      console.warn('[Universe] Gaia sky snapshot unavailable; generated faint stars remain active.', error);
      return 0;
    });
}

function createUniverseSky(scene) {
  const group = new THREE.Group();
  group.name = 'Frame-relative universe sky';
  group.visible = false;
  group.add(createProceduralBackdrop());
  const gaiaPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    createRoundStarMaterial({
      size: 2.1,
      sizeAttenuation: false,
      vertexColors: false,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      fog: false
    })
  );
  gaiaPoints.name = 'ESA Gaia DR3 nearby bright stars';
  gaiaPoints.userData = {
    accuracy: 'catalog-derived',
    epoch: 'J2016.0',
    source: 'ESA Gaia DR3'
  };
  group.add(gaiaPoints);
  scene.add(group);

  const state = {
    group,
    gaiaPoints,
    gaiaStars: [],
    currentEntity: null,
    loadPromise: null
  };
  state.loadPromise = loadGaiaStars(state);
  return state;
}

function setUniverseSkyFrame(state, entity, visible) {
  if (!state) return;
  state.currentEntity = entity || null;
  state.group.visible = Boolean(visible);
  rebuildGaiaGeometry(state);
}

function updateUniverseSky(state, rocket) {
  if (!state?.group?.visible || !rocket) return;
  state.group.position.copy(rocket.position);
}

export { createUniverseSky, setUniverseSkyFrame, updateUniverseSky };
