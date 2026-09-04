import { getModelAsset } from './model-asset-catalog.js?v=1';

const templateCache = new Map();
const instanceCounts = new Map();
const runtimeMetrics = {
  requests: 0,
  cacheHits: 0,
  loads: 0,
  failures: 0,
  activeInstances: 0
};

let loader = null;
let dracoLoader = null;

function getLoader(THREE) {
  if (loader) return loader;
  if (!THREE?.GLTFLoader) throw new Error('GLTFLoader is unavailable.');
  loader = new THREE.GLTFLoader();
  if (THREE.DRACOLoader) {
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
  }
  return loader;
}

function abortError(signal, label) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(String(signal?.reason || `${label} load aborted`), 'AbortError');
}

function loadTemplate(THREE, record, signal = null) {
  runtimeMetrics.requests += 1;
  if (templateCache.has(record.id)) {
    runtimeMetrics.cacheHits += 1;
    return templateCache.get(record.id);
  }
  const promise = new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal, record.label));
      return;
    }
    let settled = false;
    let request = null;
    const cleanup = () => signal?.removeEventListener?.('abort', abort);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const abort = () => {
      request?.abort?.();
      templateCache.delete(record.id);
      finish(reject, abortError(signal, record.label));
    };
    signal?.addEventListener?.('abort', abort, { once: true });
    request = getLoader(THREE).load(
      record.url,
      (gltf) => {
        runtimeMetrics.loads += 1;
        finish(resolve, Object.freeze({
          root: gltf?.scene || gltf?.scenes?.[0],
          animations: Object.freeze([...(gltf?.animations || [])])
        }));
      },
      undefined,
      (error) => {
        runtimeMetrics.failures += 1;
        templateCache.delete(record.id);
        finish(reject, error);
      }
    );
  });
  templateCache.set(record.id, promise);
  return promise;
}

function cloneInstanceResources(root) {
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    if (object.geometry?.clone) object.geometry = object.geometry.clone();
    if (!object.material) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material?.clone?.() || material)
      : object.material?.clone?.() || object.material;
  });
}

function cloneModelGraph(source) {
  const sourceByClone = new Map();
  const cloneBySource = new Map();
  const clone = source.clone(true);
  const pair = (sourceNode, cloneNode) => {
    sourceByClone.set(cloneNode, sourceNode);
    cloneBySource.set(sourceNode, cloneNode);
    for (let index = 0; index < sourceNode.children.length; index += 1) {
      pair(sourceNode.children[index], cloneNode.children[index]);
    }
  };
  pair(source, clone);
  clone.traverse((node) => {
    if (!node?.isSkinnedMesh) return;
    const sourceMesh = sourceByClone.get(node);
    const skeleton = sourceMesh?.skeleton?.clone?.();
    if (!sourceMesh || !skeleton) return;
    skeleton.bones = sourceMesh.skeleton.bones.map((bone) => cloneBySource.get(bone));
    node.skeleton = skeleton;
    node.bindMatrix.copy(sourceMesh.bindMatrix);
    node.bind(node.skeleton, node.bindMatrix);
  });
  return clone;
}

function normalizeHeight(THREE, root, targetHeightMeters) {
  if (!Number.isFinite(Number(targetHeightMeters)) || Number(targetHeightMeters) <= 0) return;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  root.scale.multiplyScalar(Number(targetHeightMeters) / Math.max(.001, size.y));
  root.updateMatrixWorld(true);
  bounds.setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= bounds.min.y;
  root.position.z -= center.z;
  root.updateMatrixWorld(true);
}

async function loadModelAssetInstance(THREE, assetId, options = {}) {
  const record = getModelAsset(assetId);
  if (!record) throw new Error(`Unknown curated model asset: ${assetId}`);
  const template = await loadTemplate(THREE, record, options.signal || null);
  if (!template.root) throw new Error(`${record.label} did not contain a scene.`);
  if (options.signal?.aborted) throw abortError(options.signal, record.label);
  const root = cloneModelGraph(template.root);
  cloneInstanceResources(root);
  normalizeHeight(THREE, root, options.targetHeightMeters ?? record.scale.targetHeightMeters);
  root.name = options.name || record.label;
  root.userData.curatedModelAsset = Object.freeze({
    id: record.id,
    license: record.license,
    sourceUrl: record.sourceUrl,
    attribution: record.attribution,
    collisionPolicy: record.collision.policy,
    qualityTier: options.qualityTier || 'promoted'
  });
  root.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = options.castShadow !== false;
    object.receiveShadow = options.receiveShadow === true;
    object.frustumCulled = true;
  });
  instanceCounts.set(record.id, Number(instanceCounts.get(record.id) || 0) + 1);
  runtimeMetrics.activeInstances += 1;
  let released = false;
  return Object.freeze({
    root,
    animations: template.animations,
    record,
    release() {
      if (released) return false;
      released = true;
      root.removeFromParent?.();
      root.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object?.material) ? object.material : [object?.material];
        materials.forEach((material) => material?.dispose?.());
      });
      runtimeMetrics.activeInstances = Math.max(0, runtimeMetrics.activeInstances - 1);
      const remaining = Math.max(0, Number(instanceCounts.get(record.id) || 0) - 1);
      if (remaining) instanceCounts.set(record.id, remaining);
      else instanceCounts.delete(record.id);
      if (!remaining && options.cachePolicy === 'while-in-use') evictModelAsset(record.id);
      return true;
    }
  });
}

async function loadFirstAvailableModelAsset(THREE, assetIds = [], options = {}) {
  const failures = [];
  for (const assetId of assetIds) {
    try {
      return await loadModelAssetInstance(THREE, assetId, options);
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
      failures.push(`${assetId}: ${String(error?.message || error)}`);
    }
  }
  throw new Error(`No curated model asset could be loaded (${failures.join('; ')})`);
}

function getModelAssetRuntimeMetrics() {
  return Object.freeze({
    ...runtimeMetrics,
    cachedTemplates: templateCache.size,
    instancesByAsset: Object.freeze(Object.fromEntries(instanceCounts))
  });
}

function evictModelAsset(assetId) {
  const id = String(assetId || '');
  const pending = templateCache.get(id);
  if (!pending || Number(instanceCounts.get(id) || 0) > 0) return false;
  templateCache.delete(id);
  Promise.resolve(pending).then(({ root }) => {
    root?.traverse?.((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object?.material) ? object.material : [object?.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }).catch(() => {});
  return true;
}

function clearModelAssetCache() {
  for (const pending of templateCache.values()) {
    Promise.resolve(pending).then(({ root }) => {
      root?.traverse?.((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object?.material) ? object.material : [object?.material];
        materials.forEach((material) => material?.dispose?.());
      });
    }).catch(() => {});
  }
  templateCache.clear();
  instanceCounts.clear();
  dracoLoader?.dispose?.();
  dracoLoader = null;
  loader = null;
}

export {
  clearModelAssetCache,
  evictModelAsset,
  getModelAssetRuntimeMetrics,
  loadFirstAvailableModelAsset,
  loadModelAssetInstance
};
