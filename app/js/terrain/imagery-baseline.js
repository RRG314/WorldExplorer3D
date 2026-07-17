import { ctx as appCtx } from "../shared-context.js?v=55";

const WORLD_IMAGERY_TILE_URL = (z, x, y) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

function applyImageryMaterial(material, texture) {
  material.map = texture;
  material.color.setHex(0xffffff);
  if (material.emissive) material.emissive.setHex(0xffffff);
  material.emissiveMap = texture;
  material.emissiveIntensity = 0.035;
  material.needsUpdate = true;
}

function configureImageryTexture(texture) {
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
    texture.encoding = THREE.sRGBEncoding;
  }
  texture.needsUpdate = true;
  return texture;
}

export function queueTerrainImagery(mesh, z, x, y) {
  if (!mesh?.material || Array.isArray(mesh.material) || mesh.userData?.terrainDisposed) return null;
  if (mesh.userData.terrainImageryPromise || mesh.userData.terrainImageryStatus === 'ready') {
    return mesh.userData.terrainImageryPromise || Promise.resolve(mesh.userData.terrainImageryTexture);
  }

  mesh.userData.terrainImageryStatus = 'loading';
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const promise = new Promise((resolve) => {
    loader.load(
      WORLD_IMAGERY_TILE_URL(z, x, y),
      (loadedTexture) => {
        const texture = configureImageryTexture(loadedTexture);
        if (mesh.userData?.terrainDisposed || !mesh.material || Array.isArray(mesh.material)) {
          texture.dispose();
          resolve(null);
          return;
        }
        mesh.userData.terrainImageryTexture = texture;
        mesh.userData.terrainImageryStatus = 'ready';
        mesh.userData.terrainImageryPromise = null;
        applyImageryMaterial(mesh.material, texture);
        resolve(texture);
      },
      undefined,
      () => {
        if (mesh.userData) {
          mesh.userData.terrainImageryStatus = 'unavailable';
          mesh.userData.terrainImageryPromise = null;
        }
        resolve(null);
      }
    );
  });
  mesh.userData.terrainImageryPromise = promise;
  return promise;
}

export const TERRAIN_IMAGERY_ATTRIBUTION = 'Imagery © Esri and source providers';
