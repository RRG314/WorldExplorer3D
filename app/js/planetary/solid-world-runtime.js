import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { ENV, getEnv } from '../env.js?v=58';
import {
  commitEnvironment,
  registerEnvironmentLifecycle
} from '../session-coordinator.js?v=2';
import { suspendEarthModesForPlanetaryEntry } from './entry.js?v=9';
import { configureColorTexture } from './catalog.js?v=1';
import { playSurfacePodLaunch } from './surface-pod-launch.js?v=8';
import { samplePhysicalEnvironment } from './runtime/physical-environment.js?v=2';
import { clearActivePlanetaryObstacles, setActivePlanetaryObstacles } from './runtime/obstacle-authority.js?v=1';
import {
  CALORIS_PLANITIA_SURFACE_REGION,
  CERES_OCCATOR_SURFACE_REGION,
  ENCELADUS_SOUTH_POLAR_SURFACE_REGION,
  ensurePlanetarySurfaceAuthority,
  EUROPA_CONAMARA_SURFACE_REGION,
  IO_TVASHTAR_SURFACE_REGION,
  MAXWELL_MONTES_SURFACE_REGION,
  PLUTO_SPUTNIK_SURFACE_REGION,
  registerModeledSurfaceRegion,
  TITAN_SHANGRI_LA_SURFACE_REGION,
  TRITON_CANTALOUPE_SURFACE_REGION,
  VESTA_RHEASILVIA_SURFACE_REGION
} from './runtime/surface-authority.js?v=4';

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
const runtimeWorldPacks = new Map();
let activePack = null;
let transitionId = 0;
let priorWorldPresentation = null;
let activeReturnPod = null;
let unregisterReturnPodInteraction = null;

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

function mountainMass(x, z, centerX, centerZ, radiusX, radiusZ, height) {
  const dx = (x - centerX) / radiusX;
  const dz = (z - centerZ) / radiusZ;
  const distance = dx * dx + dz * dz;
  if (distance >= 1) return 0;
  const shoulder = (1 - distance) ** 1.55;
  return height * shoulder;
}

function localCoordinates(pack, x, z) {
  return { x: x - Number(pack.spawn?.x || 0), z: z - Number(pack.spawn?.z || 0) };
}

function sampleModeledRelief(pack, x, z) {
  const noise = deterministicNoise(x, z, pack.detailSeed);
  const local = localCoordinates(pack, x, z);
  const amplitude = Math.max(0.65, Number(pack.reliefAmplitude || 1));
  if (pack.reliefKind === 'tectonic-highlands') {
    const westernRange = mountainMass(local.x, local.z, -1_050, -720, 1_050, 760, 620);
    const easternRange = mountainMass(local.x, local.z, 1_180, 380, 920, 1_260, 510);
    const distantPeak = mountainMass(local.x, local.z, 120, -1_850, 760, 900, 780);
    const ridge = Math.abs(Math.sin((local.x * 0.0021) + Math.sin(local.z * 0.0008) * 2.4)) ** 3 * 92;
    const valley = -85 * Math.exp(-((local.x - 120) ** 2 + (local.z + 90) ** 2) / 560_000);
    return (westernRange + easternRange + distantPeak + ridge + valley + noise * 34) * amplitude;
  }
  if (pack.reliefKind === 'basalt-highlands') {
    const plateauA = mountainMass(local.x, local.z, -760, -480, 1_280, 1_050, 390);
    const plateauB = mountainMass(local.x, local.z, 1_350, 820, 1_100, 900, 330);
    const scarps = Math.max(0, Math.sin((local.x - local.z) * 0.0018)) ** 5 * 120;
    const caldera = craterRelief(local.x, local.z, 520, -1_050, 640, 150);
    return (plateauA + plateauB + scarps + caldera + noise * 28) * amplitude;
  }
  if (pack.reliefKind === 'glacial-mountains') {
    const spine = mountainMass(local.x, local.z, -420, -1_000, 720, 1_650, 720);
    const horn = mountainMass(local.x, local.z, 1_080, -180, 650, 780, 560);
    const trough = -110 * Math.exp(-((local.x + 80) ** 2 + (local.z - 420) ** 2) / 780_000);
    const fractures = Math.abs(Math.sin((local.x + local.z * 0.28) * 0.0031)) ** 8 * 48;
    return (spine + horn + trough + fractures + noise * 22) * amplitude;
  }
  if (pack.reliefKind === 'fractured-highlands') {
    const northMassif = mountainMass(local.x, local.z, -880, -1_120, 940, 1_220, 590);
    const southMassif = mountainMass(local.x, local.z, 1_050, 940, 1_180, 980, 470);
    const faultA = Math.max(0, Math.sin((local.x + local.z * 0.46) * 0.0024)) ** 6 * 105;
    const faultB = Math.max(0, Math.cos((local.z - local.x * 0.22) * 0.0017)) ** 8 * 72;
    const basin = -96 * Math.exp(-((local.x - 50) ** 2 + (local.z + 120) ** 2) / 720_000);
    return (northMassif + southMassif + faultA + faultB + basin + noise * 30) * amplitude;
  }
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
  if (!asset) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const image = context.createImageData(size, size);
    let seed = (Number(pack.detailSeed) || 1) >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const phaseA = random() * Math.PI * 2;
    const phaseB = random() * Math.PI * 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const broad = Math.sin(x * 0.055 + phaseA) * 15 + Math.sin(y * 0.071 + phaseB) * 12;
        const grain = (random() - 0.5) * 34;
        const value = Math.max(72, Math.min(224, Math.round(154 + broad + grain)));
        const index = (y * size + x) * 4;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    const texture = configureColorTexture(new THREE.CanvasTexture(canvas), appCtx.renderer);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    texture.anisotropy = Math.min(4, appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    return Promise.resolve(texture);
  }
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

function visualHorizonRegions(manifest, outerExtent = 45_000) {
  const bounds = manifest.localBounds;
  const extent = Math.max(
    Number(outerExtent) || 0,
    Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minZ), Math.abs(bounds.maxZ)
  );
  const overlap = 24;
  return Object.freeze([
    Object.freeze({ id: 'north', minX: -extent, maxX: extent, minZ: -extent, maxZ: bounds.minZ + overlap }),
    Object.freeze({ id: 'south', minX: -extent, maxX: extent, minZ: bounds.maxZ - overlap, maxZ: extent }),
    Object.freeze({ id: 'west', minX: -extent, maxX: bounds.minX + overlap, minZ: bounds.minZ, maxZ: bounds.maxZ }),
    Object.freeze({ id: 'east', minX: bounds.maxX - overlap, maxX: extent, minZ: bounds.minZ, maxZ: bounds.maxZ })
  ]);
}

function addVisualSurfaceHorizon(pack, world) {
  const regions = visualHorizonRegions(pack.manifest);
  regions.forEach((region) => {
    const width = region.maxX - region.minX;
    const depth = region.maxZ - region.minZ;
    const centerX = (region.minX + region.maxX) * 0.5;
    const centerZ = (region.minZ + region.maxZ) * 0.5;
    const geometry = new THREE.PlaneGeometry(
      width,
      depth,
      Math.max(2, Math.min(96, Math.ceil(width / 1_200))),
      Math.max(2, Math.min(64, Math.ceil(depth / 1_200)))
    );
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      positions.setY(
        index,
        sampleModeledRelief(pack, positions.getX(index) + centerX, positions.getZ(index) + centerZ) - 1.2
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = world.surface.material.clone();
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    const horizon = new THREE.Mesh(geometry, material);
    horizon.name = `${pack.bodyId} modeled horizon ${region.id}`;
    horizon.position.set(
      pack.manifest.renderPlacement.x + centerX,
      pack.manifest.renderPlacement.y,
      pack.manifest.renderPlacement.z + centerZ
    );
    horizon.receiveShadow = true;
    horizon.frustumCulled = false;
    horizon.userData.planetaryBody = pack.bodyId;
    horizon.userData.truthClass = 'generated_game_detail';
    horizon.userData.collisionAuthority = false;
    horizon.userData.description = 'Modeled visual continuation outside the accepted traversable surface region.';
    world.objects.push(horizon);
    appCtx.scene.add(horizon);
  });
}

function addExpeditionReturnPod(pack, world) {
  if (!['expedition-contact', 'destination-mission', 'space-flight'].includes(pack.returnMode)) return null;
  if (world.returnPod) {
    world.returnPod.visible = true;
    if (world.returnPod.parent !== appCtx.scene) appCtx.scene.add(world.returnPod);
    return world.returnPod;
  }
  const group = new THREE.Group();
  group.name = `expedition-return-pod:${pack.bodyId}`;
  const shell = new THREE.MeshStandardMaterial({ color: 0xb8c6cc, metalness: 0.48, roughness: 0.3 });
  const shellPanel = new THREE.MeshStandardMaterial({ color: 0x536d79, metalness: 0.64, roughness: 0.28 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b2c36, metalness: 0.72, roughness: 0.27 });
  const heatShield = new THREE.MeshStandardMaterial({ color: 0x282d30, metalness: 0.18, roughness: 0.78 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3b7c94, emissive: 0x123e51, emissiveIntensity: 0.48, metalness: 0.12, roughness: 0.16, transparent: true, opacity: 0.82 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x6fe8ff, emissive: 0x2fa9c8, emissiveIntensity: 0.82, metalness: 0.08, roughness: 0.25 });
  const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.75, 3.8, 32), shell);
  cabin.position.y = 2.45;
  cabin.name = 'return-pod-pressure-cabin';
  cabin.castShadow = true;
  group.add(cabin);
  for (let index = 0; index < 10; index += 1) {
    const angle = index / 10 * Math.PI * 2;
    const longeron = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.42, 0.12), index % 2 ? frame : shellPanel);
    longeron.position.set(Math.sin(angle) * 1.58, 2.45, Math.cos(angle) * 1.58);
    longeron.rotation.y = angle;
    longeron.name = `return-pod-longeron-${index + 1}`;
    longeron.castShadow = true;
    group.add(longeron);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.45, 32), shellPanel);
  roof.position.y = 5.05;
  roof.name = 'return-pod-aeroshell';
  roof.castShadow = true;
  group.add(roof);
  const dockingCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.52, 0.3, 24), frame);
  dockingCollar.position.y = 5.72;
  dockingCollar.name = 'return-pod-docking-collar';
  group.add(dockingCollar);
  const dockingSeal = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 8, 28), accent);
  dockingSeal.rotation.x = Math.PI / 2;
  dockingSeal.position.y = 5.88;
  dockingSeal.name = 'return-pod-docking-seal';
  group.add(dockingSeal);
  [1.12, 3.72, 4.52].forEach((height, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(index === 2 ? 1.34 : 1.57, index === 1 ? 0.09 : 0.12, 8, 32), frame);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height;
    ring.name = `return-pod-structural-ring-${index + 1}`;
    group.add(ring);
  });
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.62, 0.32, 32), heatShield);
  shield.position.y = 0.52;
  shield.name = 'return-pod-heat-shield';
  group.add(shield);
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.09), heatShield);
    tile.position.set(Math.sin(angle) * 1.7, 0.66, Math.cos(angle) * 1.7);
    tile.rotation.y = angle;
    tile.name = `return-pod-heat-tile-${index + 1}`;
    group.add(tile);
  }
  const windowMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), glass);
  windowMesh.scale.set(1, 0.72, 0.42);
  windowMesh.rotation.x = Math.PI / 2;
  windowMesh.position.set(0, 3.55, -1.55);
  windowMesh.name = 'return-pod-forward-window';
  group.add(windowMesh);
  [-1, 1].forEach((side) => {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.76, 0.08), glass);
    sideWindow.position.set(side * 1.49, 3.28, -0.34);
    sideWindow.rotation.y = side * Math.PI / 2;
    sideWindow.name = `return-pod-side-window-${side < 0 ? 'port' : 'starboard'}`;
    group.add(sideWindow);
    const servicePanel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.14, 0.09), shellPanel);
    servicePanel.position.set(side * 1.62, 2.18, 0.34);
    servicePanel.rotation.y = side * Math.PI / 2;
    servicePanel.name = `return-pod-service-panel-${side < 0 ? 'port' : 'starboard'}`;
    group.add(servicePanel);
    const rcsHousing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.76), frame);
    rcsHousing.position.set(side * 1.72, 4.08, 0.22);
    rcsHousing.name = `return-pod-rcs-${side < 0 ? 'port' : 'starboard'}`;
    group.add(rcsHousing);
    [-0.16, 0.16].forEach((zOffset) => {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.14, 0.28, 12), heatShield);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(side * 2.02, 4.08, 0.22 + zOffset);
      group.add(nozzle);
    });
  });
  [[-1.25, 0.72], [1.25, 0.72], [-1.3, -0.25], [1.3, -0.25]].forEach(([side, z], index) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, 0.18), frame);
    leg.position.set(side, 0.75, z);
    leg.rotation.z = side < 0 ? -0.22 : 0.22;
    leg.name = `return-pod-landing-strut-${index + 1}`;
    group.add(leg);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.16, 18), frame);
    pad.position.set(side * 1.15, -0.32, z);
    pad.name = `return-pod-landing-pad-${index + 1}`;
    group.add(pad);
  });
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 3.1), frame);
  ramp.rotation.x = -0.28;
  ramp.position.set(0, 0.58, -2.45);
  ramp.name = 'return-pod-boarding-ramp';
  group.add(ramp);
  [-0.82, 0.82].forEach((side, sideIndex) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.72), shellPanel);
    rail.position.set(side, 1.14, -2.44);
    rail.rotation.x = -0.28;
    rail.name = `return-pod-ramp-rail-${sideIndex + 1}`;
    group.add(rail);
    [-1.08, 0, 1.08].forEach((offset, postIndex) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), frame);
      post.position.set(side, 0.9 + offset * 0.076, -2.44 + offset);
      post.name = `return-pod-ramp-post-${sideIndex + 1}-${postIndex + 1}`;
      group.add(post);
    });
  });
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.75, 0.12), frame);
  hatch.position.set(0, 2.05, -1.73);
  hatch.name = 'return-pod-hatch';
  group.add(hatch);
  const hatchFrame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.02, 0.1), shellPanel);
  hatchFrame.position.set(0, 2.05, -1.67);
  hatchFrame.name = 'return-pod-hatch-frame';
  group.add(hatchFrame);
  hatch.position.z = -1.79;
  const hatchInset = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.08, 24), shellPanel);
  hatchInset.rotation.x = Math.PI / 2;
  hatchInset.position.set(0, 2.18, -1.81);
  hatchInset.name = 'return-pod-hatch-inset';
  group.add(hatchInset);
  const hatchStatus = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.13, 0.05), accent);
  hatchStatus.position.set(0, 1.39, -1.82);
  hatchStatus.name = 'return-pod-hatch-status';
  group.add(hatchStatus);
  [-0.46, 0.46].forEach((side, index) => {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.06), accent);
    handle.position.set(side, 2.05, -1.87);
    handle.name = `return-pod-hatch-handle-${index + 1}`;
    group.add(handle);
  });
  for (let index = 0; index < 6; index += 1) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.045), heatShield);
    vent.position.set(0, 2.15 + index * 0.14, 1.69);
    vent.name = `return-pod-aft-vent-${index + 1}`;
    group.add(vent);
  }
  [-0.42, 0, 0.42].forEach((offset) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 2.55), accent);
    strip.position.set(offset, 0.74, -2.48);
    strip.rotation.x = -0.28;
    group.add(strip);
  });
  const beacon = new THREE.PointLight(0x6fe8ff, 1.35, 14, 2);
  beacon.position.set(0, 4.8, 0);
  group.add(beacon);
  const beaconLens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 18), accent);
  beaconLens.position.set(0, 6.04, 0);
  group.add(beaconLens);
  const offsetX = 9;
  const offsetZ = 7;
  const x = Number(pack.spawn.x) + offsetX;
  const z = Number(pack.spawn.z) + offsetZ;
  const y = Number(pack.manifest.renderPlacement.y) + sampleModeledRelief(pack, x, z) + 0.36;
  group.position.set(x, y, z);
  const toSpawnX = Number(pack.spawn.x) - x;
  const toSpawnZ = Number(pack.spawn.z) - z;
  group.rotation.y = Math.atan2(-toSpawnX, -toSpawnZ);
  group.scale.setScalar(0.9);
  group.userData.bodyId = pack.bodyId;
  group.userData.boardingRadius = 5.5;
  group.userData.authority = 'expedition-pod-journey';
  world.returnPod = group;
  world.objects.push(group);
  appCtx.scene.add(group);
  return group;
}

function returnPodDistance() {
  if (!activeReturnPod) return Infinity;
  const walker = appCtx.Walk?.state?.mode === 'walk' ? appCtx.Walk.state.walker : null;
  const actor = walker || appCtx.car;
  if (!actor) return Infinity;
  return Math.hypot(Number(actor.x || 0) - activeReturnPod.position.x, Number(actor.z || 0) - activeReturnPod.position.z);
}

function startReturnPodLaunch() {
  if (!activePack || !activeReturnPod || returnPodDistance() > Number(activeReturnPod.userData.boardingRadius || 5.5)) {
    appCtx.showToast?.('Approach the pod ramp to board.');
    return false;
  }
  if (activePack.returnMode === 'expedition-contact') return appCtx.leaveExpeditionSurface?.(activePack.bodyId) === true;
  if (activePack.returnMode === 'destination-mission') return appCtx.leaveDestinationMissionSurface?.(activePack.bodyId) === true;
  if (activePack.returnMode === 'space-flight') {
    return playSurfacePodLaunch(appCtx, {
      bodyId: activePack.bodyId,
      pod: activeReturnPod,
      onCommit: () => appCtx.startSpaceFlightFromExpeditionSurface?.({
        frameId: activePack.parentSystemId,
        courseDestinationId: activePack.bodyId
      }) === true,
      onFailure: () => appCtx.showToast?.('Pathfinder remained on the surface.')
    }) === true;
  }
  return false;
}

function ensureReturnPodInteraction() {
  if (unregisterReturnPodInteraction || typeof appCtx.registerContextInteraction !== 'function') return;
  unregisterReturnPodInteraction = appCtx.registerContextInteraction({
    id: 'expedition-return-pod',
    priority: 96,
    evaluate() {
      const distance = returnPodDistance();
      if (!activeReturnPod || !Number.isFinite(distance) || distance > Number(activeReturnPod.userData.boardingRadius || 5.5)) return null;
      return {
        available: true,
        action: 'board-return-pod',
        label: 'Board Pathfinder for Solis Reach',
        detail: 'Surface launch and ship rendezvous',
        distance,
        data: { bodyId: activePack?.bodyId || null }
      };
    },
    perform: startReturnPodLaunch
  });
}

async function createSolidWorld(pack) {
  const cached = worldCache.get(pack.bodyId);
  const authority = ensurePlanetarySurfaceAuthority(appCtx);
  if (cached) {
    cached.pack = pack;
    const activation = authority.activate(pack.manifest.regionId);
    if (activation.status !== 'accepted') throw new Error(`${pack.title} surface activation failed.`);
    cached.surface.visible = true;
    if (cached.surface.parent !== appCtx.scene) appCtx.scene.add(cached.surface);
    cached.objects.forEach((object) => {
      object.visible = true;
      if (object.parent !== appCtx.scene) appCtx.scene.add(object);
    });
    addExpeditionReturnPod(pack, cached);
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
    surface.userData.textureTruthClass = pack.runtimeModeled ? 'generated_model_material' : 'derived_from_observations';
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
  addVisualSurfaceHorizon(pack, world);
  addGeneratedSurfaceDetail(pack, world);
  await addParentBodyView(pack, world);
  addExpeditionReturnPod(pack, world);
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
    appCtx.carMesh.visible = pack.arrivalMode !== 'walk';
  }
  if (pack.arrivalMode === 'walk' && appCtx.Walk?.state?.walker) {
    Object.assign(appCtx.Walk.state.walker, {
      x: pack.spawn.x,
      z: pack.spawn.z,
      y: ground + 1.2,
      angle: pack.spawn.angle,
      yaw: pack.spawn.angle,
      lookYawOffset: 0,
      pitch: 0,
      vy: 0,
      onGround: true
    });
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
  const gravityG = Number(environment.gravityMagnitudeMps2 || environment.gravityMps2 || 0) / 9.80665;
  const wind = environment.windVectorMps || { eastMps: 0, northMps: 0, upMps: 0 };
  const windSpeed = Math.hypot(Number(wind.eastMps || 0), Number(wind.northMps || 0), Number(wind.upMps || 0));
  const weather = environment.weatherModelId && environment.weatherModelId !== 'none'
    ? `${environment.weatherLabel || String(environment.weatherModelId).replaceAll('_', ' ')} · ${windSpeed.toFixed(1)} m/s wind`
    : environment.atmosphereEvidence === 'unconfirmed'
      ? 'Atmosphere unresolved · weather unavailable'
      : 'No active weather model';
  const outpost = pack.outpost?.state === 'operational' ? `<section style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(125,243,208,.24);"><strong style="display:block;color:#91f2d3;">${pack.outpost.name}</strong><small>${String(pack.outpost.operationsStatus || 'operational').replaceAll('-', ' ')} · ${pack.outpost.assignedCrewIds.length} crew · ${Math.round(Number(pack.outpost.condition || 0) * 100)}% condition · ${Number(pack.outpost.power?.storedMWh || 0).toFixed(1)} MWh stored</small></section>` : '';
  panel.innerHTML = `<strong style="display:block;font-size:14px;margin-bottom:4px;">${pack.title}</strong><span>${pack.context}</span><br><span>${pressure} · ${temperatureC}°C · ${gravityG.toFixed(2)}g</span><br><span>${pack.landformLabel || String(pack.reliefKind || 'modeled terrain').replaceAll('-', ' ')} · ${weather}</span><br><small style="opacity:.72;">${pack.representation}</small>${outpost}<canvas id="planetaryFieldMap" width="220" height="105" style="display:block;width:220px;max-width:100%;height:105px;margin-top:8px;border:1px solid rgba(255,255,255,.16);border-radius:6px;"></canvas><small id="planetaryFieldHint" style="display:block;margin-top:5px;color:#a7f3d0;">Follow the field beacons · use E or Explore nearby</small><button id="planetaryJournalBtn" type="button" style="display:block;width:100%;margin-top:8px;padding:8px 10px;border:1px solid rgba(167,243,208,.5);border-radius:6px;color:#eafff6;background:rgba(16,82,65,.66);font:700 10px Inter,sans-serif;cursor:pointer;">Open Journal &amp; Field Guide</button>`;
  panel.querySelector('#planetaryJournalBtn')?.addEventListener('click', () => appCtx.openPlanetaryJournal?.('journal'));
  panel.style.display = 'block';
}

function renderActiveExpeditionOutpost() {
  const pack = activePack;
  const outpost = pack?.outpost;
  if (!pack || outpost?.state !== 'operational' || !Array.isArray(outpost.blueprint)) return 0;
  const originX = Math.round(Number(pack.spawn?.x || 0) + 58);
  const originZ = Math.round(Number(pack.spawn?.z || 0) + 24);
  const originY = Math.round((Number(pack.manifest?.renderPlacement?.y || 0) + sampleModeledRelief(pack, originX, originZ)) * 2) / 2;
  let placed = 0;
  for (const block of outpost.blueprint) {
    if (appCtx.placeBuildBlock?.(
      originX + Number(block.gx || 0),
      originY + Number(block.gy || 0),
      originZ + Number(block.gz || 0),
      Number(block.materialIndex || 0),
      {
        persist: false,
        enforceLimit: false,
        authority: 'expedition-outpost',
        shape: block.shape,
        rotation: block.rotation
      }
    )) placed += 1;
  }
  return placed;
}

function showReturnButton(pack) {
  let button = document.getElementById('solidWorldReturnBtn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'solidWorldReturnBtn';
    button.className = 'game-btn';
    button.style.cssText = 'position:fixed;top:82px;right:20px;z-index:1000;padding:10px 20px;font-size:16px;background:#315d9d;color:#fff;border:1px solid #8ab4ff;border-radius:5px;cursor:pointer;';
    button.addEventListener('click', () => {
      if (['expedition-contact', 'destination-mission', 'space-flight'].includes(activePack?.returnMode)) {
        const distance = returnPodDistance();
        if (distance <= Number(activeReturnPod?.userData?.boardingRadius || 5.5)) startReturnPodLaunch();
        else appCtx.showToast?.(`Return pod is ${Math.round(distance)} m away. Approach its ramp and use Interact.`);
        return;
      }
      appCtx.startSpaceFlightToEarth?.();
    });
    document.body.appendChild(button);
  }
  button.textContent = ['expedition-contact', 'destination-mission', 'space-flight'].includes(pack.returnMode)
    ? 'Pathfinder · approach to board'
    : `Return to Space from ${getAstronomicalBody(pack.bodyId)?.name || pack.bodyName || pack.title}`;
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
  clearActivePlanetaryObstacles();
  activeReturnPod = null;
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
  const inputId = String(typeof bodyInput === 'object' ? bodyInput.id : bodyInput || '').trim().toLowerCase();
  const bodyId = normalizeAstronomicalBodyId(inputId) || inputId;
  const pack = SOLID_WORLD_PACKS[bodyId] || runtimeWorldPacks.get(bodyId) || [...runtimeWorldPacks.values()].find((entry) => entry.bodyName.toLowerCase() === inputId);
  if (!pack) return false;
  const requestId = ++transitionId;
  const body = getAstronomicalBody(bodyId);
  appCtx.showLoad?.(`Preparing ${body?.name || pack.bodyName} surface...`, {
    background: body?.presentation?.globalTexturePath || '',
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
  activeReturnPod = world.returnPod || null;
  setActivePlanetaryObstacles(bodyId, activeReturnPod ? [Object.freeze({
    id: 'expedition-return-pod',
    x: activeReturnPod.position.x,
    z: activeReturnPod.position.z,
    radius: 1.62,
    kind: 'spacecraft-hull'
  })] : []);
  ensureReturnPodInteraction();
  appCtx.activePlanetaryBodyId = bodyId;
  appCtx.activeSolidWorldSurface = world.surface;
  const environment = pack.environment || samplePhysicalEnvironment(bodyId, { heightM: 0, timestampS: Date.now() / 1000 });
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
  appCtx.setTravelMode?.(pack.arrivalMode || 'drive', { source: `${bodyId}_arrival`, emitTutorial: false });
  positionPlayer(pack);
  await appCtx.setPlanetaryVehicle?.(pack.vehicleBodyId || bodyId);
  if (requestId !== transitionId) return false;
  appCtx.setPlanetaryCharacter?.(pack.vehicleBodyId || bodyId);
  const surfaceStarOpacity = pack.fogColor == null
    ? 0.94
    : Math.max(0.04, Math.min(0.55, 0.55 - Number(pack.fogDensity || 0) * 900));
  appCtx.setPlanetarySky?.(bodyId, new Date(), { starOpacity: surfaceStarOpacity });
  if (!commitEnvironment(ENV.PLANETARY, { source: `${bodyId}_arrival` })) return false;
  await appCtx.ensureBlockBuilderReady?.();
  if (requestId !== transitionId) return false;
  appCtx.refreshBlockBuilderForCurrentLocation?.();
  renderActiveExpeditionOutpost();
  showWorldPanel(pack, environment);
  showReturnButton(pack);
  setSolidWorldInterfaceActive(true);
  appCtx.markExpeditionPodLanded?.(bodyId);
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

function deriveExpeditionWorldProfile(input = {}) {
  const seed = Number(input.seed) >>> 0;
  const radiusEarth = Math.max(0.2, Number(input.radiusEarth) || 1);
  const massEarth = Math.max(0.05, Number(input.massEarth) || radiusEarth ** 2.7);
  const gravityMps2 = 9.80665 * massEarth / (radiusEarth ** 2);
  const starMassSolar = Math.max(0.08, Number(input.starMassSolar) || 0.5);
  const orbitAu = Math.max(0.02, Number(input.semiMajorAxisAu) || 0.5);
  const luminositySolar = Math.max(0.0001, starMassSolar ** 3.5);
  const suppliedTemperatureK = Number(input.equilibriumTemperatureK);
  const temperatureK = Math.max(45, Number.isFinite(suppliedTemperatureK) && suppliedTemperatureK > 0
    ? suppliedTemperatureK
    : 278 * luminositySolar ** 0.25 / Math.sqrt(orbitAu));
  const gravityRatio = gravityMps2 / 9.80665;
  const reliefAmplitude = Math.max(0.82, Math.min(2.35, 1 / Math.sqrt(Math.max(0.16, gravityRatio))));
  const candidateLandforms = ['tectonic-highlands', 'fractured-highlands', 'tectonic-highlands'];
  const reliefKind = input.reliefKind || (
    temperatureK > 430 ? 'basalt-highlands'
      : temperatureK < 190 ? 'glacial-mountains'
        : input.habitabilityCandidate ? candidateLandforms[seed % candidateLandforms.length]
          : ['tectonic-highlands', 'basalt-highlands', 'fractured-highlands'][seed % 3]
  );
  const landformLabel = {
    'tectonic-highlands': 'Folded highlands and deep survey valleys',
    'basalt-highlands': 'Basalt plateaus, scarps, and caldera terrain',
    'glacial-mountains': 'Ice-cut mountain spines and troughs',
    'fractured-highlands': 'Fractured peaks and fault-bounded valleys'
  }[reliefKind] || String(reliefKind).replaceAll('-', ' ');
  const basePalette = [
    { ground: 0x826f5c, rock: 0x463c35, sky: 0x030407 },
    { ground: 0x756d62, rock: 0x393733, sky: 0x020306 },
    { ground: 0x8b7154, rock: 0x4d3b2b, sky: 0x050304 },
    { ground: 0x68716d, rock: 0x343b39, sky: 0x020405 }
  ][seed % 4];
  const originalGameWorld = input.originalGameWorld === true;
  let atmosphere = {
    pressurePa: 0,
    atmosphereEvidence: 'unconfirmed',
    weatherModelId: 'none',
    weatherLabel: 'Atmosphere unresolved · weather unavailable',
    windVectorMps: Object.freeze({ eastMps: 0, northMps: 0, upMps: 0, truthClass: 'unavailable' }),
    visibilityM: 80_000,
    fogColor: null,
    fogDensity: 0,
    skyColor: basePalette.sky,
    truthClass: 'modeled',
    uncertainty: 'Temperature is an equilibrium estimate; the local atmosphere is unconfirmed and the suit model uses a vacuum-safe assumption.'
  };
  if (originalGameWorld) {
    const weatherOptions = temperatureK < 210
      ? [{ id: 'ice_crystal_squalls', label: 'Ice-crystal squalls', pressurePa: 38_000, windMps: 16, sky: 0x26384d, fog: 0xa7bdcb, density: 0.0001, visibilityM: 9_000 }]
      : temperatureK > 360
        ? [{ id: 'convective_dust_fronts', label: 'Convective dust fronts', pressurePa: 24_000, windMps: 13, sky: 0x533222, fog: 0x9b6742, density: 0.00013, visibilityM: 6_500 }]
        : [
            { id: 'variable_cloud_bands', label: 'Variable cloud bands', pressurePa: 82_000, windMps: 8, sky: 0x294a62, fog: 0x6f93a5, density: 0.000055, visibilityM: 22_000 },
            { id: 'mineral_haze_and_gusts', label: 'Mineral haze and gusts', pressurePa: 54_000, windMps: 11, sky: 0x4f4540, fog: 0x8d8177, density: 0.000075, visibilityM: 14_000 }
          ];
    const selected = weatherOptions[seed % weatherOptions.length];
    atmosphere = {
      pressurePa: selected.pressurePa,
      atmosphereEvidence: 'fictional-game-world',
      weatherModelId: selected.id,
      weatherLabel: selected.label,
      windVectorMps: Object.freeze({ eastMps: selected.windMps, northMps: selected.windMps * 0.35, upMps: 0, truthClass: 'fictional-game-world' }),
      visibilityM: selected.visibilityM,
      fogColor: selected.fog,
      fogDensity: selected.density,
      skyColor: selected.sky,
      truthClass: 'fictional-game-world',
      uncertainty: 'This atmosphere and weather are canonical conditions for an original World Explorer game world, not an astronomical observation.'
    };
  }
  return Object.freeze({
    seed,
    radiusEarth,
    massEarth,
    gravityMps2,
    gravityRatio,
    starMassSolar,
    orbitAu,
    luminositySolar,
    temperatureK,
    reliefAmplitude,
    reliefKind,
    landformLabel,
    palette: Object.freeze({ ground: basePalette.ground, rock: basePalette.rock, sky: atmosphere.skyColor }),
    atmosphere: Object.freeze(atmosphere)
  });
}

function registerExpeditionSolidWorld(input = {}) {
  const bodyId = String(input.id || '').trim().toLowerCase();
  if (!bodyId) throw new TypeError('An Expedition solid world requires a stable id.');
  if (SOLID_WORLD_PACKS[bodyId]) throw new Error(`Expedition world cannot replace catalog body: ${bodyId}`);
  if (runtimeWorldPacks.has(bodyId)) return runtimeWorldPacks.get(bodyId);
  const profile = deriveExpeditionWorldProfile(input);
  const {
    seed, radiusEarth, massEarth, gravityMps2, starMassSolar, orbitAu, luminositySolar,
    temperatureK, reliefAmplitude, reliefKind, landformLabel, palette
  } = profile;
  const atmosphere = profile.atmosphere;
  const regionId = `${bodyId}-survey-site`;
  const manifest = registerModeledSurfaceRegion({
    bodyId,
    systemId: String(input.parentSystemId || 'expedition'),
    regionId,
    displayName: `${input.name || bodyId} survey site`,
    localBounds: { minX: -8_000, maxX: 8_000, minZ: -8_000, maxZ: 8_000 },
    renderPlacement: { x: 0, y: -80, z: 0 },
    modelInputs: { seed, radiusEarth, massEarth, semiMajorAxisAu: orbitAu, starMassSolar },
    source: input.source || {
      title: 'Expedition route survey model',
      provider: 'World Explorer 3D',
      attribution: 'Seeded model derived from the saved route contact',
      rights: 'World Explorer 3D generated game content',
      processing: 'Relief and appearance are generated from the stable contact seed. No observed surface imagery or local measurement is claimed.'
    }
  });
  const pack = worldPack({
    bodyId,
    bodyName: String(input.name || bodyId),
    manifest,
    runtimeModeled: true,
    arrivalMode: 'walk',
    returnMode: input.returnMode || 'expedition-contact',
    parentSystemId: String(input.parentSystemId || 'expedition'),
    reliefKind,
    reliefAmplitude,
    landformLabel,
    detailSeed: seed || 1,
    rockColor: palette.rock,
    rockScale: 4.2,
    spawn: { x: 420, z: -360, angle: 0.7 },
    material: { color: palette.ground, roughness: 0.94, bumpScale: 1.6 },
    skyColor: palette.sky,
    fogColor: atmosphere.fogColor,
    fogDensity: atmosphere.fogDensity,
    sunColor: 0xffd7aa,
    sunIntensity: Math.max(0.04, Math.min(2.2, luminositySolar / (orbitAu ** 2))),
    ambientIntensity: 0.42,
    fillIntensity: 0.34,
    exposure: 1.28,
    title: `${input.name || bodyId} · Survey Site`,
    context: input.context || `${gravityMps2.toFixed(2)} m/s² modeled gravity · atmosphere unconfirmed`,
    representation: input.representation || 'Seeded physical model · generated relief · no observed surface imagery',
    environment: Object.freeze({
      bodyId,
      gravityMps2,
      gravityMagnitudeMps2: gravityMps2,
      pressurePa: atmosphere.pressurePa,
      temperatureK,
      atmosphereEvidence: atmosphere.atmosphereEvidence,
      weatherModelId: atmosphere.weatherModelId,
      weatherLabel: atmosphere.weatherLabel,
      windVectorMps: atmosphere.windVectorMps,
      visibilityM: atmosphere.visibilityM,
      truthClass: atmosphere.truthClass,
      uncertainty: atmosphere.uncertainty
    }),
    fieldNotes: Object.freeze((input.fieldNotes || [
      Object.freeze(['Document the survey site', 'photograph', 'places', 'Record the generated survey terrain and the model inputs used to create it.']),
      Object.freeze(['Collect geology sample', 'geology-inspect', 'rock', 'Collect one modeled field sample for Solis Reach processing. The sample represents game-world material, not a real-world observation.']),
      Object.freeze(['Survey local conditions', 'habitat-survey', 'places', 'Log the model-derived gravity and thermal estimate with their uncertainty.'])
    ]).map((entry) => Object.freeze([...entry]))),
    outpost: input.outpost || null
  });
  runtimeWorldPacks.set(bodyId, pack);
  return pack;
}

function sampleActiveSolidWorldHeight(x, z) {
  return activePack ? sampleModeledRelief(activePack, x, z) : null;
}

function getActivePlanetaryReturnPod() {
  return activeReturnPod || null;
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
  getActivePlanetaryReturnPod,
  renderActiveExpeditionOutpost,
  registerExpeditionSolidWorld,
  sampleActiveSolidWorldHeight
});

export {
  arriveAtSolidWorld,
  deriveExpeditionWorldProfile,
  getActivePlanetaryReturnPod,
  registerExpeditionSolidWorld,
  sampleActiveSolidWorldHeight,
  sampleModeledRelief,
  SOLID_WORLD_PACKS,
  visualHorizonRegions
};
