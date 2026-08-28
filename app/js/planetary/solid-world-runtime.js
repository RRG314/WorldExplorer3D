import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=1';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { ENV, getEnv } from '../env.js?v=58';
import {
  commitEnvironment,
  registerEnvironmentLifecycle
} from '../session-coordinator.js?v=2';
import { suspendEarthModesForPlanetaryEntry } from './entry.js?v=9';
import { configureColorTexture } from './catalog.js?v=1';
import { samplePhysicalEnvironment } from './runtime/physical-environment.js?v=1';
import {
  CALORIS_PLANITIA_SURFACE_REGION,
  ensurePlanetarySurfaceAuthority,
  MAXWELL_MONTES_SURFACE_REGION
} from './runtime/surface-authority.js?v=1';

const SOLID_WORLD_PACKS = Object.freeze({
  mercury: Object.freeze({
    bodyId: 'mercury',
    manifest: CALORIS_PLANITIA_SURFACE_REGION,
    spawn: Object.freeze({ x: 1_150, z: -620, angle: 0.7 }),
    terrainSize: 16_000,
    segments: 192,
    material: Object.freeze({ color: 0xa69a8c, roughness: 0.96, bumpScale: 4 }),
    skyColor: 0x000000,
    fogColor: null,
    sunColor: 0xfff4df,
    sunIntensity: 4.4,
    ambientIntensity: 0.12,
    title: 'Caloris Planitia, Mercury',
    context: 'Airless terrain · intense sunlight · 0.38g',
    representation: 'MESSENGER enhanced-color map · locally shaped terrain'
  }),
  venus: Object.freeze({
    bodyId: 'venus',
    manifest: MAXWELL_MONTES_SURFACE_REGION,
    spawn: Object.freeze({ x: -900, z: 1_050, angle: -1.1 }),
    terrainSize: 16_000,
    segments: 192,
    material: Object.freeze({ color: 0xc57b45, roughness: 0.88, bumpScale: 9 }),
    skyColor: 0x9a5a2e,
    fogColor: 0xb46d38,
    sunColor: 0xffc27a,
    sunIntensity: 0.8,
    ambientIntensity: 0.58,
    title: 'Maxwell Montes, Venus',
    context: 'Protected vehicle · dense CO₂ atmosphere · 0.90g',
    representation: 'Magellan radar context · modeled local relief'
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
  if (pack.bodyId === 'mercury') {
    return deterministicNoise(x, z, 17) * 13 +
      craterRelief(x, z, -1_900, 1_250, 1_050, 145) +
      craterRelief(x, z, 2_300, -2_100, 720, 105) +
      craterRelief(x, z, 850, 2_850, 430, 62) +
      Math.max(0, Math.sin((x - z) * 0.0017)) * 19;
  }
  const broadRise = 390 * Math.exp(-((x + 1_500) ** 2 + (z - 900) ** 2) / 8_500_000);
  const ridges = Math.abs(Math.sin(x * 0.0014 + Math.sin(z * 0.0011))) * 72;
  return broadRise + ridges + deterministicNoise(x, z, 29) * 22;
}

function loadSurfaceTexture(pack) {
  const asset = pack.manifest.assets[0];
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      asset.url,
      (texture) => resolve(configureColorTexture(texture, appCtx.renderer)),
      undefined,
      () => reject(new Error(`Unable to load ${pack.bodyId} surface context: ${asset.url}`))
    );
  });
}

function addGeneratedSurfaceDetail(pack, world) {
  const count = 520;
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: pack.bodyId === 'mercury' ? 0x8d857d : 0x7f3e25,
    roughness: 1,
    metalness: 0
  });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D();
  let seed = pack.bodyId === 'mercury' ? 0x4d455243 : 0x56454e55;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < count; index++) {
    const radius = 25 + Math.sqrt(random()) * 1_100;
    const theta = random() * Math.PI * 2;
    const x = pack.spawn.x + Math.cos(theta) * radius;
    const z = pack.spawn.z + Math.sin(theta) * radius;
    const scale = 0.45 + Math.pow(random(), 2.5) * (pack.bodyId === 'venus' ? 6 : 4);
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
  const temperatureC = Math.round(environment.temperatureK - 273.15);
  const pressure = environment.pressurePa >= 1000
    ? `${(environment.pressurePa / 1000).toFixed(1)} kPa`
    : `${Math.round(environment.pressurePa)} Pa`;
  panel.innerHTML = `<strong style="display:block;font-size:14px;margin-bottom:4px;">${pack.title}</strong><span>${pack.context}</span><br><span>${pressure} · ${temperatureC}°C</span><br><small style="opacity:.72;">${pack.representation}</small>`;
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
    priorWorldPresentation = null;
  }
  activePack = null;
}

async function arriveAtSolidWorld(bodyInput) {
  const bodyId = normalizeAstronomicalBodyId(bodyInput);
  const pack = SOLID_WORLD_PACKS[bodyId];
  if (!pack) return false;
  const requestId = ++transitionId;
  suspendEarthModesForPlanetaryEntry(ENV.PLANETARY);
  appCtx.setPauseReason?.('planetary_transition', true);
  const world = await createSolidWorld(pack);
  if (requestId !== transitionId) return false;
  activePack = pack;
  appCtx.activePlanetaryBodyId = bodyId;
  appCtx.activeSolidWorldSurface = world.surface;
  const environment = samplePhysicalEnvironment(bodyId, { heightM: 0, timestampS: Date.now() / 1000 });
  appCtx.activePlanetaryEnvironment = environment;
  appCtx.planetaryTravelCapabilities = bodyId === 'venus'
    ? Object.freeze({ drive: true, walk: false, drone: false, plane: false, boat: false, ocean: false, earth: false, space: false })
    : Object.freeze({ drive: true, walk: true, drone: false, plane: false, boat: false, ocean: false, earth: false, space: false });
  appCtx.scene.background = new THREE.Color(pack.skyColor);
  appCtx.scene.fog = pack.fogColor == null ? null : new THREE.FogExp2(pack.fogColor, bodyId === 'venus' ? 0.00042 : 0);
  if (!priorWorldPresentation) {
    priorWorldPresentation = {
      exposure: Number(appCtx.renderer?.toneMappingExposure),
      cameraFar: Number(appCtx.camera?.far)
    };
  }
  if (appCtx.renderer) appCtx.renderer.toneMappingExposure = bodyId === 'mercury' ? 1.18 : 1.04;
  if (appCtx.camera) {
    appCtx.camera.far = Math.max(30_000, appCtx.camera.far);
    appCtx.camera.updateProjectionMatrix?.();
  }
  if (appCtx.sun) {
    appCtx.sun.color?.setHex?.(pack.sunColor);
    appCtx.sun.intensity = pack.sunIntensity;
    appCtx.sun.position.set(-160, 220, 70);
  }
  if (appCtx.ambientLight) appCtx.ambientLight.intensity = bodyId === 'mercury' ? 0.38 : pack.ambientIntensity;
  if (appCtx.fillLight) appCtx.fillLight.intensity = bodyId === 'venus' ? 0.4 : 0.2;
  positionPlayer(pack);
  appCtx.setTravelMode?.('drive', { source: `${bodyId}_arrival`, emitTutorial: false });
  await appCtx.setPlanetaryVehicle?.(bodyId);
  if (requestId !== transitionId) return false;
  appCtx.setPlanetaryCharacter?.(bodyId);
  appCtx.setPlanetarySky?.(bodyId);
  if (!commitEnvironment(ENV.PLANETARY, { source: `${bodyId}_arrival` })) return false;
  showWorldPanel(pack, environment);
  showReturnButton(pack);
  setSolidWorldInterfaceActive(true);
  appCtx.syncTravelModeButtons?.();
  appCtx.setPauseReason?.('planetary_transition', false);
  return true;
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
