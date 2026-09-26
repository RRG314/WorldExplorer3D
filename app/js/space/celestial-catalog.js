import { ctx as appCtx } from '../shared-context.js?v=55';
import { BRIGHT_STARS, CONSTELLATION_STAR_IDS } from '../sky/catalog.js?v=1';
import { projectCatalogStar, skyArcPoints } from './observer-sky.js?v=1';
import { createRoundStarMaterial } from '../sky/star-point-material.js?v=4';
import { createGaiaSkyLayers } from '../sky/gaia-catalog.js?v=4';

const CATALOG_RADIUS = 300000;

function raDecToPosition(raHours, decDeg, radius = CATALOG_RADIUS) {
  const ra = Number(raHours) / 24 * Math.PI * 2;
  const dec = Number(decDeg) * Math.PI / 180;
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
    radius * Math.cos(dec) * Math.sin(ra)
  );
}

function createCatalogStars(group, catalog) {
  catalog.starEntries = BRIGHT_STARS.filter((star) => !star.isPlanet).map((star) => ({ star }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(catalog.starEntries.length * 3), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(catalog.starEntries.length * 3), 3));
  catalog.points = new THREE.Points(geometry, createRoundStarMaterial({ skyBackground: true, size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  catalog.points.userData.isCatalogStar = true;
  catalog.points.frustumCulled = false;
  catalog.points.renderOrder = -1000;
  group.add(catalog.points);
}

function createConstellations(group, catalog) {
  catalog.constellationEntries = [];
  const stars = new Map(BRIGHT_STARS.map((star) => [star.hip, star]));
  Object.entries(CONSTELLATION_STAR_IDS).forEach(([name, segments]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(segments.length * 6 * 12), 3));
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x628bb8, transparent: true, opacity: 0.10, depthWrite: false }));
    line.renderOrder = -1000;
    line.userData = { isSpaceConstellation: true, constellationName: name };
    line.visible = appCtx.constellationsVisible === true;
    line.frustumCulled = false;
    group.add(line);
    catalog.constellationEntries.push({ line, name, segments: segments.map((pair) => pair.map((id) => stars.get(id))) });
  });
}

function updateSpaceCatalogObserver(observer = { x: 0, y: 0, z: 0 }, position = null) {
  const catalog = appCtx.spaceFlight?.celestialCatalog;
  if (!catalog) return;
  if (position) catalog.group.position.copy(position);
  const last = catalog.observer;
  if (last && Math.hypot(observer.x-last.x, observer.y-last.y, observer.z-last.z) < 0.00001) return;
  catalog.observer = { ...observer };
  const positions = catalog.points.geometry.attributes.position;
  const colors = catalog.points.geometry.attributes.color;
  catalog.starEntries.forEach((entry, index) => {
    const projected = projectCatalogStar(entry.star, observer, CATALOG_RADIUS);
    entry.projected = projected;
    positions.setXYZ(index, projected?.x || 0, projected?.y || 0, projected?.z || 0);
    const brightness = projected ? Math.max(0.08, Math.min(1, Math.pow(10, -0.16 * projected.magnitude))) : 0;
    colors.setXYZ(index, brightness, brightness, brightness);
  });
  positions.needsUpdate = colors.needsUpdate = true;
  catalog.constellationEntries.forEach((entry) => {
    const attribute = entry.line.geometry.attributes.position;
    entry.segments.forEach((pair, i) => {
      const points = pair.map((star) => projectCatalogStar(star, observer, CATALOG_RADIUS - 1200));
      const arc=skyArcPoints(points[0],points[1],CATALOG_RADIUS-1200);
      for(let step=0;step<12;step++)for(let end=0;end<2;end++){
        const point=arc[step+end];attribute.setXYZ(i*24+step*2+end,point.x,point.y,point.z);
      }
    });
    attribute.needsUpdate = true;
  });
}

function highlightSpaceConstellation(name = '') {
  const entries = appCtx.spaceFlight?.celestialCatalog?.constellationEntries || [];
  entries.forEach((entry) => {
    const selected = entry.name === name;
    entry.line.visible = appCtx.constellationsVisible === true;
    entry.line.material.color.setHex(selected ? 0x65e6ff : 0x628bb8);
    entry.line.material.opacity = selected ? 0.88 : 0.18;
  });
}

function setSpaceConstellationsVisible(visible) {
  appCtx.constellationsVisible = visible === true;
  highlightSpaceConstellation('');
  const button = document.getElementById('spaceConstellationToggle');
  if (button) {
    button.textContent = `CONSTELLATIONS: ${visible ? 'ON' : 'OFF'}`;
    button.setAttribute('aria-pressed', String(visible === true));
  }
}

function showSpaceConstellationInfo(name) {
  const panel = document.getElementById('solarSystemInfo');
  if (!panel) return;
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  set('ssInfoTitle', name);
  set('ssInfoType', 'Traditional Western constellation figure');
  set('ssInfoDesc', 'Stellarium line figure joining HYG catalog stars. Its shape changes with your viewpoint; IAU sky boundaries are defined from Earth.');
  set('ssInfoMetaLabel', 'CELESTIAL COORDINATES');
  set('ssInfoMetric1Label', 'Reference frame');
  set('ssInfoDistAU', 'Equatorial J2000');
  set('ssInfoMetric2Label', 'Pattern source');
  set('ssInfoDistKM', 'Stellarium / HYG v4.0');
  const courseButton = document.getElementById('ssInfoSetCourse');
  if (courseButton) courseButton.style.display = 'none';
  set('ssInfoMetric3Label', 'Catalog stars');
  set('ssInfoDistEarth', String((appCtx.BRIGHT_STARS || []).filter((star) => star.constellation === name).length));
  panel.style.display = 'block';
  highlightSpaceConstellation(name);
}

function createSpaceCelestialCatalog(scene) {
  const group = new THREE.Group();
  group.name = 'Catalog celestial sphere';
  const catalog = { group, starEntries: [], constellationEntries: [] };
  catalog.gaiaSky = createGaiaSkyLayers({
    name: 'ESA Gaia DR3 space sky',
    radius: CATALOG_RADIUS + 30000,
    brightSize: 3.6,
    faintSize: 2.1
  });
  group.add(catalog.gaiaSky.group);
  createCatalogStars(group, catalog);
  createConstellations(group, catalog);
  scene.add(group);
  appCtx.spaceFlight.celestialCatalog = catalog;
  updateSpaceCatalogObserver();
  return catalog;
}

Object.assign(appCtx, { highlightSpaceConstellation, showSpaceConstellationInfo, updateSpaceCatalogObserver, setSpaceConstellationsVisible });

export {
  createSpaceCelestialCatalog,
  highlightSpaceConstellation,
  showSpaceConstellationInfo
};
