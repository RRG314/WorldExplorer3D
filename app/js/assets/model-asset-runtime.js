import { getModelAsset } from './model-asset-catalog.js?v=2';

const templateLoads = new Map();

function loaderFor(THREE) {
  if (!THREE?.GLTFLoader) throw new Error('GLTFLoader is unavailable.');
  // Curated runtime assets are stored as self-contained, non-Draco GLBs.
  // Keeping decoding local prevents a vehicle or character from disappearing
  // because a third-party CDN is slow, blocked, or offline.
  return new THREE.GLTFLoader();
}

function loadTemplate(THREE, record) {
  if (templateLoads.has(record.id)) return templateLoads.get(record.id);
  const pending = new Promise((resolve, reject) => {
    loaderFor(THREE).load(
      record.url,
      (gltf) => {
        const root = gltf?.scene || gltf?.scenes?.[0];
        if (!root) {
          reject(new Error(`${record.label} does not contain a scene.`));
          return;
        }
        resolve(root);
      },
      undefined,
      reject
    );
  }).catch((error) => {
    templateLoads.delete(record.id);
    throw error;
  });
  templateLoads.set(record.id, pending);
  return pending;
}

function cloneModelGraph(source) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!object?.isMesh) return;
    object.geometry = object.geometry?.clone?.() || object.geometry;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material?.clone?.() || material)
      : object.material?.clone?.() || object.material;
  });
  return clone;
}

async function loadModelAsset(THREE, assetId) {
  const record = getModelAsset(assetId);
  if (!record) throw new Error(`Unknown model asset: ${assetId}`);
  const template = await loadTemplate(THREE, record);
  const root = cloneModelGraph(template);
  root.userData.modelAsset = Object.freeze({
    id: record.id,
    label: record.label,
    license: record.license,
    sourceUrl: record.sourceUrl,
    attribution: record.attribution,
    collisionPolicy: record.collisionPolicy
  });
  root.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = true;
  });
  return Object.freeze({ record, root });
}

export { loadModelAsset };
