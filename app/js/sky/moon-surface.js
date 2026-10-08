import { createSurfaceDressing } from '../planetary/surface-dressing.js';
import { addSurfaceMaterialDetail } from '../planetary/surface-material-detail.js';
import { setActivePlanetaryObstacles } from '../planetary/runtime/obstacle-authority.js?v=1';
import { APOLLO11_TERRAIN, loadApollo11Terrain } from './moon-lroc-terrain.js?v=1';
import {
  APOLLO11_SURFACE_REGION,
  ensurePlanetarySurfaceAuthority
} from '../planetary/runtime/surface-authority.js?v=5';

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
  addSurfaceMaterialDetail(material, .45);
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
  const rocks = createSurfaceDressing(THREE, {
    bodyId:'moon',kind:'regolith',spawn:{x:200,z:-950},seed:0x4c524f43,
    bounds:{minX:surface.position.x-APOLLO11_TERRAIN.widthMeters/2,maxX:surface.position.x+APOLLO11_TERRAIN.widthMeters/2,
      minZ:surface.position.z-APOLLO11_TERRAIN.lengthMeters/2,maxZ:surface.position.z+APOLLO11_TERRAIN.lengthMeters/2},
    sampleHeight:(x,z)=>sampleHeight(x-surface.position.x,z-surface.position.z)+surface.position.y
  });
  rocks.userData.moonObject=true;
  surface.userData.obstacles=rocks.userData.obstacles;
  setActivePlanetaryObstacles('moon',rocks.userData.obstacles);
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
