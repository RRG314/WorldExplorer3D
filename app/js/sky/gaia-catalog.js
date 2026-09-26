import { createRoundStarMaterial } from './star-point-material.js?v=4';

const GAIA_CSV_URL = new URL('../../assets/data/universe/gaia-dr3-nearby-bright.csv', import.meta.url);
let catalogPromise = null;

function parseNumber(value) {
  if (value == null || String(value).trim() === '') return null;
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
      skyBackground: true,
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
  points.renderOrder = -1000;
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
    disposed: false,
    radius: Number(options.radius) || 5000,
    brightMagnitude: Number(options.brightMagnitude) || 5.2,
    brightPoints: createPointLayer(options.brightName || 'Gaia DR3 bright stars', options.brightSize || 5.2, 0.98),
    faintPoints: createPointLayer(options.faintName || 'Gaia DR3 faint stars', options.faintSize || 2.8, 0.84),
    stars: [],
    ready: Promise.resolve(0),
    load: null
  };
  group.add(state.faintPoints, state.brightPoints);
  state.load = () => {
    if (state.loadStarted) return state.ready;
    state.loadStarted = true;
    state.ready = loadGaiaCatalog().then((stars) => {
      if (state.disposed) return 0;
      state.stars = stars;
      rebuildGaiaSkyLayers(state);
      return stars.length;
    }).catch((error) => {
      console.warn('[Sky] Gaia DR3 catalog snapshot unavailable.', error);
      return 0;
    });
    return state.ready;
  };
  if (options.autoload !== false) state.load();
  return state;
}

function rebuildGaiaSkyLayers(state, observer = null) {
  if (state?.disposed || !state?.stars?.length) return 0;
  const origin = observer?.isVector3 ? observer : new THREE.Vector3();
  const layers = {
    bright: { positions: [], colors: [], entries: [] },
    faint: { positions: [], colors: [], entries: [] }
  };
  state.stars.forEach((star) => {
    const direction = starCartesian(star).sub(origin);
    if (direction.lengthSq() < 1e-12) return;
    const distanceLy = direction.length();
    const sourceDistanceLy = 1000 / star.parallaxMas * 3.26156;
    const magnitude = star.magnitude + 5 * Math.log10(distanceLy / sourceDistanceLy);
    direction.normalize().multiplyScalar(state.radius);
    const layer = magnitude <= state.brightMagnitude ? layers.bright : layers.faint;
    layer.entries.push({ star: { name: `Gaia DR3 ${star.sourceId}`, proper: star.sourceId, source: 'ESA Gaia DR3 (J2016.0)', ra: star.raDeg / 15, dec: star.decDeg, dist: sourceDistanceLy, mag: star.magnitude, constellation: 'Catalog star' }, projected: { distanceLy, magnitude } });
    const color = colorFromBpRp(star.bpRp);
    layer.positions.push(direction.x, direction.y, direction.z);
    layer.colors.push(color.r, color.g, color.b);
  });
  [['bright', state.brightPoints], ['faint', state.faintPoints]].forEach(([key, points]) => {
    // Reserve catalog capacity once: parallax must not churn GPU buffers in flight.
    const geometry = points.geometry;
    const capacity = state.stars.length * 3;
    for (const [name, values] of [['position', layers[key].positions], ['color', layers[key].colors]]) {
      let attribute = geometry.getAttribute(name);
      if (!attribute || attribute.array.length < capacity) {
        attribute = new THREE.Float32BufferAttribute(new Float32Array(capacity), 3);
        geometry.setAttribute(name, attribute);
      }
      attribute.array.set(values);
      attribute.needsUpdate = true;
    }
    geometry.setDrawRange(0, layers[key].entries.length);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), state.radius);
    points.userData.catalogCount = layers[key].positions.length / 3;
    points.userData.isCatalogStar = true;
    points.userData.catalogEntries = layers[key].entries;
  });
  return state.stars.length;
}

function releaseGaiaSkyLayers(state) {
  if (!state) return false;
  state.disposed = true;
  state.stars = [];
  state.group = null;
  state.brightPoints = null;
  state.faintPoints = null;
  return true;
}

export { createGaiaSkyLayers, loadGaiaCatalog, rebuildGaiaSkyLayers, releaseGaiaSkyLayers };
