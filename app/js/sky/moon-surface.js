import { APOLLO11_TERRAIN, loadApollo11Terrain } from './moon-lroc-terrain.js?v=1';
import {
  APOLLO11_SURFACE_REGION,
  ensurePlanetarySurfaceAuthority
} from '../planetary/runtime/surface-authority.js?v=2';

function createMeasuredSurface(appCtx) {
  const geometry = new THREE.PlaneGeometry(
    APOLLO11_TERRAIN.widthMeters,
    APOLLO11_TERRAIN.lengthMeters,
    144,
    640
  );
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b8b88,
    roughness: 0.98,
    metalness: 0,
    emissive: 0x090909,
    emissiveIntensity: 0.08
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'Apollo 11 LROC measured terrain';
  surface.receiveShadow = true;
  surface.frustumCulled = false;
  surface.position.set(
    APOLLO11_SURFACE_REGION.renderPlacement.x,
    APOLLO11_SURFACE_REGION.renderPlacement.y,
    APOLLO11_SURFACE_REGION.renderPlacement.z
  );
  surface.userData = {
    moonObject: true,
    surfaceRegionId: APOLLO11_SURFACE_REGION.regionId,
    worldAddress: APOLLO11_SURFACE_REGION.address,
    worldAddressKey: APOLLO11_SURFACE_REGION.addressKey,
    terrainSource: APOLLO11_TERRAIN.source,
    sourceUrl: APOLLO11_TERRAIN.sourceUrl,
    originalResolutionMeters: APOLLO11_TERRAIN.originalDtmResolutionMeters,
    runtimeResolutionMeters: APOLLO11_TERRAIN.horizontalResolutionMeters,
    verticalScale: 1,
    coordinateSystem: 'IAU Moon planetocentric latitude / positive-east longitude'
  };
  appCtx.scene.add(surface);
  return surface;
}

function addScaleRocks(appCtx, surface, sampleHeight) {
  const count = 420;
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x777773, roughness: 1, metalness: 0 });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  let seed = 0x4c524f43;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let index = 0; index < count; index++) {
    const localX = (random() - 0.5) * APOLLO11_TERRAIN.widthMeters * 0.94;
    const localZ = (random() - 0.5) * APOLLO11_TERRAIN.lengthMeters * 0.94;
    const worldX = localX + surface.position.x;
    const worldZ = localZ + surface.position.z;
    const scale = 0.35 + Math.pow(random(), 2.4) * 3.8;
    transform.position.set(worldX, sampleHeight(localX, localZ) + surface.position.y + scale * 0.32, worldZ);
    transform.rotation.set(random() * 0.6, random() * Math.PI * 2, random() * 0.6);
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    rocks.setMatrixAt(index, transform.matrix);
    const tone = 0.3 + random() * 0.24;
    color.setRGB(tone, tone, tone * 0.97);
    rocks.setColorAt(index, color);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.userData = {
    moonObject: true,
    provenance: 'Deterministic display-scale rocks; not georeferenced survey features'
  };
  appCtx.scene.add(rocks);
  if (!Array.isArray(window._moonObjects)) window._moonObjects = [];
  window._moonObjects.push(rocks);
}

function finishMoonEntry(appCtx, createApollo11LandingSite, positionCarOnMoon) {
  if (!appCtx.onMoon) return;
  createApollo11LandingSite();
  positionCarOnMoon();
  appCtx.refreshBlockBuilderForCurrentLocation?.();
  if (appCtx.carMesh) appCtx.carMesh.visible = true;
  if (appCtx.camera) {
    appCtx.camera.position.set(appCtx.car.x, appCtx.car.y + 5, appCtx.car.z - 10);
    appCtx.camera.lookAt(appCtx.car.x, appCtx.car.y + 0.5, appCtx.car.z);
    appCtx.camera.userData.lookTarget = { x: appCtx.car.x, y: appCtx.car.y + 0.5, z: appCtx.car.z };
  }
  appCtx.setPauseReason?.('planetary_transition', false);
}

export function activateMoonSurface(appCtx) {
  const surfaceAuthority = ensurePlanetarySurfaceAuthority(appCtx);
  return surfaceAuthority.activate(APOLLO11_SURFACE_REGION.regionId);
}

export function createMoonSurface(options = {}) {
  const { appCtx, createApollo11LandingSite, positionCarOnMoon } = options;
  const surface = createMeasuredSurface(appCtx);
  const surfaceAuthority = ensurePlanetarySurfaceAuthority(appCtx);
  appCtx.moonSurface = surface;
  appCtx.moonSurfaceReady = surfaceAuthority.prepare(
    APOLLO11_SURFACE_REGION.regionId,
    async () => {
      const terrain = await loadApollo11Terrain(THREE, appCtx.renderer, surface.geometry);
      surface.material.map = terrain.albedo;
      surface.material.color.setHex(0x9a9a98);
      surface.material.needsUpdate = true;
      return {
        sampleHeight: terrain.sampleHeight,
        renderArtifact: surface,
        readyAssetIds: APOLLO11_SURFACE_REGION.assets.map((asset) => asset.id)
      };
    }
  ).then((publication) => {
      const accepted = publication.status === 'accepted';
      surface.userData.ready = accepted;
      surface.userData.surfacePublication = publication;
      if (!accepted) {
        console.error('LROC lunar terrain failed acceptance.', publication.reason);
        finishMoonEntry(appCtx, createApollo11LandingSite, positionCarOnMoon);
        return surface;
      }
      const sampleHeight = (localX, localZ) => {
        const sample = surfaceAuthority.sampleAtLocalXZ(localX, localZ, {
          bodyId: 'moon',
          regionId: APOLLO11_SURFACE_REGION.regionId
        });
        return sample.status === 'available' ? sample.local.y : 0;
      };
      addScaleRocks(appCtx, surface, sampleHeight);
      finishMoonEntry(appCtx, createApollo11LandingSite, positionCarOnMoon);
      return surface;
    })
    .catch((error) => {
      console.error('LROC lunar terrain failed to load.', error);
      surface.userData.ready = false;
      finishMoonEntry(appCtx, createApollo11LandingSite, positionCarOnMoon);
      return surface;
    });
  return surface;
}
