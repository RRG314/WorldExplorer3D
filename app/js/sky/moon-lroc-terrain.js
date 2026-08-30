import { APOLLO11_SURFACE_REGION } from '../planetary/runtime/surface-authority.js?v=3';

const heightAsset = APOLLO11_SURFACE_REGION.assets.find((asset) => asset.role === 'height');
const albedoAsset = APOLLO11_SURFACE_REGION.assets.find((asset) => asset.role === 'albedo');

const APOLLO11_TERRAIN = Object.freeze({
  regionId: APOLLO11_SURFACE_REGION.regionId,
  source: APOLLO11_SURFACE_REGION.source.title,
  sourceUrl: APOLLO11_SURFACE_REGION.source.url,
  horizontalResolutionMeters: heightAsset.resolutionM,
  originalDtmResolutionMeters: 2,
  minLatitude: 0.31464201,
  maxLatitude: 1.23650584,
  minLongitude: 23.37231647,
  maxLongitude: 23.51150435,
  minElevationMeters: -2069.795166015625,
  maxElevationMeters: -1807.9019775390625,
  landingElevationMeters: -1927.6068,
  landingLatitude: 0.67416,
  landingLongitude: 23.47314,
  widthMeters: APOLLO11_SURFACE_REGION.localBounds.maxX - APOLLO11_SURFACE_REGION.localBounds.minX,
  lengthMeters: APOLLO11_SURFACE_REGION.localBounds.maxZ - APOLLO11_SURFACE_REGION.localBounds.minZ,
  heightAsset: heightAsset.url,
  albedoAsset: albedoAsset.url
});

function imageRequest(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load lunar terrain asset: ${url}`));
    image.src = url;
  });
}

function readPixels(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data
  };
}

function terrainCoordinates(latitude, longitude) {
  const u = (longitude - APOLLO11_TERRAIN.minLongitude) /
    (APOLLO11_TERRAIN.maxLongitude - APOLLO11_TERRAIN.minLongitude);
  const row = (APOLLO11_TERRAIN.maxLatitude - latitude) /
    (APOLLO11_TERRAIN.maxLatitude - APOLLO11_TERRAIN.minLatitude);
  return {
    x: (u - 0.5) * APOLLO11_TERRAIN.widthMeters,
    z: (row - 0.5) * APOLLO11_TERRAIN.lengthMeters
  };
}

const landingLocal = terrainCoordinates(
  APOLLO11_TERRAIN.landingLatitude,
  APOLLO11_TERRAIN.landingLongitude
);

function createHeightSampler(heightData) {
  const elevationRange = APOLLO11_TERRAIN.maxElevationMeters - APOLLO11_TERRAIN.minElevationMeters;
  return (localX, localZ) => {
    const u = Math.max(0, Math.min(1, localX / APOLLO11_TERRAIN.widthMeters + 0.5));
    const v = Math.max(0, Math.min(1, localZ / APOLLO11_TERRAIN.lengthMeters + 0.5));
    const column = Math.round(u * (heightData.width - 1));
    const row = Math.round(v * (heightData.height - 1));
    const offset = (row * heightData.width + column) * 4;
    if (heightData.pixels[offset + 3] < 128) return 0;
    const absoluteElevation = APOLLO11_TERRAIN.minElevationMeters +
      heightData.pixels[offset] / 255 * elevationRange;
    return absoluteElevation - APOLLO11_TERRAIN.landingElevationMeters;
  };
}

function applyMeasuredRelief(geometry, sampleHeight) {
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, sampleHeight(positions.getX(index), positions.getZ(index)));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function configureAlbedoTexture(THREE, image, renderer) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

async function loadApollo11Terrain(THREE, renderer, geometry) {
  const [heightImage, albedoImage] = await Promise.all([
    imageRequest(APOLLO11_TERRAIN.heightAsset),
    imageRequest(APOLLO11_TERRAIN.albedoAsset)
  ]);
  const sampleHeight = createHeightSampler(readPixels(heightImage));
  applyMeasuredRelief(geometry, sampleHeight);
  return {
    albedo: configureAlbedoTexture(THREE, albedoImage, renderer),
    landingLocal,
    metadata: APOLLO11_TERRAIN,
    sampleHeight
  };
}

export { APOLLO11_TERRAIN, landingLocal, loadApollo11Terrain, terrainCoordinates };
