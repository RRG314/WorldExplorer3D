import { getModelAsset } from './model-asset-catalog.js?v=5';

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
        resolve(Object.freeze({ root, animations: Object.freeze([...(gltf?.animations || [])]) }));
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

function parallelTraverse(source, clone, visit) {
  visit(source, clone);
  for (let index = 0; index < source.children.length; index += 1) {
    parallelTraverse(source.children[index], clone.children[index], visit);
  }
}

function cloneModelGraph(source, policy = {}) {
  const clone = source.clone(true);
  const sourceToClone = new Map();
  const cloneToSource = new Map();
  parallelTraverse(source, clone, (sourceNode, cloneNode) => {
    sourceToClone.set(sourceNode, cloneNode);
    cloneToSource.set(cloneNode, sourceNode);
  });
  clone.traverse((object) => {
    if (!object?.isMesh) return;
    if (policy.geometry === 'clone') {
      object.geometry = object.geometry?.clone?.() || object.geometry;
    }
    if (policy.materials === 'clone') {
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material?.clone?.() || material)
        : object.material?.clone?.() || object.material;
    }
    if (!object.isSkinnedMesh) return;
    const sourceMesh = cloneToSource.get(object);
    object.skeleton = sourceMesh.skeleton.clone();
    object.bindMatrix.copy(sourceMesh.bindMatrix);
    object.skeleton.bones = sourceMesh.skeleton.bones.map((bone) => sourceToClone.get(bone));
    object.bind(object.skeleton, object.bindMatrix);
  });
  return clone;
}

function abortError(assetId) {
  const error = new Error(`Model asset load was cancelled: ${assetId}`);
  error.name = 'AbortError';
  return error;
}

function disposeModelInstance(root, policy = {}) {
  root?.removeFromParent?.();
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    if (policy.geometry === 'clone') object.geometry?.dispose?.();
    if (policy.materials !== 'clone') return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

async function loadModelAsset(THREE, assetId, options = {}) {
  const record = getModelAsset(assetId);
  if (!record) throw new Error(`Unknown model asset: ${assetId}`);
  if (options.signal?.aborted) throw abortError(assetId);
  const template = await loadTemplate(THREE, record);
  if (options.signal?.aborted) throw abortError(assetId);
  const policy = record.instancePolicy || Object.freeze({ geometry: 'clone', materials: 'clone' });
  const root = cloneModelGraph(template.root, policy);
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
  let disposed = false;
  return Object.freeze({
    record,
    root,
    animations: template.animations,
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeModelInstance(root, policy);
    }
  });
}

export { loadModelAsset };
