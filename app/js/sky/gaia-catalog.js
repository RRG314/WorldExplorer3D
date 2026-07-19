import { createRoundStarMaterial } from './star-point-material.js?v=2';

const GAIA_CSV_URL = new URL('../../assets/data/universe/gaia-dr3-nearby-bright.csv', import.meta.url);
let catalogPromise = null;

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseGaiaCsv(csv) {
  const rows = String(csv || '').trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  return rows.slice(1).map((line) => {
    const values = line.split(',');
    return {
      sourceId: values[0],
      raDeg: parseNumber(values[1]),
      decDeg: parseNumber(values[2]),
      parallaxMas: parseNumber(values[3]),
      magnitude: parseNumber(values[4]),
      bpRp: parseNumber(values[5]),
      pmRa: parseNumber(values[6]),
      pmDec: parseNumber(values[7]),
      radialVelocity: parseNumber(values[8])
    };
  }).filter((star) => (
    star.raDeg !== null &&
    star.decDeg !== null &&
    star.parallaxMas > 0 &&
    star.magnitude !== null
  ));
}

function loadGaiaCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch(GAIA_CSV_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Gaia snapshot unavailable (${response.status})`);
      return response.text();
    })
    .then(parseGaiaCsv);
  return catalogPromise;
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

function colorFromBpRp(bpRp) {
  const index = Math.max(-0.4, Math.min(3.2, Number(bpRp) || 0.8));
  const color = new THREE.Color();
  if (index < 0.8) {
    return color.setRGB(
      0.68 + (index + 0.4) / 1.2 * 0.32,
      0.8 + (index + 0.4) / 1.2 * 0.2,
      1
    );
  }
  const warmth = (index - 0.8) / 2.4;
  return color.setRGB(1, 1 - warmth * 0.28, 1 - warmth * 0.52);
}

function createPointLayer(name, size, opacity) {
  const points = new THREE.Points(
    new THREE.BufferGeometry(),
    createRoundStarMaterial({
      size,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity,
      fog: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    })
  );
  points.name = name;
  points.frustumCulled = false;
  points.userData = {
    accuracy: 'catalog-derived',
    epoch: 'J2016.0',
    source: 'ESA Gaia DR3',
    baseOpacity: opacity
  };
  return points;
}

function createGaiaSkyLayers(options = {}) {
  const group = new THREE.Group();
  group.name = options.name || 'ESA Gaia DR3 sky';
  const state = {
    group,
    radius: Number(options.radius) || 5000,
    brightMagnitude: Number(options.brightMagnitude) || 5.2,
    brightPoints: createPointLayer(options.brightName || 'Gaia DR3 bright stars', options.brightSize || 5.2, 0.98),
    faintPoints: createPointLayer(options.faintName || 'Gaia DR3 faint stars', options.faintSize || 2.8, 0.84),
    stars: [],
    ready: null
  };
  group.add(state.faintPoints, state.brightPoints);
  state.ready = loadGaiaCatalog().then((stars) => {
    state.stars = stars;
    rebuildGaiaSkyLayers(state);
    return stars.length;
  }).catch((error) => {
    console.warn('[Sky] Gaia DR3 catalog snapshot unavailable.', error);
    return 0;
  });
  return state;
}

function rebuildGaiaSkyLayers(state, observer = null) {
  if (!state?.stars?.length) return 0;
  const origin = observer?.isVector3 ? observer : new THREE.Vector3();
  const layers = {
    bright: { positions: [], colors: [] },
    faint: { positions: [], colors: [] }
  };
  state.stars.forEach((star) => {
    const direction = starCartesian(star).sub(origin);
    if (direction.lengthSq() < 1e-12) return;
    direction.normalize().multiplyScalar(state.radius);
    const layer = star.magnitude <= state.brightMagnitude ? layers.bright : layers.faint;
    const color = colorFromBpRp(star.bpRp);
    layer.positions.push(direction.x, direction.y, direction.z);
    layer.colors.push(color.r, color.g, color.b);
  });
  [['bright', state.brightPoints], ['faint', state.faintPoints]].forEach(([key, points]) => {
    points.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(layers[key].positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(layers[key].colors, 3));
    points.geometry = geometry;
    points.userData.catalogCount = layers[key].positions.length / 3;
  });
  return state.stars.length;
}

export { createGaiaSkyLayers, loadGaiaCatalog, rebuildGaiaSkyLayers };
