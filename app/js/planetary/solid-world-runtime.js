import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=2';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { ENV, getEnv } from '../env.js?v=58';
import {
  commitEnvironment,
  registerEnvironmentLifecycle
} from '../session-coordinator.js?v=2';
import { suspendEarthModesForPlanetaryEntry } from './entry.js?v=9';
import { configureColorTexture } from './catalog.js?v=1';
import { samplePhysicalEnvironment } from './runtime/physical-environment.js?v=2';
import {
  CALORIS_PLANITIA_SURFACE_REGION,
  CERES_OCCATOR_SURFACE_REGION,
  ENCELADUS_SOUTH_POLAR_SURFACE_REGION,
  ensurePlanetarySurfaceAuthority,
  EUROPA_CONAMARA_SURFACE_REGION,
  IO_TVASHTAR_SURFACE_REGION,
  MAXWELL_MONTES_SURFACE_REGION,
  PLUTO_SPUTNIK_SURFACE_REGION,
  TITAN_SHANGRI_LA_SURFACE_REGION,
  TRITON_CANTALOUPE_SURFACE_REGION,
  VESTA_RHEASILVIA_SURFACE_REGION
} from './runtime/surface-authority.js?v=3';

const WALK_AND_DRIVE = Object.freeze({ drive: true, walk: true, drone: false, plane: false, boat: false, ocean: false, earth: false, space: false });
const PROTECTED_DRIVE = Object.freeze({ drive: true, walk: false, drone: false, plane: false, boat: false, ocean: false, earth: false, space: false });

function worldPack(input) {
  return Object.freeze({
    terrainSize: 16_000,
    segments: 192,
    fogColor: null,
    fogDensity: 0,
    exposure: 1.04,
    fillIntensity: 0.2,
    rockCount: 520,
    rockScale: 4,
    capabilities: WALK_AND_DRIVE,
    ...input,
    spawn: Object.freeze(input.spawn),
    material: Object.freeze(input.material),
    textureWindow: input.textureWindow ? Object.freeze(input.textureWindow) : null
  });
}

const SOLID_WORLD_PACKS = Object.freeze({
  mercury: worldPack({
    bodyId: 'mercury',
    manifest: CALORIS_PLANITIA_SURFACE_REGION,
    reliefKind: 'cratered',
    detailSeed: 17,
    rockColor: 0x8d857d,
    spawn: Object.freeze({ x: 1_150, z: -620, angle: 0.7 }),
    material: Object.freeze({ color: 0xa69a8c, roughness: 0.96, bumpScale: 4 }),
    skyColor: 0x000000,
    sunColor: 0xfff4df,
    sunIntensity: 4.4,
    ambientIntensity: 0.12,
    exposure: 1.18,
    fillIntensity: 0.2,
    title: 'Caloris Planitia, Mercury',
    context: 'Airless terrain · intense sunlight · 0.38g',
    representation: 'MESSENGER enhanced-color map · locally shaped terrain'
  }),
  venus: worldPack({
    bodyId: 'venus',
    manifest: MAXWELL_MONTES_SURFACE_REGION,
    reliefKind: 'mountain-ridges',
    detailSeed: 29,
    rockColor: 0x7f3e25,
    rockScale: 6,
    spawn: Object.freeze({ x: -900, z: 1_050, angle: -1.1 }),
    material: Object.freeze({ color: 0xc57b45, roughness: 0.88, bumpScale: 9 }),
    skyColor: 0x9a5a2e,
    fogColor: 0xb46d38,
    fogDensity: 0.00042,
    sunColor: 0xffc27a,
    sunIntensity: 0.8,
    ambientIntensity: 0.58,
    fillIntensity: 0.4,
    capabilities: PROTECTED_DRIVE,
    title: 'Maxwell Montes, Venus',
    context: 'Protected vehicle · dense CO₂ atmosphere · 0.90g',
    representation: 'Magellan radar context · modeled local relief'
  }),
  io: worldPack({
    bodyId: 'io', manifest: IO_TVASHTAR_SURFACE_REGION, reliefKind: 'volcanic', detailSeed: 47,
    rockColor: 0x6d5734, rockScale: 5, spawn: { x: 780, z: -1_020, angle: 0.35 },
    material: { color: 0xd7aa55, roughness: 0.92, bumpScale: 7 },
    skyColor: 0x000000, sunColor: 0xfff7e9, sunIntensity: 0.18, ambientIntensity: 0.1,
    parentBodyId: 'jupiter', parentVisualDiameter: 620,
    title: 'Tvashtar Paterae, Io',
    context: 'Protected survey · sulfurous volcanic terrain · 0.18g',
    representation: 'Voyager/Galileo color context · modeled volcanic relief'
  }),
  europa: worldPack({
    bodyId: 'europa', manifest: EUROPA_CONAMARA_SURFACE_REGION, reliefKind: 'ice-lineae', detailSeed: 53,
    rockColor: 0xa9b4ba, rockScale: 2.6, spawn: { x: -640, z: 980, angle: -0.6 },
    material: { color: 0xd9d3c6, roughness: 0.78, bumpScale: 3 },
    skyColor: 0x000000, sunColor: 0xfff8ec, sunIntensity: 0.17, ambientIntensity: 0.11,
    parentBodyId: 'jupiter', parentVisualDiameter: 420,
    title: 'Conamara Chaos, Europa',
    context: 'Protected survey · fractured water-ice surface · 0.13g',
    representation: 'Voyager/Galileo image context · modeled local ice relief'
  }),
  titan: worldPack({
    bodyId: 'titan', manifest: TITAN_SHANGRI_LA_SURFACE_REGION, reliefKind: 'titan-dunes', detailSeed: 61,
    rockColor: 0x493526, rockScale: 3.5, spawn: { x: 520, z: 1_080, angle: 1.25 },
    material: { color: 0x8d6038, roughness: 0.98, bumpScale: 5 },
    skyColor: 0x7a4b22, fogColor: 0xb87532, fogDensity: 0.00055,
    sunColor: 0xffd29c, sunIntensity: 0.07, ambientIntensity: 0.5, fillIntensity: 0.32,
    parentBodyId: 'saturn', parentVisualDiameter: 180,
    title: 'Shangri-La, Titan',
    context: 'Sealed suit · nitrogen-methane haze · 0.14g',
    representation: 'Cassini near-infrared context · modeled dune relief'
  }),
  enceladus: worldPack({
    bodyId: 'enceladus', manifest: ENCELADUS_SOUTH_POLAR_SURFACE_REGION, reliefKind: 'ice-fractures', detailSeed: 67,
    rockColor: 0xbcc8d0, rockScale: 2.1, spawn: { x: -720, z: -840, angle: 0.85 },
    material: { color: 0xe7eef2, roughness: 0.74, bumpScale: 4 },
    skyColor: 0x000000, sunColor: 0xfff6e4, sunIntensity: 0.06, ambientIntensity: 0.12,
    parentBodyId: 'saturn', parentVisualDiameter: 760,
    title: 'South Polar Terrain, Enceladus',
    context: 'Airless ice terrain · plume-source fractures · 0.012g',
    representation: 'Cassini image context · modeled local fracture relief'
  }),
  triton: worldPack({
    bodyId: 'triton', manifest: TRITON_CANTALOUPE_SURFACE_REGION, reliefKind: 'cantaloupe', detailSeed: 73,
    rockColor: 0xa4a6a0, rockScale: 3.2, spawn: { x: 860, z: 720, angle: -0.25 },
    material: { color: 0xc4b7aa, roughness: 0.9, bumpScale: 5 },
    skyColor: 0x030508, fogColor: 0x66727d, fogDensity: 0.000012,
    sunColor: 0xe7efff, sunIntensity: 0.002, ambientIntensity: 0.09,
    parentBodyId: 'neptune', parentVisualDiameter: 330,
    title: 'Voyager Hemisphere, Triton',
    context: 'Near-vacuum · nitrogen-ice terrain · 0.08g',
    representation: 'Voyager enhanced-color context · modeled cellular relief'
  }),
  ceres: worldPack({
    bodyId: 'ceres', manifest: CERES_OCCATOR_SURFACE_REGION, reliefKind: 'ceres-craters', detailSeed: 79,
    rockColor: 0x72716d, rockScale: 4.2, spawn: { x: -960, z: 480, angle: -1.35 },
    material: { color: 0x8b8b85, roughness: 0.97, bumpScale: 6 },
    skyColor: 0x000000, sunColor: 0xfff5df, sunIntensity: 0.14, ambientIntensity: 0.09,
    title: 'Occator Crater, Ceres',
    context: 'Airless dwarf planet · bright salt deposits · 0.028g',
    representation: 'Dawn enhanced-color context · modeled crater relief'
  }),
  vesta: worldPack({
    bodyId: 'vesta', manifest: VESTA_RHEASILVIA_SURFACE_REGION, reliefKind: 'vesta-basin', detailSeed: 83,
    rockColor: 0x615b54, rockScale: 4.8, spawn: { x: 940, z: -460, angle: 0.5 },
    material: { color: 0x837b70, roughness: 0.97, bumpScale: 7 },
    textureWindow: { u: 0.59, v: 0.31, width: 0.28, height: 0.39 },
    skyColor: 0x000000, sunColor: 0xfff6e3, sunIntensity: 0.18, ambientIntensity: 0.08,
    title: 'Rheasilvia Basin, Vesta',
    context: 'Irregular small world · giant impact basin · 0.025g',
    representation: 'Dawn image context · modeled basin relief'
  }),
  pluto: worldPack({
    bodyId: 'pluto', manifest: PLUTO_SPUTNIK_SURFACE_REGION, reliefKind: 'nitrogen-ice', detailSeed: 89,
    rockColor: 0x9a8d80, rockScale: 3.8, spawn: { x: -680, z: -1_060, angle: 1.05 },
    material: { color: 0xc1aa96, roughness: 0.88, bumpScale: 5 },
    skyColor: 0x020305, fogColor: 0x6b7280, fogDensity: 0.000008,
    sunColor: 0xddeaff, sunIntensity: 0.0012, ambientIntensity: 0.08,
    title: 'Sputnik Planitia, Pluto',
    context: 'Near-vacuum · nitrogen-ice plain · 0.063g',
    representation: 'New Horizons color context · modeled local ice relief'
  })
});

const worldCache = new Map();
let activePack = null;
let transitionId = 0;
let priorWorldPresentation = null;

function deterministicNoise(x, z, seed) {
  const a = Math.sin((x + seed * 13) * 0.0031 + Math.cos(z * 0.0023));
  const b = Math.sin((z - seed * 7) * 0.0077 + Math.cos(x * 0.0049));
  const c = Math.sin((x + z) * 0.0141 + seed);
  return a * 0.52 + b * 0.31 + c * 0.17;
}

function craterRelief(x, z, centerX, centerZ, radius, depth) {
  const distance = Math.hypot(x - centerX, z - centerZ);
  if (distance > radius * 1.35) return 0;
  const normalized = distance / radius;
  if (normalized < 1) return -depth * (1 - normalized * normalized);
  const rim = 1 - Math.abs(normalized - 1) / 0.35;
  return Math.max(0, rim) * depth * 0.28;
}

function sampleModeledRelief(pack, x, z) {
  const noise = deterministicNoise(x, z, pack.detailSeed);
  if (pack.reliefKind === 'cratered') {
    return noise * 13 +
      craterRelief(x, z, -1_900, 1_250, 1_050, 145) +
      craterRelief(x, z, 2_300, -2_100, 720, 105) +
      craterRelief(x, z, 850, 2_850, 430, 62) +
      Math.max(0, Math.sin((x - z) * 0.0017)) * 19;
  }
  if (pack.reliefKind === 'mountain-ridges') {
    const broadRise = 390 * Math.exp(-((x + 1_500) ** 2 + (z - 900) ** 2) / 8_500_000);
    const ridges = Math.abs(Math.sin(x * 0.0014 + Math.sin(z * 0.0011))) * 72;
    return broadRise + ridges + noise * 22;
  }
  if (pack.reliefKind === 'volcanic') {
    const shield = 230 * Math.exp(-((x + 900) ** 2 + (z - 650) ** 2) / 3_800_000);
    const caldera = craterRelief(x, z, -900, 650, 520, 105);
    const flows = Math.max(0, Math.sin((x * 0.0019) + Math.sin(z * 0.0007) * 2.5)) * 36;
    return shield + caldera + flows + noise * 17;
  }
  if (pack.reliefKind === 'ice-lineae') {
    const lineae = Math.abs(Math.sin(x * 0.0021 + z * 0.0007)) * 18 +
      Math.abs(Math.sin(z * 0.0017 - x * 0.0005)) * 12;
    const chaos = Math.max(0, noise) * 22 * Math.exp(-((x - 650) ** 2 + (z + 400) ** 2) / 4_200_000);
    return lineae + chaos + noise * 5;
  }
  if (pack.reliefKind === 'titan-dunes') {
    const dunes = Math.sin(x * 0.007 + Math.sin(z * 0.00045) * 1.6) * 18;
    const broadTerrain = 55 * Math.sin((x + z) * 0.00035) + 34 * Math.sin(z * 0.00062);
    return dunes + broadTerrain + noise * 8;
  }
  if (pack.reliefKind === 'ice-fractures') {
    const tigerStripes = Math.abs(Math.sin((x + z * 0.35) * 0.0028)) ** 8 * 48;
    const crossFractures = Math.abs(Math.sin((z - x * 0.18) * 0.0011)) ** 10 * 24;
    return tigerStripes + crossFractures + noise * 7;
  }
  if (pack.reliefKind === 'cantaloupe') {
    const cells = Math.sin(x * 0.0016) * Math.sin(z * 0.0016) * 34;
    const dimples = -Math.abs(Math.sin(x * 0.0024) * Math.cos(z * 0.0021)) * 22;
    return cells + dimples + noise * 9;
  }
  if (pack.reliefKind === 'ceres-craters') {
    return noise * 16 +
      craterRelief(x, z, -1_050, 820, 1_150, 190) +
      craterRelief(x, z, 1_900, -1_250, 560, 92) +
      craterRelief(x, z, 380, 2_300, 390, 65);
  }
  if (pack.reliefKind === 'vesta-basin') {
    const basin = craterRelief(x, z, 0, 0, 3_300, 360);
    const centralPeak = 250 * Math.exp(-(x ** 2 + z ** 2) / 1_200_000);
    const scarps = Math.max(0, Math.sin((x - z) * 0.0012)) * 54;
    return basin + centralPeak + scarps + noise * 18;
  }
  if (pack.reliefKind === 'nitrogen-ice') {
    const cells = (Math.sin(x * 0.0017) + Math.sin(z * 0.0015) + Math.sin((x + z) * 0.0011)) * 13;
    const mountains = 190 * Math.max(0, noise - 0.55) ** 2;
    return cells + mountains;
  }
  return noise * 12;
}

function loadSurfaceTexture(pack) {
  const asset = pack.manifest.assets[0];
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      asset.url,
      (texture) => {
        const configured = configureColorTexture(texture, appCtx.renderer);
        if (pack.textureWindow) {
          configured.offset.set(pack.textureWindow.u, pack.textureWindow.v);
          configured.repeat.set(pack.textureWindow.width, pack.textureWindow.height);
          configured.needsUpdate = true;
        }
        resolve(configured);
      },
      undefined,
      () => reject(new Error(`Unable to load ${pack.bodyId} surface context: ${asset.url}`))
    );
  });
}

function loadColorTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => resolve(configureColorTexture(texture, appCtx.renderer)),
      undefined,
      () => resolve(null)
    );
  });
}

async function addParentBodyView(pack, world) {
  if (!pack.parentBodyId || !pack.parentVisualDiameter) return;
  const parent = getAstronomicalBody(pack.parentBodyId);
  if (!parent?.presentation?.globalTexturePath) return;
  const texture = await loadColorTexture(parent.presentation.globalTexturePath);
  const radius = pack.parentVisualDiameter / 2;
  const group = new THREE.Group();
  group.name = `${parent.name} body-fixed sky context`;
  group.position.set(-2_900, 1_850, -4_900);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff })
  );
  globe.rotation.y = 0.55;
  group.add(globe);
  if (parent.id === 'saturn') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.18, radius * 2.15, 96),
      new THREE.MeshBasicMaterial({ color: 0xd8c7a4, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = 1.18;
    ring.rotation.z = -0.18;
    group.add(ring);
  }
  group.userData.truthClass = 'visual_scale_adjustment';
  group.userData.parentBodyId = parent.id;
  group.userData.description = 'Body-fixed parent-planet sky context; apparent size is adjusted for gameplay readability.';
  world.objects.push(group);
  appCtx.scene.add(group);
}

function addGeneratedSurfaceDetail(pack, world) {
  const count = pack.rockCount;
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: pack.rockColor,
    roughness: 1,
    metalness: 0
  });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D();
  let seed = pack.detailSeed * 0x01010101;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < count; index++) {
    const radius = 25 + Math.sqrt(random()) * 1_100;
    const theta = random() * Math.PI * 2;
    const x = pack.spawn.x + Math.cos(theta) * radius;
    const z = pack.spawn.z + Math.sin(theta) * radius;
    const scale = 0.45 + Math.pow(random(), 2.5) * pack.rockScale;
    transform.position.set(x, pack.manifest.renderPlacement.y + sampleModeledRelief(pack, x, z) + scale * 0.35, z);
    transform.rotation.set(random(), random() * Math.PI * 2, random());
    transform.scale.set(scale * 1.3, scale * (0.45 + random() * 0.5), scale);
    transform.updateMatrix();
    rocks.setMatrixAt(index, transform.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.name = `${pack.bodyId} generated surface rocks`;
  rocks.userData.truthClass = 'generated_game_detail';
  world.objects.push(rocks);
  appCtx.scene.add(rocks);
}

async function createSolidWorld(pack) {
  const cached = worldCache.get(pack.bodyId);
  const authority = ensurePlanetarySurfaceAuthority(appCtx);
  if (cached) {
    const activation = authority.activate(pack.manifest.regionId);
    if (activation.status !== 'accepted') throw new Error(`${pack.title} surface activation failed.`);
    cached.surface.visible = true;
    if (cached.surface.parent !== appCtx.scene) appCtx.scene.add(cached.surface);
    cached.objects.forEach((object) => {
      object.visible = true;
      if (object.parent !== appCtx.scene) appCtx.scene.add(object);
    });
    return cached;
  }
  let surface = null;
  const publication = await authority.prepare(pack.manifest.regionId, async () => {
    const texture = await loadSurfaceTexture(pack);
    const geometry = new THREE.PlaneGeometry(pack.terrainSize, pack.terrainSize, pack.segments, pack.segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      positions.setY(index, sampleModeledRelief(pack, positions.getX(index), positions.getZ(index)));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: pack.material.color,
      roughness: pack.material.roughness,
      metalness: 0,
      bumpMap: texture,
      bumpScale: pack.material.bumpScale
    });
    surface = new THREE.Mesh(geometry, material);
    surface.name = `${pack.title} modeled surface`;
    surface.position.set(
      pack.manifest.renderPlacement.x,
      pack.manifest.renderPlacement.y,
      pack.manifest.renderPlacement.z
    );
    surface.receiveShadow = true;
    surface.castShadow = true;
    surface.frustumCulled = false;
    surface.userData.planetaryBody = pack.bodyId;
    surface.userData.surfaceRegionId = pack.manifest.regionId;
    surface.userData.worldAddress = pack.manifest.address;
    surface.userData.worldAddressKey = pack.manifest.addressKey;
    surface.userData.terrainTruthClass = 'modeled';
    surface.userData.textureTruthClass = 'derived_from_observations';
    return {
      sampleHeight: (x, z) => sampleModeledRelief(pack, x, z),
      renderArtifact: surface,
      readyAssetIds: pack.manifest.assets.map((asset) => asset.id)
    };
  });
  if (publication.status !== 'accepted' || !surface) {
    throw new Error(`${pack.title} surface publication failed: ${publication.reason || publication.status}`);
  }
  const world = { pack, surface, objects: [] };
  worldCache.set(pack.bodyId, world);
  appCtx.scene.add(surface);
  addGeneratedSurfaceDetail(pack, world);
  await addParentBodyView(pack, world);
  return world;
}

function positionPlayer(pack) {
  const ground = pack.manifest.renderPlacement.y + sampleModeledRelief(pack, pack.spawn.x, pack.spawn.z);
  Object.assign(appCtx.car, {
    x: pack.spawn.x,
    z: pack.spawn.z,
    y: ground + 1.2,
    angle: pack.spawn.angle,
    vx: 0,
    vz: 0,
    vy: 0,
    vFwd: 0,
    vLat: 0,
    speed: 0,
    isAirborne: false,
    _lastSurfaceY: null
  });
  appCtx.carMesh?.position.set(pack.spawn.x, ground + 1.2, pack.spawn.z);
  if (appCtx.carMesh) {
    appCtx.carMesh.rotation.y = pack.spawn.angle;
    appCtx.carMesh.visible = true;
  }
  appCtx.camera?.position.set(pack.spawn.x + 18, ground + 10, pack.spawn.z + 22);
  appCtx.camera?.lookAt(pack.spawn.x, ground + 3, pack.spawn.z);
}

function showWorldPanel(pack, environment) {
  let panel = document.getElementById('solidWorldPanel');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'solidWorldPanel';
    panel.style.cssText = 'position:fixed;top:76px;left:18px;z-index:999;background:rgba(10,12,18,.88);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:12px 14px;color:#fff;font:12px Inter,sans-serif;max-width:260px;line-height:1.45;';
    document.body.appendChild(panel);
  }
  const compact = globalThis.innerWidth <= 600;
  panel.style.left = compact ? '10px' : '18px';
  panel.style.right = compact ? '10px' : 'auto';
  panel.style.maxWidth = compact ? 'none' : '260px';
  const temperatureC = Math.round(environment.temperatureK - 273.15);
  const pressure = environment.pressurePa >= 1000
    ? `${(environment.pressurePa / 1000).toFixed(1)} kPa`
    : `${Math.round(environment.pressurePa)} Pa`;
  panel.innerHTML = `<strong style="display:block;font-size:14px;margin-bottom:4px;">${pack.title}</strong><span>${pack.context}</span><br><span>${pressure} · ${temperatureC}°C</span><br><small style="opacity:.72;">${pack.representation}</small><canvas id="planetaryFieldMap" width="220" height="105" style="display:block;width:220px;max-width:100%;height:105px;margin-top:8px;border:1px solid rgba(255,255,255,.16);border-radius:6px;"></canvas><small id="planetaryFieldHint" style="display:block;margin-top:5px;color:#a7f3d0;">Follow the field beacons · use E or Explore nearby</small><button id="planetaryJournalBtn" type="button" style="display:block;width:100%;margin-top:8px;padding:8px 10px;border:1px solid rgba(167,243,208,.5);border-radius:6px;color:#eafff6;background:rgba(16,82,65,.66);font:700 10px Inter,sans-serif;cursor:pointer;">Open Journal &amp; Field Guide</button>`;
  panel.querySelector('#planetaryJournalBtn')?.addEventListener('click', () => appCtx.openPlanetaryJournal?.('journal'));
  panel.style.display = 'block';
}

function showReturnButton(pack) {
  let button = document.getElementById('solidWorldReturnBtn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'solidWorldReturnBtn';
    button.className = 'game-btn';
    button.style.cssText = 'position:fixed;top:82px;right:20px;z-index:1000;padding:10px 20px;font-size:16px;background:#315d9d;color:#fff;border:1px solid #8ab4ff;border-radius:5px;cursor:pointer;';
    button.addEventListener('click', () => appCtx.startSpaceFlightToEarth?.());
    document.body.appendChild(button);
  }
  button.textContent = `Leave ${getAstronomicalBody(pack.bodyId).name}`;
  const compact = globalThis.innerWidth <= 600;
  const panelBottom = document.getElementById('solidWorldPanel')?.getBoundingClientRect?.().bottom;
  const compactTop = Number.isFinite(panelBottom) ? Math.ceil(panelBottom + 10) : 330;
  button.style.setProperty('top', compact ? `${compactTop}px` : '82px', compact ? 'important' : '');
  button.style.right = compact ? '10px' : '20px';
  button.style.display = 'block';
}

function setSolidWorldInterfaceActive(active) {
  ['hud', 'minimap', 'minimapZoomControls', 'coords'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = active ? 'none' : '';
  });
  document.body?.classList.toggle('solid-world-active', !!active);
}

function hideActiveWorld() {
  appCtx.clearBlockBuilderForWorldReload?.();
  appCtx.clearPlanetaryFieldActivities?.();
  appCtx.clearPlanetarySky?.();
  if (activePack) {
    const world = worldCache.get(activePack.bodyId);
    if (world) {
      world.surface.visible = false;
      if (world.surface.parent === appCtx.scene) appCtx.scene.remove(world.surface);
      world.objects.forEach((object) => {
        object.visible = false;
        if (object.parent === appCtx.scene) appCtx.scene.remove(object);
      });
    }
  }
  document.getElementById('solidWorldPanel')?.style.setProperty('display', 'none');
  document.getElementById('solidWorldReturnBtn')?.style.setProperty('display', 'none');
  appCtx.activePlanetaryBodyId = null;
  appCtx.activeSolidWorldSurface = null;
  appCtx.activePlanetaryEnvironment = null;
  appCtx.planetaryTravelCapabilities = null;
  setSolidWorldInterfaceActive(false);
  if (priorWorldPresentation) {
    if (appCtx.renderer && Number.isFinite(priorWorldPresentation.exposure)) {
      appCtx.renderer.toneMappingExposure = priorWorldPresentation.exposure;
    }
    if (appCtx.camera && Number.isFinite(priorWorldPresentation.cameraFar)) {
      appCtx.camera.far = priorWorldPresentation.cameraFar;
      appCtx.camera.updateProjectionMatrix?.();
    }
    if (appCtx.scene) {
      appCtx.scene.background = priorWorldPresentation.background;
      appCtx.scene.fog = priorWorldPresentation.fog;
    }
    if (appCtx.sun) {
      if (priorWorldPresentation.sunColor != null) appCtx.sun.color?.setHex?.(priorWorldPresentation.sunColor);
      if (Number.isFinite(priorWorldPresentation.sunIntensity)) appCtx.sun.intensity = priorWorldPresentation.sunIntensity;
    }
    if (appCtx.ambientLight && Number.isFinite(priorWorldPresentation.ambientIntensity)) {
      appCtx.ambientLight.intensity = priorWorldPresentation.ambientIntensity;
    }
    if (appCtx.fillLight && Number.isFinite(priorWorldPresentation.fillIntensity)) {
      appCtx.fillLight.intensity = priorWorldPresentation.fillIntensity;
    }
    priorWorldPresentation = null;
  }
  activePack = null;
}

async function arriveAtSolidWorld(bodyInput) {
  const bodyId = normalizeAstronomicalBodyId(bodyInput);
  const pack = SOLID_WORLD_PACKS[bodyId];
  if (!pack) return false;
  const requestId = ++transitionId;
  const body = getAstronomicalBody(bodyId);
  appCtx.showLoad?.(`Preparing ${body.name} surface...`, {
    background: body.presentation.globalTexturePath,
    mode: 'space',
    overlay: 0.38,
    bold: true
  });
  try {
  suspendEarthModesForPlanetaryEntry(ENV.PLANETARY);
  appCtx.setPauseReason?.('planetary_transition', true);
  const world = await createSolidWorld(pack);
  if (requestId !== transitionId) return false;
  activePack = pack;
  appCtx.activePlanetaryBodyId = bodyId;
  appCtx.activeSolidWorldSurface = world.surface;
  const environment = samplePhysicalEnvironment(bodyId, { heightM: 0, timestampS: Date.now() / 1000 });
  appCtx.activePlanetaryEnvironment = environment;
  appCtx.planetaryTravelCapabilities = pack.capabilities;
  appCtx.activatePlanetaryFieldActivities?.(pack, world, (x, z) => sampleModeledRelief(pack, x, z));
  if (!priorWorldPresentation) {
    priorWorldPresentation = {
      exposure: Number(appCtx.renderer?.toneMappingExposure),
      cameraFar: Number(appCtx.camera?.far),
      background: appCtx.scene?.background || null,
      fog: appCtx.scene?.fog || null,
      sunColor: appCtx.sun?.color?.getHex?.(),
      sunIntensity: Number(appCtx.sun?.intensity),
      ambientIntensity: Number(appCtx.ambientLight?.intensity),
      fillIntensity: Number(appCtx.fillLight?.intensity)
    };
  }
  appCtx.scene.background = new THREE.Color(pack.skyColor);
  appCtx.scene.fog = pack.fogColor == null ? null : new THREE.FogExp2(pack.fogColor, pack.fogDensity);
  if (appCtx.renderer) appCtx.renderer.toneMappingExposure = pack.exposure;
  if (appCtx.camera) {
    appCtx.camera.far = Math.max(30_000, appCtx.camera.far);
    appCtx.camera.updateProjectionMatrix?.();
  }
  if (appCtx.sun) {
    appCtx.sun.color?.setHex?.(pack.sunColor);
    appCtx.sun.intensity = pack.sunIntensity;
    appCtx.sun.position.set(-160, 220, 70);
  }
  if (appCtx.ambientLight) appCtx.ambientLight.intensity = pack.ambientIntensity;
  if (appCtx.fillLight) appCtx.fillLight.intensity = pack.fillIntensity;
  appCtx.setTravelMode?.('drive', { source: `${bodyId}_arrival`, emitTutorial: false });
  positionPlayer(pack);
  await appCtx.setPlanetaryVehicle?.(bodyId);
  if (requestId !== transitionId) return false;
  appCtx.setPlanetaryCharacter?.(bodyId);
  appCtx.setPlanetarySky?.(bodyId);
  if (!commitEnvironment(ENV.PLANETARY, { source: `${bodyId}_arrival` })) return false;
  appCtx.refreshBlockBuilderForCurrentLocation?.();
  showWorldPanel(pack, environment);
  showReturnButton(pack);
  setSolidWorldInterfaceActive(true);
  appCtx.syncTravelModeButtons?.();
  appCtx.updateControlsModeUI?.();
  return true;
  } finally {
    if (requestId === transitionId) {
      appCtx.hideLoad?.();
      appCtx.setPauseReason?.('planetary_transition', false);
    }
  }
}

function sampleActiveSolidWorldHeight(x, z) {
  return activePack ? sampleModeledRelief(activePack, x, z) : null;
}

registerEnvironmentLifecycle(ENV.PLANETARY, {
  exitSync: hideActiveWorld,
  snapshot: () => ({
    active: getEnv() === ENV.PLANETARY,
    bodyId: activePack?.bodyId || null,
    regionId: activePack?.manifest.regionId || null,
    surfaceVisible: !!appCtx.activeSolidWorldSurface?.visible
  })
});

Object.assign(appCtx, {
  arriveAtSolidWorld,
  sampleActiveSolidWorldHeight
});

export {
  arriveAtSolidWorld,
  sampleActiveSolidWorldHeight,
  SOLID_WORLD_PACKS
};
